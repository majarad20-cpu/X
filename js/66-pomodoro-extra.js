'use strict';

// ---------- Pomodoro con contexto ----------
// El temporizador está en 03-pomodoro.js. Aquí: con qué se trabaja (tarea, nota, proyecto o libre),
// el tiempo dedicado a cada cosa, avisos (sonido WebAudio, notificación del sistema y aviso en la
// app), ajustes y estadísticas. Cada sesión queda en state.focusLog y viaja en bloques mensuales
// pomo-AAAA-MM (19-sincronizacion.js).

// ---------- Contexto ----------
const POMO_ICON = { task: '☑', note: '📝', project: '📁', free: '🍅' };

function pomoCtxOf(type, x) {
  if (type === 'task') return { type, id: x.id, label: x.title };
  if (type === 'note') return { type, id: x.id, label: baseName(x.path) };
  if (type === 'project') return { type, id: x.id, label: x.name };
  return { type: 'free', id: null, label: String(x || '') };
}
const pomoCtxValue = (c) => (!c || c.type === 'free' ? '' : c.type === 'task' ? c.id : `${c.type}:${c.id}`);
function pomoParseValue(v) {
  if (!v) return null;
  const m = /^(note|project):(.+)$/.exec(v);
  return m ? { type: m[1], id: m[2] } : { type: 'task', id: v };
}

// La cosa a la que apunta un contexto (o null si ya no existe).
function pomoCtxTarget(c) {
  if (!c?.id) return null;
  if (c.type === 'task') return allTasks().find((t) => t.id === c.id) || null;
  if (c.type === 'note') return noteById(c.id) || null;
  if (c.type === 'project') return projectById(c.id) || null;
  return null;
}
// Nombre actual (si se renombró) o el que tenía al registrarse.
function pomoCtxName(c) {
  if (!c || c.type === 'free') return c?.label || 'Libre';
  const x = pomoCtxTarget(c);
  return x ? pomoCtxOf(c.type, x).label : c.label || 'Borrado';
}

function pomoCtxFromUI() {
  const sel = pomoParseValue($('#timer-task').value);
  const x = sel && pomoCtxTarget(sel);
  return x ? pomoCtxOf(sel.type, x) : pomoCtxOf('free', $('#timer-label').value.trim());
}

// Selector «Trabajando en»: tareas pendientes (las de hoy primero), notas recientes y proyectos.
function renderTimerTaskOptions(want) {
  const select = $('#timer-task');
  if (!want) want = timer.startedAt ? timer.ctx : pomoParseValue(select.value);
  const today = (t) => (isDueToday(t) ? 0 : 1);
  const lists = {
    task: state.tasks.filter((t) => !t.done).sort((a, b) => today(a) - today(b) || byImportance(a, b)).slice(0, 200),
    note: state.notes.filter((n) => !n.path.startsWith(`${TEMPLATE_FOLDER}/`)).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 30),
    project: state.projects.filter((p) => p.status !== 'done'),
  };
  const x = want && pomoCtxTarget(want);
  if (x && !lists[want.type].includes(x)) lists[want.type].unshift(x);
  const group = (label, opts) => (opts.length ? [el('optgroup', { label }, opts)] : []);
  select.replaceChildren(
    el('option', { value: '' }, '— Libre —'),
    ...group('Tareas', lists.task.map((t) => el('option', { value: t.id }, t.title))),
    ...group('Notas', lists.note.map((n) => el('option', { value: `note:${n.id}` }, `📝 ${baseName(n.path)}`))),
    ...group('Proyectos', lists.project.map((p) => el('option', { value: `project:${p.id}` }, `📁 ${p.name}`)))
  );
  select.value = x ? pomoCtxValue(want) : '';
  $('#timer-label').hidden = !!select.value;
  if (!select.value && want?.type === 'free' && document.activeElement !== $('#timer-label')) $('#timer-label').value = want.label || '';
}

// Cambiar el contexto con la sesión en marcha cambia el de esa sesión.
function pomoCtxChanged() {
  $('#timer-label').hidden = !!$('#timer-task').value;
  if (!timer.startedAt) return;
  timer.ctx = pomoCtxFromUI();
  saveRun();
}
$('#timer-task').addEventListener('change', pomoCtxChanged);
$('#timer-label').addEventListener('input', pomoCtxChanged);

// Empieza (o reorienta) una sesión de enfoque con algo ya elegido.
function pomoStart(type, x) {
  const ctx = x ? pomoCtxOf(type, x) : null;
  if (typeof leaveDayView === 'function') leaveDayView();
  showView('timer');
  if (timer.mode === 'focus' && timer.startedAt) {
    if (ctx) {
      timer.ctx = ctx;
      saveRun();
      renderTimerTaskOptions(ctx);
      showToastMessage(`Ahora trabajas en: ${ctx.label}`);
    }
    if (!timer.endsAt) startTimer();
    return;
  }
  if (timer.mode !== 'focus') setMode('focus');
  if (ctx) renderTimerTaskOptions(ctx);
  startTimer();
}

