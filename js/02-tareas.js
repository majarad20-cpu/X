'use strict';

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

function addTask(text, { priority = 2, due = null, repeat = null, time = null, projectId = null } = {}) {
  const parsed = parseInput(text);
  projectId = parsed.projectId ?? projectId;
  priority = parsed.priority ?? priority;
  due = parsed.due ?? due;
  repeat = parsed.repeat ?? repeat;
  time = parsed.time ?? time;
  // Con hora pero sin fecha: hoy, o mañana si esa hora ya pasó.
  if (time && !due) due = time > nowHM() ? dateKey() : dateKey(addDays(new Date(), 1));
  if (time) askNotificationPermission();
  state.tasks.push({
    id: uid(),
    title: parsed.title,
    tags: parsed.tags,
    priority,
    due: due || (repeat ? dateKey() : null),
    repeat: repeat || null,
    time: time || null,
    notes: '',
    projectId: projectId || null,
    order: Date.now(),
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
    time: $('#task-time').value,
  });
  e.target.reset();
  $('#task-title').focus();
});

$$('[data-filter]').forEach((btn) =>
  btn.addEventListener('click', () => {
    taskFilter = btn.dataset.filter;
    taskLimit = TASK_PAGE;
    $$('[data-filter]').forEach((b) => b.classList.toggle('active', b === btn));
    renderTasks();
  })
);

$('#clear-done').addEventListener('click', () => {
  const n = allTasks().filter((t) => t.done).length;
  if (!n) return;
  withUndo(`${n} tarea(s) completada(s) borrada(s)`, () => {
    state.tasks = state.tasks.filter((t) => !t.done);
    state.archive = [];
  });
});

const byImportance = (a, b) =>
  a.done - b.done ||
  b.priority - a.priority ||
  (a.due || '9999').localeCompare(b.due || '9999') ||
  (a.time || '99').localeCompare(b.time || '99') ||
  a.createdAt - b.createdAt;

// En el orden manual, las tareas que vienen de notas van detrás de las propias (no se arrastran).
const byManualOrder = (a, b) => a.done - b.done || (a.virtual ? 1 : 0) - (b.virtual ? 1 : 0) || (a.order ?? a.createdAt) - (b.order ?? b.createdAt);

const isDueToday = (t) => !t.done && t.due && t.due <= dateKey();

// Tareas activas más las archivadas (para «Hechas», proyectos y el calendario).
const allTasks = () => state.tasks.concat(state.archive);

// Las tareas completadas hace más de 7 días pasan al archivo, que se guarda por meses.
const ARCHIVE_AFTER_DAYS = 7;
function archiveOldTasks() {
  const cutoff = Date.now() - ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000;
  const old = state.tasks.filter((t) => t.done && !t.repeat && (t.completedAt || t.createdAt) < cutoff);
  if (!old.length) return;
  old.forEach((t) => (t.completedAt = t.completedAt || t.createdAt));
  state.tasks = state.tasks.filter((t) => !old.includes(t));
  state.archive.push(...old);
  save();
}

const manualSort = () => state.settings.sort === 'manual';

$('#task-sort').addEventListener('change', (e) => {
  state.settings.sort = e.target.value;
  save();
  renderTasks();
});

function allTags() {
  return [...new Set((taskFilter === 'done' ? allTasks() : state.tasks).concat(noteTasks()).flatMap((t) => t.tags || []))].sort((a, b) => a.localeCompare(b, 'es'));
}

function visibleTasks() {
  const filters = {
    all: () => true,
    today: isDueToday,
    pending: (t) => !t.done,
    done: (t) => t.done,
  };
  return (taskFilter === 'done' ? allTasks() : state.tasks)
    .concat(noteTasks())
    .filter(filters[taskFilter])
    .filter((t) => !tagFilter || (t.tags || []).includes(tagFilter))
    .sort(manualSort() ? byManualOrder : byImportance);
}

function formatDue(due) {
  const today = dateKey();
  const tomorrow = dateKey(addDays(new Date(), 1));
  if (due === today) return 'Hoy';
  if (due === tomorrow) return 'Mañana';
  if (!DUE_TEXT.has(due)) DUE_TEXT.set(due, DUE_FORMAT.format(parseKey(due)));
  return DUE_TEXT.get(due);
}
const DUE_FORMAT = new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric', month: 'short' });
const DUE_TEXT = new Map();

