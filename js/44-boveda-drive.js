'use strict';

// ---------- Bóveda en Google Drive: cada nota como archivo .md ----------
// Las notas se guardan como «Enfoque/Notas/<carpeta>/<nombre>.md» en tu Drive, con las mismas
// carpetas que en la app. El conector de Drive no puede reescribir el contenido de un archivo:
// al cambiar una nota se sube el archivo nuevo y el anterior va a la papelera de Drive.
// Lo que edites en Drive (por ejemplo, desde Obsidian con la carpeta sincronizada) vuelve a la app.
// Solo un dispositivo escribe en Drive (el que lo activó), para no duplicar archivos.
// Las notas con contraseña no se suben nunca (y su archivo, si lo tenían, se quita).
// El conector solo puede mandar archivos a la papelera, no borrarlos del todo: las versiones
// anteriores (y la de una nota que luego se protege) siguen en la papelera de Drive hasta vaciarla.
const VAULT_KEY = 'enfoque:vault';
const VAULT_PUSH_MS = 30000;
const VAULT_PULL_MS = 5 * 60000;
const VAULT_BULK = 15; // más notas nuevas que esto en una sola subida: se pregunta antes
const vault = { busy: false, map: null, lastPull: 0, status: '' };

const deviceId = () => {
  try {
    let id = localStorage.getItem('enfoque:device');
    if (!id) localStorage.setItem('enfoque:device', (id = uid()));
    return id;
  } catch {
    return 'sin-almacenamiento';
  }
};
const vaultOn = () => gAvailable() && gSettings().vaultDevice === deviceId();

// Lo que se sabe de Drive: { root, folders: {ruta: id}, files: {noteId: {id, path, at, mt}}, ignore: [ids], lastPull, rev }.
// El enlace nota ↔ archivo (root, folders, files, ignore) se guarda además en la nube (bloque «vault-link»),
// así un dispositivo nuevo lo recibe y no cree que todas las notas faltan en Drive. El resto (lastPull,
// lastScan, notas en espera…) es solo de este dispositivo.
const VAULT_SHARED = ['root', 'folders', 'files', 'ignore'];
const VAULT_SOON_MS = 9000; // después de escribir en una nota se sube a Drive a los 9 s (pushVault espera 8 s sin cambios)
function vaultMap() {
  if (vault.map) return vault.map;
  try {
    vault.map = JSON.parse(localStorage.getItem(VAULT_KEY) || 'null');
  } catch {}
  vault.map ||= {};
  const shared = state.vaultLink;
  if (shared?.root && (!vault.map.root || (shared.rev || 0) > (vault.map.rev || 0))) {
    VAULT_SHARED.forEach((k) => {
      if (shared[k] !== undefined) vault.map[k] = JSON.parse(JSON.stringify(shared[k]));
    });
    vault.map.rev = shared.rev || 0;
  }
  vault.map.folders ||= {};
  vault.map.files ||= {};
  vault.map.ignore ||= [];
  return vault.map;
}
function saveVaultMap() {
  const m = vaultMap();
  m.ignore = m.ignore.slice(-500);
  if (m.root) {
    const link = Object.fromEntries(VAULT_SHARED.map((k) => [k, m[k]]));
    const { rev, ...before } = state.vaultLink || {};
    if (JSON.stringify(before) !== JSON.stringify(link)) {
      m.rev = Date.now();
      state.vaultLink = JSON.parse(JSON.stringify({ ...link, rev: m.rev }));
      save();
    }
  }
  try {
    localStorage.setItem(VAULT_KEY, JSON.stringify(m));
  } catch {}
}
// Llegó de la nube un enlace más nuevo (lo guardó otro dispositivo): se vuelve a leer, salvo a mitad de una sincronización.
function vaultLinkArrived() {
  if (vault.map && !vault.busy && (state.vaultLink?.rev || 0) > (vault.map.rev || 0)) vault.map = null;
}
// Una nota cambió: se sube a Drive en unos segundos (sin esperar al intervalo de 30 s).
let vaultSoonTimer = 0;
function vaultSoon() {
  if (!vaultOn()) return;
  clearTimeout(vaultSoonTimer);
  vaultSoonTimer = setTimeout(() => syncVault(), VAULT_SOON_MS);
}

const vaultStatus = (text, isError = false) => {
  vault.status = text;
  const n = $('#gvault-status');
  if (!n) return;
  n.textContent = text;
  n.classList.toggle('error', isError);
};
const driveQuote = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function findFolder(title, parentId) {
  const found = await gCall(DRIVE, 'search_files', { query: `title = '${driveQuote(title)}' and parentId = '${parentId}' and mimeType = '${FOLDER_MIME}'`, pageSize: 5, excludeContentSnippets: true });
  return (found.files || []).find((f) => f.mimeType === FOLDER_MIME && f.title === title)?.id || '';
}

async function findOrCreateFolder(title, parentId) {
  const id = await findFolder(title, parentId);
  if (id) return id;
  const made = await gCall(DRIVE, 'create_file', { title, contentMimeType: FOLDER_MIME, parentId });
  if (!made?.id) throw new Error('sin carpeta');
  return made.id;
}

// Id de la carpeta de Drive para una carpeta de notas ('' es la raíz «Notas»), creándola si falta.
async function vaultFolder(path) {
  const m = vaultMap();
  if (!m.root) {
    m.root = await findOrCreateFolder('Notas', await driveFolder());
    m.folders = { '': m.root };
    saveVaultMap();
  }
  if (m.folders[path]) return m.folders[path];
  // Una carpeta de primer nivel que ya está directamente en «Enfoque» (como una bóveda de Obsidian
  // copiada allí) se usa tal cual: no se crea otra igual dentro de «Notas».
  const top = !folderOf(path) && (await findFolder(baseName(path), await driveFolder()));
  m.folders[path] = top && top !== m.root ? top : await findOrCreateFolder(baseName(path), await vaultFolder(folderOf(path)));
  saveVaultMap();
  return m.folders[path];
}

// Archivos .md que ya hay en una carpeta de la bóveda (para no duplicar si este dispositivo perdió su mapa).
async function listVaultFolder(folderId) {
  const out = [];
  const seen = new Set();
  let pageToken;
  do {
    const r = await gCall(DRIVE, 'search_files', { query: `parentId = '${folderId}'`, pageSize: 100, excludeContentSnippets: true, ...(pageToken ? { pageToken } : {}) });
    // Drive puede repetir un archivo entre una página y la siguiente: se cuenta una sola vez.
    for (const f of r.files || []) if (!seen.has(f.id)) seen.add(f.id) && out.push(f);
    pageToken = r.nextPageToken || r.next_page_token;
  } while (pageToken && out.length < 2000);
  out.complete = !pageToken; // false si la carpeta tiene más archivos de los que se leyeron
  return out;
}

const vaultNotes = () => state.notes.filter((n) => !n.enc);
// Nota sin contenido propio: vacía o solo con propiedades (--- … ---) y espacios.
const vaultIsStub = (body) => !String(body || '').replace(/\r\n?/g, '\n').replace(/^---\n[\s\S]*?\n---\s*/, '').trim();