// ---------- Tiempo dedicado ----------
let pomoIdx = { rev: -1, map: new Map() };
function pomoIndex() {
  if (pomoIdx.rev === dataRev) return pomoIdx.map;
  const map = new Map();
  for (const r of state.focusLog || []) {
    if (!r.ctx?.id) continue;
    const k = `${r.ctx.type}:${r.ctx.id}`;
    const v = map.get(k) || { minutes: 0, count: 0 };
    v.minutes += r.minutes || 0;
    if (r.completed) v.count++;
    map.set(k, v);
  }
  pomoIdx = { rev: dataRev, map };
  return map;
}
const pomoTotals = (type, id) => pomoIndex().get(`${type}:${id}`) || { minutes: 0, count: 0 };
const pomoTimeText = ({ minutes, count }) => `⏱ ${formatMinutes(minutes)}${count ? ` (${count} 🍅)` : ''}`;
// En las tareas cuenta también el contador antiguo (pomodoros de antes del registro por sesión).
function pomoTaskTotals(t) {
  const tot = pomoTotals('task', t.id);
  return { minutes: tot.minutes, count: Math.max(tot.count, t.pomodoros || 0) };
}

// Fila del formulario de la tarea (02): tiempo dedicado y «▶ Pomodoro».
function pomoTaskRow(t) {
  const tot = pomoTaskTotals(t);
  const go = el('button', { type: 'button', className: 'chip pomo-go' }, '▶ Pomodoro');
  go.addEventListener('click', (e) => {
    e.preventDefault();
    pomoStart('task', t);
  });
  const text = tot.minutes ? pomoTimeText(tot) : tot.count ? `🍅 ${tot.count}` : 'Sin tiempo registrado';
  return el('div', { className: 'row pomo-row' }, [el('span', { className: 'pomo-time' }, text), ...(t.done ? [] : [go])]);
}

// Detalle de la fila de la tarea en las listas.
function pomoTaskMeta(t) {
  const tot = pomoTaskTotals(t);
  if (tot.minutes) return ` · ⏱ ${formatMinutes(tot.minutes)}${tot.count ? ` · 🍅 ${tot.count}` : ''}`;
  return tot.count ? ` · 🍅 ${tot.count}` : '';
}

// Línea de tiempo en «Relacionado» de una nota (60).
function pomoTimeLine(type, id) {
  const tot = pomoTotals(type, id);
  return tot.minutes ? el('p', { className: 'pomo-time rel-time' }, pomoTimeText(tot)) : null;
}

// Proyecto: lo dedicado al proyecto, a sus tareas y a sus notas.
function pomoProjectRows(p) {
  const rows = [];
  const add = (type, x) => {
    const tot = type === 'task' ? pomoTaskTotals(x) : pomoTotals(type, x.id);
    if (tot.minutes) rows.push({ type, x, ...tot });
  };
  add('project', p);
  allTasks().filter((t) => t.projectId === p.id).forEach((t) => add('task', t));
  if (typeof projectNotes === 'function') projectNotes(p).forEach(({ note }) => add('note', note));
  return rows.sort((a, b) => b.minutes - a.minutes);
}

function pomoProjectBlock(p) {
  const rows = pomoProjectRows(p);
  const total = rows.reduce((n, r) => ({ minutes: n.minutes + r.minutes, count: n.count + r.count }), { minutes: 0, count: 0 });
  const max = rows[0]?.minutes || 1;
  const go = el('button', { type: 'button', className: 'chip pomo-go' }, '▶ Pomodoro para el proyecto');
  go.addEventListener('click', () => pomoStart('project', p));
  const list = rows.map((r) => {
    const name = el('button', { type: 'button', className: 'rel-name' }, [el('span', { className: 'rel-ico', ariaHidden: 'true' }, POMO_ICON[r.type]), el('span', {}, r.type === 'project' ? 'El proyecto en general' : pomoCtxOf(r.type, r.x).label)]);
    name.addEventListener('click', () => relOpen(r.type, r.x));
    const bar = el('span', { className: 'pomo-bar' }, el('i', { style: `width:${Math.max(2, Math.round((r.minutes / max) * 100))}%` }));
    const row = el('div', { className: 'rel-row pomo-trow' }, [name, bar, el('span', { className: 'rel-meta' }, pomoTimeText(r))]);
    row.dataset.relType = r.type;
    row.dataset.relId = r.x.id;
    return row;
  });
  return el('section', { id: 'pd-time', className: 'pd-time' }, [
    el('h2', { className: 'section-title' }, ['Tiempo dedicado ', el('span', { className: 'muted' }, total.minutes ? pomoTimeText(total) : '')]),
    ...(list.length ? list : [el('p', { className: 'muted side-empty' }, 'Aún no hay sesiones de enfoque en este proyecto.')]),
    el('div', { className: 'row' }, go),
  ]);
}

