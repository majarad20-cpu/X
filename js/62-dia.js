'use strict';

// ---------- La nota diaria como centro del día ----------
// Arriba de cada nota diaria (Diario/AAAA-MM-DD), en lectura y en la vista dividida, un panel vivo
// con lo de ese día: hábitos para marcar (los mismos de Hábitos), tareas (las del día y, si es hoy,
// las vencidas; las hechas, plegadas), pomodoros, ideas apuntadas y eventos de Google Calendar.
// No se guarda en el texto de la nota: el Markdown queda limpio (y compatible con Obsidian).
// Ajuste: «Mostrar el resumen del día en las notas diarias». Plegado: state.settings.dayPanelClosed.
const dayPanelOn = () => state.settings.dayPanel !== false;
let dpDoneOpen = false; // «Hechas (N)» desplegado

// Tareas del día `key` (las de la propia nota ya se ven en ella).
function dpTasks(key, note) {
  const today = dateKey();
  const mine = (t) => t.noteId !== note.id;
  const due = state.tasks.concat(noteTasks()).filter((t) => mine(t) && !t.done && t.due && (key === today ? t.due <= key : t.due === key)).sort(byImportance);
  const done = state.tasks.concat(state.archive).filter((t) => t.done && t.completedAt && dateKey(new Date(t.completedAt)) === key)
    .concat(noteTasks().filter((t) => mine(t) && t.done && t.doneOn === key));
  return { due, done };
}

function dpTaskRow(t, key) {
  const check = el('input', { type: 'checkbox', checked: t.done, ariaLabel: t.done ? 'Desmarcar' : 'Completar' });
  check.addEventListener('change', () => (t.virtual ? toggleNoteTask(t.noteId, t.line, check.checked) : toggleDone(t, check.checked)));
  const name = el('button', { type: 'button', className: 'dp-name', title: 'Abrir la tarea' }, t.title);
  name.addEventListener('click', () => (typeof relOpenTask === 'function' ? relOpenTask(t) : t.virtual ? openNoteAtLine(t.noteId, t.line) : showView('tasks')));
  const meta = [
    !t.done && t.due && t.due < key ? `vencida · ${formatDue(t.due)}` : '',
    t.time ? `⏰ ${t.time}` : '',
    t.virtual && noteById(t.noteId) ? `📝 ${baseName(noteById(t.noteId).path)}` : '',
  ].filter(Boolean).join(' · ');
  return el('li', { className: `dp-row${t.done ? ' done' : ''}` }, [check, name, meta ? el('span', { className: `dp-meta${!t.done && t.due < key ? ' overdue' : ''}` }, meta) : '']);
}

function dpSection(icon, title, count, children) {
  return el('div', { className: 'dp-sec' }, [el('h4', { className: 'dp-sec-head' }, [`${icon} ${title}`, count ? el('span', { className: 'dp-count' }, count) : '']), ...children]);
}

const dpEmpty = (t) => el('p', { className: 'muted dp-empty' }, t);

// Empieza un Pomodoro de enfoque (o muestra el que ya corre).
function dpStartPomodoro() {
  showView('timer');
  if (timer.endsAt) return;
  if (timer.mode !== 'focus') setMode('focus');
  startTimer();
}

// Abre (o crea) la nota diaria de otro día.
function dpGo(key) {
  flushNoteSave();
  openNote(djNoteFor(key));
}

function dpNav(key) {
  const btn = (txt, title, k, cls) => {
    const b = el('button', { type: 'button', className: `chip ${cls}`, title }, txt);
    b.addEventListener('click', () => dpGo(k));
    return b;
  };
  const d = parseKey(key);
  const today = dateKey();
  return el('span', { className: 'dp-nav' }, [
    btn(`‹ ${shortDay(addDays(d, -1))}`, 'Día anterior', dateKey(addDays(d, -1)), 'dp-prev'),
    ...(key === today ? [] : [btn('Hoy', 'Nota de hoy', today, 'dp-today')]),
    btn(`${shortDay(addDays(d, 1))} ›`, 'Día siguiente', dateKey(addDays(d, 1)), 'dp-next'),
  ]);
}

