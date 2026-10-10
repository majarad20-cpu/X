'use strict';

// ---------- Pomodoro ----------
// La cuenta atrás va por la hora de fin (endsAt), no restando segundos: sigue exacta aunque el
// navegador frene la pestaña en segundo plano. El temporizador en marcha se guarda en este
// dispositivo (POMO_RUN_KEY) y sigue tras recargar. Cada sesión de enfoque queda en
// state.focusLog con su contexto (tarea, nota, proyecto o libre).
// Contexto, sonidos, avisos, ajustes y estadísticas: 66-pomodoro-extra.js.
const CIRCUMFERENCE = 2 * Math.PI * 54;
const ring = $('#ring-fg');
ring.style.strokeDasharray = CIRCUMFERENCE;
const POMO_RUN_KEY = 'enfoque:pomo-run';

const timer = {
  mode: 'focus',
  total: state.settings.focus * 60, // duración de esta fase en segundos (con los «+5 min»)
  remaining: state.settings.focus * 60, // segundos
  endsAt: null, // timestamp cuando está en marcha
  focusCount: 0, // pomodoros completados en esta racha (para la pausa larga)
  lastDay: null, // día del último pomodoro completado (la racha empieza de cero cada día)
  interval: null,
  wakeLock: null,
  ctx: null, // { type: 'task'|'note'|'project'|'free', id, label } de la sesión de enfoque
  startedAt: null, // inicio de la sesión de enfoque en curso
  spent: 0, // ms de enfoque contados antes de la última pausa
  runFrom: null, // cuándo se puso en marcha por última vez
  warned: false, // ya sonó «1 minuto restante»
  alert: false, // el título parpadea con un aviso (66)
  title: 'Enfoque',
};

const MODE_LABEL = { focus: 'Enfoque', short: 'Pausa corta', long: 'Pausa larga' };
// Ajustes del Pomodoro (además de focus/short/long en state.settings).
const POMO_DEFAULTS = { rounds: 4, goal: 8, autoBreak: false, autoFocus: false, strict: false, warn: false, sound: true, toneStart: 'madera', toneEnd: 'campana', volume: 70, sys: true, ask: true, appendNote: false };
const pomoCfg = () => ({ ...POMO_DEFAULTS, ...state.settings.pomo });

function modeDuration(mode) {
  return state.settings[mode] * 60;
}

function renderModeChips() {
  $$('[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === timer.mode));
}

// Cambia de fase. Una fase en pausa a medias se conserva si se pide la misma (p. ej. al sincronizar).
function setMode(mode) {
  if (mode === timer.mode && !timer.endsAt && timer.remaining < timer.total) return renderTimer();
  abandonSession();
  stopTimer();
  timer.mode = mode;
  resetPhase();
}

function resetPhase() {
  timer.total = timer.remaining = modeDuration(timer.mode);
  timer.warned = false;
  renderModeChips();
  saveRun();
  renderTimer();
}

// «Reiniciar»: la fase vuelve a empezar (lo ya enfocado queda como sesión interrumpida).
function resetTimer() {
  abandonSession();
  stopTimer();
  resetPhase();
}

// Con el modo estricto, parar una sesión de enfoque en marcha pide confirmación.
function pomoGuard(action) {
  if (pomoCfg().strict && timer.mode === 'focus' && timer.endsAt && typeof pomoConfirm === 'function') {
    return pomoConfirm('Modo estricto: ¿parar la sesión de enfoque?', action);
  }
  action();
}

function toggleTimer() {
  if (timer.endsAt) pomoGuard(stopTimer);
  else startTimer();
}

// from: hora desde la que cuenta (al encadenar fases, el fin exacto de la anterior).
function startTimer({ from = Date.now(), quiet = false } = {}) {
  if (timer.endsAt) return;
  const fresh = timer.remaining === timer.total;
  if (timer.mode === 'focus' && !timer.startedAt) {
    timer.focusCount = pomoRound();
    timer.startedAt = from;
    timer.spent = 0;
    timer.ctx = typeof pomoCtxFromUI === 'function' ? pomoCtxFromUI() : null;
  }
  timer.runFrom = from;
  timer.endsAt = from + timer.remaining * 1000;
  clearInterval(timer.interval);
  timer.interval = setInterval(tick, 250);
  $('#timer-start').textContent = 'Pausar';
  keepScreenOn();
  saveRun();
  if (fresh && !quiet && typeof pomoPhaseStart === 'function') pomoPhaseStart(timer.mode);
  renderTimer();
}

function stopTimer() {
  if (!timer.endsAt) return;
  const now = Math.min(Date.now(), timer.endsAt);
  timer.remaining = Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
  if (timer.mode === 'focus' && timer.runFrom) timer.spent += now - timer.runFrom;
  timer.endsAt = null;
  timer.runFrom = null;
  clearInterval(timer.interval);
  $('#timer-start').textContent = 'Iniciar';
  releaseScreen();
  saveRun();
  renderTimer();
}

// «+5 min» a la fase en curso.
function addFiveMinutes() {
  if (timer.endsAt) timer.endsAt += 300e3;
  timer.remaining += 300;
  timer.total += 300;
  if (timer.remaining > 60) timer.warned = false;
  saveRun();
  renderTimer();
}

// Mantiene la pantalla encendida mientras el temporizador corre (si el navegador lo permite).
async function keepScreenOn() {
  if (!('wakeLock' in navigator) || timer.wakeLock) return;
  try {
    timer.wakeLock = await navigator.wakeLock.request('screen');
    timer.wakeLock.addEventListener('release', () => (timer.wakeLock = null));
    if (!timer.endsAt) releaseScreen(); // se pausó mientras esperábamos el permiso
  } catch {
    // No permitido aquí: el temporizador funciona igual.
  }
}

function releaseScreen() {
  timer.wakeLock?.release().catch(() => {});
  timer.wakeLock = null;
}

// Al volver a la pestaña: se pide otra vez la pantalla encendida y se pone al día la cuenta
// (con la pestaña oculta el navegador apenas ejecuta los intervalos).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !timer.endsAt) return;
  keepScreenOn();
  tick();
});

