'use strict';

// ---------- Almacenamiento ----------
const STORE_KEY = 'enfoque:v1';

const defaults = () => ({
  tasks: [],
  habits: [],
  settings: { focus: 25, short: 5, long: 15 },
  pomodoros: {}, // { 'YYYY-MM-DD': n }
});

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? { ...defaults(), ...JSON.parse(raw) } : defaults();
  } catch {
    return defaults();
  }
}

const state = load();

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    // Almacenamiento no disponible (modo privado, cuota llena): la app sigue funcionando en memoria.
  }
}

// ---------- Utilidades ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  for (const c of [].concat(children)) node.append(c);
  return node;
}

function renderAll() {
  renderToday();
  renderTasks();
  renderTimer();
  renderHabits();
}

// ---------- Aviso con "Deshacer" ----------
let toastTimeout = null;

// Aplica un cambio destructivo y ofrece deshacerlo durante unos segundos.
function withUndo(message, change) {
  const snapshot = JSON.stringify({ tasks: state.tasks, habits: state.habits });
  change();
  save();
  renderAll();

  const undo = el('button', { className: 'toast-action' }, 'Deshacer');
  undo.addEventListener('click', () => {
    Object.assign(state, JSON.parse(snapshot));
    save();
    renderAll();
    hideToast();
  });
  $('#toast').replaceChildren(el('span', {}, message), undo);
  $('#toast').hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(hideToast, 6000);
}

function hideToast() {
  $('#toast').hidden = true;
}

// ---------- Pestañas ----------
function showView(name) {
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
}

$$('.tab').forEach((tab) => tab.addEventListener('click', () => showView(tab.dataset.view)));

// ---------- Tareas ----------
let taskFilter = 'all';
let editingId = null;
const PRIORITY_LABEL = { 1: 'Baja', 2: 'Media', 3: 'Alta' };

function addTask(title, priority, due) {
  state.tasks.push({
    id: uid(),
    title,
    priority,
    due: due || null,
    done: false,
    pomodoros: 0,
    createdAt: Date.now(),
  });
  save();
  renderAll();
}

$('#task-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const title = $('#task-title').value.trim();
  if (!title) return;
  addTask(title, Number($('#task-priority').value), $('#task-due').value);
  e.target.reset();
  $('#task-title').focus();
});

$$('[data-filter]').forEach((btn) =>
  btn.addEventListener('click', () => {
    taskFilter = btn.dataset.filter;
    $$('[data-filter]').forEach((b) => b.classList.toggle('active', b === btn));
    renderTasks();
  })
);

$('#clear-done').addEventListener('click', () => {
  const n = state.tasks.filter((t) => t.done).length;
  if (!n) return;
  withUndo(`${n} tarea(s) borrada(s)`, () => {
    state.tasks = state.tasks.filter((t) => !t.done);
  });
});

const byImportance = (a, b) =>
  a.done - b.done ||
  b.priority - a.priority ||
  (a.due || '9999').localeCompare(b.due || '9999') ||
  a.createdAt - b.createdAt;

const isDueToday = (t) => !t.done && t.due && t.due <= dateKey();

function visibleTasks() {
  const filters = {
    all: () => true,
    today: isDueToday,
    pending: (t) => !t.done,
    done: (t) => t.done,
  };
  return state.tasks.filter(filters[taskFilter]).sort(byImportance);
}

function formatDue(due) {
  const today = dateKey();
  const tomorrow = dateKey(addDays(new Date(), 1));
  if (due === today) return 'Hoy';
  if (due === tomorrow) return 'Mañana';
  const [y, m, d] = due.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es', { day: 'numeric', month: 'short' });
}