// Sesiones de un día para el panel de la nota diaria (62), con su contexto.
function pomoDaySessions(key) {
  const hm = (ts) => new Date(ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  const recs = (state.focusLog || []).filter((r) => r.date === key);
  const ids = new Set(recs.map((r) => r.id));
  const rows = recs.map((r) => {
    const x = pomoCtxTarget(r.ctx);
    const name = x ? el('button', { type: 'button', className: 'dp-name', title: 'Abrir' }, `${POMO_ICON[r.ctx.type]} ${pomoCtxName(r.ctx)}`) : el('span', {}, r.ctx?.type === 'free' ? `🍅 ${r.ctx.label || 'Libre'}` : `${POMO_ICON[r.ctx?.type] || '🍅'} ${r.ctx?.label || 'Sesión'}`);
    if (x) name.addEventListener('click', () => relOpen(r.ctx.type, x));
    const li = el('li', { className: `dp-row pomo-session${r.completed ? '' : ' cut'}` }, [
      el('span', { className: 'dp-meta' }, `${hm(r.start)}–${hm(r.end)}`),
      name,
      el('span', { className: 'dp-meta' }, `${r.minutes} min${r.completed ? '' : ' · interrumpida'}`),
      ...(r.note ? [el('span', { className: 'muted pomo-session-note' }, `«${r.note}»`)] : []),
    ]);
    return { at: r.start, li };
  });
  // Pomodoros anteriores al registro por sesión: los de la bitácora.
  (state.log || [])
    .filter((e) => e.type === 'pomodoro' && e.date === key && !e.removed && !ids.has(e.pomo))
    .forEach((e) => rows.push({ at: e.at, li: el('li', { className: 'dp-row' }, [el('span', { className: 'dp-meta' }, hm(e.at)), el('span', {}, e.text)]) }));
  return rows.sort((a, b) => a.at - b.at).map((r) => r.li);
}

// ---------- Menús ----------
CTX_MENU_EXTRA.push((kind, x) => {
  if (!x?.id || x.virtual) return [];
  if (kind === 'task' && !x.done) return [{ sep: true }, { label: '▶ Pomodoro con esta tarea', action: () => pomoStart('task', x) }];
  if (kind === 'note') return [{ label: '▶ Pomodoro con esta nota', action: () => pomoStart('note', x) }];
  if (kind === 'project') return [{ label: '▶ Pomodoro para el proyecto', action: () => pomoStart('project', x) }];
  return [];
});
NOTE_MENU_EXTRA.push((note) => ({ label: '▶ Pomodoro con esta nota', action: () => pomoStart('note', note) }));
COMMANDS_EXTRA.push((note) => [
  { label: timer.endsAt ? '⏱ Ver el Pomodoro en marcha' : '▶ Empezar un Pomodoro', action: () => pomoStart() },
  ...(note ? [{ label: '▶ Pomodoro con esta nota', action: () => pomoStart('note', note) }] : []),
]);

// ---------- Sonido (WebAudio, sin archivos) ----------
// El navegador no deja sonar nada hasta el primer gesto: ahí se crea y desbloquea el AudioContext.
const POMO_TONES = {
  campana: { label: 'Campana', wave: 'sine', base: 880, dur: 1.2, attack: 0.005, partial: 2.76, gain: 1 },
  digital: { label: 'Digital', wave: 'square', base: 1000, dur: 0.12, attack: 0.002, gain: 0.35 },
  suave: { label: 'Suave', wave: 'sine', base: 523, dur: 0.7, attack: 0.08, gain: 1 },
  madera: { label: 'Madera', wave: 'triangle', base: 660, dur: 0.09, attack: 0.001, gain: 1 },
  ninguno: { label: 'Ninguno' },
};
// Al empezar sube, al terminar baja, y el aviso de 1 minuto es una nota aguda.
const POMO_PATTERN = { start: [1, 1.5], end: [1.5, 1.25, 1], warn: [2] };
const pomoSnd = { ctx: null, last: null };

function pomoAudioCtx() {
  if (pomoSnd.ctx) return pomoSnd.ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    pomoSnd.ctx = new AC();
  } catch {
    return null;
  }
  return pomoSnd.ctx;
}

const POMO_GESTURES = ['pointerdown', 'keydown', 'touchend'];
function pomoUnlockAudio() {
  if (!pomoCfg().sound) return;
  const ctx = pomoAudioCtx();
  try {
    if (ctx?.state === 'suspended') Promise.resolve(ctx.resume()).catch(() => {});
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, 22050);
    src.connect(ctx.destination);
    src.start(0);
  } catch {
    // Sin audio: quedan el aviso en la app y la notificación.
  }
  if (!ctx || ctx.state === 'running') POMO_GESTURES.forEach((ev) => document.removeEventListener(ev, pomoUnlockAudio, true));
}
POMO_GESTURES.forEach((ev) => document.addEventListener(ev, pomoUnlockAudio, true));