// Notas que se quedan solo en Drive (p. ej. libros convertidos, muy pesados): se quitan de la app
// sin borrar su archivo y no se vuelven a traer. La lista va en los ajustes (se sincroniza), así
// ningún dispositivo manda esos archivos a la papelera de Drive. Además, al traer de Drive se saltan
// los .md de más de «vaultMaxKB» (100 KB por defecto; 0 = sin límite).
const VAULT_MAX_KB = 100;
const vaultExcluded = () => (state.settings.vaultExcluded ||= []);
const vaultMaxKB = () => (state.settings.vaultMaxKB ?? VAULT_MAX_KB);
const vaultExcludedPath = (path) => vaultExcluded().some((x) => x.path.toLowerCase() === path.toLowerCase());
const vaultTooBig = (f) => vaultMaxKB() > 0 && Number(f.fileSize || 0) > vaultMaxKB() * 1024;

// Saca notas de Enfoque: las que están en Drive se quedan allí (sin papelera); las demás van a la
// papelera de la app. No se puede deshacer con «Deshacer» (el archivo de Drive ya no está enlazado),
// pero se pueden volver a traer quitándolas de la lista de excluidas.
function excludeFromEnfoque(notes) {
  const m = vaultMap();
  const inDrive = [];
  const local = [];
  // En Drive: enlazada en este dispositivo o, si la bóveda la lleva otro dispositivo, cualquier nota sin contraseña.
  const vaultSomewhere = !!(typeof gSettings === 'function' && gSettings().vaultDevice);
  notes.forEach((n) => (m.files[n.id] || (vaultSomewhere && !n.enc) ? inDrive : local).push(n));
  const ex = vaultExcluded();
  notes.forEach((n) => ex.some((x) => x.id === n.id) || ex.push({ id: n.id, path: n.path, kb: Math.round((n.body || '').length / 1024), at: Date.now() }));
  if (ex.length > 5000) ex.splice(0, ex.length - 5000);
  const ids = new Set(notes.map((n) => n.id));
  inDrive.forEach((n) => delete m.files[n.id]);
  saveVaultMap();
  const onlyLocal = local;
  if (onlyLocal.length) trashNotes(onlyLocal);
  state.notes = state.notes.filter((n) => !ids.has(n.id));
  dataRev++;
  save();
  renderAll();
  return { inDrive: inDrive.length, trashed: onlyLocal.length };
}

async function trashVaultFile(id) {
  const m = vaultMap();
  m.ignore.push(id);
  try {
    await gCall(DRIVE, 'trash_file', { fileId: id });
  } catch (e) {
    // Si ya no existe, no importa; cualquier otro error se reintenta en la próxima vuelta.
    if (!/not.?found|404/i.test(`${e?.code} ${e?.message}`)) throw e;
  }
}

// Archivos de Drive enlazados con alguna nota de la app (menos la indicada).
function vaultMappedIds(m, exceptId) {
  const live = new Set(vaultNotes().map((n) => n.id));
  return new Set(Object.entries(m.files).filter(([id]) => id !== exceptId && live.has(id)).map(([, f]) => f.id));
}

// Dos notas con la misma ruta y el mismo texto (p. ej. una que volvió desde un dispositivo con datos
// viejos): sobra una, que va a la papelera de Enfoque. Si el texto es distinto, las dos se quedan.
function vaultSamePath(m) {
  const groups = new Map();
  for (const n of vaultNotes()) {
    const k = pathKey(n.path);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(n);
  }
  const extra = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    // Se queda la que ya está en Drive; si no, la cambiada más recientemente.
    list.sort((a, b) => !!m.files[b.id] - !!m.files[a.id] || (b.updatedAt || 0) - (a.updatedAt || 0));
    const [keep, ...rest] = list;
    for (const n of rest) if ((n.body || '').trim() === (keep.body || '').trim()) extra.push(n);
  }
  if (!extra.length) return;
  trashNotes(extra);
  const gone = new Set(extra.map((n) => n.id));
  state.notes = state.notes.filter((n) => !gone.has(n.id));
  noteIndex.key = '';
  dataRev++;
  save();
  renderAll();
}

// Busca en las carpetas de la bóveda archivos .md repetidos (mismo nombre en la misma carpeta).
// De cada grupo se queda el enlazado con una nota de la app (o, si no hay, el más reciente).
async function scanVaultDuplicates() {
  const m = vaultMap();
  const mapped = vaultMappedIds(m);
  const groups = [];
  const folders = [['', m.root], ...Object.entries(m.folders)].filter(([, id]) => id);
  const seen = new Set();
  for (const [path, id] of folders) {
    if (seen.has(id)) continue;
    seen.add(id);
    const byName = new Map();
    for (const f of await listVaultFolder(id)) {
      if (f.mimeType === FOLDER_MIME || !/\.md$/i.test(f.title)) continue;
      const k = pathKey(f.title);
      if (!byName.has(k)) byName.set(k, []);
      byName.get(k).push(f);
    }
    for (const list of byName.values()) {
      if (list.length < 2) continue;
      list.sort((a, b) => mapped.has(b.id) - mapped.has(a.id) || String(b.modifiedTime || '').localeCompare(String(a.modifiedTime || '')));
      const [keep, ...rest] = list;
      // Las notas que dejaste solo en Drive (libros, archivos grandes) no se tocan.
      if (vaultExcludedPath(joinPath(path, keep.title.replace(/\.md$/i, ''))) || list.some(vaultTooBig)) continue;
      // Dos archivos enlazados con notas distintas no son copias sobrantes: no se tocan.
      const extra = rest.filter((f) => !mapped.has(f.id));
      if (extra.length) groups.push({ path: joinPath(path, keep.title.replace(/\.md$/i, '')), keep, extra });
    }
  }
  return groups.sort((a, b) => a.path.localeCompare(b.path));
}

async function trashVaultDuplicates(groups) {
  let n = 0;
  for (const g of groups) {
    for (const f of g.extra) {
      await trashVaultFile(f.id);
      n++;
    }
  }
  saveVaultMap();
  return n;
}