function toggleDone(t, done) {
  if (done && t.repeat) {
    // Tarea que se repite: cuenta como hecha y pasa a la siguiente fecha.
    const next = nextDue(t);
    withUndo(`Hecha · vuelve ${formatDue(next).toLowerCase()}`, () => {
      bump(state.completions, dateKey(), 1);
      logEvent('task', t.title, { ref: t.id, detail: [`↻ ${REPEAT_LABEL[t.repeat]}`, projectById(t.projectId) && `📁 ${projectById(t.projectId).name}`].filter(Boolean).join(' · ') });
      t.due = next;
      (t.subtasks || []).forEach((s) => (s.done = false));
    });
    return;
  }
  // Desmarcar una tarea archivada la devuelve a la lista.
  if (!done && state.archive.includes(t)) {
    state.archive = state.archive.filter((x) => x !== t);
    state.tasks.push(t);
  }
  t.done = done;
  if (done) {
    t.completedAt = Date.now();
    bump(state.completions, dateKey(), 1);
    logEvent('task', t.title, { ref: t.id, detail: projectById(t.projectId) ? `📁 ${projectById(t.projectId).name}` : '' });
  } else {
    if (t.completedAt) unlogEvent('task', t.id, dateKey(new Date(t.completedAt)));
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

function taskItem(t, { draggable = false } = {}) {
  if (t.virtual) return noteTaskItem(t);
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
  if (t.time) meta.append(' · ', el('span', { className: 'at-time' }, `⏰ ${t.time}`));
  if (t.repeat) meta.append(' · ', el('span', { className: 'repeat' }, `↻ ${REPEAT_LABEL[t.repeat]}`));
  if (t.pomodoros) meta.append(` · 🍅 ${t.pomodoros}`);
  if (subtasks.length) meta.append(` · ☑ ${subtasks.filter((s) => s.done).length}/${subtasks.length}`);

  const title = el('button', { className: 'title', title: 'Editar' }, t.title);
  title.addEventListener('click', () => startEditing(t.id));

  const body = el('div', { className: 'body' }, [title, meta]);
  if (t.notes && !isOpen) body.append(el('div', { className: 'note-preview' }, t.notes.split('\n')[0]));
  const project = t.projectId && projectById(t.projectId);
  if (t.tags?.length || project) {
    const chips = el('div', { className: 'tags' }, (t.tags || []).map(tagChip));
    if (project && openProjectId !== project.id) {
      const pc = el('button', { className: 'tag project-tag', title: `Abrir proyecto ${project.name}` }, `📁 ${project.name}`);
      pc.dataset.pcolor = project.color;
      pc.addEventListener('click', () => openProject(project.id));
      chips.prepend(pc);
    }
    if (chips.children.length) body.append(chips);
  }

  const toggle = el(
    'button',
    { className: `sub-toggle${isOpen ? ' open' : ''}`, title: 'Subtareas y notas', ariaLabel: 'Subtareas y notas', ariaExpanded: String(isOpen) },
    subtasks.length ? `☰ ${subtasks.length}` : t.notes ? '☰ 📝' : '☰ +'
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
      state.archive = state.archive.filter((x) => x.id !== t.id);
    })
  );

  const row = [check, body, toggle, del];
  if (draggable && !t.done) row.unshift(dragHandle(t));
  const li = el('li', { className: `task p${t.priority}${t.done ? ' done' : ''}` }, el('div', { className: 'task-row' }, row));
  li.dataset.id = t.id;
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

  // Notas: se guardan mientras escribes, sin redibujar la lista (así no se pierde el cursor).
  const notes = el('textarea', { className: 'notes', rows: 3, placeholder: 'Notas, enlaces, ideas…', value: t.notes || '', ariaLabel: 'Notas de la tarea' });
  let notesTimer = null;
  notes.addEventListener('input', () => {
    clearTimeout(notesTimer);
    notesTimer = setTimeout(() => {
      t.notes = notes.value;
      save();
    }, 400);
  });
  notes.addEventListener('blur', () => {
    clearTimeout(notesTimer);
    if ((t.notes || '') !== notes.value) {
      t.notes = notes.value;
      save();
    }
  });

  const extra = [];
  if (calEnabled() && t.due && t.time) {
    if (t.calEventId) extra.push(el('p', { className: 'muted cal-done' }, '📅 Ya está en tu Google Calendar'));
    else {
      const add = el('button', { className: 'chip' }, '📅 Añadir a Google Calendar');
      add.addEventListener('click', () => addTaskToCalendar(t, add));
      extra.push(el('div', { className: 'row cal-add' }, add));
    }
  }
  return el('div', { className: 'subtasks' }, [
    ...extra,
    el('div', { className: 'panel-label' }, 'Subtareas'),
    el('ul', {}, items),
    form,
    el('div', { className: 'panel-label' }, 'Notas'),
    notes,
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
  const time = el('input', { type: 'time', value: t.time || '', ariaLabel: 'Hora del recordatorio' });
  const repeat = repeatSelect(t.repeat);
  const project = el('select', { ariaLabel: 'Proyecto' }, [
    el('option', { value: '' }, 'Sin proyecto'),
    ...state.projects.filter((p) => p.status !== 'done' || p.id === t.projectId).map((p) => el('option', { value: p.id, selected: p.id === t.projectId }, `📁 ${p.name}`)),
  ]);
  const cancel = el('button', { type: 'button' }, 'Cancelar');
  cancel.addEventListener('click', stopEditing);

  const form = el('form', { className: 'task-edit' }, [
    title,
    el('div', { className: 'row' }, [priority, due, time, repeat, ...(state.projects.length ? [project] : [])]),
    el('div', { className: 'row' }, [el('button', { type: 'submit', className: 'primary' }, 'Guardar'), cancel]),
  ]);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = title.value.trim();
    if (!text) return;
    const parsed = parseInput(text);
    t.title = parsed.title;
    t.tags = parsed.tags;
    t.priority = parsed.priority ?? Number(priority.value);
    t.repeat = parsed.repeat ?? (repeat.value || null);
    t.time = parsed.time ?? (time.value || null);
    t.projectId = parsed.projectId ?? (project.value || null);
    t.due = parsed.due ?? (due.value || (t.repeat ? dateKey() : null));
    if (t.time && !t.due) t.due = t.time > nowHM() ? dateKey() : dateKey(addDays(new Date(), 1));
    if (t.time) askNotificationPermission();
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

const TASK_PAGE = 150;
let taskLimit = TASK_PAGE;

function renderTasks() {
  renderTagFilter();
  $('#list-pane').hidden = taskView !== 'list';
  $('#week-pane').hidden = taskView !== 'week';
  if (taskView === 'week') renderWeek();
  $('#task-sort').value = state.settings.sort || 'priority';
  const tasks = visibleTasks();
  // Con muchas tareas se dibujan por tandas; el resto aparece con «Mostrar más».
  const shown = tasks.slice(0, taskLimit);
  const items = shown.map((t) => taskItem(t, { draggable: manualSort() }));
  if (tasks.length > shown.length) {
    const more = el('button', { className: 'chip show-more' }, `Mostrar ${Math.min(TASK_PAGE, tasks.length - shown.length)} más (quedan ${tasks.length - shown.length})`);
    more.addEventListener('click', () => {
      taskLimit += TASK_PAGE;
      renderTasks();
    });
    items.push(el('li', { className: 'more-row' }, more));
  }
  $('#task-list').replaceChildren(...items);
  $('#task-empty').hidden = tasks.length > 0;
  const done = state.tasks.filter((t) => t.done).length;
  $('#task-stats').textContent = state.tasks.length ? `${done}/${state.tasks.length} completadas` : '';
  renderTimerTaskOptions();
}


// ---------- Reordenar arrastrando ----------
// El asa ⠿ se arrastra con ratón o dedo; con teclado, las flechas ↑ ↓ mueven la tarea.
function dragHandle(t) {
  const handle = el('button', { className: 'handle', title: 'Arrastra para reordenar', ariaLabel: `Mover "${t.title}" (flechas arriba y abajo)` }, '⠿');
  handle.addEventListener('pointerdown', (e) => startDrag(e, handle));
  handle.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const li = handle.closest('li');
    const sibling = e.key === 'ArrowUp' ? li.previousElementSibling : li.nextElementSibling;
    if (!sibling || sibling.classList.contains('done') || sibling.classList.contains('more-row')) return;
    if (e.key === 'ArrowUp') sibling.before(li);
    else sibling.after(li);
    commitOrder(li.parentElement);
    document.querySelector(`#task-list li[data-id="${t.id}"] .handle`)?.focus();
  });
  return handle;
}

function startDrag(e, handle) {
  e.preventDefault();
  const li = handle.closest('li');
  const list = li.parentElement;
  li.classList.add('dragging');

  // Se escucha en la página: al mover el elemento en el DOM se pierde la captura del puntero.
  const onMove = (ev) => {
    ev.preventDefault();
    const others = [...list.children].filter((c) => c !== li && !c.classList.contains('done') && !c.classList.contains('more-row'));
    const before = others.find((c) => {
      const r = c.getBoundingClientRect();
      return ev.clientY < r.top + r.height / 2;
    });
    if (before) {
      if (li.nextElementSibling !== before) before.before(li);
    } else {
      const last = others[others.length - 1];
      if (last && last.nextElementSibling !== li) last.after(li);
    }
    // Desplaza la página si se arrastra cerca del borde.
    if (ev.clientY < 60) $('#views-pane').scrollBy(0, -12);
    else if (ev.clientY > window.innerHeight - 60) $('#views-pane').scrollBy(0, 12);
  };
  const onUp = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
    li.classList.remove('dragging');
    commitOrder(list);
  };
  document.addEventListener('pointermove', onMove, { passive: false });
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onUp);
}