function pomoPlayTone(name, kind, vol = pomoCfg().volume / 100) {
  const tone = POMO_TONES[name];
  if (!tone?.wave || !(vol > 0)) return null;
  const ctx = pomoAudioCtx();
  if (!ctx) return null;
  const freqs = POMO_PATTERN[kind].map((m) => Math.round(tone.base * m));
  const voice = (f, at, dur, level) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = tone.wave;
    osc.frequency.setValueAtTime(f, at);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.35 * vol * tone.gain * level), at + tone.attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  };
  const play = () => {
    try {
      const t0 = ctx.currentTime + 0.02;
      const gap = Math.min(0.35, Math.max(0.16, tone.dur));
      freqs.forEach((f, i) => {
        voice(f, t0 + i * gap, tone.dur, 1);
        if (tone.partial) voice(f * tone.partial, t0 + i * gap, tone.dur / 2, 0.25);
      });
    } catch {
      // Sin audio disponible.
    }
  };
  // Un contexto suspendido (pestaña sin gesto todavía) se reanuda antes de sonar.
  if (ctx.state === 'suspended') Promise.resolve(ctx.resume()).then(play, () => {});
  else play();
  pomoSnd.last = { name, kind, freqs };
  return freqs;
}

function pomoSound(kind) {
  const c = pomoCfg();
  if (c.sound) pomoPlayTone(kind === 'start' ? c.toneStart : c.toneEnd, kind);
}

// ---------- Notificación del sistema ----------
// Dentro de Claude la página va en un marco aislado: lo normal es que no haya permiso.
function pomoNotifyState() {
  try {
    return 'Notification' in window && typeof Notification === 'function' ? Notification.permission || 'default' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}
const POMO_SYS_MSG = {
  unavailable: 'Aquí no hay notificaciones del sistema (este navegador, o la app dentro de Claude, no las permite). Te avisaremos dentro de la app y con sonido.',
  denied: 'Las notificaciones del sistema están bloqueadas para esta página (en el navegador o porque la app va dentro de Claude). Te avisaremos dentro de la app y con sonido.',
  default: 'Pulsa «Permitir notificaciones» para recibir avisos aunque estés en otra pestaña.',
  granted: 'Notificaciones del sistema activadas.',
};

function pomoSysNotify(title, body) {
  if (!pomoCfg().sys || pomoNotifyState() !== 'granted') return false;
  try {
    new Notification(title, { body, tag: 'enfoque-pomodoro' });
    return true;
  } catch {
    return false; // algunos navegadores móviles no las permiten desde la página
  }
}

function pomoAskPermission() {
  try {
    Promise.resolve(Notification.requestPermission()).catch(() => {}).then(refreshSettingsInputs);
  } catch {
    refreshSettingsInputs();
  }
}

// ---------- Aviso en la app (siempre) y título que parpadea con la pestaña oculta ----------
const pomoBan = { timeout: null, blink: null, extra: null };

function pomoAlert(text, { actions = [], extra = null, sticky = false, ms = 6000, kind = '' } = {}) {
  const box = $('#pomo-alert');
  const hidden = document.visibilityState === 'hidden';
  pomoBan.extra?.flush?.(); // lo escrito en el aviso anterior no se pierde
  pomoBan.extra = extra;
  const btn = (a) => {
    const b = el('button', { type: 'button', className: a.cls || '' }, a.label);
    b.addEventListener('click', () => {
      pomoAlertHide();
      a.fn();
    });
    return b;
  };
  const close = el('button', { type: 'button', className: 'pomo-alert-x', title: 'Cerrar', ariaLabel: 'Cerrar el aviso' }, '✕');
  close.addEventListener('click', pomoAlertHide);
  box.className = `pomo-alert${kind ? ` ${kind}` : ''}`;
  box.replaceChildren(el('p', { className: 'pomo-alert-text' }, text), ...(extra ? [extra] : []), ...(actions.length ? [el('div', { className: 'row pomo-alert-actions' }, actions.map(btn))] : []), close);
  box.hidden = false;
  clearTimeout(pomoBan.timeout);
  if (!sticky && !hidden) pomoBan.timeout = setTimeout(pomoAlertHide, ms);
  if (hidden) pomoBlink(text);
}

// Al cerrar el aviso se guarda lo escrito en «¿Qué hiciste?».
function pomoAlertHide() {
  pomoBan.extra?.flush?.();
  pomoBan.extra = null;
  clearTimeout(pomoBan.timeout);
  $('#pomo-alert').hidden = true;
}

function pomoBlink(text) {
  clearInterval(pomoBan.blink);
  timer.alert = true;
  let on = false;
  const step = () => {
    on = !on;
    document.title = on ? `🔔 ${text}` : timer.title;
  };
  step();
  pomoBan.blink = setInterval(step, 1000);
}

function pomoBlinkStop() {
  if (!timer.alert) return;
  clearInterval(pomoBan.blink);
  timer.alert = false;
  document.title = timer.title;
}
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && pomoBlinkStop());

