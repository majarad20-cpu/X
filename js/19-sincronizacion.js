'use strict';

// ---------- Sincronización entre dispositivos ----------
// Dentro de Claude, los datos se guardan también en un almacén privado del usuario, así
// el móvil y el ordenador ven lo mismo. Fuera de Claude la app usa solo este navegador.
//
// Los datos se reparten en bloques (cada documento admite hasta 256 KB):
//   state            tareas, hábitos, proyectos, ajustes y estadísticas
//   ideas            notas de ideas
//   journal-AAAA-MM  entradas del diario de ese mes
//   archive-AAAA-MM  tareas completadas archivadas ese mes
//   log-AAAA-MM      bitácora de hitos de ese mes (se fusiona, no se pisa)
//   map-<id>         cada mapa mental
//   canvas-<id>      cada lienzo
//   file-<id>        cada imagen (26-imagenes.js)
//   note-<id>        cada nota
//   trash-<id>       cada nota en la papelera (57-papelera-captura.js)
//   fin-AAAA-MM      movimientos de finanzas de ese mes (se fusionan por id: 65-finanzas.js)
//   fin-meta         categorías, gastos fijos y ajustes de finanzas
//   pomo-AAAA-MM     sesiones de enfoque de ese mes (se fusionan por id: 03-pomodoro.js)
// Cada bloque se sube solo cuando cambia, con una versión que siempre crece (aunque el reloj vaya
// atrasado). Si dos dispositivos lo cambian, gana el que empezó a cambiarlo después (dirtyAt), salvo
// state e ideas, que se fusionan elemento a elemento (por id; gana el updatedAt más reciente) y con
// lápidas («gone») para que lo borrado no vuelva.
// seen/items: cómo estaban los bloques y los elementos la última vez que se miró (syncMark).
const sync = { col: null, writing: false, dirty: false, timeout: null, editAt: 0, seen: new Map(), items: new Map() };

const SYNC_LABEL = {
  local: 'Guardado en este dispositivo',
  saving: 'Guardando…',
  synced: 'Sincronizado',
  error: 'Sin sincronizar: guardado en este dispositivo',
  full: 'Sin sincronizar: espacio lleno (ver Ajustes)',
};

function setSyncStatus(status) {
  const node = $('#sync-status');
  node.textContent = SYNC_LABEL[status];
  node.dataset.state = status;
}

const monthOf = (date) => date.slice(0, 7);
const archiveMonth = (t) => dateKey(new Date(t.completedAt || t.createdAt)).slice(0, 7);
const logOrder = (a, b) => a.at - b.at || String(a.id).localeCompare(String(b.id));
const isFinMonth = (name) => /^fin-\d/.test(name);
const isPomoMonth = (name) => /^pomo-\d/.test(name);
// De dos versiones de un movimiento gana la más reciente (con desempate fijo, igual en todos los dispositivos).
const finNewer = (a, b) => (a.updatedAt || 0) - (b.updatedAt || 0) || (JSON.stringify(a) > JSON.stringify(b) ? 1 : -1);