// Guarda el orden visible reutilizando las posiciones que ya tenían esas tareas,
// así las tareas ocultas por un filtro no se mueven.
function commitOrder(list) {
  const tasks = [...list.children].map((c) => state.tasks.find((t) => t.id === c.dataset.id)).filter((t) => t && !t.done);
  let slots = tasks.map((t) => t.order ?? t.createdAt).sort((a, b) => a - b);
  if (new Set(slots).size < slots.length) slots = slots.map((_, i) => slots[0] + i);
  const changed = tasks.some((t, i) => (t.order ?? t.createdAt) !== slots[i]);
  tasks.forEach((t, i) => (t.order = slots[i]));
  if (changed) save();
  renderAll();
}

// ---------- Lenguaje natural ----------
// "Llamar a Ana mañana !alta #trabajo" -> título "Llamar a Ana", fecha mañana, prioridad alta, etiqueta trabajo.
const WEEKDAY_PATTERNS = ['domingo', 'lunes', 'martes', 'mi[eé]rcoles', 'jueves', 'viernes', 's[aá]bado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'sep?tiembre', 'octubre', 'noviembre', 'diciembre'];
const PRIORITY_WORDS = { alta: 3, media: 2, baja: 1 };
const END = '(?=$|\\s|[,.;:!?])';
const PREFIX = '(?:(?:para|el|este|esta|del|al)\\s+)*';

function weekdayIndex(word) {
  return WEEKDAY_PATTERNS.findIndex((p) => new RegExp(`^${p}$`, 'i').test(word));
}

function nextWeekday(index, { skipToday = false } = {}) {
  const d = new Date();
  let diff = (index - d.getDay() + 7) % 7;
  if (diff === 0 && skipToday) diff = 7;
  return addDays(d, diff);
}

// Fecha con día y mes; si ya pasó este año y no se indicó el año, se entiende el próximo.
function dayMonth(day, month, year) {
  const now = new Date();
  let y = year ? (year < 100 ? 2000 + year : year) : now.getFullYear();
  let d = new Date(y, month, day);
  if (d.getMonth() !== month || d.getDate() !== day) return null;
  if (!year && dateKey(d) < dateKey(now)) d = new Date(y + 1, month, day);
  return d;
}

const DATE_RULES = [
  [`pasado\\s+ma[nñ]ana`, () => addDays(new Date(), 2)],
  [`${PREFIX}hoy`, () => new Date()],
  // "mañana" como día, no "por la mañana" ni "esta mañana".
  [`(?<!\\bla\\s)(?<!\\besta\\s)${PREFIX}ma[nñ]ana`, () => addDays(new Date(), 1)],
  [`en\\s+(\\d{1,3})\\s+(d[ií]as?|semanas?|mes(?:es)?)`, (m) => {
    const n = Number(m[1]);
    if (/^d/i.test(m[2])) return addDays(new Date(), n);
    if (/^s/i.test(m[2])) return addDays(new Date(), n * 7);
    const d = new Date();
    d.setMonth(d.getMonth() + n);
    return d;
  }],
  [`${PREFIX}(pr[oó]ximo\\s+)?(${WEEKDAY_PATTERNS.join('|')})`, (m) => nextWeekday(weekdayIndex(m[2]), { skipToday: !!m[1] })],
  [`${PREFIX}(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?`, (m) => dayMonth(Number(m[1]), Number(m[2]) - 1, m[3] && Number(m[3]))],
  [`${PREFIX}(\\d{1,2})\\s+de\\s+(${MONTHS.join('|')})(?:\\s+(?:de\\s+)?(\\d{4}))?`, (m) => {
    const month = MONTHS.findIndex((p) => new RegExp(`^${p}$`, 'i').test(m[2]));
    return dayMonth(Number(m[1]), month, m[3] && Number(m[3]));
  }],
];

const REPEAT_RULES = [
  ['(?:cada\\s+d[ií]a|todos\\s+los\\s+d[ií]as|diariamente)', 'daily'],
  ['(?:entre\\s+semana|de\\s+lunes\\s+a\\s+viernes|d[ií]as\\s+laborables)', 'weekdays'],
  ['(?:cada\\s+semana|todas\\s+las\\s+semanas|semanalmente)', 'weekly'],
  ['(?:cada\\s+mes|todos\\s+los\\s+meses|mensualmente)', 'monthly'],
];

// "a las 5" = 17:00 (de 1 a 7 sin más detalle se entiende tarde), "a las 9:30", "17:30", "8pm", "a las 10 de la noche".
function toHM(h, m, suffix, fromALas) {
  h = Number(h);
  m = Number(m || 0);
  suffix = (suffix || '').toLowerCase();
  if (/pm|tarde|noche/.test(suffix) && h < 12) h += 12;
  else if (/am|ma[nñ]ana|madrugada/.test(suffix) && h === 12) h = 0;
  else if (!suffix && fromALas && h >= 1 && h <= 7) h += 12;
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const TIME_SUFFIX = '(?:\\s*(am|pm|de\\s+la\\s+(?:ma[nñ]ana|tarde|noche|madrugada)))?';
const TIME_RULES = [
  [`a\\s+las?\\s+(\\d{1,2})(?::(\\d{2}))?${TIME_SUFFIX}`, (m) => toHM(m[1], m[2], m[3], true)],
  [`(\\d{1,2}):(\\d{2})${TIME_SUFFIX}`, (m) => toHM(m[1], m[2], m[3], false)],
  ['(\\d{1,2})\\s*(am|pm)', (m) => toHM(m[1], 0, m[2], false)],
];

function parseInput(text) {
  let rest = ` ${text} `;
  const out = {};
  const take = (pattern, fn) => {
    const re = new RegExp(`(^|\\s)${pattern}${END}`, 'iu');
    const m = rest.match(re);
    if (!m) return false;
    const result = fn([m[0], ...m.slice(2)]);
    if (result === null || result === undefined) return false;
    rest = rest.slice(0, m.index) + m[1] + ' ' + rest.slice(m.index + m[0].length);
    return result;
  };

  // "cada lunes" = cada semana empezando el próximo lunes.
  take(`cada\\s+(${WEEKDAY_PATTERNS.join('|')})`, (m) => {
    out.repeat = 'weekly';
    out.due = dateKey(nextWeekday(weekdayIndex(m[1])));
    return true;
  });
  for (const [pattern, repeat] of REPEAT_RULES) {
    if (!out.repeat && take(pattern, () => true)) out.repeat = repeat;
  }
  take('!(alta|media|baja)', (m) => (out.priority = PRIORITY_WORDS[m[1].toLowerCase()]));
  // "+web" asigna la tarea al proyecto cuyo nombre empieza por "web" (sin importar espacios ni tildes).
  take('\\+([\\p{L}\\p{N}_-]+)', (m) => {
    const norm = (x) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '').toLowerCase();
    const p = state.projects.find((pr) => norm(pr.name).startsWith(norm(m[1])));
    if (!p) return null;
    out.projectId = p.id;
    return true;
  });
  for (const [pattern, fn] of TIME_RULES) {
    const hm = take(pattern, fn);
    if (hm) {
      out.time = hm;
      break;
    }
  }
  if (!out.due) {
    for (const [pattern, fn] of DATE_RULES) {
      const d = take(pattern, fn);
      if (d) {
        out.due = dateKey(d);
        break;
      }
    }
  }
  const { title, tags } = parseTitle(rest);
  return { ...out, title: title || text.trim(), tags };
}

// Muestra bajo el campo lo que se ha entendido mientras se escribe.
function attachPreview(input, preview) {
  const update = () => {
    const text = input.value.trim();
    const p = text ? parseInput(text) : {};
    const chips = [];
    if (p.due) chips.push(`📅 ${formatDue(p.due)}`);
    if (p.time) chips.push(`⏰ ${p.time}`);
    if (p.repeat) chips.push(`↻ ${REPEAT_LABEL[p.repeat]}`);
    if (p.priority) chips.push(`Prioridad ${PRIORITY_LABEL[p.priority].toLowerCase()}`);
    if (p.projectId) chips.push(`📁 ${projectById(p.projectId)?.name}`);
    (p.tags || []).forEach((tag) => chips.push(`#${tag}`));
    preview.replaceChildren(...chips.map((c) => el('span', { className: 'tag' }, c)));
    preview.hidden = !chips.length;
  };
  input.addEventListener('input', update);
  input.form.addEventListener('reset', () => setTimeout(update));
  update();
}

// ---------- Calendario semanal ----------
let taskView = 'list';
let weekOffset = 0; // 0 = esta semana
let addingDay = null; // día con el formulario rápido abierto

$$('[data-taskview]').forEach((btn) =>
  btn.addEventListener('click', () => {
    taskView = btn.dataset.taskview;
    $$('[data-taskview]').forEach((b) => {
      b.classList.toggle('active', b === btn);
      b.ariaPressed = String(b === btn);
    });
    renderTasks();
  })
);
$('#week-prev').addEventListener('click', () => {
  weekOffset--;
  renderTasks();
});
$('#week-next').addEventListener('click', () => {
  weekOffset++;
  renderTasks();
});
$('#week-today').addEventListener('click', () => {
  weekOffset = 0;
  renderTasks();
});
$('#week-undated').addEventListener('click', () => $('[data-taskview="list"]').click());

// Fechas futuras de una tarea que se repite dentro de un rango (sin contar la actual).
function occurrencesBetween(t, fromKey, toKey) {
  if (!t.repeat || t.done || !t.due) return [];
  const out = [];
  let d = parseKey(t.due);
  for (let i = 0; i < 400; i++) {
    d = nextOccurrence(d, t.repeat);
    const key = dateKey(d);
    if (key > toKey) break;
    if (key >= fromKey) out.push(key);
  }
  return out;
}

function weekTitle(start, end) {
  const sameMonth = start.getMonth() === end.getMonth();
  const a = start.toLocaleDateString('es', sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' });
  const b = end.toLocaleDateString('es', { day: 'numeric', month: 'long' });
  return `${a} – ${b}`;
}

function ghostItem(t) {
  return el('li', { className: 'task ghost', title: 'Repetición prevista' }, el('div', { className: 'task-row' }, [
    el('span', { className: 'ghost-icon', ariaHidden: 'true' }, '↻'),
    el('div', { className: 'body' }, [
      el('div', { className: 'ghost-title' }, t.title),
      el('div', { className: 'meta' }, `${REPEAT_LABEL[t.repeat]}${t.time ? ` · ⏰ ${t.time}` : ''} · repetición prevista`),
    ]),
  ]));
}

function renderWeek() {
  const start = addDays(weekStart(new Date()), weekOffset * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const fromKey = dateKey(days[0]);
  const toKey = dateKey(days[6]);
  const today = dateKey();
  const tasks = allTasks().concat(noteTasks()).filter((t) => !tagFilter || (t.tags || []).includes(tagFilter));

  const ghosts = {};
  tasks.forEach((t) => occurrencesBetween(t, fromKey, toKey).forEach((k) => (ghosts[k] = [...(ghosts[k] || []), t])));

  $('#week-title').textContent = weekTitle(days[0], days[6]);
  $('#week-today').hidden = weekOffset === 0;

  const byDay = days.map((d) => {
    const key = dateKey(d);
    return { d, key, real: tasks.filter((t) => t.due === key).sort(byImportance), ghosts: (ghosts[key] || []).sort((a, b) => (a.time || '99').localeCompare(b.time || '99')) };
  });

  $('#week-strip').replaceChildren(
    ...byDay.map(({ d, key, real, ghosts: g }) => {
      const pending = real.filter((t) => !t.done).length + g.length;
      const btn = el('button', { className: `strip-day${key === today ? ' today' : ''}${key < today ? ' past' : ''}`, ariaLabel: `${d.toLocaleDateString('es', { weekday: 'long', day: 'numeric' })}: ${pending} pendientes` }, [
        el('span', { className: 'sd-name' }, d.toLocaleDateString('es', { weekday: 'short' })),
        el('span', { className: 'sd-num' }, String(d.getDate())),
        el('span', { className: `sd-count${pending ? '' : ' zero'}` }, pending ? String(pending) : '·'),
      ]);
      btn.addEventListener('click', () => document.getElementById(`day-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      return btn;
    })
  );

  $('#week-days').replaceChildren(
    ...byDay.map(({ d, key, real, ghosts: g }) => {
      const add = el('button', { className: 'day-add', title: 'Añadir tarea este día', ariaLabel: `Añadir tarea el ${d.toLocaleDateString('es', { weekday: 'long', day: 'numeric' })}` }, '+');
      add.addEventListener('click', () => {
        addingDay = addingDay === key ? null : key;
        renderTasks();
        document.querySelector('.day-form input')?.focus();
      });
      const name = d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short' });
      const head = el('div', { className: 'day-head' }, [
        el('h4', {}, [name.charAt(0).toUpperCase() + name.slice(1), key === today ? el('span', { className: 'today-badge' }, 'Hoy') : '']),
        add,
      ]);

      const block = el('section', { id: `day-${key}`, className: `day${key === today ? ' is-today' : ''}${key < today ? ' past' : ''}` }, head);
      const evs = calendarBlock(key, { compact: true });
      if (evs) block.append(evs);
      if (addingDay === key) {
        const input = el('input', { type: 'text', placeholder: 'Nueva tarea (p. ej. Dentista a las 10)', required: true, maxLength: 200, ariaLabel: 'Nueva tarea' });
        const form = el('form', { className: 'row day-form' }, [input, el('button', { type: 'submit', className: 'primary' }, 'Añadir')]);
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          if (!input.value.trim()) return;
          addingDay = null;
          addTask(input.value.trim(), { due: key });
        });
        block.append(form);
      }
      if (real.length || g.length) block.append(el('ul', { className: 'list' }, [...real.map((t) => taskItem(t)), ...g.map(ghostItem)]));
      else if (addingDay !== key && !evs) block.append(el('p', { className: 'day-free' }, 'Libre'));
      return block;
    })
  );

  const undated = tasks.filter((t) => !t.due && !t.done).length;
  $('#week-undated').textContent = undated ? `${undated} ${undated === 1 ? 'tarea' : 'tareas'} sin fecha · ver en la lista` : '';
  $('#week-undated').hidden = !undated;
  autoLoadCalendar();
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

  const dueToday = state.tasks.concat(noteTasks()).filter(isDueToday).sort(byImportance);
  const overdue = dueToday.filter((t) => t.due < today).length;
  const doneToday = state.completions[today] || 0;
  const habitsDone = state.habits.filter((h) => h.log[today]).length;

  $('#stat-pending').textContent = dueToday.length;
  $('#stat-overdue').textContent = overdue;
  $('#stat-overdue').closest('.stat').classList.toggle('alert', overdue > 0);
  $('#stat-done').textContent = doneToday;
  $('#stat-pomos').textContent = state.pomodoros[today] || 0;

  $('#today-list').replaceChildren(...dueToday.map((t) => taskItem(t)));
  $('#today-empty').hidden = dueToday.length > 0;

  $('#today-journal').hidden = state.journal.some((e) => e.date === today);
  renderReviewNudge();
  renderTodayCalendar();
  $('#today-habits-count').textContent = state.habits.length ? `${habitsDone}/${state.habits.length}` : '';
  $('#today-habits').replaceChildren(
    ...state.habits.map((h) => {
      const on = !!h.log[today];
      const chip = el('button', { className: `habit-chip${on ? ' on' : ''}`, ariaPressed: String(on) }, [
        el('span', { className: 'check', ariaHidden: 'true' }, on ? '✓' : ''),
        h.name,
      ]);
      if (!isDaily(h)) chip.append(el('span', { className: 'chip-goal' }, `${weekCount(h, weekStart(new Date()))}/${goalOf(h)}`));
      chip.addEventListener('click', () => toggleHabit(h, today));
      return chip;
    })
  );
  $('#today-habits-empty').hidden = state.habits.length > 0;
}