function tick() {
  if (!timer.endsAt) return;
  timer.remaining = Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000));
  // Otra pestaña lleva el temporizador: aquí solo se muestra (si deja de latir, se toma el relevo).
  if (pomoOtherOwns()) return pomoFollowing ? renderTimer() : pomoFollow(readRun());
  pomoFollowing = false;
  pomoBeat();
  timer.remaining = Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000));
  if (!timer.warned && timer.remaining > 0 && timer.remaining <= 60 && timer.total > 90 && pomoCfg().warn) {
    timer.warned = true;
    saveRun();
    if (typeof pomoWarn === 'function') pomoWarn();
  }
  renderTimer();
  if (timer.remaining === 0) finishSession(true);
}

// Guarda una sesión de enfoque (completa o interrumpida) con su contexto.
function recordFocus({ completed, end, ms }) {
  const minutes = completed ? Math.round(timer.total / 60) : Math.round(ms / 60000);
  const ctx = timer.ctx || { type: 'free', id: null, label: '' };
  const key = dateKey(new Date(end));
  const start = timer.startedAt || end - ms;
  // Id fijo por sesión: si dos pestañas o dispositivos la registran, se fusiona en una.
  const id = `f-${start}`;
  const dup = (state.focusLog || []).find((r) => r.id === id);
  if (dup) return dup;
  const rec = { id, start, end, date: key, minutes, kind: 'focus', ctx, completed, updatedAt: Date.now() };
  (state.focusLog ||= []).push(rec);
  if (completed) {
    bump(state.pomodoros, key, 1);
    bump(state.focusMinutes, key, minutes);
    const task = ctx.type === 'task' && state.tasks.find((t) => t.id === ctx.id);
    if (task) task.pomodoros = (task.pomodoros || 0) + 1;
    logEvent('pomodoro', task ? task.title : ctx.label || 'Sesión de enfoque', { ref: task?.id || null, date: key, at: end, detail: `${minutes} min` });
    state.log[state.log.length - 1].pomo = rec.id;
  }
  save();
  renderAll();
  return rec;
}

// Una sesión de enfoque que se deja a medias queda registrada (si pasó al menos un minuto).
function abandonSession() {
  if (timer.mode !== 'focus' || !timer.startedAt) return;
  const now = Date.now();
  const ms = timer.spent + (timer.endsAt && timer.runFrom ? Math.min(now, timer.endsAt) - timer.runFrom : 0);
  timer.runFrom = timer.endsAt ? now : null;
  if (ms >= 60e3) recordFocus({ completed: false, end: now, ms });
  timer.startedAt = null;
  timer.spent = 0;
}

