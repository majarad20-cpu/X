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
          const note = state.notes.find((n) => n.path.toLowerCase() === path.toLowerCase());
          if (note && !m.files[note.id]) m.files[note.id] = { id: f.id, path: note.path, at: 0, mt: f.modifiedTime || '' };
        }
      }
    };
    await walk(root, '');
    saveVaultMap();
  }
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
  for (const id of gone) {
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
      // Un .md nuevo que pusiste en la carpeta de la bóveda: pasa a ser una nota.
      const folder = folderPath.get(f.parentId);
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

async function syncVault({ manual = false, adopt = false } = {}) {
  if (!vaultOn() || vault.busy) return;
  vault.busy = true;
  if (manual) vaultStatus('Sincronizando con Drive…');
  if (typeof renderDriveBtn === 'function') renderDriveBtn();
  try {
    const pulled = Date.now() - (vaultMap().lastPull || 0) > VAULT_PULL_MS || manual ? await pullVault() : 0;
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
