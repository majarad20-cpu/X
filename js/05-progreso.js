'use strict';

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
  // Para comparar rachas diarias y semanales, una semana cuenta como 7 días.
  const best = state.habits.reduce((acc, h) => {
    const n = longestStreak(h);
    const score = isDaily(h) ? n : n * 7;
    return score > acc.score ? { n, score, habit: h } : acc;
  }, { n: 0, score: 0, habit: null });

  $('#progress-stats').replaceChildren(
    statTile(pomos, 'Pomodoros', pomos - sumDays(state.pomodoros, lastWeekEnd, 7)),
    statTile(tasks, 'Tareas completadas', tasks - sumDays(state.completions, lastWeekEnd, 7)),
    statTile(formatMinutes(minutes), 'Tiempo enfocado'),
    statTile(best.n ? streakText(best.habit, best.n) : '—', best.n ? `Mejor racha · ${best.habit.name}` : 'Mejor racha de hábito')
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
      // Porcentaje respecto al objetivo: con 3 veces por semana, ~13 días en 30 es el 100 %.
      const expected = (goalOf(h) / 7) * DAYS;
      const pct = Math.min(100, Math.round((done / expected) * 100));
      return el('li', { className: 'habit-progress' }, [
        el('div', { className: 'hp-head' }, [
          el('span', { className: 'hp-name' }, h.name),
          el('span', { className: 'hp-num' }, `${done} días · ${pct}% del objetivo`),
        ]),
        el('div', { className: 'hp-track', role: 'progressbar', ariaValueNow: String(pct), ariaValueMin: '0', ariaValueMax: '100', ariaLabel: h.name },
          el('div', { className: 'hp-fill', style: `width: ${pct}%` })),
        el('div', { className: 'hp-meta' }, `${GOAL_LABEL(goalOf(h))} · racha actual ${streakText(h, streak(h))} · mejor ${streakText(h, longestStreak(h))}`),
      ]);
    })
  );
  $('#habit-progress-empty').hidden = state.habits.length > 0;
}
