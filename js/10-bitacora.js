'use strict';

// ---------- Bitácora del día ----------
// Cada logro de cualquier pestaña queda anotado con su hora. Las anotaciones se guardan
// aparte (un bloque por mes), así que siguen ahí aunque luego se borre la tarea o la idea.
// Deshacer un logro (desmarcar) no borra la anotación: la marca como retirada, para que
// los dispositivos sincronizados puedan juntar sus bitácoras sin pisarse.
let logDay = null; // null = hoy
const LOG_TYPES = {
  task: { icon: '✅', label: 'Tarea completada' },
  pomodoro: { icon: '🍅', label: 'Pomodoro' },
  habit: { icon: '🔥', label: 'Hábito' },
  streak: { icon: '🏅', label: 'Racha' },
  goal: { icon: '🎯', label: 'Objetivo semanal' },
  journal: { icon: '✍️', label: 'Diario' },
  idea: { icon: '💡', label: 'Idea' },
  map: { icon: '🧠', label: 'Mapa mental' },
  project: { icon: '📁', label: 'Proyecto' },
  milestone: { icon: '🚩', label: 'Avance de proyecto' },
  note: { icon: '📝', label: 'Nota' },
};
const STREAK_MARKS = [7, 14, 21, 30, 50, 75, 100, 150, 200, 365];
const PROJECT_MARKS = [25, 50, 75, 100];

function logEvent(type, text, { ref = null, date = dateKey(), at = Date.now(), detail = '', untimed = false } = {}) {
  state.log.push({ id: uid(), type, text, ref, date, at, detail, ...(untimed ? { untimed: true } : {}) });
}

// Retira la última anotación de ese tipo y elemento en ese día (al desmarcar algo).
function unlogEvent(type, ref, date) {
  const e = state.log.filter((x) => x.type === type && x.ref === ref && x.date === date && !x.removed).pop();
  if (e) e.removed = true;
}

// Hitos de proyecto: se anotan al cruzar el 25, 50, 75 y 100 %.
// Si el avance baja el mismo día (p. ej. al desmarcar una tarea), el hito de hoy se retira.
function checkProjectMilestones() {
  state.projects.forEach((p) => {
    const pct = projectProgress(p);
    const reached = PROJECT_MARKS.filter((m) => pct >= m).pop() || 0;
    const prev = p.milestone || 0;
    if (reached > prev) logEvent('milestone', `${p.name} alcanzó el ${reached} %`, { ref: `${p.id}:${reached}` });
    if (reached < prev) PROJECT_MARKS.filter((m) => m > reached && m <= prev).forEach((m) => unlogEvent('milestone', `${p.id}:${m}`, dateKey()));
    p.milestone = reached;
  });
}

function dayEvents(key) {
  return state.log.filter((e) => e.date === key && !e.removed).sort((a, b) => a.at - b.at);
}

