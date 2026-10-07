'use strict';

// ---------- Hábitos ----------
const DAYS_SHOWN = 7;
let editingHabitId = null;

// Objetivo: 7 = cada día; 1–6 = veces por semana.
const goalOf = (h) => h.goal || 7;
const isDaily = (h) => goalOf(h) === 7;
const GOAL_LABEL = (g) => (g === 7 ? 'Cada día' : `${g} ${g === 1 ? 'vez' : 'veces'} por semana`);

function goalSelect(value, id) {
  return el(
    'select',
    { id: id || '', ariaLabel: 'Objetivo' },
    [7, 6, 5, 4, 3, 2, 1].map((g) => el('option', { value: g, selected: g === value }, GOAL_LABEL(g)))
  );
}


$('#habit-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#habit-name').value.trim();
  if (!name) return;
  state.habits.push({ id: uid(), name, goal: Number($('#habit-goal').value), log: {} });
  save();
  e.target.reset();
  renderAll();
});

function toggleHabit(habit, key) {
  if (habit.log[key]) {
    delete habit.log[key];
    unlogEvent('habit', habit.id, key);
  } else {
    habit.log[key] = true;
    // Un día pasado se anota a mediodía de ese día (no hay hora real).
    const at = key === dateKey() ? Date.now() : parseKey(key).getTime() + 12 * 3600 * 1000;
    logEvent('habit', habit.name, { ref: habit.id, date: key, at, untimed: key !== dateKey(), detail: isDaily(habit) ? '' : `${weekCount(habit, weekStart(parseKey(key)))}/${goalOf(habit)} esta semana` });
    if (key === dateKey()) {
      const s = streak(habit);
      if (isDaily(habit) && STREAK_MARKS.includes(s)) logEvent('streak', `${s} días seguidos: ${habit.name}`, { ref: habit.id });
      if (!isDaily(habit) && weekCount(habit, weekStart(new Date())) === goalOf(habit)) logEvent('goal', `${habit.name}: ${GOAL_LABEL(goalOf(habit)).toLowerCase()} cumplido`, { ref: habit.id });
    }
  }
  save();
  renderToday();
  renderHabits();
  renderProgress();
}

// Lunes de la semana de `d`.
function weekStart(d) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  r.setDate(r.getDate() - ((r.getDay() + 6) % 7));
  return r;
}

function weekCount(habit, monday) {
  let n = 0;
  for (let i = 0; i < 7; i++) if (habit.log[dateKey(addDays(monday, i))]) n++;
  return n;
}

// Racha actual: días seguidos (hábito diario) o semanas seguidas cumpliendo el objetivo.
function streak(habit) {
  if (isDaily(habit)) {
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
  let week = weekStart(new Date());
  // La semana en curso solo cuenta si ya se cumplió el objetivo.
  if (weekCount(habit, week) < goalOf(habit)) week = addDays(week, -7);
  let n = 0;
  while (weekCount(habit, week) >= goalOf(habit)) {
    n++;
    week = addDays(week, -7);
  }
  return n;
}

function longestStreak(habit) {
  const keys = Object.keys(habit.log).sort();
  if (!keys.length) return 0;
  if (isDaily(habit)) {
    let best = 0;
    let run = 0;
    let prev = null;
    for (const key of keys) {
      run = prev && dateKey(addDays(parseKey(prev), 1)) === key ? run + 1 : 1;
      best = Math.max(best, run);
      prev = key;
    }
    return best;
  }
  let best = 0;
  let run = 0;
  const end = weekStart(new Date());
  for (let week = weekStart(parseKey(keys[0])); week <= end; week = addDays(week, 7)) {
    run = weekCount(habit, week) >= goalOf(habit) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

const streakText = (habit, n) => (isDaily(habit) ? `${n} ${n === 1 ? 'día' : 'días'}` : `${n} ${n === 1 ? 'semana' : 'semanas'}`);

function habitEditorRow(h) {
  const name = el('input', { type: 'text', value: h.name, required: true, maxLength: 60, ariaLabel: 'Nombre del hábito' });
  const goal = goalSelect(goalOf(h));
  const cancel = el('button', { type: 'button' }, 'Cancelar');
  cancel.addEventListener('click', () => {
    editingHabitId = null;
    renderHabits();
  });
  const form = el('form', { className: 'row habit-edit' }, [name, goal, el('button', { type: 'submit', className: 'primary' }, 'Guardar'), cancel]);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!name.value.trim()) return;
    h.name = name.value.trim();
    h.goal = Number(goal.value);
    editingHabitId = null;
    save();
    renderAll();
  });
  setTimeout(() => name.focus());
  return el('tr', {}, el('td', { colSpan: DAYS_SHOWN + 3 }, form));
}

function renderHabits() {
  const today = new Date();
  const days = Array.from({ length: DAYS_SHOWN }, (_, i) => addDays(today, i - DAYS_SHOWN + 1));
  const monday = weekStart(today);

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
      if (h.id === editingHabitId) return habitEditorRow(h);

      const cells = days.map((d) => {
        const key = dateKey(d);
        const btn = el('button', {
          className: `dot${h.log[key] ? ' on' : ''}${d < monday ? ' prev-week' : ''}`,
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

      const nameBtn = el('button', { className: 'habit-name', title: `${h.name} · ${GOAL_LABEL(goalOf(h))} · toca para editar` }, [
        el('span', { className: 'hn' }, h.name),
        el('span', { className: 'hg' }, isDaily(h) ? 'Cada día' : `${weekCount(h, monday)}/${goalOf(h)} sem.`),
      ]);
      nameBtn.addEventListener('click', () => {
        editingHabitId = h.id;
        renderHabits();
      });

      const s = streak(h);
      return el('tr', {}, [
        el('td', { className: 'name' }, nameBtn),
        ...cells,
        el('td', { className: 'streak', title: streakText(h, s) }, s ? `🔥 ${s}${isDaily(h) ? '' : ' sem'}` : '—'),
        el('td', {}, del),
      ]);
    })
  );

  $('#habit-empty').hidden = state.habits.length > 0;
  $('.habits').hidden = !state.habits.length;
}