function finishSession(completed) {
  const now = Date.now();
  // Hora real de fin aunque la pestaña estuviera dormida.
  const end = completed && timer.endsAt ? Math.min(now, timer.endsAt) : now;
  const late = now - end;
  const prev = timer.mode;
  const cfg = pomoCfg();
  let rec = null;
  if (timer.endsAt) {
    if (prev === 'focus' && timer.runFrom) timer.spent += end - timer.runFrom;
    timer.endsAt = null;
    timer.runFrom = null;
    clearInterval(timer.interval);
    $('#timer-start').textContent = 'Iniciar';
    releaseScreen();
  }
  let next;
  if (prev === 'focus') {
    if (completed) rec = recordFocus({ completed: true, end, ms: timer.total * 1000 });
    else if (timer.startedAt && timer.spent >= 60e3) rec = recordFocus({ completed: false, end, ms: timer.spent });
    timer.startedAt = null;
    timer.spent = 0;
    if (completed) {
      timer.focusCount = pomoRound() + 1;
      timer.lastDay = dateKey(new Date(end));
    }
    next = completed && timer.focusCount % Math.max(1, cfg.rounds) === 0 ? 'long' : 'short';
  } else {
    // Tras una pausa larga (también si se eligió a mano) la racha vuelve a empezar.
    if (prev === 'long') timer.focusCount = 0;
    next = 'focus';
  }
  timer.mode = next;
  resetPhase();
  if (typeof pomoPhaseEnd === 'function') pomoPhaseEnd({ prev, next, completed, rec, end, late });
  // Empieza sola la siguiente fase si así está ajustado (y si no se volvió tarde: nadie miraba).
  const auto = next === 'focus' ? cfg.autoFocus : cfg.autoBreak;
  if (completed && auto && late < 90e3) startTimer({ from: end, quiet: true });
}

function renderTimer() {
  const m = Math.floor(timer.remaining / 60);
  const s = timer.remaining % 60;
  const text = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  $('#timer-display').textContent = text;
  ring.style.strokeDashoffset = CIRCUMFERENCE * (1 - timer.remaining / (timer.total || 1));
  timer.title = timer.endsAt ? `${text} · ${MODE_LABEL[timer.mode]}` : 'Enfoque';
  if (!timer.alert) document.title = timer.title;
  $('#pomo-today').textContent = state.pomodoros[dateKey()] || 0;
  $('#timer-skip').textContent = timer.mode === 'focus' ? 'Saltar' : 'Saltar descanso';
  $('#timer-plus5').hidden = !timer.endsAt && timer.remaining === timer.total;
  const cfg = pomoCfg();
  $('#timer-round').textContent = timer.mode === 'focus' ? `Pomodoro ${(pomoRound() % Math.max(1, cfg.rounds)) + 1} de ${cfg.rounds} antes de la pausa larga` : MODE_LABEL[timer.mode];
}

// ---------- El temporizador en marcha sobrevive a una recarga ----------
function saveRun() {
  try {
    const t = timer;
    // Quien cambia el temporizador pasa a llevarlo (las demás pestañas lo siguen).
    pomoFollowing = false;
    pomoBeat(true);
    const busy = t.endsAt || t.startedAt || t.remaining < t.total || t.focusCount || t.mode !== 'focus';
    if (!busy) return localStorage.removeItem(POMO_RUN_KEY);
    const { mode, total, remaining, endsAt, focusCount, lastDay, ctx, startedAt, spent, runFrom, warned } = t;
    localStorage.setItem(POMO_RUN_KEY, JSON.stringify({ mode, total, remaining, endsAt, focusCount, lastDay, ctx, startedAt, spent, runFrom, warned }));
  } catch {
    // Sin almacenamiento: el temporizador sigue en memoria.
  }
}

function readRun() {
  try {
    const run = JSON.parse(localStorage.getItem(POMO_RUN_KEY) || 'null');
    return run && MODE_LABEL[run.mode] ? run : null;
  } catch {
    return null;
  }
}

// Día del último pomodoro completado, para los temporizadores guardados antes de lastDay.
const lastFocusDay = () => (state.focusLog || []).reduce((a, r) => (r.completed && r.end > (a?.end || 0) ? r : a), null)?.date || null;
// Pomodoros de la racha de hoy: si el último fue otro día, se empieza de cero.
const pomoRound = () => (timer.lastDay && timer.lastDay !== dateKey() ? 0 : timer.focusCount);