function localBuckets() {
  const out = new Map();
  out.set('state', Object.fromEntries(CORE_KEYS.map((k) => [k, state[k]])));
  out.set('ideas', { items: state.ideas });
  const months = new Set(state.journal.map((e) => monthOf(e.date)));
  // Un mes que se quedó sin entradas se sube vacío para que los demás dispositivos lo vacíen también.
  Object.keys(state.syncMeta.sent).filter((n) => n.startsWith('journal-')).forEach((n) => months.add(n.slice(8)));
  months.forEach((m) => out.set(`journal-${m}`, { items: state.journal.filter((e) => monthOf(e.date) === m) }));
  const logMonths = new Set(state.log.map((e) => monthOf(e.date)));
  Object.keys(state.syncMeta.sent).filter((n) => n.startsWith('log-')).forEach((n) => logMonths.add(n.slice(4)));
  logMonths.forEach((m) => out.set(`log-${m}`, { items: state.log.filter((e) => monthOf(e.date) === m).sort(logOrder) }));
  const archMonths = new Set(state.archive.map((t) => archiveMonth(t)));
  Object.keys(state.syncMeta.sent).filter((n) => n.startsWith('archive-')).forEach((n) => archMonths.add(n.slice(8)));
  archMonths.forEach((m) => {
    const gone = archiveGone(`archive-${m}`);
    out.set(`archive-${m}`, { items: state.archive.filter((t) => archiveMonth(t) === m), ...(gone.length ? { gone } : {}) });
  });
  // Finanzas: un bloque por mes (los borrados van con marca «del») y fin-meta, solo si ya se usan.
  const fin = state.finance || {};
  const finTx = fin.tx || [];
  const finMonths = new Set(finTx.map((t) => monthOf(t.date)));
  Object.keys(state.syncMeta.sent).filter(isFinMonth).forEach((n) => finMonths.add(n.slice(4)));
  finMonths.forEach((m) => out.set(`fin-${m}`, { items: finTx.filter((t) => monthOf(t.date) === m).sort((a, b) => String(a.id).localeCompare(String(b.id))) }));
  if (finTx.length || fin.edited || state.syncMeta.sent['fin-meta'] !== undefined) {
    const { tx, ...meta } = fin;
    out.set('fin-meta', meta);
  }
  // Sesiones de enfoque: un bloque por mes, ordenadas por id.
  const pomo = state.focusLog || [];
  const pomoMonths = new Set(pomo.map((r) => monthOf(r.date)));
  Object.keys(state.syncMeta.sent).filter(isPomoMonth).forEach((n) => pomoMonths.add(n.slice(5)));
  pomoMonths.forEach((m) => out.set(`pomo-${m}`, { items: pomo.filter((r) => monthOf(r.date) === m).sort((a, b) => String(a.id).localeCompare(String(b.id))) }));
  state.maps.forEach((m) => out.set(`map-${m.id}`, { map: m }));
  state.canvases.forEach((c) => out.set(`canvas-${c.id}`, { canvas: c }));
  state.notes.forEach((n) => out.set(`note-${n.id}`, { note: n }));
  (state.trash || []).forEach((t) => out.set(`trash-${t.id}`, { item: t }));
  return out;
}

// Archivo: los id de tareas archivadas que se borraron viajan en «gone», para que otro dispositivo
// (que aún las tenga o gane con su copia) no las devuelva. Salen de lo último enviado de ese mes:
// lo que se envió y ya no está ni en el archivo ni en la lista (restaurar no cuenta como borrar).
function archiveGone(name) {
  let sent = {};
  try {
    sent = JSON.parse(state.syncMeta.sent[name] || '{}');
  } catch {}
  const live = new Set(allTasks().map((t) => t.id));
  return [...new Set([...(sent.gone || []), ...(sent.items || []).map((t) => t.id)])].filter((id) => !live.has(id)).sort();
}

// Llegan borrados de otro dispositivo: se quitan aquí y se recuerdan para seguir enviándolos.
function archiveTakeGone(name, gone) {
  if (!gone?.length || state.syncMeta.sent[name] === undefined) return false;
  const sent = JSON.parse(state.syncMeta.sent[name]);
  sent.gone = [...new Set([...(sent.gone || []), ...gone])].sort();
  state.syncMeta.sent[name] = JSON.stringify(sent);
  const ids = new Set(gone);
  const n = state.archive.length + state.tasks.length;
  state.archive = state.archive.filter((t) => !ids.has(t.id));
  state.tasks = state.tasks.filter((t) => !ids.has(t.id));
  if (state.archive.length + state.tasks.length === n) return false;
  dataRev++;
  return true;
}

function bucketIsEmpty(name, data) {
  if (name === 'state') return !data.tasks?.length && !data.habits?.length && !data.projects?.length;
  if (name.startsWith('map-')) return !data.map;
  if (name.startsWith('canvas-')) return !data.canvas;
  if (name.startsWith('note-')) return !data.note;
  if (name.startsWith('trash-')) return !data.item;
  if (name === 'fin-meta') return !data.categories?.length && !data.recurring?.length;
  return !data.items?.length;
}