// Confirmación propia (window.confirm puede estar bloqueado dentro de Claude).
function pomoConfirm(text, onYes) {
  pomoAlert(text, {
    sticky: true,
    kind: 'confirm',
    actions: [
      { label: 'Seguir enfocado', cls: 'primary', fn: () => {} },
      { label: 'Parar', cls: 'danger-chip', fn: onYes },
    ],
  });
  $('#pomo-alert .primary')?.focus();
}

// ---------- Avisos de cada fase ----------
const pomoHM = (ts) => hmNow(new Date(ts));

function pomoPhaseStart(mode) {
  if (mode !== 'focus') return;
  const c = timer.ctx;
  const name = c && (c.type !== 'free' || c.label) ? pomoCtxName(c) : '';
  const msg = `🍅 Enfoque de ${Math.round(timer.total / 60)} min${name ? ` · ${name}` : ''}`;
  pomoSound('start');
  pomoSysNotify('Enfoque', msg);
  pomoAlert(msg, { ms: 3500 });
}

function pomoPhaseEnd({ prev, next, completed, rec, end, late }) {
  if (!completed) return;
  const cfg = pomoCfg();
  const when = late > 60e3 ? ` (terminó a las ${pomoHM(end)})` : '';
  if (prev === 'focus') {
    const msg = `¡Pomodoro completado! Toca ${next === 'long' ? 'una pausa larga' : 'descansar'}.`;
    pomoSound('end');
    pomoSysNotify('🍅 Pomodoro completado', `${msg}${rec?.ctx && (rec.ctx.type !== 'free' || rec.ctx.label) ? ` ${pomoCtxName(rec.ctx)}` : ''}`);
    const actions = [];
    if (!cfg.autoBreak || late >= 90e3) actions.push({ label: 'Empezar la pausa', cls: 'primary', fn: () => startTimer() });
    actions.push({ label: 'Saltar descanso', fn: () => finishSession(false) });
    pomoAlert(msg + when, { actions, extra: cfg.ask && rec ? pomoNoteInput(rec) : null, sticky: true });
  } else {
    const msg = '¡Pausa terminada! A enfocarse.';
    pomoSound('start');
    pomoSysNotify('Enfoque', msg);
    const auto = cfg.autoFocus && late < 90e3;
    pomoAlert(msg + when, { actions: auto ? [] : [{ label: 'Empezar el pomodoro', cls: 'primary', fn: () => startTimer() }], sticky: !auto });
  }
}

function pomoWarn() {
  const msg = `⏳ Queda 1 minuto de ${MODE_LABEL[timer.mode].toLowerCase()}`;
  pomoSound('warn');
  pomoSysNotify('Enfoque', msg);
  pomoAlert(msg, { ms: 5000 });
}

// «¿Qué hiciste?» tras una sesión (opcional): se guarda en la sesión y, si se pidió, en la nota.
function pomoNoteInput(rec) {
  const input = el('input', { type: 'text', maxLength: 200, placeholder: '¿Qué hiciste? (opcional)', ariaLabel: '¿Qué hiciste?', className: 'pomo-note-input' });
  const ok = el('button', { type: 'button' }, 'Guardar');
  const box = el('div', { className: 'row pomo-note' }, [input, ok]);
  box.flush = () => {
    const v = input.value.trim();
    if (!v || box.dataset.saved) return;
    box.dataset.saved = '1';
    pomoSaveNote(rec.id, v);
  };
  ok.addEventListener('click', pomoAlertHide);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      pomoAlertHide();
    } else if (e.key === 'Escape') {
      input.value = '';
      pomoAlertHide();
    }
  });
  return box;
}

function pomoSaveNote(id, text) {
  const rec = (state.focusLog || []).find((r) => r.id === id);
  if (!rec) return;
  rec.note = text;
  rec.updatedAt = Date.now();
  const note = rec.ctx?.type === 'note' && noteById(rec.ctx.id);
  if (pomoCfg().appendNote && note && !note.enc) appendToNote(note, `- 🍅 ${pomoHM(rec.start)}–${pomoHM(rec.end)} ${text}`);
  save();
  renderAll();
}

