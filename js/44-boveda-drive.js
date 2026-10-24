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

// Lo que se sabe de Drive se guarda solo en este dispositivo: { root, folders: {ruta: id}, files: {noteId: {id, path, at, mt}}, ignore: [ids], lastPull }
function vaultMap() {
  if (vault.map) return vault.map;
  try {
    vault.map = JSON.parse(localStorage.getItem(VAULT_KEY) || 'null');
  } catch {}
  vault.map ||= {};
  vault.map.folders ||= {};
  vault.map.files ||= {};
  vault.map.ignore ||= [];
  return vault.map;
}
function saveVaultMap() {
  const m = vaultMap();
  m.ignore = m.ignore.slice(-500);
  try {
    localStorage.setItem(VAULT_KEY, JSON.stringify(m));
  } catch {}
}

const vaultStatus = (text, isError = false) => {
  vault.status = text;
  const n = $('#gvault-status');
  if (!n) return;
  n.textContent = text;
  n.classList.toggle('error', isError);
};
const driveQuote = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function findOrCreateFolder(title, parentId) {
  const found = await gCall(DRIVE, 'search_files', { query: `title = '${driveQuote(title)}' and parentId = '${parentId}' and mimeType = '${FOLDER_MIME}'`, pageSize: 5, excludeContentSnippets: true });
  const folder = (found.files || []).find((f) => f.mimeType === FOLDER_MIME && f.title === title);
  if (folder) return folder.id;
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
  const parent = await vaultFolder(folderOf(path));
  m.folders[path] = await findOrCreateFolder(baseName(path), parent);
  saveVaultMap();
  return m.folders[path];
}

// Archivos .md que ya hay en una carpeta de la bóveda (para no duplicar si este dispositivo perdió su mapa).
async function listVaultFolder(folderId) {
  const out = [];
  let pageToken;
  do {
    const r = await gCall(DRIVE, 'search_files', { query: `parentId = '${folderId}'`, pageSize: 100, excludeContentSnippets: true, ...(pageToken ? { pageToken } : {}) });
    out.push(...(r.files || []));
    pageToken = r.nextPageToken || r.next_page_token;
  } while (pageToken && out.length < 2000);
  return out;
}

const vaultNotes = () => state.notes.filter((n) => !n.enc);

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
async function pushVault({ adopt = false } = {}) {
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
  const pending = notes.filter((n) => {
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
  if (!m.root) return 0;
  const known = new Set(Object.values(m.files).map((f) => f.id));
  const ignore = new Set(m.ignore);
  let made = 0;
  let assetsIn = 0;
  const visit = async (folderId, path, depth = 0) => {
    if (depth > 12) return;
    for (const f of await listVaultFolder(folderId)) {
      if (f.mimeType === FOLDER_MIME) {
        if (/^\./.test(f.title)) continue;
        const sub = joinPath(path, cleanName(f.title) || 'Carpeta');
        if (!m.folders[sub]) m.folders[sub] = f.id;
        await visit(f.id, sub, depth + 1);
      } else if (/\.md$/i.test(f.title) && !known.has(f.id) && !ignore.has(f.id)) {
        const title = cleanName(f.title.replace(/\.md$/i, '')) || 'Sin título';
        if (vaultTooBig(f) || vaultExcludedPath(joinPath(path, title))) continue; // libros pesados o sacados de Enfoque: se quedan en Drive
        const same = state.notes.find((n) => n.path.toLowerCase() === joinPath(path, title).toLowerCase());
        if (same) {
          if (!m.files[same.id] && !same.enc) m.files[same.id] = { id: f.id, path: same.path, at: same.updatedAt || 0, mt: f.modifiedTime || '' };
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
  // Carpetas puestas directamente en «Enfoque» (fuera de «Notas»): también son notas.
  // Las que ya se conocen se vuelven a recorrer con su ruta, por si tienen archivos nuevos.
  const pathOf = new Map(Object.entries(m.folders).map(([path, id]) => [id, path]));
  for (const f of await listVaultFolder(await driveFolder())) {
    if (f.mimeType !== FOLDER_MIME || f.id === m.root || /^\./.test(f.title)) continue;
    const path = pathOf.get(f.id) ?? (cleanName(f.title) || 'Carpeta');
    if (!m.folders[path]) m.folders[path] = f.id;
    await visit(f.id, path);
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

async function syncVault({ manual = false, adopt = false } = {}) {
  if (!vaultOn() || vault.busy) return;
  vault.busy = true;
  if (manual) vaultStatus('Sincronizando con Drive…');
  if (typeof renderDriveBtn === 'function') renderDriveBtn();
  try {
    let pulled = Date.now() - (vaultMap().lastPull || 0) > VAULT_PULL_MS || manual ? await pullVault() : 0;
    // Al sincronizar a mano (y cada media hora) se buscan también carpetas y .md nuevos aunque sean antiguos.
    if (manual || adopt || Date.now() - (vaultMap().lastScan || 0) > 30 * 60000) pulled += await scanVaultNew();
    const pushed = await pushVault({ adopt });
    const m = vaultMap();
    m.lastSync = Date.now();
    saveVaultMap();
    vaultStatus(`${Object.keys(m.files).length} notas en Drive · última sincronización ${new Date(m.lastSync).toLocaleTimeString('es', { timeStyle: 'short' })}${pulled ? ` · ${pulled} cambio(s) traídos de Drive` : ''}.`);
    if (manual) showToastMessage(pushed || pulled ? 'Bóveda de Drive al día' : 'No había cambios');
  } catch (e) {
    vaultStatus(e?.partial ? e.message : `No se pudo sincronizar la bóveda: ${gErrorText(e, DRIVE)}`, true);
  } finally {
    vault.busy = false;
    renderVaultSettings();
  }
}

function renderVaultSettings() {
  if (typeof renderDriveBtn === 'function') renderDriveBtn();
  const g = gSettings();
  const ok = gAvailable();
  const mine = g.vaultDevice === deviceId();
  $('#gvault-on').disabled = !ok;
  $('#gvault-on').checked = !!g.vaultDevice && mine;
  $('#gvault-now').disabled = !ok || !mine || vault.busy;
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