function applyBucket(name, data) {
  dataRev++;
  if (name === 'state') {
    const fresh = defaults();
    for (const k of CORE_KEYS) state[k] = data[k] ?? fresh[k];
    state.settings = { ...fresh.settings, ...state.settings };
  } else if (name === 'ideas') {
    state.ideas = data.items || [];
  } else if (name.startsWith('journal-')) {
    const m = name.slice(8);
    state.journal = state.journal.filter((e) => monthOf(e.date) !== m).concat(data.items || []);
  } else if (name.startsWith('log-')) {
    // La bitácora se fusiona: se juntan las anotaciones de ambos lados y una retirada gana.
    const byId = new Map(state.log.filter((e) => monthOf(e.date) === name.slice(4)).map((e) => [e.id, e]));
    (data.items || []).forEach((e) => {
      const mine = byId.get(e.id);
      byId.set(e.id, mine ? { ...mine, removed: mine.removed || e.removed } : e);
    });
    state.log = state.log.filter((e) => monthOf(e.date) !== name.slice(4)).concat([...byId.values()].sort(logOrder));
  } else if (name === 'fin-meta') {
    const { updatedAt, ...meta } = data;
    state.finance = { ...meta, tx: state.finance?.tx || [] };
  } else if (isFinMonth(name)) {
    // Se fusiona por id: gana la versión más reciente de cada movimiento (aunque cambiara de mes).
    const byId = new Map((state.finance?.tx || []).map((t) => [t.id, t]));
    (data.items || []).forEach((t) => {
      const mine = byId.get(t.id);
      if (!mine || finNewer(t, mine) > 0) byId.set(t.id, t);
    });
    state.finance = { ...state.finance, tx: [...byId.values()] };
  } else if (isPomoMonth(name)) {
    // Se fusiona por id: gana la versión más reciente de cada sesión (p. ej. con «¿Qué hiciste?»).
    const byId = new Map((state.focusLog || []).map((r) => [r.id, r]));
    (data.items || []).forEach((r) => {
      const mine = byId.get(r.id);
      if (!mine || finNewer(r, mine) > 0) byId.set(r.id, r);
    });
    state.focusLog = [...byId.values()];
  } else if (name.startsWith('archive-')) {
    const m = name.slice(8);
    const gone = new Set([...(data.gone || []), ...archiveGone(name)]);
    const incoming = (data.items || []).filter((t) => !gone.has(t.id));
    const ids = new Set([...incoming.map((t) => t.id), ...gone]);
    state.archive = state.archive.filter((t) => archiveMonth(t) !== m).concat(incoming);
    // Si otro dispositivo archivó una tarea, aquí deja de estar en la lista activa.
    state.tasks = state.tasks.filter((t) => !ids.has(t.id));
  } else if (name.startsWith('note-') && data.note) {
    const id = data.note.id;
    const i = state.notes.findIndex((x) => x.id === id);
    // Llegó otra versión de una nota desbloqueada: el texto en memoria ya no vale (se vuelve a bloquear).
    if (unlockedNotes.has(id) && (i < 0 || state.notes[i].enc?.ct !== data.note.enc?.ct)) {
      clearTimeout(encryptTimers.get(id));
      encryptTimers.delete(id);
      unlockedNotes.delete(id);
      lockKeys.delete(id);
    }
    if (i >= 0) state.notes[i] = data.note;
    else state.notes.push(data.note);
  } else if (name.startsWith('canvas-') && data.canvas) {
    const i = state.canvases.findIndex((x) => x.id === data.canvas.id);
    if (i >= 0) state.canvases[i] = data.canvas;
    else state.canvases.push(data.canvas);
  } else if (name.startsWith('map-') && data.map) {
    const i = state.maps.findIndex((x) => x.id === data.map.id);
    if (i >= 0) state.maps[i] = data.map;
    else state.maps.push(data.map);
  } else if (name.startsWith('trash-') && data.item) {
    const list = (state.trash ||= []);
    const i = list.findIndex((x) => x.id === data.item.id);
    if (i >= 0) list[i] = data.item;
    else list.push(data.item);
  }
}