// Sube las notas cambiadas, las renombradas o movidas, y quita de Drive las borradas.
async function pushVault({ adopt = false, manual = false } = {}) {
  const m = vaultMap();
  if (adopt && !Object.keys(m.files).length) {
    // Primera vez en este dispositivo: se reconocen los archivos que ya estén en «Notas» con la misma ruta.
    const root = await vaultFolder('');
    const walk = async (folderId, prefix) => {
      for (const f of await listVaultFolder(folderId)) {
        if (f.mimeType === FOLDER_MIME) {
          const path = joinPath(prefix, f.title);
          m.folders[path] = f.id;
          await walk(f.id, path);
        } else if (/\.md$/i.test(f.title)) {
          const path = joinPath(prefix, f.title.replace(/\.md$/i, ''));
          const note = state.notes.find((n) => pathKey(n.path) === pathKey(path));
          if (note && !m.files[note.id]) m.files[note.id] = { id: f.id, path: note.path, at: 0, mt: f.modifiedTime || '' };
        }
      }
    };
    await walk(root, '');
    saveVaultMap();
  }
  vaultSamePath(m);
  const notes = vaultNotes();
  // Muchas notas sin archivo en Drive de una vez (p. ej. un dispositivo que perdió su mapa y guarda notas
  // que ya se borraron o renombraron en Drive): no se suben sin preguntar. Quedan «en espera».
  const unseen = notes.filter((n) => !m.files[n.id]);
  const unseenIds = new Set(unseen.map((n) => n.id));
  const held = new Set((m.hold || []).filter((id) => unseenIds.has(id)));
  if (vault.allowBulk) {
    held.clear();
    vault.allowBulk = false;
  } else {
    const fresh = unseen.filter((n) => !held.has(n.id));
    if (fresh.length > VAULT_BULK) {
      fresh.forEach((n) => held.add(n.id));
      vault.askBulk = true;
    } else if (manual && held.size) vault.askBulk = true;
  }
  m.hold = [...held];
  saveVaultMap();
  const pending = notes.filter((n) => {
    if (held.has(n.id)) return false;
    const f = m.files[n.id];
    return !f || f.path !== n.path || (n.updatedAt || 0) > f.at;
  });
  const alive = new Set(notes.map((n) => n.id));
  const gone = Object.keys(m.files).filter((id) => !alive.has(id));
  let done = 0;
  const failed = [];
  for (const note of pending) {
    // Se espera a que la nota lleve unos segundos sin cambios, salvo en la primera subida.
    if (!adopt && Date.now() - (note.updatedAt || 0) < 8000) continue;
    const at = note.updatedAt || 0;
    try {
      const folderId = await vaultFolder(folderOf(note.path));
      // Drive no acepta archivos vacíos: una nota sin texto se sube con un salto de línea.
      const made = await gCall(DRIVE, 'create_file', { title: `${baseName(note.path)}.md`, textContent: note.body || '\n', contentMimeType: 'text/markdown', disableConversionToGoogleType: true, parentId: folderId });
      if (!made?.id) throw new Error('sin archivo');
      const old = m.files[note.id];
      m.files[note.id] = { id: made.id, path: note.path, at, mt: made.modifiedTime || '' };
      m.ignore.push(made.id);
      saveVaultMap();
      if (old?.id && old.id !== made.id) await trashVaultFile(old.id);
      saveVaultMap();
    } catch (e) {
      // Una nota que falla no detiene las demás; se reintenta en la próxima vuelta.
      if (['needs_reauth', 'server_not_connected', 'not_granted', 'not_in_manifest', 'blocked_by_policy'].includes(e?.code)) throw e;
      failed.push({ note, e });
    }
    if (++done % 10 === 0) vaultStatus(`Subiendo notas a Drive… ${done} de ${pending.length}`);
  }
  const keep = new Set(vaultExcluded().map((x) => x.id));
  for (const id of gone) {
    // Sacada de Enfoque a propósito: el archivo se queda en Drive.
    if (keep.has(id)) {
      delete m.files[id];
      saveVaultMap();
      continue;
    }
    try {
      await trashVaultFile(m.files[id].id);
      delete m.files[id];
      saveVaultMap();
    } catch (e) {
      failed.push({ e });
    }
  }
  if (failed.length) {
    const first = failed[0];
    const err = new Error(`${failed.length} nota(s) no se pudieron subir${first.note ? ` (por ejemplo, «${baseName(first.note.path)}»)` : ''}: ${gErrorText(first.e, DRIVE)}`);
    err.partial = true;
    throw err;
  }
  return done + gone.length;
}

// Trae lo que cambió en Drive desde la última vez: archivos editados y .md nuevos en las carpetas de la bóveda.
async function pullVault() {
  const m = vaultMap();
  if (!m.root) return 0;
  const since = new Date((m.lastPull || Date.now()) - 60000).toISOString().replace(/\.\d+Z$/, 'Z');
  const started = Date.now();
  // Se pregunta por las carpetas de la bóveda en grupos (la consulta tiene un tamaño máximo).
  const ids = Object.values(m.folders);
  const files = [];
  for (let i = 0; i < ids.length; i += 15) {
    const parents = ids.slice(i, i + 15).map((id) => `parentId = '${id}'`).join(' or ');
    let pageToken;
    do {
      const r = await gCall(DRIVE, 'search_files', { query: `modifiedTime > '${since}' and (${parents})`, pageSize: 100, excludeContentSnippets: true, ...(pageToken ? { pageToken } : {}) });
      files.push(...(r.files || []));
      pageToken = r.nextPageToken || r.next_page_token;
    } while (pageToken && files.length < 1000);
  }
  const folderPath = new Map(Object.entries(m.folders).map(([path, id]) => [id, path]));
  const byFile = new Map(Object.entries(m.files).map(([noteId, f]) => [f.id, noteId]));
  const ignore = new Set(m.ignore);
  let changed = 0;
  for (const f of files) {
    if (!/\.md$/i.test(f.title) || !folderPath.has(f.parentId)) continue;
    const noteId = byFile.get(f.id);
    const entry = noteId && m.files[noteId];
    if (entry ? f.modifiedTime && f.modifiedTime <= entry.mt : ignore.has(f.id)) continue;
    if (!entry && (vaultTooBig(f) || vaultExcludedPath(joinPath(folderPath.get(f.parentId), f.title.replace(/\.md$/i, ''))))) continue;
    const got = await gCall(DRIVE, 'download_file_content', { fileId: f.id });
    if (typeof got.content !== 'string') continue;
    // Los .md editados en Windows llegan con \r\n: se normalizan (las propiedades esperan \n).
    const text = b64ToText(got.content).replace(/\r\n?/g, '\n');
    const note = noteId && noteById(noteId);
    if (note && !note.enc) {
      if (text !== note.body && !(text === '\n' && !note.body)) {
        if ((note.updatedAt || 0) > entry.at) {
          // Cambió en los dos sitios: lo de Drive se guarda aparte para no perder nada.
          createNote({ folder: folderOf(note.path), title: `${baseName(note.path)} (desde Drive)`, body: text, open: false, log: false });
        } else {
          note.body = text;
          note.updatedAt = Date.now();
          entry.at = note.updatedAt;
        }
        changed++;
      }
      entry.mt = f.modifiedTime || entry.mt;
    } else if (!note) {
      // Un .md nuevo que pusiste en la carpeta de la bóveda: pasa a ser una nota. Si ya hay una nota con
      // esa ruta (p. ej. la subió otro dispositivo), se enlaza con ella en vez de crear «… 2».
      const folder = folderPath.get(f.parentId);
      const same = state.notes.find((x) => pathKey(x.path) === pathKey(joinPath(folder, f.title.replace(/\.md$/i, ''))));
      if (same) {
        if (!same.enc && text !== same.body && (same.updatedAt || 0) < Date.parse(f.modifiedTime || 0)) {
          same.body = text;
          same.updatedAt = Date.now();
          changed++;
        }
        m.files[same.id] = { id: f.id, path: same.path, at: same.updatedAt || 0, mt: f.modifiedTime || '' };
        continue;
      }
      const n = createNote({ folder, title: f.title.replace(/\.md$/i, ''), body: text, open: false, log: false });
      m.files[n.id] = { id: f.id, path: n.path, at: n.updatedAt, mt: f.modifiedTime || '' };
      changed++;
    }
  }
  m.lastPull = started;
  saveVaultMap();
  if (changed) {
    dataRev++;
    save();
    renderAll();
  }
  return changed;
}