// ---------- Ajustes ----------
const POMO_PRESETS = [
  ['classic', 'Clásico', 25, 5, 15],
  ['long', 'Largo', 50, 10, 30],
  ['short', 'Corto', 15, 3, 10],
];
const PSET_NUM = { focus: ['Enfoque (min)', 1, 120], short: ['Pausa corta', 1, 60], long: ['Pausa larga', 1, 60], rounds: ['Pomodoros hasta la pausa larga', 1, 12], goal: ['Meta diaria de pomodoros', 1, 24] };
const PSET_BOOL = {
  autoBreak: 'Empezar las pausas solas',
  autoFocus: 'Empezar el siguiente pomodoro solo',
  strict: 'Modo estricto: confirmar antes de parar una sesión de enfoque',
  warn: 'Avisar cuando quede 1 minuto',
  ask: 'Preguntar «¿Qué hiciste?» al terminar',
  appendNote: 'Añadir lo que hiciste a la nota (si trabajas en una nota)',
  sound: 'Sonido',
  sys: 'Notificación del sistema',
};
const PSET_TOP = ['focus', 'short', 'long']; // en state.settings; lo demás en state.settings.pomo
const psetGet = (k) => (PSET_TOP.includes(k) ? state.settings[k] : pomoCfg()[k]);

function psetSet(k, v) {
  if (PSET_TOP.includes(k)) state.settings[k] = v;
  else state.settings.pomo = { ...state.settings.pomo, [k]: v };
  save();
  if (PSET_TOP.includes(k) && k === timer.mode && !timer.endsAt) setMode(k);
  refreshSettingsInputs();
  renderTimer();
  if (activeTab()?.view === 'timer') pomoRenderPanel();
}

function pomoPresetNow() {
  const s = state.settings;
  return POMO_PRESETS.find(([, , f, sh, l]) => s.focus === f && s.short === sh && s.long === l)?.[0] || 'custom';
}

function pomoApplyPreset(id) {
  const p = POMO_PRESETS.find((x) => x[0] === id);
  if (!p) return;
  [, , state.settings.focus, state.settings.short, state.settings.long] = p;
  save();
  if (!timer.endsAt) setMode(timer.mode);
  refreshSettingsInputs();
}

// Los mismos controles en la vista Pomodoro (⚙) y en Ajustes.
function pomoSettingsUI(box, scope) {
  const num = (k) => {
    const [label, min, max] = PSET_NUM[k];
    const input = el('input', { type: 'number', min, max, step: 1 });
    if (scope === 'timer' && PSET_TOP.includes(k)) input.id = `set-${k}`;
    input.dataset.pset = k;
    input.addEventListener('change', () => {
      const v = Math.min(max, Math.max(min, Math.round(Number(input.value) || min)));
      input.value = v;
      psetSet(k, v);
    });
    return el('label', {}, [label, input]);
  };
  const bool = (k) => {
    const input = el('input', { type: 'checkbox' });
    input.dataset.pset = k;
    input.addEventListener('change', () => psetSet(k, input.checked));
    return el('label', { className: 'switch' }, [input, ` ${PSET_BOOL[k]}`]);
  };
  const tone = (k, label) => {
    const s = el('select', {}, Object.entries(POMO_TONES).map(([v, t]) => el('option', { value: v }, t.label)));
    s.dataset.pset = k;
    s.addEventListener('change', () => {
      psetSet(k, s.value);
      pomoPlayTone(s.value, k === 'toneEnd' ? 'end' : 'start');
    });
    return el('label', {}, [label, s]);
  };
  const presets = el('div', { className: 'filters pomo-presets', role: 'group', ariaLabel: 'Duraciones' }, [
    ...POMO_PRESETS.map(([id, label, f, s, l]) => {
      const b = el('button', { type: 'button', className: 'chip' }, `${label} ${f}/${s}/${l}`);
      b.dataset.preset = id;
      b.addEventListener('click', () => pomoApplyPreset(id));
      return b;
    }),
  ]);
  const custom = el('button', { type: 'button', className: 'chip' }, 'Personalizado');
  custom.dataset.preset = 'custom';
  custom.addEventListener('click', () => box.querySelector('[data-pset="focus"]').focus());
  presets.append(custom);

  const vol = el('input', { type: 'range', min: 0, max: 100, step: 5, ariaLabel: 'Volumen' });
  vol.dataset.pset = 'volume';
  vol.addEventListener('change', () => psetSet('volume', Number(vol.value)));
  const test = el('button', { type: 'button', className: 'chip pomo-test' }, '🔊 Probar');
  test.addEventListener('click', () => {
    const c = pomoCfg();
    pomoPlayTone(c.toneStart, 'start');
    setTimeout(() => pomoPlayTone(c.toneEnd, 'end'), 700);
  });
  const perm = el('button', { type: 'button', className: 'chip pomo-perm' }, 'Permitir notificaciones');
  perm.addEventListener('click', pomoAskPermission);

  const head = (t) => el('h4', { className: 'pomo-set-head' }, t);
  box.replaceChildren(
    head('Duración'),
    presets,
    el('div', { className: 'settings' }, ['focus', 'short', 'long', 'rounds', 'goal'].map(num)),
    head('Al terminar una fase'),
    el('div', { className: 'pomo-switches' }, ['autoBreak', 'autoFocus', 'strict', 'ask', 'appendNote'].map(bool)),
    head('Avisos'),
    el('div', { className: 'pomo-switches' }, [bool('warn'), bool('sound')]),
    el('div', { className: 'row pomo-sound' }, [tone('toneStart', 'Al empezar'), tone('toneEnd', 'Al terminar'), el('label', {}, ['Volumen', vol]), test]),
    el('div', { className: 'row pomo-sys' }, [bool('sys'), perm]),
    el('p', { className: 'muted pomo-sys-msg' }),
    el('p', { className: 'muted' }, 'Siempre verás un aviso dentro de la app y, si estás en otra pestaña, el título parpadea.')
  );
}