// Primera vez que se recibe un bloque: manda la nube, pero lo que solo existe aquí se conserva
// (en las listas con id se juntan ambas; si un id está en las dos, gana la de la nube).
function mergeByIds(local, remote) {
  const out = { ...remote };
  for (const [k, v] of Object.entries(remote)) {
    const mine = local?.[k];
    const withIds = (list) => list.every((x) => x && typeof x === 'object' && x.id !== undefined);
    if (!Array.isArray(v) || !Array.isArray(mine) || !withIds(v) || !withIds(mine)) continue;
    const ids = new Set(v.map((x) => x.id));
    out[k] = v.concat(mine.filter((x) => !ids.has(x.id)));
  }
  return out;
}

function removeBucket(name) {
  if (name.startsWith('map-')) state.maps = state.maps.filter((m) => `map-${m.id}` !== name);
  if (name.startsWith('canvas-')) state.canvases = state.canvases.filter((c) => `canvas-${c.id}` !== name);
  if (name.startsWith('note-')) state.notes = state.notes.filter((n) => `note-${n.id}` !== name);
  if (name.startsWith('trash-')) state.trash = (state.trash || []).filter((t) => `trash-${t.id}` !== name);
}

function dedupeNotes() {
  const keep = new Map();
  const drop = new Set();
  state.notes
    .slice()
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || a.id.localeCompare(b.id))
    .forEach((n) => {
      const key = `${n.path}\u0000${n.enc ? JSON.stringify(n.enc) : n.body}`;
      if (keep.has(key)) drop.add(n.id);
      else keep.set(key, n);
    });
  if (!drop.size) return false;
  state.notes = state.notes.filter((n) => !drop.has(n.id));
  return true;
}

function scheduleSync() {
  if (!sync.col) return;
  setSyncStatus('saving');
  clearTimeout(sync.timeout);
  sync.timeout = setTimeout(pushState, 800);
}

// Sube los bloques que cambiaron, de uno en uno; si hubo cambios mientras tanto, repite al terminar.
async function pushState() {
  if (!sync.col || idb.blocked) return;
  if (sync.writing) {
    sync.dirty = true;
    return;
  }
  sync.writing = true;
  const meta = state.syncMeta;
  let tooBig = false;
  try {
    const buckets = localBuckets();
    const startSent = { ...meta.sent };
    for (const [name, data] of buckets) {
      const json = JSON.stringify(data);
      if (meta.sent[name] === json) continue;
      // Mientras se subían otros llegó una versión de este bloque: se vuelve a mirar al terminar.
      if (meta.sent[name] !== startSent[name]) {
        sync.dirty = true;
        continue;
      }
      const now = Date.now();
      try {
        await sync.col.doc(name).set({ ...JSON.parse(json), updatedAt: now });
      } catch (e) {
        // Un bloque por encima del límite se rechaza; los demás se siguen subiendo.
        if (e?.code !== 'invalid_argument') throw e;
        tooBig = true;
        continue;
      }
      meta.sent[name] = json;
      meta.times[name] = now;
    }
    // Mapas, notas, lienzos y elementos de la papelera borrados en este dispositivo.
    for (const name of Object.keys(meta.sent)) {
      if (/^(map|note|canvas|trash)-/.test(name) && !buckets.has(name) && meta.sent[name] === startSent[name] && !localBuckets().has(name)) {
        await sync.col.doc(name).delete();
        delete meta.sent[name];
        delete meta.times[name];
      }
    }
    await pushFiles();
    saveLocal();
    setSyncStatus(tooBig ? 'full' : 'synced');
  } catch {
    setSyncStatus('error');
  } finally {
    updateStorageWarning();
    sync.writing = false;
    if (sync.dirty) {
      sync.dirty = false;
      pushState();
    }
  }
}

