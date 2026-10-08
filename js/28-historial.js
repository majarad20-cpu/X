'use strict';

// ---------- Historial de versiones de las notas ----------
// Cada nota guarda en este dispositivo (IndexedDB, almacén «history») hasta 60 versiones: una por
// cada tanda de cambios (los cambios seguidos de menos de 5 minutos se juntan en una sola versión).
// Las notas con contraseña no guardan versiones, para no dejar su texto en claro.
const HISTORY_MAX = 60;
const HISTORY_GAP = 5 * 60 * 1000;
const historyMem = new Map(); // sin IndexedDB, solo mientras la página está abierta

function historyGet(noteId) {
  if (!idb.ok) return Promise.resolve(historyMem.get(noteId) || null);
  return new Promise((resolve) => {
    try {
      const req = idb.db.transaction('history').objectStore('history').get(noteId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function historyPut(rec) {
  if (!idb.ok) {
    historyMem.set(rec.noteId, rec);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    try {
      const tx = idb.db.transaction('history', 'readwrite');
      tx.objectStore('history').put(rec);
      tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

function forgetHistory(noteId) {
  historyMem.delete(noteId);
  if (!idb.ok) return;
  try {
    idb.db.transaction('history', 'readwrite').objectStore('history').delete(noteId);
  } catch {
    // Nada que borrar.
  }
}

// Las escrituras se encadenan para que dos instantáneas seguidas no se pisen.
let historyQueue = Promise.resolve();

function snapshotNote(note, { force = false } = {}) {
  if (!note || note.enc) return historyQueue;
  const body = note.body;
  const at = Date.now();
  historyQueue = historyQueue.then(async () => {
    const rec = (await historyGet(note.id)) || { noteId: note.id, versions: [] };
    const last = rec.versions[rec.versions.length - 1];
    if (last && last.body === body) return;
    if (last && !force && at - last.at < HISTORY_GAP && rec.versions.length > 1) last.body = body;
    else rec.versions.push({ at, body });
    // Dentro de una tanda se actualiza la última versión; se marca el momento del último cambio.
    rec.versions[rec.versions.length - 1].at = at;
    if (rec.versions.length > HISTORY_MAX) rec.versions.splice(0, rec.versions.length - HISTORY_MAX);
    await historyPut(rec);
  });
  return historyQueue;
}

// Al abrir una nota sin historial se guarda su estado actual como punto de partida.
function ensureBaseline(note) {
  if (!note || note.enc) return;
  historyQueue = historyQueue.then(async () => {
    if (await historyGet(note.id)) return;
    await historyPut({ noteId: note.id, versions: [{ at: note.updatedAt || Date.now(), body: note.body }] });
  });
}

// Diferencias por líneas (subsecuencia común más larga).
function lineDiff(a, b) {
  const A = a.split('\n');
  const B = b.split('\n');
  if (A.length * B.length > 4e6) return [...A.map((t) => ({ t, k: 'del' })), ...B.map((t) => ({ t, k: 'add' }))];
  const n = A.length;
  const m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      out.push({ t: A[i], k: 'same' });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ t: A[i++], k: 'del' });
    else out.push({ t: B[j++], k: 'add' });
  }
  while (i < n) out.push({ t: A[i++], k: 'del' });
  while (j < m) out.push({ t: B[j++], k: 'add' });
  return out;
}

const historyUI = { noteId: null, versions: [], index: 0 };

function versionWhen(at) {
  const d = new Date(at);
  const day = dateKey(d) === dateKey() ? 'Hoy' : dateKey(d) === dateKey(addDays(new Date(), -1)) ? 'Ayer' : d.toLocaleDateString('es', { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  return `${day}, ${d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`;
}

async function openHistory(note) {
  flushNoteSave();
  await snapshotNote(note, { force: false });
  const rec = await historyGet(note.id);
  historyUI.noteId = note.id;
  historyUI.versions = (rec?.versions || []).slice().reverse();
  // La primera es la actual: se empieza mostrando la anterior a ella.
  historyUI.index = historyUI.versions.length > 1 ? 1 : 0;
  $('#history').hidden = false;
  renderHistory();
  $('#history-close').focus();
}

function renderHistory() {
  const note = noteById(historyUI.noteId);
  if (!note) return closeHistory();
  const { versions, index } = historyUI;
  $('#history-title').textContent = `Historial de «${baseName(note.path)}»`;
  $('#history-list').replaceChildren(
    ...(versions.length
      ? versions.map((v, i) => {
          const d = lineDiff(v.body, note.body);
          const add = d.filter((x) => x.k === 'del').length; // líneas que la versión tiene y la actual no
          const del = d.filter((x) => x.k === 'add').length;
          const b = el('button', { className: `hv-item${i === index ? ' active' : ''}`, ariaCurrent: i === index ? 'true' : null }, [
            el('span', { className: 'hv-when' }, i === 0 && v.body === note.body ? `${versionWhen(v.at)} · actual` : versionWhen(v.at)),
            el('span', { className: 'hv-meta' }, v.body === note.body ? 'igual que ahora' : `${plural(v.body.split(/\s+/).filter(Boolean).length, 'palabra', 'palabras')} · +${add} −${del} líneas`),
          ]);
          b.addEventListener('click', () => {
            historyUI.index = i;
            renderHistory();
          });
          return b;
        })
      : [el('p', { className: 'muted' }, 'Aún no hay versiones guardadas de esta nota.')])
  );
  const v = versions[index];
  const view = $('#history-diff');
  if (!v) {
    view.replaceChildren();
    $('#history-restore').disabled = true;
    return;
  }
  $('#history-restore').disabled = v.body === note.body;
  const diff = lineDiff(note.body, v.body);
  $('#history-legend').textContent = v.body === note.body ? 'Esta versión es igual a la nota actual.' : 'En verde, lo que tenía esta versión y ya no está; en rojo, lo que se añadió después.';
  view.replaceChildren(
    ...diff.map((x) => el('div', { className: `hd-line ${x.k === 'add' ? 'hd-old' : x.k === 'del' ? 'hd-new' : ''}` }, [el('span', { className: 'hd-mark', ariaHidden: 'true' }, x.k === 'add' ? '+' : x.k === 'del' ? '−' : ' '), x.t || ' ']))
  );
}

function closeHistory() {
  $('#history').hidden = true;
  historyUI.noteId = null;
}

$('#history-close').addEventListener('click', closeHistory);
$('#history').addEventListener('click', (e) => {
  if (e.target.id === 'history') closeHistory();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#history').hidden) closeHistory();
});
$('#history-restore').addEventListener('click', async () => {
  const note = noteById(historyUI.noteId);
  const v = historyUI.versions[historyUI.index];
  if (!note || !v) return;
  // Lo de ahora queda también como versión, así que restaurar se puede deshacer.
  await snapshotNote(note, { force: true });
  note.body = v.body;
  note.updatedAt = Date.now();
  save();
  await snapshotNote(note, { force: true });
  closeHistory();
  renderAll();
  showToastMessage(`Restaurada la versión de ${versionWhen(v.at).toLowerCase()}`);
});

NOTE_MENU_EXTRA.push((note) => (note.enc ? null : { label: '🕘 Historial de versiones…', action: () => openHistory(note) }));
