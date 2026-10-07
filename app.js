'use strict';

// ---------- Almacenamiento ----------
const STORE_KEY = 'enfoque:v1';

const defaults = () => ({
  tasks: [],
  habits: [],
  settings: { focus: 25, short: 5, long: 15 },
  pomodoros: {}, // { 'YYYY-MM-DD': n }
  focusMinutes: {}, // { 'YYYY-MM-DD': minutos de enfoque completados }
  completions: {}, // { 'YYYY-MM-DD': tareas completadas ese día }
  updatedAt: 0, // última modificación, para decidir qué copia gana al sincronizar
});

const SYNCED_KEYS = ['tasks', 'habits', 'settings', 'pomodoros', 'focusMinutes', 'completions', 'updatedAt'];

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaults();
    const data = JSON.parse(raw);
    // Datos de versiones anteriores: reconstruye el historial de completadas con lo que haya.
    if (!data.completions) {
      data.completions = {};
      for (const t of data.tasks || []) {
        if (t.done && t.completedAt) {
          const key = dateKey(new Date(t.completedAt));
          data.completions[key] = (data.completions[key] || 0) + 1;
        }
      }
    }
    return { ...defaults(), ...data };
  } catch {
    return defaults();
  }
}

function saveLocal() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    // Almacenamiento no disponible (modo privado, cuota llena): la app sigue funcionando en memoria.
  }
}

function save() {
  state.updatedAt = Date.now();
  saveLocal();
  scheduleSync();
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

const state = load();

function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  for (const c of [].concat(children)) node.append(c);
  return node;
}

// Suma `n` al contador de un día, sin dejarlo negativo.
function bump(counter, key, n) {
  counter[key] = Math.max(0, (counter[key] || 0) + n);
  if (!counter[key]) delete counter[key];
}

function renderAll() {
  renderToday();
  renderTasks();
  renderTimer();
  renderHabits();
  renderProgress();
}

// ---------- Aviso con "Deshacer" ----------
let toastTimeout = null;

// Aplica un cambio destructivo y ofrece deshacerlo durante unos segundos.
function withUndo(message, change) {
  const snapshot = JSON.stringify({ tasks: state.tasks, habits: state.habits, completions: state.completions });
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
let tagFilter = null;
let editingId = null;
const expanded = new Set(); // tareas con las subtareas desplegadas
const PRIORITY_LABEL = { 1: 'Baja', 2: 'Media', 3: 'Alta' };
const REPEAT_LABEL = { daily: 'Cada día', weekdays: 'Lun a vie', weekly: 'Cada semana', monthly: 'Cada mes' };

// "Preparar informe #trabajo #urgente" -> título "Preparar informe", etiquetas [trabajo, urgente]
function parseTitle(text) {
  const tags = [];
  const title = text
    .replace(/(^|\s)#([\p{L}\p{N}_-]+)/gu, (_, space, tag) => {
      tag = tag.toLowerCase();
      if (!tags.includes(tag)) tags.push(tag);
      return space;
    })
    .replace(/\s+/g, ' ')
    .trim();
  return { title: title || text.trim(), tags };
}

function withTags(t) {
  return [t.title, ...(t.tags || []).map((tag) => `#${tag}`)].join(' ');
}

function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function nextOccurrence(date, repeat) {
  const d = new Date(date);
  if (repeat === 'daily') d.setDate(d.getDate() + 1);
  else if (repeat === 'weekdays') {
    do d.setDate(d.getDate() + 1);
    while (d.getDay() === 0 || d.getDay() === 6);
  } else if (repeat === 'weekly') d.setDate(d.getDate() + 7);
  else if (repeat === 'monthly') {
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, lastDay));
  }
  return d;
}

// Siguiente fecha posterior a hoy, partiendo de la fecha límite actual.
function nextDue(t) {
  const today = dateKey();
  let d = parseKey(t.due || today);
  do d = nextOccurrence(d, t.repeat);
  while (dateKey(d) <= today);
  return dateKey(d);
}

function addTask(text, { priority = 2, due = null, repeat = null } = {}) {
  const { title, tags } = parseTitle(text);
  state.tasks.push({
    id: uid(),
    title,
    tags,
    priority,
    due: due || (repeat ? dateKey() : null),
    repeat: repeat || null,
    subtasks: [],
    done: false,
    pomodoros: 0,
    createdAt: Date.now(),
  });
  save();
  renderAll();
}