// ---------- Imágenes y PDF de la bóveda ----------
// Las imágenes y los PDF que hay junto a las notas (p. ej. los adjuntos de Obsidian) se guardan en la
// app y se recuerdan por nombre y por ruta: ![[foto.png]], ![](adjuntos/foto.png) o [[libro.pdf]] se
// ven al leer la nota, sin cambiar su texto (en Drive y en Obsidian sigue igual).
const VAULT_ASSET_RE = /\.(png|jpe?g|gif|webp|bmp|svg|avif|pdf)$/i;
const VAULT_ASSET_MB = 15;
const vaultAssets = () => (state.settings.vaultAssets ||= {});

async function fetchVaultAsset(f, path) {
  const m = vaultMap();
  m.assets ||= {};
  if (m.assets[f.id] || Number(f.fileSize || 0) > VAULT_ASSET_MB * 1024 * 1024) return false;
  const got = await gCall(DRIVE, 'download_file_content', { fileId: f.id });
  if (typeof got.content !== 'string' || !got.content) return false;
  const ext = f.title.split('.').pop().toLowerCase();
  const pdf = ext === 'pdf';
  const type = pdf ? 'application/pdf' : /^image\//.test(f.mimeType || '') ? f.mimeType : `image/${ext.replace('jpg', 'jpeg').replace('svg', 'svg+xml')}`;
  let rec;
  if (pdf) rec = { id: uid(), name: f.title, type, size: Number(f.fileSize) || Math.round(got.content.length * 0.75), data: `data:${type};base64,${got.content}`, createdAt: Date.now() };
  else {
    const bytes = Uint8Array.from(atob(got.content), (c) => c.charCodeAt(0));
    const img = await compressImage(new File([bytes], f.title, { type })).catch(() => null);
    // Una imagen que no se puede leer no se vuelve a bajar en cada sincronización.
    if (!img) return !!(m.assets[f.id] = 'no válida');
    rec = { id: uid(), name: f.title.replace(/\.[^.]+$/, ''), type: img.type, data: img.data, width: img.width, height: img.height, createdAt: Date.now() };
  }
  if (!(await putFile(rec))) return false;
  const a = vaultAssets();
  const val = { id: rec.id, k: pdf ? 'file' : 'img' };
  a[joinPath(path, f.title).toLowerCase()] = val;
  a[f.title.toLowerCase()] = val;
  m.assets[f.id] = rec.id;
  return true;
}

