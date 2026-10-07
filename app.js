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

// ---------- Pestañas ----------
$$('.tab').forEach((tab) =>
  tab.addEventListener('click', () => {
    $$('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${tab.dataset.view}`));
  })
);

// ---------- Tareas ----------
let taskFilter = 'all';
const PRIORITY_LABEL = { 1: 'Baja', 2: 'Media', 3: 'Alta' };

$('#task-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const title = $('#task-title').value.trim();
  if (!title) return;
  state.tasks.push({
    id: uid(),
    title,
    priority: Number($('#task-priority').value),
    due: $('#task-due').value || null,
    done: false,
    pomodoros: 0,
    createdAt: Date.now(),
  });
  save();
  e.target.reset();
  $('#task-title').focus();
  renderTasks();
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
  if (!n || !confirm(`¿Borrar ${n} tarea(s) completada(s)?`)) return;
  state.tasks = state.tasks.filter((t) => !t.done);
  save();
  renderTasks();
});

function visibleTasks() {
  const today = dateKey();
  const filters = {
    all: () => true,
    today: (t) => !t.done && t.due && t.due <= today,
    pending: (t) => !t.done,
    done: (t) => t.done,
  };
  return state.tasks
    .filter(filters[taskFilter])
    .sort(
      (a, b) =>
        a.done - b.done ||
        b.priority - a.priority ||
        (a.due || '9999').localeCompare(b.due || '9999') ||
        a.createdAt - b.createdAt
    );
}

function formatDue(due) {
  const today = dateKey();
  const tomorrow = dateKey(addDays(new Date(), 1));
  if (due === today) return 'Hoy';
  if (due === tomorrow) return 'Mañana';
  const [y, m, d] = due.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es', { day: 'numeric', month: 'short' });
}

function renderTasks() {
  const list = $('#task-list');
  const today = dateKey();
  const tasks = visibleTasks();
  list.replaceChildren(
    ...tasks.map((t) => {
      const check = el('input', { type: 'checkbox', checked: t.done, ariaLabel: 'Completar' });
      check.addEventListener('change', () => {
        t.done = check.checked;
        save();
        renderTasks();
      });

      const meta = el('div', { className: 'meta' }, PRIORITY_LABEL[t.priority]);
      if (t.due) {
        const overdue = !t.done && t.due < today;
        meta.append(' · ', el('span', { className: overdue ? 'overdue' : '' }, (overdue ? 'Vencida: ' : '') + formatDue(t.due)));
      }
      if (t.pomodoros) meta.append(` · 🍅 ${t.pomodoros}`);

      const del = el('button', { className: 'del', title: 'Eliminar', ariaLabel: 'Eliminar' }, '✕');
      del.addEventListener('click', () => {
        state.tasks = state.tasks.filter((x) => x.id !== t.id);
        save();
        renderTasks();
      });

      return el('li', { className: `task p${t.priority}${t.done ? ' done' : ''}` }, [
        check,
        el('div', { className: 'body' }, [el('div', { className: 'title' }, t.title), meta]),
        del,
      ]);
    })
  );

  $('#task-empty').style.display = tasks.length ? 'none' : 'block';
  const done = state.tasks.filter((t) => t.done).length;
  $('#task-stats').textContent = state.tasks.length ? `${done}/${state.tasks.length} completadas` : '';
  renderTimerTaskOptions();
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

function startTimer() {
  if (timer.endsAt) return;
  timer.endsAt = Date.now() + timer.remaining * 1000;
  timer.interval = setInterval(tick, 250);
  $('#timer-start').textContent = 'Pausar';
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
}

function stopTimer() {
  if (!timer.endsAt) return;
  timer.remaining = Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000));
  timer.endsAt = null;
  clearInterval(timer.interval);
  $('#timer-start').textContent = 'Iniciar';
}

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
    new Notification('Enfoque', { body: message });
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

$('#timer-start').addEventListener('click', () => (timer.endsAt ? stopTimer() : startTimer()));
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
  renderHabits();
});

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
        btn.addEventListener('click', () => {
          if (h.log[key]) delete h.log[key];
          else h.log[key] = true;
          save();
          renderHabits();
        });
        return el('td', {}, btn);
      });

      const del = el('button', { className: 'del', title: 'Eliminar', ariaLabel: 'Eliminar hábito' }, '✕');
      del.addEventListener('click', () => {
        if (!confirm(`¿Eliminar el hábito "${h.name}"?`)) return;
        state.habits = state.habits.filter((x) => x.id !== h.id);
        save();
        renderHabits();
      });

      const s = streak(h);
      return el('tr', {}, [
        el('td', { className: 'name', title: h.name }, h.name),
        ...cells,
        el('td', { className: 'streak' }, s ? `🔥 ${s}` : '—'),
        el('td', {}, del),
      ]);
    })
  );

  $('#habit-empty').style.display = state.habits.length ? 'none' : 'block';
  $('.habits').style.display = state.habits.length ? '' : 'none';
}

// ---------- Inicio ----------
renderTasks();
renderTimer();
renderHabits();