function refreshSettingsInputs() {
  $$('[data-pset]').forEach((n) => {
    const v = psetGet(n.dataset.pset);
    if (n.type === 'checkbox') n.checked = !!v;
    else if (document.activeElement !== n) n.value = v;
  });
  const preset = pomoPresetNow();
  $$('[data-preset]').forEach((b) => b.classList.toggle('active', b.dataset.preset === preset));
  const st = pomoNotifyState();
  $$('.pomo-sys-msg').forEach((n) => {
    n.textContent = POMO_SYS_MSG[st] || POMO_SYS_MSG.unavailable;
    n.dataset.state = st;
  });
  $$('.pomo-perm').forEach((b) => (b.hidden = st !== 'default'));
}

pomoSettingsUI($('#pomo-quick'), 'timer');
pomoSettingsUI($('#pomo-settings'), 'settings');
$('#timer-gear').addEventListener('click', () => {
  const box = $('#pomo-quick-box');
  box.open = !box.open;
  if (box.open) reveal(box, { block: 'start', smooth: true });
});

// ---------- Estadísticas ----------
function pomoStreak(goal) {
  let d = new Date();
  if ((state.pomodoros[dateKey(d)] || 0) < goal) d = addDays(d, -1); // hoy aún no cuenta en contra
  let n = 0;
  while ((state.pomodoros[dateKey(d)] || 0) >= goal) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

// En qué se fue el tiempo esta semana (desde el lunes).
function pomoWeekTop(limit = 5) {
  const from = dateKey(weekStart(new Date()));
  const m = new Map();
  for (const r of state.focusLog || []) {
    if (r.date < from) continue;
    const k = r.ctx?.id ? `${r.ctx.type}:${r.ctx.id}` : `free:${r.ctx?.label || ''}`;
    const v = m.get(k) || { ctx: r.ctx || { type: 'free', label: '' }, minutes: 0, count: 0 };
    v.minutes += r.minutes || 0;
    if (r.completed) v.count++;
    m.set(k, v);
  }
  return [...m.values()].sort((a, b) => b.minutes - a.minutes).slice(0, limit);
}

// Barras de los últimos 7 días (SVG): una serie, la meta como línea discontinua.
function pomoWeekBars(goal) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(today, i - 6);
    const key = dateKey(d);
    return { key, d, n: state.pomodoros[key] || 0, min: state.focusMinutes[key] || 0 };
  });
  const W = 308, H = 132, top = 14, base = 104, colW = W / 7, bw = 24;
  const max = Math.max(goal, ...days.map((x) => x.n), 1);
  const y = (n) => base - ((base - top) * n) / max;
  const ns = 'http://www.w3.org/2000/svg';
  const mk = (tag, attrs, text) => {
    const n = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const svg = mk('svg', { viewBox: `0 0 ${W} ${H}`, class: 'pomo-bars', role: 'img' });
  const peak = Math.max(...days.map((x) => x.n));
  svg.setAttribute('aria-label', `Pomodoros de los últimos 7 días: ${days.map((x) => `${shortDay(x.d)} ${x.n}`).join(', ')}. Meta: ${goal}.`);
  svg.append(mk('line', { x1: 0, x2: W, y1: base, y2: base, class: 'pomo-axis' }));
  days.forEach((x, i) => {
    const cx = colW * i + colW / 2;
    const g = mk('g', { class: `pomo-col${x.key === dateKey() ? ' today' : ''}${x.n >= goal ? ' met' : ''}` });
    g.append(mk('title', {}, `${capFirst(x.d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short' }))}: ${plural(x.n, 'pomodoro', 'pomodoros')} · ${formatMinutes(x.min)}`));
    g.append(mk('rect', { x: cx - colW / 2, y: 0, width: colW, height: H, class: 'pomo-hit' }));
    if (x.n) {
      const yt = y(x.n), x0 = cx - bw / 2, r = Math.min(4, base - yt);
      g.append(mk('path', { class: 'pomo-bar-mark', d: `M${x0},${base}V${yt + r}Q${x0},${yt} ${x0 + r},${yt}H${x0 + bw - r}Q${x0 + bw},${yt} ${x0 + bw},${yt + r}V${base}Z` }));
      // Etiquetas solo en hoy y en el mejor día.
      if (x.key === dateKey() || x.n === peak) g.append(mk('text', { x: cx, y: yt - 4, class: 'pomo-val', 'text-anchor': 'middle' }, String(x.n)));
    }
    g.append(mk('text', { x: cx, y: base + 16, class: 'pomo-day', 'text-anchor': 'middle' }, x.d.toLocaleDateString('es', { weekday: 'short' }).replace('.', '')));
    svg.append(g);
  });
  const gy = y(goal);
  svg.append(mk('line', { x1: 0, x2: W, y1: gy, y2: gy, class: 'pomo-goal-line' }));
  svg.append(mk('text', { x: W - 2, y: gy - 3, class: 'pomo-goal-text', 'text-anchor': 'end' }, `meta ${goal}`));
  return svg;
}