$('#task-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('#task-title').value.trim();
  if (!text) return;
  addTask(text, {
    priority: Number($('#task-priority').value),
    due: $('#task-due').value,
    repeat: $('#task-repeat').value,
  });
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

function allTags() {
  return [...new Set(state.tasks.flatMap((t) => t.tags || []))].sort((a, b) => a.localeCompare(b, 'es'));
}

function visibleTasks() {
  const filters = {
    all: () => true,
    today: isDueToday,
    pending: (t) => !t.done,
    done: (t) => t.done,
  };
  return state.tasks
    .filter(filters[taskFilter])
    .filter((t) => !tagFilter || (t.tags || []).includes(tagFilter))
    .sort(byImportance);
}

function formatDue(due) {
  const today = dateKey();
  const tomorrow = dateKey(addDays(new Date(), 1));
  if (due === today) return 'Hoy';
  if (due === tomorrow) return 'Mañana';
  return parseKey(due).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' });
}

function toggleDone(t, done) {
  if (done && t.repeat) {
    // Tarea que se repite: cuenta como hecha y pasa a la siguiente fecha.
    const next = nextDue(t);
    withUndo(`Hecha · vuelve ${formatDue(next).toLowerCase()}`, () => {
      bump(state.completions, dateKey(), 1);
      t.due = next;
      (t.subtasks || []).forEach((s) => (s.done = false));
    });
    return;
  }
  t.done = done;
  if (done) {
    t.completedAt = Date.now();
    bump(state.completions, dateKey(), 1);
  } else {
    if (t.completedAt) bump(state.completions, dateKey(new Date(t.completedAt)), -1);
    t.completedAt = null;
  }
  save();
  renderAll();
}

function tagChip(tag) {
  const chip = el('button', { className: `tag${tag === tagFilter ? ' active' : ''}`, title: `Filtrar por #${tag}` }, `#${tag}`);
  chip.addEventListener('click', () => setTagFilter(tag === tagFilter ? null : tag));
  return chip;
}

function setTagFilter(tag) {
  tagFilter = tag;
  showView('tasks');
  renderTasks();
}

function taskItem(t) {
  if (t.id === editingId) return taskEditor(t);
  const subtasks = t.subtasks || [];
  const isOpen = expanded.has(t.id);

  const check = el('input', { type: 'checkbox', checked: t.done, ariaLabel: 'Completar' });
  check.addEventListener('change', () => toggleDone(t, check.checked));

  const meta = el('div', { className: 'meta' }, PRIORITY_LABEL[t.priority]);
  if (t.due) {
    const overdue = !t.done && t.due < dateKey();
    meta.append(' · ', el('span', { className: overdue ? 'overdue' : '' }, (overdue ? 'Vencida: ' : '') + formatDue(t.due)));
  }
  if (t.repeat) meta.append(' · ', el('span', { className: 'repeat' }, `↻ ${REPEAT_LABEL[t.repeat]}`));
  if (t.pomodoros) meta.append(` · 🍅 ${t.pomodoros}`);
  if (subtasks.length) meta.append(` · ☑ ${subtasks.filter((s) => s.done).length}/${subtasks.length}`);

  const title = el('button', { className: 'title', title: 'Editar' }, t.title);
  title.addEventListener('click', () => startEditing(t.id));

  const body = el('div', { className: 'body' }, [title, meta]);
  if (t.tags?.length) body.append(el('div', { className: 'tags' }, t.tags.map(tagChip)));

  const toggle = el(
    'button',
    { className: `sub-toggle${isOpen ? ' open' : ''}`, title: 'Subtareas', ariaLabel: 'Subtareas', ariaExpanded: String(isOpen) },
    subtasks.length ? `☰ ${subtasks.length}` : '☰ +'
  );
  toggle.addEventListener('click', () => {
    if (isOpen) expanded.delete(t.id);
    else expanded.add(t.id);
    renderAll();
    if (!isOpen) document.querySelector(`.view.active [data-sub-input="${t.id}"]`)?.focus();
  });

  const del = el('button', { className: 'del', title: 'Eliminar', ariaLabel: 'Eliminar' }, '✕');
  del.addEventListener('click', () =>
    withUndo('Tarea borrada', () => {
      state.tasks = state.tasks.filter((x) => x.id !== t.id);
    })
  );

  const li = el('li', { className: `task p${t.priority}${t.done ? ' done' : ''}` }, [
    el('div', { className: 'task-row' }, [check, body, toggle, del]),
  ]);
  if (isOpen) li.append(subtaskPanel(t));
  return li;
}

function subtaskPanel(t) {
  t.subtasks = t.subtasks || [];
  const items = t.subtasks.map((s) => {
    const check = el('input', { type: 'checkbox', checked: s.done, ariaLabel: 'Completar subtarea' });
    check.addEventListener('change', () => {
      s.done = check.checked;
      save();
      renderAll();
    });
    const del = el('button', { className: 'del small', title: 'Eliminar subtarea', ariaLabel: 'Eliminar subtarea' }, '✕');
    del.addEventListener('click', () =>
      withUndo('Subtarea borrada', () => {
        t.subtasks = t.subtasks.filter((x) => x.id !== s.id);
      })
    );
    return el('li', { className: `subtask${s.done ? ' done' : ''}` }, [
      el('label', {}, [check, el('span', {}, s.title)]),
      del,
    ]);
  });

  const input = el('input', { type: 'text', placeholder: 'Añadir subtarea', maxLength: 140, required: true, ariaLabel: 'Nueva subtarea' });
  input.dataset.subInput = t.id;
  const form = el('form', { className: 'row sub-form' }, [input, el('button', { type: 'submit' }, 'Añadir')]);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = input.value.trim();
    if (!value) return;
    t.subtasks.push({ id: uid(), title: value, done: false });
    save();
    renderAll();
    document.querySelector(`.view.active [data-sub-input="${t.id}"]`)?.focus();
  });

  return el('div', { className: 'subtasks' }, [el('ul', {}, items), form]);
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