function taskItem(t) {
  if (t.id === editingId) return taskEditor(t);

  const check = el('input', { type: 'checkbox', checked: t.done, ariaLabel: 'Completar' });
  check.addEventListener('change', () => {
    t.done = check.checked;
    t.completedAt = t.done ? Date.now() : null;
    save();
    renderAll();
  });

  const meta = el('div', { className: 'meta' }, PRIORITY_LABEL[t.priority]);
  if (t.due) {
    const overdue = !t.done && t.due < dateKey();
    meta.append(' · ', el('span', { className: overdue ? 'overdue' : '' }, (overdue ? 'Vencida: ' : '') + formatDue(t.due)));
  }
  if (t.pomodoros) meta.append(` · 🍅 ${t.pomodoros}`);

  const title = el('button', { className: 'title', title: 'Editar' }, t.title);
  title.addEventListener('click', () => startEditing(t.id));

  const del = el('button', { className: 'del', title: 'Eliminar', ariaLabel: 'Eliminar' }, '✕');
  del.addEventListener('click', () =>
    withUndo('Tarea borrada', () => {
      state.tasks = state.tasks.filter((x) => x.id !== t.id);
    })
  );

  return el('li', { className: `task p${t.priority}${t.done ? ' done' : ''}` }, [
    check,
    el('div', { className: 'body' }, [title, meta]),
    del,
  ]);
}

function startEditing(id) {
  editingId = id;
  renderAll();
  document.querySelector('.view.active .task-edit input[type="text"]')?.focus();
}

function stopEditing() {
  editingId = null;
  renderAll();
}

function taskEditor(t) {
  const title = el('input', { type: 'text', value: t.title, required: true, maxLength: 140, ariaLabel: 'Título' });
  const priority = el(
    'select',
    { ariaLabel: 'Prioridad' },
    [3, 2, 1].map((p) => el('option', { value: p, selected: p === t.priority }, PRIORITY_LABEL[p]))
  );
  const due = el('input', { type: 'date', value: t.due || '', ariaLabel: 'Fecha límite' });
  const cancel = el('button', { type: 'button' }, 'Cancelar');
  cancel.addEventListener('click', stopEditing);

  const form = el('form', { className: 'task-edit' }, [
    title,
    el('div', { className: 'row' }, [priority, due, el('button', { type: 'submit', className: 'primary' }, 'Guardar'), cancel]),
  ]);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = title.value.trim();
    if (!value) return;
    t.title = value;
    t.priority = Number(priority.value);
    t.due = due.value || null;
    save();
    stopEditing();
  });
  return el('li', { className: `task editing p${t.priority}` }, form);
}

function renderTasks() {
  const tasks = visibleTasks();
  $('#task-list').replaceChildren(...tasks.map(taskItem));
  $('#task-empty').hidden = tasks.length > 0;
  const done = state.tasks.filter((t) => t.done).length;
  $('#task-stats').textContent = state.tasks.length ? `${done}/${state.tasks.length} completadas` : '';
  renderTimerTaskOptions();
}

// ---------- Hoy ----------
$('#today-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const title = $('#today-title').value.trim();
  if (!title) return;
  addTask(title, 2, dateKey());
  e.target.reset();
  $('#today-title').focus();
});

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function renderToday() {
  const today = dateKey();
  const dateText = new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#today-date').textContent = dateText.charAt(0).toUpperCase() + dateText.slice(1);

  const dueToday = state.tasks.filter(isDueToday).sort(byImportance);
  const overdue = dueToday.filter((t) => t.due < today).length;
  const doneToday = state.tasks.filter((t) => t.done && t.completedAt >= startOfToday()).length;
  const habitsDone = state.habits.filter((h) => h.log[today]).length;

  $('#stat-pending').textContent = dueToday.length;
  $('#stat-overdue').textContent = overdue;
  $('#stat-overdue').closest('.stat').classList.toggle('alert', overdue > 0);
  $('#stat-done').textContent = doneToday;
  $('#stat-pomos').textContent = state.pomodoros[today] || 0;

  $('#today-list').replaceChildren(...dueToday.map(taskItem));
  $('#today-empty').hidden = dueToday.length > 0;

  $('#today-habits-count').textContent = state.habits.length ? `${habitsDone}/${state.habits.length}` : '';
  $('#today-habits').replaceChildren(
    ...state.habits.map((h) => {
      const on = !!h.log[today];
      const chip = el('button', { className: `habit-chip${on ? ' on' : ''}`, ariaPressed: String(on) }, [
        el('span', { className: 'check', ariaHidden: 'true' }, on ? '✓' : ''),
        h.name,
      ]);
      chip.addEventListener('click', () => toggleHabit(h, today));
      return chip;
    })
  );
  $('#today-habits-empty').hidden = state.habits.length > 0;
}