function pomoGoalBar() {
  const goal = pomoCfg().goal;
  const n = state.pomodoros[dateKey()] || 0;
  const pct = Math.min(100, Math.round((n / goal) * 100));
  return el('div', { className: `pomo-goal-in${n >= goal ? ' met' : ''}` }, [
    el('span', { className: 'pomo-goal-text' }, `Meta de hoy: ${n}/${goal} 🍅${n >= goal ? ' ✓' : ''}`),
    progressBar(pct),
  ]);
}

function pomoRenderPanel() {
  const cfg = pomoCfg();
  const key = dateKey();
  const n = state.pomodoros[key] || 0;
  const min = state.focusMinutes[key] || 0;
  const streak = pomoStreak(cfg.goal);
  const week = sumDays(state.pomodoros, new Date(), 7);
  $('#pomo-goal').replaceChildren(pomoGoalBar());
  const tile = (v, label, cls = '') => el('div', { className: `stat ${cls}` }, [el('span', { className: 'num' }, v), el('span', { className: 'label' }, label)]);
  const top = pomoWeekTop();
  const tmax = top[0]?.minutes || 1;
  const rows = top.map((t) => {
    const x = pomoCtxTarget(t.ctx);
    const label = `${POMO_ICON[t.ctx.type] || '🍅'} ${t.ctx.type === 'free' ? t.ctx.label || 'Libre' : pomoCtxName(t.ctx)}`;
    const name = x ? el('button', { type: 'button', className: 'rel-name' }, label) : el('span', { className: 'rel-name' }, label);
    if (x) name.addEventListener('click', () => relOpen(t.ctx.type, x));
    const p = t.ctx.type === 'task' && x?.projectId && projectById(x.projectId);
    return el('div', { className: 'rel-row pomo-trow' }, [
      el('span', { className: 'pomo-top-name' }, [name, ...(p ? [el('span', { className: 'rel-meta' }, `📁 ${p.name}`)] : [])]),
      el('span', { className: 'pomo-bar' }, el('i', { style: `width:${Math.max(2, Math.round((t.minutes / tmax) * 100))}%` })),
      el('span', { className: 'rel-meta' }, pomoTimeText(t)),
    ]);
  });
  $('#pomo-stats').replaceChildren(
    el('h3', { className: 'pomo-stats-head' }, 'Estadísticas'),
    el('div', { className: 'stats pomo-tiles' }, [
      tile(`${n}/${cfg.goal}`, 'Hoy', n >= cfg.goal ? 'met' : ''),
      tile(formatMinutes(min), 'Enfoque hoy'),
      tile(String(week), 'Últimos 7 días'),
      tile(`🔥 ${streak}`, streak === 1 ? 'día con la meta' : 'días con la meta'),
    ]),
    el('h4', { className: 'pomo-set-head' }, 'Últimos 7 días'),
    pomoWeekBars(cfg.goal),
    el('h4', { className: 'pomo-set-head' }, 'En qué se fue el tiempo esta semana'),
    ...(rows.length ? rows : [el('p', { className: 'muted side-empty' }, 'Aún no hay sesiones esta semana. Elige en qué trabajas y empieza un pomodoro.')])
  );
  refreshSettingsInputs();
}

const pomoViewTimer = VIEW_RENDER.timer;
VIEW_RENDER.timer = () => {
  pomoViewTimer();
  pomoRenderPanel();
};

// Meta diaria en Hoy: una barrita bajo «Pomodoros».
RENDER_HOOKS.push(() => {
  const g = $('#stat-pomo-goal');
  const goal = pomoCfg().goal;
  const n = state.pomodoros[dateKey()] || 0;
  g.hidden = !goal;
  g.title = `${n} de ${goal} pomodoros (meta diaria)`;
  g.classList.toggle('met', n >= goal);
  g.firstChild.style.width = `${Math.min(100, Math.round((n / goal) * 100))}%`;
});