function repeatSelect(value) {
  return el(
    'select',
    { ariaLabel: 'Repetir' },
    [['', 'No se repite'], ...Object.entries(REPEAT_LABEL)].map(([v, label]) =>
      el('option', { value: v, selected: v === (value || '') }, label)
    )
  );
}

function taskEditor(t) {
  const title = el('input', { type: 'text', value: withTags(t), required: true, maxLength: 200, ariaLabel: 'Título y #etiquetas' });
  const priority = el(
    'select',
    { ariaLabel: 'Prioridad' },
    [3, 2, 1].map((p) => el('option', { value: p, selected: p === t.priority }, PRIORITY_LABEL[p]))
  );
  const due = el('input', { type: 'date', value: t.due || '', ariaLabel: 'Fecha límite' });
  const repeat = repeatSelect(t.repeat);
  const cancel = el('button', { type: 'button' }, 'Cancelar');
  cancel.addEventListener('click', stopEditing);

  const form = el('form', { className: 'task-edit' }, [
    title,
    el('div', { className: 'row' }, [priority, due, repeat]),
    el('div', { className: 'row' }, [el('button', { type: 'submit', className: 'primary' }, 'Guardar'), cancel]),
  ]);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = title.value.trim();
    if (!text) return;
    Object.assign(t, parseTitle(text));
    t.priority = Number(priority.value);
    t.repeat = repeat.value || null;
    t.due = due.value || (t.repeat ? dateKey() : null);
    save();
    stopEditing();
  });
  return el('li', { className: `task editing p${t.priority}` }, form);
}

function renderTagFilter() {
  const tags = allTags();
  if (tagFilter && !tags.includes(tagFilter)) tagFilter = null;
  const all = el('button', { className: `tag${tagFilter ? '' : ' active'}` }, 'Todas las etiquetas');
  all.addEventListener('click', () => setTagFilter(null));
  $('#tag-filter').replaceChildren(...(tags.length ? [all, ...tags.map(tagChip)] : []));
  $('#tag-filter').hidden = !tags.length;
}

function renderTasks() {
  renderTagFilter();
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
  const text = $('#today-title').value.trim();
  if (!text) return;
  addTask(text, { due: dateKey() });
  e.target.reset();
  $('#today-title').focus();
});