// ---------- Pomodoro ----------
const CIRCUMFERENCE = 2 * Math.PI * 54;
const ring = $('#ring-fg');
ring.style.strokeDasharray = CIRCUMFERENCE;

const timer = {
  mode: 'focus',
  remaining: state.settings.focus * 60, // segundos
  endsAt: null, // timestamp cuando está en marcha
  focusCount: 0, // sesiones de enfoque completadas en esta racha (para la pausa larga)
  interval: null,
  wakeLock: null,
};

const MODE_LABEL = { focus: 'Enfoque', short: 'Pausa corta', long: 'Pausa larga' };

function modeDuration(mode) {
  return state.settings[mode] * 60;
}

function setMode(mode) {
  stopTimer();
  timer.mode = mode;
  timer.remaining = modeDuration(mode);
  $$('[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  renderTimer();
}

function toggleTimer() {
  if (timer.endsAt) stopTimer();
  else startTimer();
}

function startTimer() {
  if (timer.endsAt) return;
  timer.endsAt = Date.now() + timer.remaining * 1000;
  timer.interval = setInterval(tick, 250);
  $('#timer-start').textContent = 'Pausar';
  keepScreenOn();
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}

function stopTimer() {
  if (!timer.endsAt) return;
  timer.remaining = Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000));
  timer.endsAt = null;
  clearInterval(timer.interval);
  $('#timer-start').textContent = 'Iniciar';
  releaseScreen();
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

// El navegador libera el bloqueo al cambiar de pestaña; lo pedimos de nuevo al volver.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && timer.endsAt) keepScreenOn();
});

function tick() {
  timer.remaining = Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000));
  renderTimer();
  if (timer.remaining === 0) finishSession(true);
}

function finishSession(completed) {
  stopTimer();
  let next;
  if (timer.mode === 'focus') {
    if (completed) {
      const key = dateKey();
      state.pomodoros[key] = (state.pomodoros[key] || 0) + 1;
      const task = state.tasks.find((t) => t.id === $('#timer-task').value);
      if (task) task.pomodoros = (task.pomodoros || 0) + 1;
      save();
      renderToday();
      renderTasks();
    }
    timer.focusCount += 1;
    next = timer.focusCount % 4 === 0 ? 'long' : 'short';
  } else {
    next = 'focus';
  }
  if (completed) notify(timer.mode === 'focus' ? '¡Pomodoro completado! Toca descansar.' : '¡Pausa terminada! A enfocarse.');
  setMode(next);
}

function renderTimer() {
  const m = Math.floor(timer.remaining / 60);
  const s = timer.remaining % 60;
  const text = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  $('#timer-display').textContent = text;
  ring.style.strokeDashoffset = CIRCUMFERENCE * (1 - timer.remaining / modeDuration(timer.mode));
  document.title = timer.endsAt ? `${text} · ${MODE_LABEL[timer.mode]}` : 'Enfoque';
  $('#pomo-today').textContent = state.pomodoros[dateKey()] || 0;
}

function renderTimerTaskOptions() {
  const select = $('#timer-task');
  const current = select.value;
  const pending = state.tasks.filter((t) => !t.done);
  select.replaceChildren(
    el('option', { value: '' }, '— ninguna —'),
    ...pending.map((t) => el('option', { value: t.id }, t.title))
  );
  if (pending.some((t) => t.id === current)) select.value = current;
}

function notify(message) {
  beep();
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification('Enfoque', { body: message });
    } catch {
      // Algunos navegadores móviles no permiten notificaciones desde la página.
    }
  }
}

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25, 0.5].forEach((t) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.2, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.2);
    });
  } catch {
    // Sin audio disponible.
  }
}