function eventTime(e) {
  // Los hábitos marcados para un día pasado (o de antes de la bitácora) no tienen hora real.
  if (e.untimed || dateKey(new Date(e.at)) !== e.date) return '—';
  return new Date(e.at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}

$('#log-prev').addEventListener('click', () => {
  logDay = dateKey(addDays(parseKey(logDay || dateKey()), -1));
  renderLog();
});
$('#log-next').addEventListener('click', () => {
  const next = dateKey(addDays(parseKey(logDay || dateKey()), 1));
  logDay = next >= dateKey() ? null : next;
  renderLog();
});
$('#log-today').addEventListener('click', () => {
  logDay = null;
  renderLog();
});

function renderLog() {
  const key = logDay || dateKey();
  const isToday = key === dateKey();
  const events = dayEvents(key);
  const d = parseKey(key);
  const label = isToday ? 'Hoy' : key === dateKey(addDays(new Date(), -1)) ? 'Ayer' : d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#log-title').textContent = label.charAt(0).toUpperCase() + label.slice(1);
  $('#log-next').disabled = isToday;
  $('#log-today').hidden = isToday;

  // Resumen: se usan los contadores del día, que no dependen de la bitácora.
  const pomos = state.pomodoros[key] || 0;
  const habitsDue = state.habits.length;
  const habitsDone = state.habits.filter((h) => h.log[key]).length;
  const entries = state.journal.filter((e) => e.date === key);
  const moodEntry = entries.filter((e) => e.mood).sort((a, b) => a.createdAt - b.createdAt).pop();
  const mood = moodEntry && MOODS.find((m) => m.v === moodEntry.mood);
  const count = (t) => events.filter((e) => e.type === t).length;
  const chips = [
    ['✅', `${plural(state.completions[key] || 0, 'tarea', 'tareas')}`],
    ['🍅', pomos ? `${plural(pomos, 'pomodoro', 'pomodoros')} · ${formatMinutes(state.focusMinutes[key] || 0)}` : '0 pomodoros'],
    habitsDue ? ['🔥', `${habitsDone}/${habitsDue} hábitos`] : null,
    entries.length ? ['✍️', plural(entries.length, 'entrada', 'entradas')] : null,
    count('idea') ? ['💡', plural(count('idea'), 'idea', 'ideas')] : null,
    mood ? [mood.e, `Ánimo: ${mood.l.toLowerCase()}`] : null,
  ].filter(Boolean);
  $('#log-summary').replaceChildren(...chips.map(([i, t]) => el('span', { className: 'log-chip' }, [el('span', { ariaHidden: 'true' }, i), t])));

  $('#log-list').replaceChildren(
    ...events.map((e) => {
      const t = LOG_TYPES[e.type] || { icon: '•', label: '' };
      return el('li', { className: `log-item type-${e.type}` }, [
        el('span', { className: 'log-time' }, eventTime(e)),
        el('span', { className: 'log-icon', ariaHidden: 'true' }, t.icon),
        el('div', { className: 'log-body' }, [
          el('span', { className: 'log-label' }, t.label),
          el('span', { className: 'log-text' }, e.text),
          e.detail ? el('span', { className: 'log-detail' }, e.detail) : '',
        ]),
      ]);
    })
  );
  $('#log-empty').hidden = events.length > 0;
  $('#log-empty').textContent = isToday
    ? 'Aún no hay hitos hoy. Completa una tarea, un pomodoro o un hábito, escribe en el diario o apunta una idea, y aparecerá aquí.'
    : 'No hay hitos registrados ese día.';
}

// Una sola vez: se reconstruye la bitácora pasada con lo que ya tenía fecha y hora.
function backfillLog() {
  if (state.settings.logVersion >= 1) return;
  const seen = new Set(state.log.map((e) => `${e.type}:${e.ref}:${e.date}`));
  const add = (type, text, ref, at, detail = '', date = dateKey(new Date(at)), untimed = false) => {
    if (!at || seen.has(`${type}:${ref}:${date}`)) return;
    state.log.push({ id: uid(), type, text, ref, date, at, detail, ...(untimed ? { untimed: true } : {}) });
  };
  allTasks().filter((t) => t.done && t.completedAt && !t.repeat).forEach((t) => add('task', t.title, t.id, t.completedAt, projectById(t.projectId)?.name ? `📁 ${projectById(t.projectId).name}` : ''));
  state.journal.forEach((e) => add('journal', JOURNAL_KINDS[e.kind]?.label || 'Entrada', e.id, e.createdAt, MOODS.find((m) => m.v === e.mood)?.e || ''));
  state.ideas.forEach((i) => add('idea', i.text.split('\n')[0], i.id, i.createdAt));
  // Los hábitos no guardaban la hora: se anotan sin hora (a mediodía de ese día).
  state.habits.forEach((h) => Object.keys(h.log).forEach((k) => add('habit', h.name, h.id, parseKey(k).getTime() + 12 * 3600 * 1000, '', k, true)));
  state.maps.forEach((m) => add('map', `Nuevo mapa: ${m.title}`, m.id, m.createdAt));
  state.projects.forEach((p) => {
    add('project', `Nuevo proyecto: ${p.name}`, p.id, p.createdAt);
    p.milestone = PROJECT_MARKS.filter((m) => projectProgress(p) >= m).pop() || 0;
  });
  state.settings.logVersion = 1;
  save();
}