function renderDayPanel(note) {
  const box = $('#day-panel');
  const key = note && dayPanelOn() && noteText(note) !== null ? djKeyOf(note) : null;
  const show = !!key; // también al editar: el resumen va fuera del texto de la nota
  box.hidden = !show;
  if (!show) return box.replaceChildren();
  const today = dateKey();
  const closed = !!state.settings.dayPanelClosed;
  const habitsDone = state.habits.filter((h) => h.log[key]).length;
  const { due, done } = dpTasks(key, note);
  const pomos = state.pomodoros[key] || 0;
  const mins = state.focusMinutes?.[key] || 0;
  const ideas = state.ideas.filter((i) => i.createdAt && dateKey(new Date(i.createdAt)) === key);

  const fold = el('button', { type: 'button', className: 'dp-fold', ariaExpanded: String(!closed), title: closed ? 'Mostrar el resumen' : 'Plegar el resumen' }, closed ? '▸' : '▾');
  fold.addEventListener('click', () => {
    state.settings.dayPanelClosed = !closed;
    save();
    renderDayPanel(note);
  });
  const label = capFirst(parseKey(key).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' }));
  const summary = [state.habits.length && `🔥 ${habitsDone}/${state.habits.length}`, `☑ ${due.length}`, done.length && `✓ ${done.length}`, `🍅 ${pomos}`, ideas.length && `💡 ${ideas.length}`].filter(Boolean).join(' · ');
  const head = el('div', { className: 'dp-head' }, [
    fold,
    el('strong', { className: 'dp-title' }, key === today ? `Hoy · ${label}` : label),
    closed ? el('span', { className: 'muted dp-sum' }, summary) : '',
    dpNav(key),
  ]);
  if (closed) {
    box.classList.add('closed');
    return box.replaceChildren(head);
  }
  box.classList.remove('closed');

  // Hábitos: la misma función que en Hoy (rachas, registro y bitácora al día).
  const habits = state.habits.map((h) => {
    const on = !!h.log[key];
    const chip = el('button', { type: 'button', className: `habit-chip${on ? ' on' : ''}`, ariaPressed: String(on), disabled: key > today, title: key > today ? 'Aún no ha llegado ese día' : '' }, [
      el('span', { className: 'check', ariaHidden: 'true' }, on ? '✓' : ''),
      h.name,
    ]);
    if (!isDaily(h)) chip.append(el('span', { className: 'chip-goal' }, `${weekCount(h, weekStart(parseKey(key)))}/${goalOf(h)}`));
    chip.addEventListener('click', () => {
      toggleHabit(h, key);
      renderDayPanel(note);
    });
    return chip;
  });

  const doneBox = el('details', { className: 'dp-done', open: dpDoneOpen }, [el('summary', {}, `Hechas (${done.length})`), el('ul', { className: 'dp-list' }, done.map((t) => dpTaskRow(t, key)))]);
  doneBox.addEventListener('toggle', () => (dpDoneOpen = doneBox.open));

  const sessions = (state.log || []).filter((e) => e.type === 'pomodoro' && e.date === key && !e.removed).sort((a, b) => a.at - b.at);
  const pomoKids = [
    el('p', { className: 'dp-pomos' }, pomos ? `${plural(pomos, 'pomodoro', 'pomodoros')}${mins ? ` · ${formatMinutes(mins)}` : ''}` : 'Ningún pomodoro'),
    ...(sessions.length ? [el('ul', { className: 'dp-list dp-sessions' }, sessions.map((e) => el('li', { className: 'dp-row' }, [el('span', { className: 'dp-meta' }, new Date(e.at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })), el('span', {}, e.text)])))] : []),
  ];
  if (key === today) {
    const start = el('button', { type: 'button', className: 'dp-start' }, timer.endsAt ? '⏱ Ver el Pomodoro en marcha' : '▶ Empezar un Pomodoro');
    start.addEventListener('click', dpStartPomodoro);
    pomoKids.push(start);
  }

  const ideaRows = ideas.map((i) => {
    const b = el('button', { type: 'button', className: 'dp-name', title: 'Abrir la idea' }, `💡 ${i.text.split('\n')[0] || 'Idea'}`);
    b.addEventListener('click', () => (typeof relOpenIdea === 'function' ? relOpenIdea(i) : showView('ideas')));
    return el('li', { className: 'dp-row' }, b);
  });

  const cal = typeof calendarBlock === 'function' ? calendarBlock(key, { compact: true }) : null;
  box.replaceChildren(
    head,
    el('div', { className: 'dp-grid' }, [
      dpSection('🔥', 'Hábitos', state.habits.length ? `${habitsDone}/${state.habits.length}` : '', state.habits.length ? [el('div', { className: 'habit-chips dp-habits' }, habits)] : [dpEmpty('Sin hábitos. Créalos en Hábitos.')]),
      dpSection('☑', key === today ? 'Tareas de hoy' : 'Tareas de ese día', due.length ? String(due.length) : '', [
        due.length ? el('ul', { className: 'dp-list' }, due.map((t) => dpTaskRow(t, key))) : dpEmpty(key < today ? 'Nada quedó pendiente.' : 'Nada pendiente.'),
        ...(done.length ? [doneBox] : []),
      ]),
      dpSection('🍅', 'Pomodoros', '', pomoKids),
      ...(ideas.length ? [dpSection('💡', 'Ideas apuntadas', String(ideas.length), [el('ul', { className: 'dp-list' }, ideaRows)])] : []),
      ...(cal ? [dpSection('📅', 'Calendario', '', [cal])] : []),
    ])
  );
}

NOTE_PANE_EXTRA.push((note) => renderDayPanel(note));

// Ajuste, menú ⋯ de la nota y paleta.
function setDayPanel(on) {
  state.settings.dayPanel = !!on;
  save();
  renderAll();
}
$('#set-day-panel').addEventListener('change', (e) => setDayPanel(e.target.checked));
RENDER_HOOKS.push(() => ($('#set-day-panel').checked = dayPanelOn()));
NOTE_MENU_EXTRA.push((note) => (djKeyOf(note) ? { label: dayPanelOn() ? 'Ocultar el resumen del día' : 'Mostrar el resumen del día', action: () => setDayPanel(!dayPanelOn()) } : null));
COMMANDS_EXTRA.push((note) => (djKeyOf(note) ? [{ label: dayPanelOn() ? 'Ocultar el resumen del día en las notas diarias' : 'Mostrar el resumen del día en las notas diarias', action: () => setDayPanel(!dayPanelOn()) }] : []));