// Al leer: las referencias a imágenes y PDF de la bóveda se muestran con el archivo guardado.
function vaultAssetMd(src) {
  const a = state.settings.vaultAssets;
  if (!a || !src.includes('.')) return src;
  const find = (ref) => {
    let r = String(ref).trim().replace(/^<|>$/g, '');
    try {
      r = decodeURIComponent(r);
    } catch {}
    r = r.replace(/^\.?\//, '').toLowerCase();
    return a[r] || a[r.split('/').pop()];
  };
  const md = (hit, name, size) => (hit.k === 'img' ? `![${name}${size ? `|${size}` : ''}](img:${hit.id})` : `![${name}](file:${hit.id})`);
  return src
    .replace(/(!?)\[\[([^\]|#\n]+?\.(?:png|jpe?g|gif|webp|bmp|svg|avif|pdf))(?:\|([^\]\n]*))?\]\]/gi, (m, bang, ref, size) => {
      const hit = find(ref);
      if (!hit || (!bang && hit.k === 'img')) return m;
      const name = ref.split('/').pop();
      return md(hit, hit.k === 'img' ? name.replace(/\.[^.]+$/, '') : name, size);
    })
    .replace(/!\[([^\]\n]*)\]\((<[^>\n]+>|[^)\s]+)\)/g, (m, alt, ref) => {
      if (/^(https?|img|file|audio|data):/i.test(ref) || !VAULT_ASSET_RE.test(ref.replace(/>$/, ''))) return m;
      const hit = find(ref);
      return hit ? md(hit, alt || ref.replace(/^<|>$/g, '').split('/').pop(), '') : m;
    });
}

// Busca en toda la bóveda (y en las carpetas que pusiste directamente en «Enfoque», como una
// carpeta de Obsidian copiada) los .md que la app aún no conoce, aunque su fecha sea antigua: al copiar
// una carpeta, Drive conserva la fecha original y el repaso normal (por cambios recientes) no los ve.
// Las carpetas que empiezan por «.» (como .obsidian) se saltan. Si ya hay una nota con esa ruta, se
// enlaza con el archivo en vez de duplicarla.
async function scanVaultNew() {
  const m = vaultMap();
  // Sin raíz (primera vez o mapa perdido) se prepara, para reconocer lo que ya hay en Drive antes de subir nada.
  if (!m.root) await vaultFolder('');
  const known = new Set(Object.values(m.files).map((f) => f.id));
  const ignore = new Set(m.ignore);
  let made = 0;
  let assetsIn = 0;
  // Carpetas puestas directamente en «Enfoque» (fuera de «Notas»): también son notas. Si «Notas» tiene
  // otra con el mismo nombre (la creó un dispositivo que había perdido el mapa), manda la de «Enfoque»:
  // sus rutas vuelven a apuntar a ella y la copia de «Notas» se deja de recorrer.
  const pathOf = new Map(Object.entries(m.folders).map(([path, id]) => [id, path]));
  const top = new Map();
  for (const f of await listVaultFolder(await driveFolder())) {
    if (f.mimeType !== FOLDER_MIME || f.id === m.root || /^\./.test(f.title)) continue;
    const path = pathOf.get(f.id) ?? (cleanName(f.title) || 'Carpeta');
    if (m.folders[path] && m.folders[path] !== f.id) {
      for (const k of Object.keys(m.folders)) if (k === path || k.startsWith(`${path}/`)) delete m.folders[k];
    }
    m.folders[path] ||= f.id;
    top.set(path, f.id);
  }
  // Una nota enlazada con un archivo de otra carpeta (la copia sobrante) se enlaza con el de su carpeta.
  // Si los textos difieren, gana el más reciente; si la nota tenía cambios sin subir, lo de Drive se
  // guarda aparte para no perder nada.
  const relink = async (note, f) => {
    const entry = m.files[note.id];
    const got = await gCall(DRIVE, 'download_file_content', { fileId: f.id });
    if (typeof got.content !== 'string') return;
    const text = b64ToText(got.content).replace(/\r\n?/g, '\n');
    const pending = (note.updatedAt || 0) > entry.at;
    let at = note.updatedAt || 0;
    if (text !== note.body && !(text === '\n' && !note.body)) {
      if ((f.modifiedTime || '') <= (entry.mt || '')) at = -1; // la nota es más nueva: se sube encima
      else if (pending) {
        createNote({ folder: folderOf(note.path), title: `${baseName(note.path)} (desde Drive)`, body: text, open: false, log: false });
        at = entry.at;
        made++;
      } else {
        note.body = text;
        note.updatedAt = at = Date.now();
        made++;
      }
    }
    m.files[note.id] = { id: f.id, path: note.path, at, mt: f.modifiedTime || '' };
    known.add(f.id);
  };
  // Nota que en la app quedó vacía (solo propiedades) o en una versión antigua y mucho más corta que la de
  // Drive: se trae la de Drive. Pasa con notas importadas como borrador y escritas después en Obsidian o en
  // Drive. Solo si la nota no tiene cambios sin subir; la versión anterior queda en la papelera de Enfoque.
  const refill = async (note, f) => {
    const entry = note && m.files[note.id];
    if (!entry || note.enc || (note.updatedAt || 0) > entry.at) return;
    const size = f.fileSize != null ? Number(f.fileSize) : null;
    const len = new TextEncoder().encode(note.body || '').length;
    const stub = vaultIsStub(note.body);
    const older = !(Date.parse(f.modifiedTime || '') <= (note.updatedAt || 0));
    if (stub ? size != null && size <= len + 40 : !(size != null && size > len * 1.3 + 100 && older)) return;
    const got = await gCall(DRIVE, 'download_file_content', { fileId: f.id });
    if (typeof got.content !== 'string') return;
    const text = b64ToText(got.content).replace(/\r\n?/g, '\n');
    if (vaultIsStub(text) || text === note.body || (!stub && text.length <= (note.body || '').length)) return;
    if (!stub) trashNotes([{ ...note, id: uid(), path: `${note.path} (versión anterior en Enfoque)` }]);
    note.body = text;
    note.updatedAt = Date.now();
    m.files[note.id] = { ...entry, at: note.updatedAt, mt: f.modifiedTime || entry.mt };
    made++;
  };
  // Un archivo que moviste o renombraste en Drive (o en Obsidian): la nota cambia igual de ruta en la
  // app, sin volver a subirse. Si la nota tiene cambios sin subir o ya hay otra con esa ruta, se deja.
  const byFile = new Map(Object.entries(m.files).map(([noteId, f]) => [f.id, noteId]));
  const follow = (f, path) => {
    const note = noteById(byFile.get(f.id));
    const entry = note && m.files[note.id];
    if (!entry || note.enc || (note.updatedAt || 0) > entry.at) return;
    const to = joinPath(path, cleanName(f.title.replace(/\.md$/i, '')) || 'Sin título');
    if (pathKey(to) === pathKey(note.path) || state.notes.some((n) => n !== note && pathKey(n.path) === pathKey(to))) return;
    const from = note.path;
    note.path = to;
    noteIndex.key = '';
    relinkAll(from, to);
    if (path && !state.folders.includes(path)) state.folders.push(path);
    entry.path = to;
    made++;
  };
  // Archivos vistos y carpetas leídas enteras en este repaso: con eso se sabe qué se borró en Drive.
  const seen = new Set();
  const complete = new Set();
  const glance = async (folderId, depth = 0) => {
    if (depth > 12) return;
    for (const f of await listVaultFolder(folderId)) {
      seen.add(f.id);
      if (f.mimeType === FOLDER_MIME) await glance(f.id, depth + 1);
    }
  };
  const visit = async (folderId, path, depth = 0) => {
    if (depth > 12) return;
    const list = await listVaultFolder(folderId);
    const here = new Set(list.map((f) => f.id));
    list.forEach((f) => seen.add(f.id));
    if (list.complete) complete.add(folderId);
    for (const f of list) {
      if (f.mimeType === FOLDER_MIME) {
        if (/^\./.test(f.title)) continue;
        const sub = joinPath(path, cleanName(f.title) || 'Carpeta');
        // Copia en «Notas» de una carpeta de «Enfoque»: no se recorre, pero sus archivos cuentan como presentes.
        if (top.has(sub) && top.get(sub) !== f.id) {
          await glance(f.id, depth + 1);
          continue;
        }
        if (!m.folders[sub]) m.folders[sub] = f.id;
        await visit(f.id, sub, depth + 1);
      } else if (/\.md$/i.test(f.title) && known.has(f.id)) {
        follow(f, path);
        await refill(noteById(byFile.get(f.id)), f);
      } else if (/\.md$/i.test(f.title) && !known.has(f.id) && !ignore.has(f.id)) {
        const title = cleanName(f.title.replace(/\.md$/i, '')) || 'Sin título';
        if (vaultTooBig(f) || vaultExcludedPath(joinPath(path, title))) continue; // libros pesados o sacados de Enfoque: se quedan en Drive
        const same = state.notes.find((n) => n.path.toLowerCase() === joinPath(path, title).toLowerCase());
        if (same) {
          const entry = m.files[same.id];
          if (same.enc) continue;
          if (!entry) {
            m.files[same.id] = { id: f.id, path: same.path, at: same.updatedAt || 0, mt: f.modifiedTime || '' };
            await refill(same, f);
          }
          else if (entry.id !== f.id && !here.has(entry.id)) await relink(same, f);
          continue;
        }
        const got = await gCall(DRIVE, 'download_file_content', { fileId: f.id });
        if (typeof got.content !== 'string') continue;
        const n = createNote({ folder: path, title, body: b64ToText(got.content).replace(/\r\n?/g, '\n'), open: false, log: false });
        if (path && !state.folders.includes(path)) state.folders.push(path);
        m.files[n.id] = { id: f.id, path: n.path, at: n.updatedAt, mt: f.modifiedTime || '' };
        known.add(f.id);
        if (++made % 10 === 0) vaultStatus(`Trayendo notas de Drive… ${made}`);
      } else if (VAULT_ASSET_RE.test(f.title) && !vaultMap().assets?.[f.id]) {
        try {
          if (await fetchVaultAsset(f, path) && ++assetsIn % 5 === 0) vaultStatus(`Trayendo imágenes y PDF de Drive… ${assetsIn}`);
        } catch (e) {
          if (['needs_reauth', 'server_not_connected', 'not_granted'].includes(e?.code)) throw e;
        }
      }
    }
    saveVaultMap();
  };
  await visit(m.root, '');
  // Las de «Enfoque» se recorren siempre con su ruta, por si tienen archivos nuevos.
  for (const [path, id] of top) await visit(id, path);
  // Notas cuyo archivo borraste en Drive: van a la papelera de Enfoque (se recuperan desde ahí). Solo si
  // su carpeta se leyó entera, el archivo no está en ninguna otra carpeta, la nota no tiene cambios sin
  // subir y el archivo no se subió hace poco (la búsqueda de Drive tarda un poco en verlo).
  const recent = Date.now() - 10 * 60000;
  const removed = vaultNotes().filter((n) => {
    const entry = m.files[n.id];
    return entry && !seen.has(entry.id) && complete.has(m.folders[folderOf(n.path)]) && (n.updatedAt || 0) <= entry.at && !(Date.parse(entry.mt || 0) > recent);
  });
  if (removed.length) {
    trashNotes(removed);
    const ids = new Set(removed.map((n) => n.id));
    state.notes = state.notes.filter((n) => !ids.has(n.id));
    removed.forEach((n) => delete m.files[n.id]);
    noteIndex.key = '';
    made += removed.length;
    vault.removed = removed.length;
  }
  m.lastScan = Date.now();
  saveVaultMap();
  if (assetsIn) scheduleFilesSync();
  if (made || assetsIn) {
    dataRev++;
    save();
    renderAll();
  }
  return made + assetsIn;
}

async function syncVault({ manual = false, adopt = false, pull = false } = {}) {
  if (!vaultOn() || vault.busy) return;
  vault.busy = true;
  vault.removed = 0;
  if (manual) vaultStatus('Sincronizando con Drive…');
  if (typeof renderDriveBtn === 'function') renderDriveBtn();
  try {
    // Al abrir la app (pull) o a mano se traen siempre los cambios de Drive; si no, cada 5 minutos.
    let pulled = Date.now() - (vaultMap().lastPull || 0) > VAULT_PULL_MS || manual || pull ? await pullVault() : 0;
    // Al sincronizar a mano (y cada media hora) se buscan también carpetas y .md nuevos aunque sean antiguos.
    if (manual || adopt || Date.now() - (vaultMap().lastScan || 0) > 30 * 60000) pulled += await scanVaultNew();
    const pushed = await pushVault({ adopt, manual });
    const m = vaultMap();
    m.lastSync = Date.now();
    saveVaultMap();
    vaultStatus(`${Object.keys(m.files).length} notas en Drive · última sincronización ${new Date(m.lastSync).toLocaleTimeString('es', { timeStyle: 'short' })}${pulled ? ` · ${pulled} cambio(s) traídos de Drive` : ''}${vault.removed ? ` · ${vault.removed} nota(s) borradas en Drive pasaron a la papelera de Enfoque` : ''}${m.hold?.length ? ` · ${m.hold.length} nota(s) en espera: no están en Drive (pulsa «Sincronizar ahora» para decidir)` : ''}.`);
    if (vault.askBulk) {
      vault.askBulk = false;
      askVaultBulk();
    }
    if (vault.removed) showToastMessage(`${vault.removed} nota(s) borradas en Drive pasaron a la papelera de Enfoque`);
    else if (manual) showToastMessage(pushed || pulled ? 'Bóveda de Drive al día' : 'No había cambios');
  } catch (e) {
    vaultStatus(e?.partial ? e.message : `No se pudo sincronizar la bóveda: ${gErrorText(e, DRIVE)}`, true);
  } finally {
    vault.busy = false;
    renderVaultSettings();
  }
}

// Pregunta qué hacer con las notas en espera: subirlas, mandarlas a la papelera de Enfoque o decidir después.
// Notas en espera que ya están en otra carpeta con el mismo nombre y el mismo texto (copias sobrantes).
function vaultHeldTwins(list) {
  const norm = (s) => String(s || '').replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').trim();
  const ids = new Set(list.map((n) => n.id));
  const others = new Map();
  vaultNotes().filter((n) => !ids.has(n.id)).forEach((n) => {
    const k = baseName(n.path).toLowerCase();
    if (!others.has(k)) others.set(k, new Set());
    others.get(k).add(norm(n.body));
  });
  return list.filter((n) => others.get(baseName(n.path).toLowerCase())?.has(norm(n.body)));
}

// Manda notas en espera a la papelera de Enfoque (se recuperan desde ahí).
function trashHeldNotes(now) {
  trashNotes(now);
  const gone = new Set(now.map((n) => n.id));
  state.notes = state.notes.filter((n) => !gone.has(n.id));
  const m = vaultMap();
  m.hold = (m.hold || []).filter((id) => !gone.has(id));
  saveVaultMap();
  noteIndex.key = '';
  dataRev++;
  save();
  renderAll();
  showToastMessage(`${now.length} nota(s) en la papelera de Enfoque (se pueden recuperar)`);
  renderVaultSettings();
}

function askVaultBulk() {
  const ids = new Set(vaultMap().hold || []);
  const list = vaultNotes().filter((n) => ids.has(n.id));
  if (!list.length || typeof pomoAlert !== 'function') return;
  const twins = vaultHeldTwins(list);
  const twinIds = new Set(twins.map((n) => n.id));
  const rest = list.filter((n) => !twinIds.has(n.id));
  const names = (arr, k) => arr.slice(0, k).map((n) => `«${n.path}»`).join(', ') + (arr.length > k ? ` y ${arr.length - k} más` : '');
  const text = `${list.length} notas de este dispositivo no están en tu Drive.`
    + (twins.length ? ` ${twins.length} ya existen con el mismo nombre y texto en otra carpeta (copias sobrantes).` : '')
    + (rest.length ? ` ${twins.length ? 'Las otras' : 'Son'}: ${names(rest, 8)}.` : '')
    + ' Si las borraste o renombraste en Drive desde otro lugar, no las subas: volverían a aparecer repetidas.';
  pomoAlert(text, {
    sticky: true,
    kind: 'confirm',
    actions: [
      { label: 'Decidir después', cls: 'primary', fn: () => {} },
      ...(twins.length ? [{ label: `Quitar las ${twins.length} repetidas`, cls: 'danger-chip', fn: () => {
        trashHeldNotes(vaultNotes().filter((n) => twinIds.has(n.id)));
        if (rest.length) setTimeout(askVaultBulk, 300);
      } }] : []),
      { label: twins.length ? `Mandar las ${list.length} a la papelera de Enfoque` : 'Mandarlas a la papelera de Enfoque', cls: 'danger-chip', fn: () => trashHeldNotes(vaultNotes().filter((n) => ids.has(n.id))) },
      { label: `Subirlas a Drive (${list.length})`, fn: () => {
        vault.allowBulk = true;
        syncVault({ manual: true });
      } },
    ],
  });
}

// Carpeta para notas nuevas: una sola dirección para las notas sueltas (las de Diario, Revisiones,
// Mapas y demás funciones siguen en su propia carpeta).
function renderNoteHome() {
  const sel = $('#note-home');
  if (!sel) return;
  const cur = noteHome();
  const folders = allFolders().filter((f) => !/^\./.test(f));
  if (cur && !folders.includes(cur)) folders.unshift(cur);
  sel.replaceChildren(el('option', { value: '' }, 'Sin carpeta (raíz de «Notas»)'), ...folders.map((f) => el('option', { value: f }, f)));
  sel.value = cur;
  const top = cur.split('/')[0];
  $('#note-home-hint').textContent = cur
    ? `Las notas que crees con «Nueva nota» o desde un enlace sin carpeta van a «${cur}». En Drive quedan en esa misma carpeta: dentro de «Enfoque/${top}» si esa carpeta está directamente en «Enfoque», o en «Enfoque/Notas/${cur}» si no. Las notas de Diario, Revisiones, Mapas y demás funciones siguen en su carpeta.`
    : 'Las notas nuevas sin carpeta quedan en la raíz (en Drive, «Enfoque/Notas»). Elige aquí la carpeta de tu bóveda para que todas vayan a un solo lugar.';
}
$('#note-home')?.addEventListener('change', (e) => {
  state.settings.noteHome = e.target.value;
  save();
  renderNoteHome();
  showToastMessage(e.target.value ? `Las notas nuevas irán a «${e.target.value}»` : 'Las notas nuevas irán a la raíz');
});

function renderVaultSettings() {
  renderNoteHome();
  if (typeof renderDriveBtn === 'function') renderDriveBtn();
  const g = gSettings();
  const ok = gAvailable();
  const mine = g.vaultDevice === deviceId();
  $('#gvault-on').disabled = !ok;
  $('#gvault-on').checked = !!g.vaultDevice && mine;
  $('#gvault-now').disabled = !ok || !mine || vault.busy;
  if ($('#gvault-verify')) $('#gvault-verify').disabled = !ok || !mine || vault.busy;
  $('#gvault-open').hidden = !mine || !vaultMap().root;
  if (!ok) return vaultStatus('Disponible al abrir la app desde Claude con el conector de Google Drive.');
  if (g.vaultDevice && !mine) return vaultStatus('Tus notas se guardan en Drive desde otro dispositivo. Actívalo aquí si quieres que lo haga este.');
  if (!mine) return vaultStatus('Desactivado.');
  if (!vault.busy && !vault.status) vaultStatus('Activado. Las notas se suben al dejar de escribir.');
}

$('#gvault-on').addEventListener('change', (e) => {
  const g = gSettings();
  if (e.target.checked) {
    g.vaultDevice = deviceId();
    save();
    vaultStatus('Preparando la carpeta «Enfoque/Notas»…');
    syncVault({ manual: true, adopt: true });
  } else {
    if (g.vaultDevice === deviceId()) delete g.vaultDevice;
    save();
    vault.status = '';
    renderVaultSettings();
  }
});
$('#gvault-verify')?.addEventListener('click', () => verifyVault());
$('#gvault-now').addEventListener('click', () => syncVault({ manual: true, adopt: !Object.keys(vaultMap().files).length }));
$('#gvault-open').addEventListener('click', () => {
  const root = vaultMap().root;
  if (root) window.open(`https://drive.google.com/drive/folders/${root}`, '_blank', 'noopener');
});

setInterval(() => vaultOn() && syncVault(), VAULT_PUSH_MS);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && vaultOn()) syncVault();
});
// Aviso en los ajustes: lo que va a la papelera de Drive sigue ahí (sin cifrar) hasta vaciarla.
$('#gvault-on').closest('.switch').nextElementSibling?.after(el('p', { className: 'muted gvault-trash-note' }, 'Al cambiar una nota, la versión anterior va a la papelera de Drive; también la de una nota que proteges con contraseña, que allí sigue sin cifrar. Vacía la papelera desde Drive si quieres borrarlas del todo.'));
COMMANDS_EXTRA.push(() => (vaultOn() ? [{ label: 'Sincronizar las notas con Drive', action: () => syncVault({ manual: true }) }] : []));
renderVaultSettings();