$('#timer-start').addEventListener('click', toggleTimer);
$('#timer-reset').addEventListener('click', () => setMode(timer.mode));
$('#timer-skip').addEventListener('click', () => finishSession(false));
$$('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

['focus', 'short', 'long'].forEach((mode) => {
  const input = $(`#set-${mode}`);
  input.value = state.settings[mode];
  input.addEventListener('change', () => {
    const v = Math.min(Number(input.max), Math.max(1, Math.round(Number(input.value) || 1)));
    input.value = v;
    state.settings[mode] = v;
    save();
    if (mode === timer.mode && !timer.endsAt) setMode(mode);
  });
});

// ---------- Hábitos ----------
const DAYS_SHOWN = 7;

$('#habit-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#habit-name').value.trim();
  if (!name) return;
  state.habits.push({ id: uid(), name, log: {} });
  save();
  e.target.reset();
  renderAll();
});

function toggleHabit(habit, key) {
  if (habit.log[key]) delete habit.log[key];
  else habit.log[key] = true;
  save();
  renderToday();
  renderHabits();
}

function streak(habit) {
  let d = new Date();
  // Si hoy aún no está marcado, la racha cuenta desde ayer.
  if (!habit.log[dateKey(d)]) d = addDays(d, -1);
  let n = 0;
  while (habit.log[dateKey(d)]) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

function renderHabits() {
  const today = new Date();
  const days = Array.from({ length: DAYS_SHOWN }, (_, i) => addDays(today, i - DAYS_SHOWN + 1));

  $('#habit-head').replaceChildren(
    el('th'),
    ...days.map((d, i) =>
      el('th', { className: i === DAYS_SHOWN - 1 ? 'today' : '' }, [
        d.toLocaleDateString('es', { weekday: 'short' }),
        el('br'),
        String(d.getDate()),
      ])
    ),
    el('th', {}, 'Racha'),
    el('th')
  );

  $('#habit-body').replaceChildren(
    ...state.habits.map((h) => {
      const cells = days.map((d) => {
        const key = dateKey(d);
        const btn = el('button', {
          className: `dot${h.log[key] ? ' on' : ''}`,
          ariaLabel: `${h.name} ${key}`,
          ariaPressed: String(!!h.log[key]),
        });
        btn.addEventListener('click', () => toggleHabit(h, key));
        return el('td', {}, btn);
      });

      const del = el('button', { className: 'del', title: 'Eliminar', ariaLabel: 'Eliminar hábito' }, '✕');
      del.addEventListener('click', () =>
        withUndo(`Hábito "${h.name}" borrado`, () => {
          state.habits = state.habits.filter((x) => x.id !== h.id);
        })
      );

      const s = streak(h);
      return el('tr', {}, [
        el('td', { className: 'name', title: h.name }, h.name),
        ...cells,
        el('td', { className: 'streak' }, s ? `🔥 ${s}` : '—'),
        el('td', {}, del),
      ]);
    })
  );

  $('#habit-empty').hidden = state.habits.length > 0;
  $('.habits').hidden = !state.habits.length;
}

// ---------- Atajos de teclado ----------
const VIEW_KEYS = { 1: 'today', 2: 'tasks', 3: 'timer', 4: 'habits' };

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (editingId) stopEditing();
    $('#shortcuts').hidden = true;
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

  if (VIEW_KEYS[e.key]) {
    showView(VIEW_KEYS[e.key]);
  } else if (e.key === 'n' || e.key === 'N') {
    e.preventDefault();
    showView('tasks');
    $('#task-title').focus();
  } else if (e.key === ' ' && tag !== 'BUTTON') {
    e.preventDefault();
    toggleTimer();
  } else if (e.key === '?') {
    $('#shortcuts').hidden = !$('#shortcuts').hidden;
  }
});

$('#shortcuts-toggle').addEventListener('click', () => {
  $('#shortcuts').hidden = !$('#shortcuts').hidden;
});

// ---------- Inicio ----------
renderAll();