function receiveSnapshot(snap, first) {
  const meta = state.syncMeta;
  const local = localBuckets();
  const remoteNames = new Set();
  let changed = false;

  for (const doc of snap.docs) {
    const name = doc.id;
    remoteNames.add(name);
    // Las imágenes van aparte: no cambian y no forman parte del estado (26-imagenes.js).
    if (name.startsWith('file-')) {
      receiveFile(name, doc.data());
      continue;
    }
    const body = JSON.parse(JSON.stringify(doc.data()));
    const remoteAt = body.updatedAt || 0;
    delete body.updatedAt;
    if (remoteAt <= (meta.times[name] || 0)) continue; // ya lo tenemos (o lo subimos nosotros)

    const localData = local.get(name);
    const localJson = localData && JSON.stringify(localData);
    const localDirty = localData !== undefined && localJson !== meta.sent[name];
    // Nunca se pisa con una copia vacía lo que este dispositivo tiene sin subir.
    if (localDirty && meta.sent[name] === undefined && bucketIsEmpty(name, body) && !bucketIsEmpty(name, localData)) continue;
    // Si este bloque cambió aquí después que en la nube, gana el de aquí (la bitácora siempre se fusiona).
    // La primera vez que llega un bloque no gana nunca la copia de aquí: se junta con la de la nube.
    const isLog = name.startsWith('log-') || isFinMonth(name) || isPomoMonth(name);
    const firstSync = meta.sent[name] === undefined;
    const ln = name.startsWith('note-') && localData?.note;
    const localAt = Math.max(state.updatedAt || 0, (ln && ln.updatedAt) || 0);
    const pending = ln && ((noteSaveTimer && activeNote()?.id === ln.id) || encryptTimers.has(ln.id));
    // Tareas archivadas borradas en otro dispositivo: no vuelven aunque aquí gane la copia local.
    const goneHere = name.startsWith('archive-') && archiveTakeGone(name, body.gone);
    if (!isLog && localDirty && !firstSync && (localAt > remoteAt || pending)) {
      if (goneHere) changed = true;
      continue;
    }

    const incoming = !isLog && firstSync && localDirty ? mergeByIds(localData, body) : body;
    applyBucket(name, incoming);
    // Si al aplicar se quitaron tareas borradas aquí, la versión de aquí se vuelve a subir.
    const merged = (incoming !== body && JSON.stringify(incoming) !== JSON.stringify(body)) || (name.startsWith('archive-') && JSON.stringify(localBuckets().get(name)) !== JSON.stringify(body));
    // Tras fusionar (la bitácora o una primera vez), lo que quede distinto de la nube se vuelve a subir.
    meta.sent[name] = isLog || merged ? JSON.stringify(body) : JSON.stringify(localBuckets().get(name) ?? body);
    meta.times[name] = remoteAt;
    changed = true;
  }

  // Mapas que ya no están en la nube: otro dispositivo los borró (si aquí no cambiaron).
  for (const name of Object.keys(meta.sent)) {
    if (remoteNames.has(name) || !/^(map|note|canvas|trash)-/.test(name)) continue;
    const localData = local.get(name);
    if (localData && JSON.stringify(localData) !== meta.sent[name]) continue;
    removeBucket(name);
    delete meta.sent[name];
    delete meta.times[name];
    changed = true;
  }

  // Cada dispositivo pudo crear su propia nota de bienvenida (u otra igual): las copias idénticas
  // (misma ruta y mismo texto) se juntan en la más antigua.
  if (dedupeNotes()) changed = true;

  if (changed) {
    saveLocal();
    applySettings();
    if (!timer.endsAt) setMode(timer.mode);
    renderAll();
  }
  if (first || changed) pushState();
  else setSyncStatus('synced');
}

async function startSync() {
  if (!window.claude?.use) return;
  const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
  const id = user && (await user.id());
  if (!db || !id) return;

  sync.col = db.collection(`data/users/${id}`);
  let first = true;
  sync.col.onSnapshot(
    (snap) => {
      if (snap.metadata.hasPendingWrites) return;
      receiveSnapshot(snap, first);
      first = false;
    },
    () => setSyncStatus('error')
  );
}
