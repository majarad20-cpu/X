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
// Bloques con listas que se fusionan por id, y sus claves.
const ID_LISTS = { state: ['tasks', 'habits', 'projects'], ideas: ['items'] };
const idList = (b, k) => (b === 'ideas' ? state.ideas : state[k]) || [];
const COUNTERS = ['pomodoros', 'focusMinutes', 'completions'];
const TOMB_TTL = 60 * 24 * 3600 * 1000;
const tombsOf = (name) => state.syncMeta.tombs?.[name] || [];
const tombOrder = (a, b) => String(a.k || '').localeCompare(String(b.k || '')) || String(a.id).localeCompare(String(b.id));
const bare = ({ updatedAt, ...rest }) => JSON.stringify(rest);
// JSON con las claves ordenadas: para comparar lo mismo venga en el orden que venga.
const canon = (v) => JSON.stringify(v, (k, x) => (isPlain(x) ? Object.fromEntries(Object.keys(x).sort().map((y) => [y, x[y]])) : x));
function sentData(name) {
  try {
    return JSON.parse(state.syncMeta.sent[name] || 'null') || undefined;
  } catch {
    return undefined;
  }
}
// La hora del primer cambio del usuario sin mirar (o ahora, si cambió sin pasar por save()).
const editStamp = () => sync.editAt || (document.documentElement.dataset.ready ? Date.now() : 0);