// ---------- Verificar con Drive ----------
// Compara las notas de Enfoque con los .md de la bóveda en Drive leyendo solo nombres, tamaños y fechas
// (no descarga nada). Muestra qué falta en cada lado, qué está repetido y qué no coincide, con un botón
// para arreglar cada grupo. Nada se borra: lo que sobra va a la papelera (de Drive o de Enfoque).
const vaultCheck = { report: null };
const bytesOf = (s) => new TextEncoder().encode(s || '\n').length;

async function verifyVault() {
  if (!vaultOn() || vault.busy) return;
  vault.busy = true;
  vaultCheck.report = null;
  renderVaultSettings();
  vaultStatus('Verificando con Drive… (solo se leen nombres y tamaños)');
  try {
    const m = vaultMap();
    if (!m.root) await vaultFolder('');
    const files = [];
    const ids = new Set();
    const dupFolders = [];
    const tops = new Map();
    for (const f of await listVaultFolder(await driveFolder())) {
      if (f.mimeType !== FOLDER_MIME || f.id === m.root || /^\./.test(f.title)) continue;
      tops.set(cleanName(f.title) || 'Carpeta', f.id);
    }
    const walk = async (id, path, depth = 0) => {
      if (depth > 12) return;
      for (const f of await listVaultFolder(id)) {
        if (f.mimeType === FOLDER_MIME) {
          if (/^\./.test(f.title)) continue;
          const sub = joinPath(path, cleanName(f.title) || 'Carpeta');
          // Una carpeta de «Enfoque» repetida dentro de «Notas»: se informa y no se recorre.
          if (!path && tops.has(sub) && tops.get(sub) !== f.id) {
            dupFolders.push(sub);
            continue;
          }
          await walk(f.id, sub, depth + 1);
          if (files.length % 50 === 0) vaultStatus(`Verificando con Drive… ${files.length} archivos leídos`);
        } else if (/\.md$/i.test(f.title) && !ids.has(f.id)) {
          ids.add(f.id);
          files.push({ f, path: joinPath(path, cleanName(f.title.replace(/\.md$/i, '')) || 'Sin título') });
        }
      }
    };
    await walk(m.root, '');
    for (const [path, id] of tops) await walk(id, path);
    vaultCheck.report = vaultReport(files, dupFolders);
    const r = vaultCheck.report;
    vaultStatus(r.problems ? `Verificación: ${r.problems} punto(s) por revisar.` : `Verificación: todo coincide (${r.appCount} notas en Enfoque, ${r.driveCount} archivos en Drive).`);
  } catch (e) {
    vaultStatus(`No se pudo verificar: ${gErrorText(e, DRIVE)}`, true);
  } finally {
    vault.busy = false;
    renderVaultSettings();
    renderVaultReport();
  }
}