function resumeTimer() {
  const run = readRun();
  if (!run) {
    timer.total = timer.remaining = modeDuration(timer.mode); // ajustes ya cargados de IndexedDB
    return renderTimer();
  }
  if (pomoOtherOwns()) return pomoFollow(run);
  Object.assign(timer, run);
  if (!('lastDay' in run)) timer.lastDay = lastFocusDay();
  renderModeChips();
  if (typeof renderTimerTaskOptions === 'function') renderTimerTaskOptions();
  if (timer.endsAt) {
    // Terminó mientras la página estaba cerrada: cuenta como completada a su hora.
    pomoBeat(true);
    if (Date.now() >= timer.endsAt) return finishSession(true);
    timer.interval = setInterval(tick, 250);
    $('#timer-start').textContent = 'Pausar';
    keepScreenOn();
  }
  renderTimer();
}

// ---------- Varias pestañas ----------
// El temporizador en marcha lo lleva una sola pestaña (la última que lo tocó), que late en
// POMO_OWNER_KEY. Las demás lo muestran sin registrar nada ni avisar; si la dueña se cierra o deja
// de latir, la siguiente que haga tictac toma el relevo.
const POMO_OWNER_KEY = 'enfoque:pomo-owner';
const POMO_TAB = Math.random().toString(36).slice(2);
let pomoFollowing = false;
let pomoBeatAt = 0;

function pomoOtherOwns() {
  try {
    const o = JSON.parse(localStorage.getItem(POMO_OWNER_KEY) || 'null');
    return !!o && o.tab !== POMO_TAB && Date.now() - o.at < 5000;
  } catch {
    return false;
  }
}

function pomoBeat(now = false) {
  if (!now && Date.now() - pomoBeatAt < 1000) return;
  pomoBeatAt = Date.now();
  try {
    localStorage.setItem(POMO_OWNER_KEY, JSON.stringify({ tab: POMO_TAB, at: pomoBeatAt }));
  } catch {}
}

// Muestra el temporizador que lleva otra pestaña (sin guardarlo: eso lo haría dueña).
function pomoFollow(run) {
  pomoFollowing = true;
  clearInterval(timer.interval);
  releaseScreen();
  const total = modeDuration('focus');
  Object.assign(timer, { mode: 'focus', total, remaining: total, endsAt: null, focusCount: 0, lastDay: null, ctx: null, startedAt: null, spent: 0, runFrom: null, warned: false }, run || {});
  if (run && !('lastDay' in run)) timer.lastDay = lastFocusDay();
  if (timer.endsAt) timer.interval = setInterval(tick, 250);
  $('#timer-start').textContent = timer.endsAt ? 'Pausar' : 'Iniciar';
  renderModeChips();
  if (typeof renderTimerTaskOptions === 'function') renderTimerTaskOptions();
  renderTimer();
}

window.addEventListener('storage', (e) => {
  if (!timerResumed) return;
  // Otra pestaña cambió el temporizador o tomó el relevo: esta pasa a seguirlo.
  if (e.key === POMO_RUN_KEY || (e.key === POMO_OWNER_KEY && !pomoFollowing && timer.endsAt && pomoOtherOwns())) pomoFollow(readRun());
});
window.addEventListener('pagehide', () => {
  try {
    if (JSON.parse(localStorage.getItem(POMO_OWNER_KEY) || 'null')?.tab === POMO_TAB) localStorage.removeItem(POMO_OWNER_KEY);
  } catch {}
});

// Se retoma cuando los datos ya están cargados (el primer renderAll, al arrancar).
let timerResumed = false;
RENDER_HOOKS.push(() => {
  if (timerResumed) return;
  timerResumed = true;
  resumeTimer();
});

// Pitido de los recordatorios (18): el sonido «digital», sin depender de los ajustes del Pomodoro.
function beep() {
  if (typeof pomoPlayTone === 'function') pomoPlayTone('digital', 'end', 0.7);
}

$('#timer-start').addEventListener('click', toggleTimer);
$('#timer-reset').addEventListener('click', () => pomoGuard(resetTimer));
$('#timer-skip').addEventListener('click', () => pomoGuard(() => finishSession(false)));
$('#timer-plus5').addEventListener('click', addFiveMinutes);
$$('[data-mode]').forEach((b) =>
  b.addEventListener('click', () => {
    if (b.dataset.mode === timer.mode) return;
    pomoGuard(() => setMode(b.dataset.mode));
  })
);