function localBuckets() {
  const out = new Map();
  const withGone = (name, data) => (tombsOf(name).length ? { ...data, gone: tombsOf(name) } : data);
  out.set('state', withGone('state', Object.fromEntries(CORE_KEYS.map((k) => [k, state[k]]))));
  out.set('ideas', withGone('ideas', { items: state.ideas }));
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

// Archivo: las tareas archivadas que se borraron viajan en «gone» ({ id, at }) para que otro
// dispositivo (que aún las tenga o gane con su copia) no las devuelva; una copia cambiada después
// (p. ej. con «Deshacer») gana a su borrado. Las anota syncMark en syncMeta.tombs.
function archiveGone(name) {
  return tombsOf(name);
}

// «gone» de antes eran solo id: se fechan con `at`.
const goneEntries = (gone, at) => (gone || []).map((g) => (isPlain(g) ? g : { id: g, at }));

// Llegan borrados de otro dispositivo: se quitan aquí (si no cambiaron después) y se recuerdan.
function archiveTakeGone(name, gone, at) {
  if (!gone?.length || state.syncMeta.sent[name] === undefined) return false;
  const tombs = (state.syncMeta.tombs ||= {});
  const byId = new Map(tombsOf(name).map((g) => [g.id, g]));
  goneEntries(gone, at).forEach((g) => byId.set(g.id, { id: g.id, at: Math.max(g.at || 0, byId.get(g.id)?.at || 0) }));
  const dead = (t) => byId.has(t.id) && (t.updatedAt || 0) <= byId.get(t.id).at;
  allTasks().filter((t) => byId.has(t.id) && !dead(t)).forEach((t) => byId.delete(t.id));
  tombs[name] = [...byId.values()].sort(tombOrder);
  const n = state.archive.length + state.tasks.length;
  state.archive = state.archive.filter((t) => !dead(t));
  state.tasks = state.tasks.filter((t) => !dead(t));
  if (state.archive.length + state.tasks.length === n) return false;
  dataRev++;
  return true;
}

// Antes de subir o de recibir: anota los borrados (lápidas), fecha cada elemento de las listas por id
// que cambió y cada bloque que empezó a diferir de lo último enviado (dirtyAt). `at` es la hora del
// primer cambio del usuario; 0, mantenimiento (no cuenta como cambio); null, solo tomar nota.
// Devuelve los bloques de aquí en JSON.
function syncMark(at) {
  const meta = state.syncMeta;
  const tombs = (meta.tombs ||= {});
  const dirty = (meta.dirtyAt ||= {});
  const now = Date.now();
  const live = new Map(allTasks().map((t) => [t.id, t]));
  const keep = (list) => list.filter((g) => now - g.at < TOMB_TTL).sort(tombOrder);
  const seenItems = new Set();
  for (const [b, keys] of Object.entries(ID_LISTS)) {
    const sent = sentData(b);
    const list = (tombs[b] || []).slice();
    for (const k of keys) {
      const items = idList(b, k).filter((x) => isPlain(x) && x.id !== undefined);
      const here = new Set(items.map((x) => x.id));
      const sentItems = new Map(((b === 'ideas' ? sent?.items : sent?.[k]) || []).filter(isPlain).map((x) => [x.id, x]));
      // Lo enviado que ya no está es un borrado (pasar al archivo no lo es).
      sentItems.forEach((x, id) => {
        if (!here.has(id) && !(k === 'tasks' && live.has(id)) && !list.some((g) => g.k === k && g.id === id)) list.push({ k, id, at: now });
      });
      items.forEach((x) => {
        const key = `${b}:${k}:${x.id}`;
        const json = bare(x);
        const gi = list.findIndex((g) => g.k === k && g.id === x.id);
        if (gi >= 0) {
          // Volvió tras borrarse (p. ej. con «Deshacer»): es un cambio nuevo, gana a la lápida.
          if (at !== null) x.updatedAt = Math.max(now, list[gi].at + 1, x.updatedAt || 0);
          list.splice(gi, 1);
        } else {
          const known = sync.items.has(key);
          const prev = known ? sync.items.get(key) : sentItems.has(x.id) ? bare(sentItems.get(x.id)) : undefined;
          // Al arrancar, lo que ya difería se fecha con el último cambio guardado.
          const t = !known && at === 0 ? state.updatedAt : at;
          if (json !== prev && t) x.updatedAt = Math.max(t, x.updatedAt || 0);
        }
        sync.items.set(key, bare(x));
        seenItems.add(key);
      });
    }
    const kept = keep(list);
    if (kept.length) tombs[b] = kept;
    else delete tombs[b];
  }
  sync.items.forEach((v, key) => !seenItems.has(key) && sync.items.delete(key));
  // Archivo: lo enviado que ya no está (ni en el archivo ni en la lista) es un borrado.
  for (const name of Object.keys(meta.sent).filter((n) => n.startsWith('archive-'))) {
    const sent = sentData(name) || {};
    const byId = new Map(tombsOf(name).map((g) => [g.id, g]));
    goneEntries(sent.gone, meta.times[name] || now).forEach((g) => !byId.has(g.id) && byId.set(g.id, { id: g.id, at: g.at }));
    // Lo borrado que vuelve (p. ej. con «Deshacer») es un cambio nuevo: gana a su lápida.
    const list = [...byId.values()].filter((g) => {
      const t = live.get(g.id);
      if (!t) return true;
      if (at !== null && (t.updatedAt || 0) <= g.at) t.updatedAt = Math.max(now, g.at + 1);
      return false;
    });
    (sent.items || []).forEach((t) => !live.has(t.id) && !byId.has(t.id) && list.push({ id: t.id, at: now }));
    const kept = keep(list);
    if (kept.length) tombs[name] = kept;
    else delete tombs[name];
  }
  const out = new Map();
  for (const [name, data] of localBuckets()) {
    const json = JSON.stringify(data);
    out.set(name, json);
    if (json === meta.sent[name]) delete dirty[name];
    else if (!dirty[name] && at !== null && sync.seen.get(name) !== json) {
      // La primera vez (al arrancar) lo que ya difería se fecha con el último cambio guardado.
      const t = sync.seen.has(name) ? at : state.updatedAt || at;
      if (t) dirty[name] = t;
    }
    sync.seen.set(name, json);
  }
  Object.keys(dirty).forEach((n) => !out.has(n) && delete dirty[n]);
  return out;
}

// Llamada desde save(): un cambio del usuario se fecha; el mantenimiento del arranque se anota ya.
function syncNoteEdit(quiet) {
  if (quiet) syncMark(0);
  else sync.editAt ||= Date.now();
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
    const gone = new Map(archiveGone(name).map((g) => [g.id, g.at]));
    goneEntries(data.gone, Date.now()).forEach((g) => gone.set(g.id, Math.max(g.at || 0, gone.get(g.id) || 0)));
    // Una copia cambiada después de borrarse gana (y su borrado se olvida).
    const dead = (t) => gone.has(t.id) && (t.updatedAt || 0) <= gone.get(t.id);
    const incoming = (data.items || []).filter((t) => !dead(t));
    const ids = new Set(incoming.map((t) => t.id));
    state.archive = state.archive.filter((t) => archiveMonth(t) !== m).concat(incoming);
    // Si otro dispositivo archivó una tarea, aquí deja de estar en la lista activa.
    state.tasks = state.tasks.filter((t) => !ids.has(t.id) && !dead(t));
    allTasks().forEach((t) => gone.delete(t.id));
    const tombs = (state.syncMeta.tombs ||= {});
    if (gone.size) tombs[name] = [...gone].map(([id, at]) => ({ id, at })).sort(tombOrder);
    else delete tombs[name];
  } else if (name.startsWith('note-') && data.note) {
    const id = data.note.id;
    const i = state.notes.findIndex((x) => x.id === id);
    // Llegó otra versión de una nota desbloqueada: el texto en memoria ya no vale (se vuelve a bloquear).
    // Se protegió en otro dispositivo: fuera el historial en claro de aquí (versiones y deshacer).
    if (data.note.enc && i >= 0 && !state.notes[i].enc) {
      if (typeof forgetHistory === 'function') forgetHistory(id);
      if (typeof noteHist !== 'undefined') noteHist.delete(id);
    }
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

// Fusión a tres bandas (b: lo último enviado o recibido): lo que solo cambió de un lado se queda;
// si cambió en los dos, en los objetos se mira clave a clave, los contadores por día se quedan con el
// mayor y en lo demás gana `localWins`.
function merge3(b, l, r, localWins, max) {
  const [jb, jl, jr] = [b, l, r].map((x) => JSON.stringify(x));
  if (jl === jr || jl === jb) return r;
  if (jr === jb) return l;
  if (isPlain(l) && isPlain(r)) {
    const out = {};
    for (const k of new Set([...Object.keys(l), ...Object.keys(r)])) {
      const v = merge3(isPlain(b) ? b[k] : undefined, l[k], r[k], localWins, max);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  if (max && typeof l === 'number' && typeof r === 'number') return Math.max(l, r);
  return localWins ? l : r;
}

// Lista con id: cada elemento por separado (gana el updatedAt más reciente). Lo que falta de un lado
// y del otro no cambió desde `base` se borró; con lápida más reciente que el elemento, también.
function mergeList(k, base, local, remote, tombs) {
  const J = JSON.stringify;
  const B = new Map(base.map((x) => [x.id, J(x)]));
  const L = new Map(local.map((x) => [x.id, x]));
  const R = new Map(remote.map((x) => [x.id, x]));
  const pick = (id) => {
    const l = L.get(id);
    const r = R.get(id);
    const b = B.get(id);
    let x = l && r ? (J(l) === b ? r : J(r) === b ? l : finNewer(l, r) > 0 ? l : r) : l || r;
    if (!(l && r) && b !== undefined && J(x) === b) x = null;
    const g = x && tombs.get(`${k}:${id}`);
    return g && (x.updatedAt || 0) <= g.at ? null : x;
  };
  // Manda el orden de la nube, salvo que allí no haya cambiado (entonces, el de aquí).
  const same = J(remote.map((x) => x.id)) === J(base.map((x) => x.id));
  const [first, second] = same ? [local, remote] : [remote, local];
  const done = new Set();
  const out = [];
  first.forEach((y) => {
    done.add(y.id);
    const x = pick(y.id);
    if (x) out.push(x);
  });
  let after = -1;
  second.forEach((y) => {
    if (done.has(y.id)) {
      after = out.findIndex((x) => x.id === y.id);
      return;
    }
    done.add(y.id);
    const x = pick(y.id);
    if (x) out.splice(++after, 0, x);
  });
  return out;
}

// state e ideas: se fusionan siempre, elemento a elemento y con las lápidas de los dos lados.
function mergeIdBucket(name, base, local, remote, localWins) {
  const keys = ID_LISTS[name];
  const tombs = new Map();
  [...(local?.gone || []), ...(remote.gone || [])].forEach((g) => {
    const key = `${g.k}:${g.id}`;
    if ((tombs.get(key)?.at || 0) < g.at) tombs.set(key, g);
  });
  const out = {};
  for (const k of new Set([...Object.keys(local || {}), ...Object.keys(remote)])) {
    if (k === 'gone' || k === 'updatedAt' || keys.includes(k)) continue;
    const v = merge3(base?.[k], local?.[k], remote[k], localWins, COUNTERS.includes(k));
    if (v !== undefined) out[k] = v;
  }
  for (const k of keys) {
    const ok = (list) => (Array.isArray(list) ? list.filter((x) => isPlain(x) && x.id !== undefined) : []);
    out[k] = mergeList(k, ok(base?.[k]), ok(local?.[k]), ok(remote[k]), tombs);
    out[k].forEach((x) => tombs.delete(`${k}:${x.id}`));
  }
  const gone = [...tombs.values()].filter((g) => Date.now() - g.at < TOMB_TTL).sort(tombOrder);
  if (gone.length) out.gone = gone;
  return out;
}

// Tras fusionar, los contadores de enfoque de cada día no se quedan por debajo de las sesiones
// completas que hay en focusLog (cada dispositivo pudo sumar las suyas).
function focusCounters() {
  const n = {};
  const min = {};
  (state.focusLog || []).forEach((r) => {
    if (!r?.completed || !r.date) return;
    n[r.date] = (n[r.date] || 0) + 1;
    min[r.date] = (min[r.date] || 0) + (r.minutes || 0);
  });
  Object.keys(n).forEach((d) => {
    if ((state.pomodoros[d] || 0) < n[d]) state.pomodoros[d] = n[d];
    if ((state.focusMinutes[d] || 0) < min[d]) state.focusMinutes[d] = min[d];
  });
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
    const buckets = syncMark(editStamp());
    sync.editAt = 0;
    const startSent = { ...meta.sent };
    for (const [name, json] of buckets) {
      if (meta.sent[name] === json) continue;
      // Mientras se subían otros llegó una versión de este bloque: se vuelve a mirar al terminar.
      if (meta.sent[name] !== startSent[name]) {
        sync.dirty = true;
        continue;
      }
      // La versión siempre crece, aunque el reloj de aquí vaya por detrás del de otro dispositivo.
      const now = Math.max(Date.now(), (meta.times[name] || 0) + 1);
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
      delete meta.dirtyAt[name];
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
  // Lo cambiado aquí hasta ahora queda fechado antes de mezclar nada.
  syncMark(editStamp());
  sync.editAt = 0;
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
    // Ya lo tenemos (o lo subimos nosotros). Se compara la versión exacta: un reloj atrasado no cuenta.
    if (remoteAt === (meta.times[name] || 0)) continue;

    const localData = ID_LISTS[name] ? localBuckets().get(name) : local.get(name);
    const localJson = localData && JSON.stringify(localData);
    const localDirty = localData !== undefined && localJson !== meta.sent[name];
    // Nunca se pisa con una copia vacía lo que este dispositivo tiene sin subir.
    if (localDirty && meta.sent[name] === undefined && bucketIsEmpty(name, body) && !bucketIsEmpty(name, localData)) continue;
    // Si este bloque empezó a cambiar aquí después que en la nube, gana el de aquí (la bitácora siempre se fusiona).
    // La primera vez que llega un bloque no gana nunca la copia de aquí: se junta con la de la nube.
    const isLog = name.startsWith('log-') || isFinMonth(name) || isPomoMonth(name);
    const firstSync = meta.sent[name] === undefined;
    const ln = name.startsWith('note-') && localData?.note;
    const localAt = Math.max(meta.dirtyAt?.[name] || 0, (ln && localDirty && ln.updatedAt) || 0);
    const pending = ln && ((noteSaveTimer && activeNote()?.id === ln.id) || encryptTimers.has(ln.id));
    // Una nota protegida aquí no la pisa una copia en claro más antigua (se vuelve a subir la cifrada).
    if (ln?.enc && body.note && !body.note.enc && (body.note.updatedAt || 0) <= (ln.updatedAt || 0)) {
      if (!localDirty) meta.sent[name] = '';
      meta.times[name] = remoteAt;
      changed = true;
      continue;
    }
    const localWins = !firstSync && localDirty && (localAt > remoteAt || !!pending);

    // state e ideas: elemento a elemento (lo de aquí sin subir y lo de la nube se juntan).
    if (ID_LISTS[name]) {
      const merged = mergeIdBucket(name, sentData(name), localData, body, localWins);
      applyBucket(name, merged);
      if (merged.gone) meta.tombs[name] = merged.gone;
      else delete meta.tombs[name];
      // Si lo fusionado es distinto de la nube, se vuelve a subir.
      const mine = localBuckets().get(name);
      meta.sent[name] = canon(mine) === canon(body) ? JSON.stringify(mine) : JSON.stringify(body);
      meta.times[name] = remoteAt;
      changed = true;
      continue;
    }

    // Tareas archivadas borradas en otro dispositivo: no vuelven aunque aquí gane la copia local.
    const goneHere = name.startsWith('archive-') && archiveTakeGone(name, body.gone, remoteAt);
    if (!isLog && localWins) {
      meta.times[name] = remoteAt;
      if (goneHere) changed = true;
      continue;
    }

    const incoming = !isLog && firstSync && localDirty ? mergeByIds(localData, body) : body;
    applyBucket(name, incoming);
    // Si al aplicar se quitaron tareas borradas aquí, la versión de aquí se vuelve a subir.
    const merged = (incoming !== body && JSON.stringify(incoming) !== JSON.stringify(body)) || (name.startsWith('archive-') && canon(localBuckets().get(name)) !== canon(body));
    // Tras fusionar (la bitácora o una primera vez), lo que quede distinto de la nube se vuelve a subir.
    meta.sent[name] = isLog || merged ? JSON.stringify(body) : JSON.stringify(localBuckets().get(name) ?? body);
    meta.times[name] = remoteAt;
    changed = true;
  }

  // Mapas, notas… que ya no están en la nube: otro dispositivo los borró (si aquí no cambiaron).
  // No con la primera foto de la sesión ni con una de la caché, ni si la nube llega vacía teniendo aquí
  // datos: una foto incompleta no borra nada. Lo que nunca se sincronizó desde aquí tampoco.
  const partial = first || snap.metadata?.fromCache || (!snap.docs.length && [...local.keys()].some((n) => /^(map|note|canvas|trash)-/.test(n)));
  for (const name of partial ? [] : Object.keys(meta.sent)) {
    if (remoteNames.has(name) || !/^(map|note|canvas|trash)-/.test(name) || !meta.sent[name]) continue;
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
  if (changed) focusCounters();
  // Lo recibido no es un cambio de aquí.
  syncMark(null);

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

  // Lo sincronizado se recuerda por usuario: con otra cuenta en este navegador se empieza de cero
  // (y la de antes se guarda para cuando vuelva).
  const meta = state.syncMeta;
  if (meta.user && meta.user !== id) {
    const others = (state.syncUsers ||= {});
    others[meta.user] = meta;
    state.syncMeta = others[id] || { sent: {}, times: {}, dirtyAt: {}, tombs: {} };
    delete others[id];
    sync.seen.clear();
    sync.items.clear();
  }
  state.syncMeta.user = id;
  state.syncMeta.dirtyAt ||= {};
  state.syncMeta.tombs ||= {};

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