function vaultReport(files, dupFolders) {
  const m = vaultMap();
  const notes = vaultNotes();
  const byFile = new Map(files.map((x) => [x.f.id, x]));
  const linked = new Set(Object.values(m.files).map((e) => e.id));
  const ignore = new Set(m.ignore);
  const groupBy = (list, key) => {
    const g = new Map();
    list.forEach((x) => {
      const k = key(x);
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(x);
    });
    return [...g.values()];
  };
  const appPaths = new Set(notes.map((n) => pathKey(n.path)));
  const driveDup = groupBy(files, (x) => pathKey(x.path)).filter((g) => g.length > 1);
  const inDup = new Set(driveDup.flat().map((x) => x.f.id));
  // Un .md vacío (p. ej. la nota de carpeta de Obsidian) no se cuenta: no hay nada que traer.
  const onlyDrive = files.filter((x) => !linked.has(x.f.id) && !ignore.has(x.f.id) && !inDup.has(x.f.id) && x.f.fileSize !== '0'
    && !vaultTooBig(x.f) && !vaultExcludedPath(x.path) && !appPaths.has(pathKey(x.path)));
  const notUploaded = notes.filter((n) => !m.files[n.id]);
  const goneInDrive = notes.filter((n) => m.files[n.id] && !byFile.has(m.files[n.id].id));
  const appDup = groupBy(notes, (n) => pathKey(n.path)).filter((g) => g.length > 1);
  const pendingUp = notes.filter((n) => m.files[n.id] && byFile.has(m.files[n.id].id) && (n.updatedAt || 0) > m.files[n.id].at);
  const differ = notes.filter((n) => {
    const e = m.files[n.id];
    const x = e && byFile.get(e.id);
    // Los documentos de Google no tienen un tamaño comparable con el texto; un .md editado en Windows
    // (Obsidian) tiene saltos de línea \r\n: con eso sigue siendo la misma nota.
    if (!x || (n.updatedAt || 0) > e.at || x.f.fileSize == null || /^application\/vnd\.google-apps/.test(x.f.mimeType || '')) return false;
    const size = Number(x.f.fileSize);
    const len = bytesOf(n.body);
    if (size === 0 && !String(n.body || '').trim()) return false; // vacía en los dos lados
    return size !== len && size !== len + (String(n.body || '\n').match(/\n/g) || []).length;
  });
  const r = {
    at: Date.now(), driveCount: files.length, appCount: notes.length, protectedCount: state.notes.filter((n) => n.enc).length,
    onlyDrive, notUploaded, goneInDrive, driveDup, appDup, differ, pendingUp, dupFolders,
  };
  r.problems = onlyDrive.length + notUploaded.length + goneInDrive.length + driveDup.length + appDup.length + differ.length + dupFolders.length;
  return r;
}