function renderToday() {
  const today = dateKey();
  const dateText = new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#today-date').textContent = dateText.charAt(0).toUpperCase() + dateText.slice(1);

  const dueToday = state.tasks.filter(isDueToday).sort(byImportance);
  const overdue = dueToday.filter((t) => t.due < today).length;
  const doneToday = state.completions[today] || 0;
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
      bump(state.pomodoros, key, 1);
      bump(state.focusMinutes, key, state.settings.focus);
      const task = state.tasks.find((t) => t.id === $('#timer-task').value);
      if (task) task.pomodoros = (task.pomodoros || 0) + 1;
      save();
      renderAll();
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

function refreshSettingsInputs() {
  ['focus', 'short', 'long'].forEach((mode) => ($(`#set-${mode}`).value = state.settings[mode]));
}

['focus', 'short', 'long'].forEach((mode) => {
  const input = $(`#set-${mode}`);
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
  renderProgress();
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

// ---------- Progreso ----------
let chartMetric = 'pomodoros';

const METRICS = {
  pomodoros: { label: 'Pomodoros', data: () => state.pomodoros },
  tasks: { label: 'Tareas completadas', data: () => state.completions },
  minutes: { label: 'Minutos de enfoque', data: () => state.focusMinutes },
};

$$('[data-metric]').forEach((btn) =>
  btn.addEventListener('click', () => {
    chartMetric = btn.dataset.metric;
    $$('[data-metric]').forEach((b) => b.classList.toggle('active', b === btn));
    renderProgress();
  })
);

function sumDays(counter, from, days) {
  let total = 0;
  for (let i = 0; i < days; i++) total += counter[dateKey(addDays(from, -i))] || 0;
  return total;
}

function formatMinutes(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function longestStreak(habit) {
  const keys = Object.keys(habit.log).sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const key of keys) {
    const [y, m, d] = key.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    run = prev && dateKey(addDays(prev, 1)) === key ? run + 1 : 1;
    best = Math.max(best, run);
    prev = date;
  }
  return best;
}

function statTile(value, label, delta) {
  const tile = el('div', { className: 'stat' }, [el('span', { className: 'num' }, value), el('span', { className: 'label' }, label)]);
  if (delta !== undefined) {
    const cls = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
    const text = delta === 0 ? 'igual que la semana pasada' : `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)} vs. semana pasada`;
    tile.append(el('span', { className: `delta ${cls}` }, text));
  }
  return tile;
}

function renderProgress() {
  const today = new Date();
  const lastWeekEnd = addDays(today, -7);

  const pomos = sumDays(state.pomodoros, today, 7);
  const tasks = sumDays(state.completions, today, 7);
  const minutes = sumDays(state.focusMinutes, today, 7);
  const best = state.habits.reduce((acc, h) => {
    const n = longestStreak(h);
    return n > acc.n ? { n, name: h.name } : acc;
  }, { n: 0, name: '' });

  $('#progress-stats').replaceChildren(
    statTile(pomos, 'Pomodoros', pomos - sumDays(state.pomodoros, lastWeekEnd, 7)),
    statTile(tasks, 'Tareas completadas', tasks - sumDays(state.completions, lastWeekEnd, 7)),
    statTile(formatMinutes(minutes), 'Tiempo enfocado'),
    statTile(best.n ? `${best.n} días` : '—', best.n ? `Mejor racha · ${best.name}` : 'Mejor racha de hábito')
  );

  // Gráfico de barras de los últimos 7 días.
  const counter = METRICS[chartMetric].data();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const values = days.map((d) => counter[dateKey(d)] || 0);
  const max = Math.max(...values, 1);
  const maxIndex = values.indexOf(Math.max(...values));
  const label = METRICS[chartMetric].label;

  $('#chart-title').textContent = `${label} · últimos 7 días`;
  $('#chart').replaceChildren(
    ...days.map((d, i) => {
      const v = values[i];
      const isToday = i === 6;
      const dayName = d.toLocaleDateString('es', { weekday: 'short' });
      const showValue = v > 0 && (isToday || i === maxIndex);
      return el(
        'div',
        {
          className: `bar-col${isToday ? ' today' : ''}`,
          tabIndex: 0,
          ariaLabel: `${d.toLocaleDateString('es', { weekday: 'long', day: 'numeric' })}: ${v} ${label.toLowerCase()}`,
        },
        [
          el('span', { className: `bar-val${showValue ? ' shown' : ''}` }, String(v)),
          el('div', { className: 'bar-track' }, el('div', { className: `bar${v ? '' : ' zero'}`, style: `height: ${(v / max) * 100}%` })),
          el('span', { className: 'bar-label' }, dayName),
        ]
      );
    })
  );
  $('#chart-empty').hidden = values.some(Boolean);

  // Cumplimiento de hábitos en los últimos 30 días.
  const DAYS = 30;
  $('#habit-progress').replaceChildren(
    ...state.habits.map((h) => {
      let done = 0;
      for (let i = 0; i < DAYS; i++) if (h.log[dateKey(addDays(today, -i))]) done++;
      const pct = Math.round((done / DAYS) * 100);
      return el('li', { className: 'habit-progress' }, [
        el('div', { className: 'hp-head' }, [
          el('span', { className: 'hp-name' }, h.name),
          el('span', { className: 'hp-num' }, `${done}/${DAYS} días · ${pct}%`),
        ]),
        el('div', { className: 'hp-track', role: 'progressbar', ariaValueNow: String(pct), ariaValueMin: '0', ariaValueMax: '100', ariaLabel: h.name },
          el('div', { className: 'hp-fill', style: `width: ${pct}%` })),
        el('div', { className: 'hp-meta' }, `Racha actual ${streak(h)} · mejor ${longestStreak(h)}`),
      ]);
    })
  );
  $('#habit-progress-empty').hidden = state.habits.length > 0;
}

// ---------- Atajos de teclado ----------
const VIEW_KEYS = { 1: 'today', 2: 'tasks', 3: 'timer', 4: 'habits', 5: 'progress' };

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

// ---------- Sincronización entre dispositivos ----------
// Dentro de Claude, los datos se guardan también en un almacén privado del usuario, así
// el móvil y el ordenador ven lo mismo. Fuera de Claude la app usa solo este navegador.
const sync = { doc: null, writing: false, dirty: false, timeout: null };

const SYNC_LABEL = {
  local: 'Guardado en este dispositivo',
  saving: 'Guardando…',
  synced: 'Sincronizado',
  error: 'Sin sincronizar: guardado en este dispositivo',
};

function setSyncStatus(status) {
  const node = $('#sync-status');
  node.textContent = SYNC_LABEL[status];
  node.dataset.state = status;
}

function scheduleSync() {
  if (!sync.doc) return;
  setSyncStatus('saving');
  clearTimeout(sync.timeout);
  sync.timeout = setTimeout(pushState, 800);
}

// Una sola escritura a la vez; si hubo cambios mientras se escribía, se envían al terminar.
async function pushState() {
  if (sync.writing) {
    sync.dirty = true;
    return;
  }
  sync.writing = true;
  try {
    const body = {};
    for (const k of SYNCED_KEYS) body[k] = state[k];
    await sync.doc.set(JSON.parse(JSON.stringify(body)));
    setSyncStatus('synced');
  } catch {
    setSyncStatus('error');
  } finally {
    sync.writing = false;
    if (sync.dirty) {
      sync.dirty = false;
      pushState();
    }
  }
}

function applyRemote(data) {
  const fresh = defaults();
  for (const k of SYNCED_KEYS) state[k] = data[k] ?? fresh[k];
  saveLocal();
  refreshSettingsInputs();
  if (!timer.endsAt) setMode(timer.mode);
  renderAll();
  setSyncStatus('synced');
}

async function startSync() {
  if (!window.claude?.use) return;
  const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
  const id = user && (await user.id());
  if (!db || !id) return;

  sync.doc = db.doc(`data/users/${id}/state`);
  let first = true;
  sync.doc.onSnapshot(
    (snap) => {
      if (snap.metadata.hasPendingWrites) return;
      const remote = snap.exists ? JSON.parse(JSON.stringify(snap.data())) : null;
      const remoteNewer = remote && (remote.updatedAt || 0) > (state.updatedAt || 0);
      if (remoteNewer) {
        applyRemote(remote);
      } else if (first && (!remote || (state.updatedAt || 0) > (remote.updatedAt || 0))) {
        // Primera vez en la nube, o este dispositivo tiene cambios más recientes: súbelos.
        pushState();
      } else if (first) {
        setSyncStatus('synced');
      }
      first = false;
    },
    () => setSyncStatus('error')
  );
}

// ---------- Inicio ----------
refreshSettingsInputs();
setSyncStatus('local');
renderAll();
startSync();