// Arreglos de cada grupo. Al terminar se vuelve a verificar.
const vaultFixes = {
  async onlyDrive() {
    await syncVault({ manual: true });
  },
  async notUploaded() {
    vault.allowBulk = true;
    await syncVault({ manual: true });
  },
  async goneUpload(r) {
    const m = vaultMap();
    r.goneInDrive.forEach((n) => delete m.files[n.id]);
    saveVaultMap();
    vault.allowBulk = true;
    await syncVault({ manual: true });
  },
  async goneTrash(r) {
    const m = vaultMap();
    r.goneInDrive.forEach((n) => delete m.files[n.id]);
    saveVaultMap();
    trashHeldNotes(r.goneInDrive.map((n) => noteById(n.id)).filter(Boolean));
  },
  // Copias en Drive con la misma ruta: queda la enlazada (o la más reciente); las de igual tamaño van a la papelera de Drive.
  async driveDup(r) {
    const m = vaultMap();
    const linked = new Set(Object.values(m.files).map((e) => e.id));
    let n = 0;
    for (const g of r.driveDup) {
      const keep = g.find((x) => linked.has(x.f.id)) || [...g].sort((a, b) => String(b.f.modifiedTime).localeCompare(String(a.f.modifiedTime)))[0];
      for (const x of g) {
        if (x === keep || x.f.id === keep.f.id || x.f.fileSize !== keep.f.fileSize) continue;
        await gCall(DRIVE, 'trash_file', { fileId: x.f.id });
        m.ignore.push(x.f.id);
        n++;
      }
    }
    saveVaultMap();
    showToastMessage(`${n} copia(s) repetida(s) en la papelera de Drive`);
  },
  // Notas repetidas en Enfoque con el mismo texto: queda la enlazada con Drive (o la más antigua).
  async appDup(r) {
    const m = vaultMap();
    const extra = [];
    for (const g of r.appDup) {
      const norm = (s) => String(s || '').replace(/\r\n?/g, '\n').trim();
      const keep = g.find((n) => m.files[n.id]) || [...g].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))[0];
      g.forEach((n) => n !== keep && norm(n.body) === norm(keep.body) && extra.push(n));
    }
    if (extra.length) trashHeldNotes(extra.map((n) => noteById(n.id)).filter(Boolean));
  },
  // Notas cuyo tamaño no coincide con Drive (sin cambios por subir): se trae lo de Drive; la versión de Enfoque queda en la papelera.
  async differ(r) {
    const m = vaultMap();
    let n = 0;
    for (const note of r.differ) {
      const live = noteById(note.id);
      const e = live && m.files[live.id];
      if (!e || live.enc || (live.updatedAt || 0) > e.at) continue;
      const got = await gCall(DRIVE, 'download_file_content', { fileId: e.id });
      if (typeof got.content !== 'string') continue;
      const text = b64ToText(got.content).replace(/\r\n?/g, '\n');
      if (text !== live.body && !(text === '\n' && !live.body)) {
        trashNotes([{ ...live, id: uid(), path: `${live.path} (versión anterior en Enfoque)` }]);
        live.body = text;
        live.updatedAt = Date.now();
        n++;
      }
      m.files[live.id] = { ...e, at: live.updatedAt || e.at };
    }
    saveVaultMap();
    dataRev++;
    save();
    renderAll();
    showToastMessage(`${n} nota(s) actualizadas desde Drive (la versión anterior quedó en la papelera de Enfoque)`);
  },
};

async function runVaultFix(kind) {
  const r = vaultCheck.report;
  if (!r || vault.busy || !vaultFixes[kind]) return;
  try {
    await vaultFixes[kind](r);
  } catch (e) {
    vaultStatus(`No se pudo arreglar: ${gErrorText(e, DRIVE)}`, true);
    return;
  }
  await verifyVault();
}

function renderVaultReport() {
  const box = $('#gvault-report');
  if (!box) return;
  const r = vaultCheck.report;
  box.hidden = !r;
  if (!r) return (box.innerHTML = '');
  const names = (list, label) => `<ul>${list.slice(0, 30).map((x) => `<li>${escHtml(label(x))}</li>`).join('')}${list.length > 30 ? `<li class="muted">y ${list.length - 30} más</li>` : ''}</ul>`;
  const group = (title, help, list, label, fixes) => !list.length ? '' : `<details class="vcheck"><summary>${title} <b>(${list.length})</b></summary><p class="muted">${help}</p>${names(list, label)}${fixes.map(([kind, text]) => `<button data-vfix="${kind}">${text}</button>`).join(' ')}</details>`;
  const path = (n) => n.path;
  const dpath = (x) => x.path;
  const gpath = (g) => `${g[0].path} (${g.length} copias)`;
  box.innerHTML = `<p><b>${r.problems ? '⚠️' : '✅'} ${r.appCount} notas en Enfoque · ${r.driveCount} archivos en Drive</b>${r.protectedCount ? ` · ${r.protectedCount} protegida(s) con contraseña (no se suben a Drive, a propósito)` : ''}</p>`
    + (r.problems ? '' : '<p>Todo coincide: no falta ninguna nota en ningún lado y no hay copias repetidas.</p>')
    + group('Están en Drive y no en Enfoque', 'Archivos .md de la bóveda que la app todavía no trajo.', r.onlyDrive, dpath, [['onlyDrive', 'Traerlas a Enfoque']])
    + group('Están en Enfoque y nunca se subieron a Drive', 'Notas sin archivo en Drive.', r.notUploaded, path, [['notUploaded', 'Subirlas a Drive']])
    + group('Su archivo ya no está en Drive', 'Estaban en Drive y el archivo se borró o se movió fuera de la bóveda.', r.goneInDrive, path, [['goneUpload', 'Volver a subirlas'], ['goneTrash', 'Mandarlas a la papelera de Enfoque']])
    + group('Repetidas en Drive', 'Varios archivos con la misma ruta. Se conserva el enlazado; van a la papelera de Drive solo las copias del mismo tamaño (las distintas quedan para revisar a mano).', r.driveDup, gpath, [['driveDup', 'Quitar las copias iguales']])
    + group('Repetidas en Enfoque', 'Varias notas con la misma ruta. Van a la papelera de Enfoque solo las que tienen el mismo texto.', r.appDup, (g) => `${g[0].path} (${g.length} notas)`, [['appDup', 'Quitar las copias iguales']])
    + group('No coinciden con Drive', 'El archivo de Drive tiene otro tamaño y la nota no tiene cambios por subir. Se trae lo de Drive; la versión de Enfoque queda en la papelera.', r.differ, path, [['differ', 'Traer la versión de Drive']])
    + group('Carpetas repetidas dentro de «Notas»', 'Hay una carpeta con el mismo nombre en «Enfoque» y en «Enfoque/Notas». La app usa la de «Enfoque»; revisa la otra en Drive.', r.dupFolders.map((p) => ({ path: p })), dpath, [])
    + (r.pendingUp.length ? `<p class="muted">${r.pendingUp.length} nota(s) con cambios por subir: se suben solas en unos segundos.</p>` : '');
  box.querySelectorAll('[data-vfix]').forEach((b) => b.addEventListener('click', () => runVaultFix(b.dataset.vfix)));
}
