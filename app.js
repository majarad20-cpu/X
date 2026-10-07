'use strict';

// ---------- Almacenamiento ----------
const STORE_KEY = 'enfoque:v1';

const defaults = () => ({
  tasks: [],
  habits: [],
  settings: { focus: 25, short: 5, long: 15, sort: 'priority', accent: 'indigo' },
  pomodoros: {}, // { 'YYYY-MM-DD': n }
  focusMinutes: {}, // { 'YYYY-MM-DD': minutos de enfoque completados }
  completions: {}, // { 'YYYY-MM-DD': tareas completadas ese día }
  projects: [],
  journal: [], // entradas del diario
  ideas: [], // notas de ideas
  maps: [], // mapas mentales
  updatedAt: 0, // última modificación local
  syncMeta: { sent: {}, times: {} }, // estado de la sincronización por bloques (solo de este dispositivo)
});

// Datos del usuario (lo que se sincroniza, se exporta y se puede deshacer).
const CORE_KEYS = ['tasks', 'habits', 'settings', 'pomodoros', 'focusMinutes', 'completions', 'projects'];
const DATA_KEYS = [...CORE_KEYS, 'journal', 'ideas', 'maps'];

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
    const fresh = defaults();
    return { ...fresh, ...data, settings: { ...fresh.settings, ...data.settings }, syncMeta: { ...fresh.syncMeta, ...data.syncMeta } };
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
  renderProjects();
  renderJournal();
  renderIdeas();
  checkReminders();
}

// ---------- Aviso con "Deshacer" ----------
let toastTimeout = null;

// Aplica un cambio destructivo y ofrece deshacerlo durante unos segundos.
function withUndo(message, change) {
  const snapshot = JSON.stringify(Object.fromEntries(DATA_KEYS.map((k) => [k, state[k]])));
  change();
  save();
  renderAll();

  const undo = el('button', { className: 'toast-action' }, 'Deshacer');
  undo.addEventListener('click', () => {
    Object.assign(state, JSON.parse(snapshot));
    save();
    applySettings();
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
  $$('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.view === name);
    if (t.dataset.view === name) t.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  // El mapa mental necesita estar visible para medir sus nodos.
  if (name === 'ideas' && openMapId) renderIdeas();
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
  (a.time || '99').localeCompare(b.time || '99') ||
  a.createdAt - b.createdAt;

const byManualOrder = (a, b) => a.done - b.done || (a.order ?? a.createdAt) - (b.order ?? b.createdAt);

const isDueToday = (t) => !t.done && t.due && t.due <= dateKey();

const manualSort = () => state.settings.sort === 'manual';

$('#task-sort').addEventListener('change', (e) => {
  state.settings.sort = e.target.value;
  save();
  renderTasks();
});

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
    .sort(manualSort() ? byManualOrder : byImportance);
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

function taskItem(t, { draggable = false } = {}) {
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

  return el('div', { className: 'subtasks' }, [
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

function renderTasks() {
  renderTagFilter();
  $('#list-pane').hidden = taskView !== 'list';
  $('#week-pane').hidden = taskView !== 'week';
  if (taskView === 'week') renderWeek();
  $('#task-sort').value = state.settings.sort || 'priority';
  const tasks = visibleTasks();
  $('#task-list').replaceChildren(...tasks.map((t) => taskItem(t, { draggable: manualSort() })));
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
    if (!sibling || sibling.classList.contains('done')) return;
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
    const others = [...list.children].filter((c) => c !== li && !c.classList.contains('done'));
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
    if (ev.clientY < 60) window.scrollBy(0, -12);
    else if (ev.clientY > window.innerHeight - 60) window.scrollBy(0, 12);
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
  const tasks = state.tasks.filter((t) => !tagFilter || (t.tags || []).includes(tagFilter));

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
      else if (addingDay !== key) block.append(el('p', { className: 'day-free' }, 'Libre'));
      return block;
    })
  );

  const undated = tasks.filter((t) => !t.due && !t.done).length;
  $('#week-undated').textContent = undated ? `${undated} ${undated === 1 ? 'tarea' : 'tareas'} sin fecha · ver en la lista` : '';
  $('#week-undated').hidden = !undated;
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

  $('#today-list').replaceChildren(...dueToday.map((t) => taskItem(t)));
  $('#today-empty').hidden = dueToday.length > 0;

  $('#today-journal').hidden = state.journal.some((e) => e.date === today);
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
  if (habit.log[key]) delete habit.log[key];
  else habit.log[key] = true;
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

// ---------- Ajustes: color y copia de seguridad ----------
const ACCENTS = { indigo: 'Índigo', blue: 'Azul', teal: 'Turquesa', fuchsia: 'Fucsia', orange: 'Naranja', slate: 'Grafito' };

function applySettings() {
  document.documentElement.dataset.accent = ACCENTS[state.settings.accent] ? state.settings.accent : 'indigo';
  refreshSettingsInputs();
}

function renderAccents() {
  $('#accent-picker').replaceChildren(
    ...Object.entries(ACCENTS).map(([key, label]) => {
      const on = (state.settings.accent || 'indigo') === key;
      const btn = el('button', { className: `swatch${on ? ' on' : ''}`, role: 'radio', ariaChecked: String(on), title: label }, [
        el('span', { className: 'swatch-dot', ariaHidden: 'true' }),
        label,
      ]);
      btn.dataset.swatch = key;
      btn.addEventListener('click', () => {
        state.settings.accent = key;
        save();
        applySettings();
        renderAccents();
      });
      return btn;
    })
  );
}

function setBackupMessage(text, isError = false) {
  const node = $('#backup-message');
  node.textContent = text;
  node.classList.toggle('error', isError);
}

async function exportBackup() {
  const data = Object.fromEntries(DATA_KEYS.map((k) => [k, state[k]]));
  const json = JSON.stringify({ app: 'enfoque', version: 1, exportedAt: new Date().toISOString(), data }, null, 2);
  const filename = `enfoque-copia-${dateKey()}.json`;

  // Dentro de Claude: el visor pide confirmación y guarda el archivo.
  if (window.claude?.use) {
    const downloads = await window.claude.use('downloads');
    if (downloads) {
      try {
        await downloads.save({ filename, data: json });
        setBackupMessage(`Copia guardada como ${filename}.`);
      } catch (e) {
        if (e?.code !== 'declined') setBackupMessage('No se pudo guardar el archivo aquí. Usa «Copiar» y pégalo en una nota.', true);
      }
      return;
    }
  }
  // Navegador normal: descarga directa.
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setBackupMessage(`Copia descargada como ${filename}.`);
}

async function copyBackup() {
  const json = JSON.stringify({ app: 'enfoque', version: 1, data: Object.fromEntries(DATA_KEYS.map((k) => [k, state[k]])) });
  try {
    await navigator.clipboard.writeText(json);
    setBackupMessage('Copia en el portapapeles. Pégala en una nota para guardarla.');
  } catch {
    $('#backup-text').hidden = false;
    $('#backup-text').value = json;
    $('#backup-text').select();
    setBackupMessage('Selecciona el texto de abajo y cópialo.');
  }
}

function restoreBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    setBackupMessage('Ese archivo no es una copia de Enfoque válida.', true);
    return;
  }
  const data = parsed?.data ?? parsed;
  if (!Array.isArray(data?.tasks) || !Array.isArray(data?.habits)) {
    setBackupMessage('Ese archivo no es una copia de Enfoque válida.', true);
    return;
  }
  withUndo('Copia restaurada', () => {
    const fresh = defaults();
    for (const k of DATA_KEYS) state[k] = data[k] ?? fresh[k];
    state.settings = { ...fresh.settings, ...state.settings };
  });
  applySettings();
  renderAccents();
  setBackupMessage(`Restauradas ${data.tasks.length} tareas y ${data.habits.length} hábitos.`);
}

$('#open-settings').addEventListener('click', () => {
  showView('settings');
  renderAccents();
});
$('#backup-export').addEventListener('click', exportBackup);
$('#backup-copy').addEventListener('click', copyBackup);
$('#backup-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file) restoreBackup(await file.text());
  e.target.value = '';
});
$('#backup-paste').addEventListener('click', () => {
  const box = $('#restore-text');
  if (box.hidden) {
    box.hidden = false;
    box.focus();
    $('#backup-paste').textContent = 'Restaurar texto pegado';
  } else if (box.value.trim()) {
    restoreBackup(box.value.trim());
    box.value = '';
    box.hidden = true;
    $('#backup-paste').textContent = 'Pegar copia';
  }
});

// ---------- Proyectos ----------
let projectFilter = 'active';
let openProjectId = null;
const PROJECT_COLORS = ['indigo', 'blue', 'teal', 'fuchsia', 'orange', 'slate'];
const PROJECT_STATUS = { active: 'Activo', paused: 'En pausa', done: 'Completado' };
const DAY_MS = 24 * 60 * 60 * 1000;

const projectTasks = (p) => state.tasks.filter((t) => t.projectId === p.id);

// Avance: a mano si se fijó; si no, tareas completadas sobre el total (las que se repiten no cuentan,
// porque nunca terminan). Un proyecto completado está al 100 %.
function projectProgress(p) {
  if (p.status === 'done') return 100;
  if (p.manual !== null && p.manual !== undefined) return p.manual;
  const tasks = projectTasks(p).filter((t) => !t.repeat);
  if (!tasks.length) return 0;
  return Math.round((tasks.filter((t) => t.done).length / tasks.length) * 100);
}

function daysLeft(p) {
  if (!p.deadline) return null;
  return Math.round((parseKey(p.deadline) - parseKey(dateKey())) / DAY_MS);
}

function deadlineText(p) {
  const d = daysLeft(p);
  if (d === null) return '';
  if (p.status === 'done') return `Fecha límite: ${formatDue(p.deadline)}`;
  if (d < 0) return `Venció hace ${-d} ${d === -1 ? 'día' : 'días'}`;
  if (d === 0) return 'Vence hoy';
  if (d === 1) return 'Vence mañana';
  return `Vence en ${d} días`;
}

// "Va con retraso" cuando el tiempo consumido supera al avance en más de 20 puntos.
function projectRisk(p) {
  if (p.status !== 'active' || !p.deadline) return null;
  const pct = projectProgress(p);
  const start = parseKey(dateKey(new Date(p.createdAt)));
  const end = parseKey(p.deadline);
  const today = parseKey(dateKey());
  if (today > end && pct < 100) return { level: 'late', text: `La fecha límite ya pasó y el avance es del ${pct} %.` };
  const total = end - start;
  if (total <= 0) return null;
  const timePct = Math.round(((today - start) / total) * 100);
  if (timePct - pct > 20) return { level: 'behind', text: `Ha pasado el ${timePct} % del plazo y el avance es del ${pct} %.` };
  return null;
}

function projectById(id) {
  return state.projects.find((p) => p.id === id);
}

function openProject(id) {
  openProjectId = id;
  showView('projects');
  renderProjects();
  window.scrollTo({ top: 0 });
}

$('#project-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#project-name').value.trim();
  if (!name) return;
  const used = state.projects.map((p) => p.color);
  state.projects.push({
    id: uid(),
    name,
    desc: '',
    status: 'active',
    deadline: $('#project-deadline').value || null,
    color: PROJECT_COLORS.find((c) => !used.includes(c)) || PROJECT_COLORS[state.projects.length % PROJECT_COLORS.length],
    manual: null,
    createdAt: Date.now(),
  });
  save();
  e.target.reset();
  renderAll();
});

$$('[data-pfilter]').forEach((btn) =>
  btn.addEventListener('click', () => {
    projectFilter = btn.dataset.pfilter;
    $$('[data-pfilter]').forEach((b) => b.classList.toggle('active', b === btn));
    renderProjects();
  })
);

$('#project-back').addEventListener('click', () => {
  openProjectId = null;
  renderProjects();
});

function progressBar(pct, big = false) {
  return el('div', { className: `progress-track${big ? ' big' : ''}`, role: 'progressbar', ariaValueNow: String(pct), ariaValueMin: '0', ariaValueMax: '100' },
    el('div', { className: 'progress-fill', style: `width: ${pct}%` }));
}

function projectCard(p) {
  const tasks = projectTasks(p).filter((t) => !t.repeat);
  const pct = projectProgress(p);
  const risk = projectRisk(p);
  const card = el('button', { className: 'project-card' }, [
    el('div', { className: 'pc-head' }, [
      el('span', { className: 'pc-dot', ariaHidden: 'true' }),
      el('span', { className: 'pc-name' }, p.name),
      el('span', { className: `pill status-${p.status}` }, PROJECT_STATUS[p.status]),
    ]),
    el('div', { className: 'pc-progress' }, [progressBar(pct), el('span', { className: 'pc-pct' }, `${pct} %`)]),
    el('div', { className: 'pc-meta' }, [
      p.manual !== null && p.manual !== undefined && p.status !== 'done' ? 'Avance manual' : `${tasks.filter((t) => t.done).length}/${tasks.length} tareas`,
      p.deadline ? ` · ${deadlineText(p)}` : '',
    ]),
  ]);
  if (risk) card.append(el('div', { className: `pc-risk ${risk.level}` }, risk.level === 'late' ? '⚠ Fuera de plazo' : '⚠ Va con retraso'));
  card.dataset.pcolor = p.color;
  card.addEventListener('click', () => openProject(p.id));
  return card;
}

function renderProjects() {
  const detailOpen = !!projectById(openProjectId);
  if (!detailOpen) openProjectId = null;
  $('#projects-list-pane').hidden = detailOpen;
  $('#project-detail').hidden = !detailOpen;
  if (detailOpen) return renderProjectDetail(projectById(openProjectId));

  const order = { active: 0, paused: 1, done: 2 };
  const list = state.projects
    .filter((p) => projectFilter === 'all' || p.status === projectFilter)
    .sort((a, b) => order[a.status] - order[b.status] || (a.deadline || '9999').localeCompare(b.deadline || '9999') || a.createdAt - b.createdAt);
  $('#project-list').replaceChildren(...list.map(projectCard));
  $('#project-empty').hidden = list.length > 0;
}

function renderProjectDetail(p) {
  const focused = document.activeElement;
  const detail = $('#project-detail');
  detail.dataset.pcolor = p.color;
  // No se tocan los campos mientras se escribe en ellos.
  if (focused !== $('#pd-name')) $('#pd-name').value = p.name;
  if (focused !== $('#pd-desc')) $('#pd-desc').value = p.desc || '';
  $('#pd-status').value = p.status;
  $('#pd-deadline').value = p.deadline || '';

  $('#pd-colors').replaceChildren(
    ...PROJECT_COLORS.map((c) => {
      const b = el('button', { className: `pd-color${p.color === c ? ' on' : ''}`, role: 'radio', ariaChecked: String(p.color === c), ariaLabel: ACCENTS[c] });
      b.dataset.pcolor = c;
      b.addEventListener('click', () => {
        p.color = c;
        save();
        renderProjects();
      });
      return b;
    })
  );

  const pct = projectProgress(p);
  const manual = p.manual !== null && p.manual !== undefined;
  $('#pd-percent').textContent = `${pct} %`;
  $('#pd-bar').style.width = `${pct}%`;
  const tasks = projectTasks(p);
  const counted = tasks.filter((t) => !t.repeat);
  $('#pd-status-text').textContent = [
    p.status === 'done' ? 'Proyecto completado' : manual ? 'Avance fijado a mano' : `${counted.filter((t) => t.done).length} de ${counted.length} tareas completadas`,
    deadlineText(p),
  ].filter(Boolean).join(' · ');
  $('#pd-manual').checked = manual;
  $('#pd-manual').disabled = p.status === 'done';
  $('#pd-slider').hidden = !manual || p.status === 'done';
  if (focused !== $('#pd-slider')) $('#pd-slider').value = manual ? p.manual : pct;
  const risk = projectRisk(p);
  $('#pd-risk').hidden = !risk;
  $('#pd-risk').textContent = risk ? `⚠ ${risk.text}` : '';

  const sorted = tasks.slice().sort(byImportance);
  $('#pd-tasks').replaceChildren(...sorted.map((t) => taskItem(t)));
  $('#pd-tasks-empty').hidden = tasks.length > 0;
  $('#pd-count').textContent = tasks.length ? `${tasks.filter((t) => t.done).length}/${tasks.length}` : '';
}

function currentProject() {
  return projectById(openProjectId);
}

let pdTimer = null;
['#pd-name', '#pd-desc'].forEach((sel) =>
  $(sel).addEventListener('input', () => {
    clearTimeout(pdTimer);
    pdTimer = setTimeout(() => {
      const p = currentProject();
      if (!p) return;
      p.name = $('#pd-name').value.trim() || p.name;
      p.desc = $('#pd-desc').value;
      save();
    }, 400);
  })
);
$('#pd-name').addEventListener('blur', () => {
  const p = currentProject();
  if (p && !$('#pd-name').value.trim()) $('#pd-name').value = p.name;
  renderAll();
});
$('#pd-status').addEventListener('change', (e) => {
  const p = currentProject();
  p.status = e.target.value;
  save();
  renderAll();
});
$('#pd-deadline').addEventListener('change', (e) => {
  const p = currentProject();
  p.deadline = e.target.value || null;
  save();
  renderAll();
});
$('#pd-manual').addEventListener('change', (e) => {
  const p = currentProject();
  p.manual = e.target.checked ? projectProgress(p) : null;
  save();
  renderAll();
});
$('#pd-slider').addEventListener('input', (e) => {
  const p = currentProject();
  p.manual = Number(e.target.value);
  $('#pd-percent').textContent = `${p.manual} %`;
  $('#pd-bar').style.width = `${p.manual}%`;
});
$('#pd-slider').addEventListener('change', () => {
  save();
  renderAll();
});
$('#pd-task-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('#pd-task-title').value.trim();
  if (!text) return;
  addTask(text, { projectId: openProjectId });
  e.target.reset();
  $('#pd-task-title').focus();
});
$('#pd-delete').addEventListener('click', () => {
  const p = currentProject();
  if (!p) return;
  withUndo(`Proyecto "${p.name}" eliminado (sus tareas se conservan)`, () => {
    state.projects = state.projects.filter((x) => x.id !== p.id);
    state.tasks.forEach((t) => {
      if (t.projectId === p.id) t.projectId = null;
    });
    openProjectId = null;
  });
});

// ---------- Diario ----------
const JOURNAL_KINDS = {
  dump: {
    label: 'Vaciado mental',
    hint: 'Saca de la cabeza todo lo que te ronda: pendientes, preocupaciones, ideas. Sin filtro ni orden, una cosa por línea. Al guardar podrás convertir líneas en tareas.',
    placeholder: 'Llamar al banco\nMe preocupa la entrega del viernes\nComprar regalo para Laura\nIdea: ordenar el trastero un sábado…',
  },
  free: { label: 'Libre', hint: 'Escribe lo que quieras sobre tu día, sin reglas.', placeholder: 'Hoy…' },
  gratitude: { label: 'Gratitud', hint: 'Tres cosas por las que dar las gracias hoy, grandes o pequeñas.', prompts: ['Hoy agradezco…', 'También agradezco…', 'Y además…'] },
  reflection: { label: 'Reflexión', hint: 'Unos minutos para cerrar el día con perspectiva.', prompts: ['¿Qué salió bien hoy?', '¿Qué me costó o qué aprendí?', '¿Qué haré mejor mañana?'] },
};
const MOODS = [
  { v: 1, e: '😞', l: 'Mal' },
  { v: 2, e: '😕', l: 'Regular' },
  { v: 3, e: '😐', l: 'Normal' },
  { v: 4, e: '🙂', l: 'Bien' },
  { v: 5, e: '😄', l: 'Genial' },
];
const DRAFT_KEY = 'enfoque:journal-draft';
let journalKind = 'dump';
let journalMood = null;
let journalSearch = '';
let journalLimit = 20;
let editingEntryId = null;
const expandedEntries = new Set();

function readDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY)) || {};
  } catch {
    return {};
  }
}

function writeDraft(draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Sin almacenamiento: el borrador solo vive mientras la página está abierta.
  }
}

function moodPicker(current, onPick) {
  return MOODS.map((m) => {
    const b = el('button', { type: 'button', className: `mood${current === m.v ? ' on' : ''}`, role: 'radio', ariaChecked: String(current === m.v), title: m.l }, [
      el('span', { className: 'mood-e', ariaHidden: 'true' }, m.e),
      el('span', { className: 'mood-l' }, m.l),
    ]);
    b.addEventListener('click', () => onPick(current === m.v ? null : m.v));
    return b;
  });
}

// Campos del formulario según el tipo: un texto libre o varias preguntas.
function journalFields(kind, values = {}) {
  const k = JOURNAL_KINDS[kind];
  if (!k.prompts) {
    return [el('textarea', { className: 'notes journal-text', rows: kind === 'dump' ? 8 : 6, placeholder: k.placeholder, value: values.text || '', ariaLabel: k.label })];
  }
  return k.prompts.map((q, i) =>
    el('label', { className: 'prompt' }, [
      el('span', {}, q),
      el('textarea', { className: 'notes', rows: 2, value: values.sections?.[i]?.a || '', ariaLabel: q }),
    ])
  );
}

function readFields(container, kind) {
  const k = JOURNAL_KINDS[kind];
  if (!k.prompts) return { text: container.querySelector('textarea').value.trim(), sections: null };
  const answers = [...container.querySelectorAll('textarea')].map((t) => t.value.trim());
  return { text: '', sections: k.prompts.map((q, i) => ({ q, a: answers[i] })) };
}

const entryIsEmpty = (e) => !e.text && !(e.sections || []).some((s) => s.a);

function renderComposer() {
  $$('[data-jkind]').forEach((b) => b.classList.toggle('active', b.dataset.jkind === journalKind));
  $('#journal-hint').textContent = JOURNAL_KINDS[journalKind].hint;
  const draft = readDraft();
  const values = draft.kind === journalKind ? draft : {};
  $('#journal-fields').replaceChildren(...journalFields(journalKind, values));
  if (draft.mood !== undefined && journalMood === null) journalMood = draft.mood;
  $('#mood-picker').replaceChildren(...moodPicker(journalMood, (v) => {
    journalMood = v;
    saveDraftNow();
    renderComposerMood();
  }));
  $('#journal-draft').textContent = values.text || values.sections?.some((s) => s.a) ? 'Borrador recuperado' : '';
}

function renderComposerMood() {
  $('#mood-picker').replaceChildren(...moodPicker(journalMood, (v) => {
    journalMood = v;
    saveDraftNow();
    renderComposerMood();
  }));
}

function saveDraftNow() {
  writeDraft({ kind: journalKind, mood: journalMood, ...readFields($('#journal-fields'), journalKind) });
}

let draftTimer = null;
$('#journal-fields').addEventListener('input', () => {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    saveDraftNow();
    $('#journal-draft').textContent = 'Borrador guardado en este dispositivo';
  }, 500);
});

$$('[data-jkind]').forEach((b) =>
  b.addEventListener('click', () => {
    saveDraftNow();
    journalKind = b.dataset.jkind;
    renderComposer();
    $('#journal-fields textarea')?.focus();
  })
);

$('#journal-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const fields = readFields($('#journal-fields'), journalKind);
  const entry = { id: uid(), date: dateKey(), createdAt: Date.now(), updatedAt: Date.now(), kind: journalKind, mood: journalMood, ...fields };
  if (entryIsEmpty(entry)) {
    $('#journal-draft').textContent = 'Escribe algo antes de guardar.';
    return;
  }
  state.journal.push(entry);
  save();
  writeDraft({});
  journalMood = null;
  renderComposer();
  renderAll();
  if (entry.kind === 'dump') showDumpConvert(entry);
  $('#journal-draft').textContent = 'Entrada guardada';
});

// Líneas de un texto que pueden convertirse en tareas.
function entryLines(entry) {
  const text = entry.text || (entry.sections || []).map((s) => s.a).join('\n');
  return text
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*•·]|\d+[.)]|\[ ?\])\s*/, '').trim())
    .filter((l) => l.length > 1);
}

function showDumpConvert(entry) {
  const lines = entryLines(entry);
  const box = $('#dump-convert');
  if (!lines.length) {
    box.hidden = true;
    return;
  }
  const checks = lines.map((line) => {
    const p = parseInput(line);
    const extra = [p.due && `📅 ${formatDue(p.due)}`, p.time && `⏰ ${p.time}`, p.priority && `!${PRIORITY_LABEL[p.priority].toLowerCase()}`].filter(Boolean).join(' · ');
    const input = el('input', { type: 'checkbox' });
    return { line, input, row: el('label', { className: 'dc-line' }, [input, el('span', {}, line), extra ? el('span', { className: 'muted' }, extra) : '']) };
  });
  const create = el('button', { className: 'primary', type: 'button' }, 'Crear tareas');
  const skip = el('button', { type: 'button' }, 'Ahora no');
  const update = () => {
    const n = checks.filter((c) => c.input.checked).length;
    create.textContent = n ? `Crear ${n} ${n === 1 ? 'tarea' : 'tareas'}` : 'Marca las líneas que son tareas';
    create.disabled = !n;
  };
  checks.forEach((c) => c.input.addEventListener('change', update));
  create.addEventListener('click', () => {
    const chosen = checks.filter((c) => c.input.checked);
    chosen.forEach((c) => addTask(c.line));
    box.hidden = true;
    showToastMessage(`${chosen.length} ${chosen.length === 1 ? 'tarea creada' : 'tareas creadas'} en Tareas`);
  });
  skip.addEventListener('click', () => (box.hidden = true));
  box.replaceChildren(
    el('h3', {}, '¿Alguna de estas líneas es una tarea?'),
    el('p', { className: 'muted' }, 'Marca las que quieras pasar a Tareas. Se entienden fechas y horas como «mañana» o «a las 5».'),
    el('div', { className: 'dc-lines' }, checks.map((c) => c.row)),
    el('div', { className: 'row' }, [create, skip])
  );
  update();
  box.hidden = false;
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function showToastMessage(message) {
  $('#toast').replaceChildren(el('span', {}, message));
  $('#toast').hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(hideToast, 4000);
}

$('#journal-search').addEventListener('input', (e) => {
  journalSearch = e.target.value.trim().toLowerCase();
  journalLimit = 20;
  renderJournal();
});

function journalStreak() {
  const days = new Set(state.journal.map((e) => e.date));
  let d = new Date();
  if (!days.has(dateKey(d))) d = addDays(d, -1);
  let n = 0;
  while (days.has(dateKey(d))) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

function dayLabel(key) {
  const today = dateKey();
  if (key === today) return 'Hoy';
  if (key === dateKey(addDays(new Date(), -1))) return 'Ayer';
  const s = parseKey(key).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: key.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function entryEditor(entry) {
  const fields = el('div', {}, journalFields(entry.kind, entry));
  let mood = entry.mood ?? null;
  const picker = el('div', { className: 'mood-picker' });
  const paint = () => picker.replaceChildren(...moodPicker(mood, (v) => {
    mood = v;
    paint();
  }));
  paint();
  const saveBtn = el('button', { className: 'primary' }, 'Guardar');
  const cancel = el('button', {}, 'Cancelar');
  saveBtn.addEventListener('click', () => {
    Object.assign(entry, readFields(fields, entry.kind), { mood, updatedAt: Date.now() });
    editingEntryId = null;
    save();
    renderJournal();
  });
  cancel.addEventListener('click', () => {
    editingEntryId = null;
    renderJournal();
  });
  setTimeout(() => fields.querySelector('textarea')?.focus());
  return el('article', { className: 'card entry editing' }, [fields, picker, el('div', { className: 'row' }, [saveBtn, cancel])]);
}

function entryCard(entry) {
  if (entry.id === editingEntryId) return entryEditor(entry);
  const mood = MOODS.find((m) => m.v === entry.mood);
  const time = new Date(entry.createdAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  const open = expandedEntries.has(entry.id);

  const body = el('div', { className: `entry-body${open ? ' open' : ''}` });
  if (entry.text) body.append(el('p', { className: 'entry-text' }, entry.text));
  (entry.sections || []).filter((s) => s.a).forEach((s) => body.append(el('p', { className: 'entry-q' }, s.q), el('p', { className: 'entry-text' }, s.a)));

  const long = (entry.text || '').split('\n').length > 6 || (entry.text || '').length > 420 || (entry.sections || []).filter((s) => s.a).length > 2;
  const more = el('button', { className: 'link' }, open ? 'Ver menos' : 'Ver más');
  more.addEventListener('click', () => {
    if (open) expandedEntries.delete(entry.id);
    else expandedEntries.add(entry.id);
    renderJournal();
  });

  const edit = el('button', { className: 'link' }, 'Editar');
  edit.addEventListener('click', () => {
    editingEntryId = entry.id;
    renderJournal();
  });
  const toTasks = el('button', { className: 'link' }, '→ Tareas');
  toTasks.addEventListener('click', () => showDumpConvert(entry));
  const del = el('button', { className: 'link danger-link' }, 'Borrar');
  del.addEventListener('click', () =>
    withUndo('Entrada borrada', () => {
      state.journal = state.journal.filter((x) => x.id !== entry.id);
    })
  );

  return el('article', { className: 'card entry' }, [
    el('header', { className: 'entry-head' }, [
      el('span', { className: `entry-kind kind-${entry.kind}` }, JOURNAL_KINDS[entry.kind].label),
      el('span', { className: 'muted' }, time),
      mood ? el('span', { className: 'entry-mood', title: mood.l }, mood.e) : '',
    ]),
    body,
    el('footer', { className: 'entry-actions' }, [long ? more : '', edit, toTasks, del]),
  ]);
}

function renderJournal() {
  // Semana de ánimo: el ánimo de la última entrada de cada día.
  const today = new Date();
  $('#journal-week').replaceChildren(
    ...Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)).map((d) => {
      const key = dateKey(d);
      const entries = state.journal.filter((e) => e.date === key).sort((a, b) => a.createdAt - b.createdAt);
      const withMood = entries.filter((e) => e.mood).pop();
      const mood = withMood && MOODS.find((m) => m.v === withMood.mood);
      return el('div', { className: `jw-day${key === dateKey() ? ' today' : ''}`, title: mood ? mood.l : entries.length ? 'Escribiste' : 'Sin entrada' }, [
        el('span', { className: 'jw-name' }, d.toLocaleDateString('es', { weekday: 'narrow' })),
        el('span', { className: `jw-mark${entries.length ? ' wrote' : ''}` }, mood ? mood.e : entries.length ? '✓' : ''),
      ]);
    })
  );
  const streak = journalStreak();
  const month = dateKey().slice(0, 7);
  const words = state.journal
    .filter((e) => monthOf(e.date) === month)
    .reduce((n, e) => n + `${e.text || ''} ${(e.sections || []).map((s) => s.a).join(' ')}`.split(/\s+/).filter(Boolean).length, 0);
  $('#journal-stats').textContent = state.journal.length
    ? `${state.journal.length} ${state.journal.length === 1 ? 'entrada' : 'entradas'} · ${streak ? `racha de ${streak} ${streak === 1 ? 'día' : 'días'}` : 'sin racha activa'} · ${words} palabras este mes`
    : 'Escribir unos minutos al día ayuda a ordenar la cabeza.';

  const q = journalSearch;
  const list = state.journal
    .filter((e) => !q || `${e.text || ''} ${(e.sections || []).map((s) => `${s.q} ${s.a}`).join(' ')}`.toLowerCase().includes(q))
    .sort((a, b) => b.createdAt - a.createdAt);
  const shown = list.slice(0, journalLimit);
  const groups = [];
  shown.forEach((e) => {
    const g = groups[groups.length - 1];
    if (g && g.date === e.date) g.items.push(e);
    else groups.push({ date: e.date, items: [e] });
  });
  const nodes = groups.map((g) => el('section', { className: 'entry-day' }, [el('h3', { className: 'section-title' }, dayLabel(g.date)), ...g.items.map(entryCard)]));
  if (list.length > shown.length) {
    const more = el('button', { className: 'link' }, `Ver ${Math.min(20, list.length - shown.length)} entradas más`);
    more.addEventListener('click', () => {
      journalLimit += 20;
      renderJournal();
    });
    nodes.push(more);
  }
  $('#journal-list').replaceChildren(...nodes);
  $('#journal-empty').hidden = list.length > 0;
  $('#journal-empty').textContent = state.journal.length ? 'Ninguna entrada coincide con la búsqueda.' : 'Tu diario está vacío. Escribe la primera entrada arriba.';
}

$('#today-journal').addEventListener('click', () => {
  showView('journal');
  journalKind = 'dump';
  renderComposer();
  $('#journal-fields textarea')?.focus();
});

// ---------- Ideas ----------
let ideaView = 'notes';
let ideaSearch = '';
let ideaTag = null;
let editingIdeaId = null;

// Saca las #etiquetas de un texto conservando los saltos de línea.
function extractTags(text) {
  const tags = [];
  const clean = text
    .replace(/(^|[ \t])#([\p{L}\p{N}_-]+)/gu, (_, sp, tag) => {
      tag = tag.toLowerCase();
      if (!tags.includes(tag)) tags.push(tag);
      return sp;
    })
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .trim();
  return { text: clean || text.trim(), tags };
}

$$('[data-ideaview]').forEach((btn) =>
  btn.addEventListener('click', () => {
    ideaView = btn.dataset.ideaview;
    $$('[data-ideaview]').forEach((b) => {
      b.classList.toggle('active', b === btn);
      b.ariaPressed = String(b === btn);
    });
    renderIdeas();
  })
);

$('#idea-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const raw = $('#idea-text').value.trim();
  if (!raw) return;
  state.ideas.push({ id: uid(), ...extractTags(raw), pinned: false, createdAt: Date.now(), updatedAt: Date.now() });
  save();
  e.target.reset();
  renderIdeas();
  $('#idea-text').focus();
});
$('#idea-text').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    $('#idea-form').requestSubmit();
  }
});
$('#idea-search').addEventListener('input', (e) => {
  ideaSearch = e.target.value.trim().toLowerCase();
  renderIdeas();
});

function ideaCard(idea) {
  if (idea.id === editingIdeaId) {
    const area = el('textarea', { className: 'notes', rows: 4, value: [idea.text, ...idea.tags.map((t) => `#${t}`)].join(' ').replace(/ (#)/, '\n$1'), ariaLabel: 'Editar idea' });
    const ok = el('button', { className: 'primary' }, 'Guardar');
    const cancel = el('button', {}, 'Cancelar');
    ok.addEventListener('click', () => {
      if (!area.value.trim()) return;
      Object.assign(idea, extractTags(area.value), { updatedAt: Date.now() });
      editingIdeaId = null;
      save();
      renderIdeas();
    });
    cancel.addEventListener('click', () => {
      editingIdeaId = null;
      renderIdeas();
    });
    setTimeout(() => area.focus());
    return el('article', { className: 'card idea editing' }, [area, el('div', { className: 'row' }, [ok, cancel])]);
  }

  const pin = el('button', { className: `icon-link${idea.pinned ? ' on' : ''}`, title: idea.pinned ? 'Desfijar' : 'Fijar arriba', ariaPressed: String(!!idea.pinned) }, '📌');
  pin.addEventListener('click', () => {
    idea.pinned = !idea.pinned;
    save();
    renderIdeas();
  });
  const edit = el('button', { className: 'link' }, 'Editar');
  edit.addEventListener('click', () => {
    editingIdeaId = idea.id;
    renderIdeas();
  });
  const toTask = el('button', { className: 'link' }, '→ Tarea');
  toTask.addEventListener('click', () => {
    addTask(idea.text.split('\n')[0]);
    showToastMessage('Tarea creada en Tareas');
  });
  const toMap = el('button', { className: 'link' }, '→ Mapa');
  toMap.addEventListener('click', () => {
    // La primera línea es el tema central; las demás, sus ramas.
    const [first, ...rest] = idea.text.split('\n').map((l) => l.replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, '').trim()).filter(Boolean);
    const map = newMap(first.slice(0, 80));
    rest.forEach((line) => map.nodes.push({ id: uid(), parent: 'root', text: line.slice(0, 120) }));
    save();
    openMap(map.id);
  });
  const del = el('button', { className: 'link danger-link' }, 'Borrar');
  del.addEventListener('click', () =>
    withUndo('Idea borrada', () => {
      state.ideas = state.ideas.filter((x) => x.id !== idea.id);
    })
  );
  const date = new Date(idea.createdAt).toLocaleDateString('es', { day: 'numeric', month: 'short' });
  const card = el('article', { className: `card idea${idea.pinned ? ' pinned' : ''}` }, [
    el('header', { className: 'idea-head' }, [el('span', { className: 'muted' }, date), pin]),
    el('p', { className: 'idea-text' }, idea.text),
  ]);
  if (idea.tags.length) {
    card.append(el('div', { className: 'tags' }, idea.tags.map((t) => {
      const chip = el('button', { className: `tag${t === ideaTag ? ' active' : ''}` }, `#${t}`);
      chip.addEventListener('click', () => {
        ideaTag = ideaTag === t ? null : t;
        renderIdeas();
      });
      return chip;
    })));
  }
  card.append(el('footer', { className: 'entry-actions' }, [edit, toTask, toMap, del]));
  return card;
}

function renderIdeas() {
  $('#ideas-notes-pane').hidden = ideaView !== 'notes';
  $('#ideas-maps-pane').hidden = ideaView !== 'maps';
  if (ideaView === 'maps') return renderMaps();

  const tags = [...new Set(state.ideas.flatMap((i) => i.tags))].sort((a, b) => a.localeCompare(b, 'es'));
  if (ideaTag && !tags.includes(ideaTag)) ideaTag = null;
  const all = el('button', { className: `tag${ideaTag ? '' : ' active'}` }, 'Todas');
  all.addEventListener('click', () => {
    ideaTag = null;
    renderIdeas();
  });
  $('#idea-tags').replaceChildren(...(tags.length ? [all, ...tags.map((t) => {
    const b = el('button', { className: `tag${t === ideaTag ? ' active' : ''}` }, `#${t}`);
    b.addEventListener('click', () => {
      ideaTag = ideaTag === t ? null : t;
      renderIdeas();
    });
    return b;
  })] : []));
  $('#idea-tags').hidden = !tags.length;

  const list = state.ideas
    .filter((i) => !ideaTag || i.tags.includes(ideaTag))
    .filter((i) => !ideaSearch || `${i.text} ${i.tags.join(' ')}`.toLowerCase().includes(ideaSearch))
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.createdAt - a.createdAt);
  $('#idea-list').replaceChildren(...list.map(ideaCard));
  $('#idea-empty').hidden = list.length > 0;
  $('#idea-empty').textContent = state.ideas.length ? 'Ninguna idea coincide.' : 'Sin ideas todavía. Las buenas ideas llegan en cualquier momento: apúntalas aquí.';
}

// ---------- Mapas mentales ----------
let openMapId = null;
let selectedNode = 'root';
let editingNode = null;
let mapZoom = 1;
let mapLayout = null; // última disposición calculada (para navegar con flechas y exportar)
const BRANCH_COUNT = 6;

function newMap(title) {
  const map = { id: uid(), title, createdAt: Date.now(), updatedAt: Date.now(), nodes: [{ id: 'root', parent: null, text: title }] };
  state.maps.push(map);
  return map;
}

const currentMap = () => state.maps.find((m) => m.id === openMapId);

function openMap(id) {
  openMapId = id;
  selectedNode = 'root';
  editingNode = null;
  mapZoom = 1;
  ideaView = 'maps';
  $$('[data-ideaview]').forEach((b) => {
    b.classList.toggle('active', b.dataset.ideaview === 'maps');
    b.ariaPressed = String(b.dataset.ideaview === 'maps');
  });
  showView('ideas');
  renderIdeas();
  fitMap();
  $('#map-canvas').focus({ preventScroll: true });
}

function touchMap(map) {
  map.title = map.nodes.find((n) => !n.parent).text;
  map.updatedAt = Date.now();
  save();
}

$('#map-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const title = $('#map-title').value.trim();
  if (!title) return;
  const map = newMap(title);
  save();
  e.target.reset();
  openMap(map.id);
});
$('#map-back').addEventListener('click', () => {
  openMapId = null;
  renderIdeas();
});
$('#map-name').addEventListener('input', (e) => {
  const map = currentMap();
  if (!map || !e.target.value.trim()) return;
  map.nodes.find((n) => !n.parent).text = e.target.value.trim();
  touchMap(map);
  renderMap();
});

function renderMaps() {
  const open = !!currentMap();
  if (!open) openMapId = null;
  $('#maps-list-pane').hidden = open;
  $('#map-editor').hidden = !open;
  if (open) {
    if (!editingNode) renderMap();
    return;
  }
  const list = state.maps.slice().sort((a, b) => b.updatedAt - a.updatedAt);
  $('#map-list').replaceChildren(
    ...list.map((m) => {
      const card = el('div', { className: 'card map-card' });
      const openBtn = el('button', { className: 'map-open' }, [
        el('span', { className: 'map-card-title' }, m.title),
        el('span', { className: 'muted' }, `${m.nodes.length - 1} ${m.nodes.length === 2 ? 'idea' : 'ideas'} · ${new Date(m.updatedAt).toLocaleDateString('es', { day: 'numeric', month: 'short' })}`),
        miniMap(m),
      ]);
      openBtn.addEventListener('click', () => openMap(m.id));
      const del = el('button', { className: 'del', title: 'Borrar mapa', ariaLabel: `Borrar mapa ${m.title}` }, '✕');
      del.addEventListener('click', () =>
        withUndo(`Mapa "${m.title}" borrado`, () => {
          state.maps = state.maps.filter((x) => x.id !== m.id);
        })
      );
      card.append(openBtn, del);
      return card;
    })
  );
  $('#map-empty').hidden = list.length > 0;
}

// Miniatura: el tema central y sus primeras ramas.
function miniMap(m) {
  const kids = m.nodes.filter((n) => n.parent === 'root').slice(0, 6);
  return el('span', { className: 'mini-branches' }, kids.map((k, i) => el('span', { className: `mini b${i % BRANCH_COUNT}` }, k.text)));
}

const childrenOf = (map, id) => map.nodes.filter((n) => n.parent === id);

function branchIndex(map, node) {
  if (!node.parent) return -1;
  let n = node;
  while (n.parent && n.parent !== 'root') n = map.nodes.find((x) => x.id === n.parent);
  return childrenOf(map, 'root').indexOf(n) % BRANCH_COUNT;
}

function depthOf(map, node) {
  let d = 0;
  let n = node;
  while (n.parent) {
    n = map.nodes.find((x) => x.id === n.parent);
    d++;
  }
  return d;
}

// Disposición en árbol horizontal: el tema en el centro y las ramas repartidas a derecha e izquierda.
function computeLayout(map, sizes) {
  const GAP_X = 48;
  const GAP_Y = 12;
  const kidsOf = (n) => (n.collapsed ? [] : childrenOf(map, n.id));
  const subH = {};
  const measure = (n) => {
    const kids = kidsOf(n);
    const own = sizes[n.id].h;
    if (!kids.length) return (subH[n.id] = own);
    const sum = kids.reduce((a, k) => a + measure(k), 0) + GAP_Y * (kids.length - 1);
    return (subH[n.id] = Math.max(own, sum));
  };
  const root = map.nodes.find((n) => !n.parent);
  const top = kidsOf(root);
  top.forEach(measure);
  const total = top.reduce((a, k) => a + subH[k.id], 0);
  const right = [];
  const left = [];
  let acc = 0;
  top.forEach((k) => {
    if (acc < total / 2 || !right.length) {
      right.push(k);
      acc += subH[k.id];
    } else left.push(k);
  });

  const pos = {};
  const side = {};
  const place = (n, edge, cy, dir) => {
    const { w, h } = sizes[n.id];
    pos[n.id] = { x: dir > 0 ? edge : edge - w, y: cy - h / 2, w, h };
    side[n.id] = dir;
    const kids = kidsOf(n);
    const sum = kids.reduce((a, k) => a + subH[k.id], 0) + GAP_Y * Math.max(0, kids.length - 1);
    let y = cy - sum / 2;
    kids.forEach((k) => {
      place(k, dir > 0 ? edge + w + GAP_X : edge - w - GAP_X, y + subH[k.id] / 2, dir);
      y += subH[k.id] + GAP_Y;
    });
  };
  const rs = sizes[root.id];
  pos[root.id] = { x: -rs.w / 2, y: -rs.h / 2, w: rs.w, h: rs.h };
  side[root.id] = 0;
  const column = (list, dir) => {
    const sum = list.reduce((a, k) => a + subH[k.id], 0) + GAP_Y * Math.max(0, list.length - 1);
    let y = -sum / 2;
    list.forEach((k) => {
      place(k, dir > 0 ? rs.w / 2 + GAP_X : -rs.w / 2 - GAP_X, y + subH[k.id] / 2, dir);
      y += subH[k.id] + GAP_Y;
    });
  };
  column(right, 1);
  column(left, -1);

  const PAD = 40;
  const xs = Object.values(pos);
  const minX = Math.min(...xs.map((p) => p.x)) - PAD;
  const minY = Math.min(...xs.map((p) => p.y)) - PAD;
  const maxX = Math.max(...xs.map((p) => p.x + p.w)) + PAD;
  const maxY = Math.max(...xs.map((p) => p.y + p.h)) + PAD;
  Object.values(pos).forEach((p) => {
    p.x -= minX;
    p.y -= minY;
  });
  return { pos, side, width: maxX - minX, height: maxY - minY };
}

function edgePath(a, b, dir) {
  const x1 = dir > 0 ? a.x + a.w : a.x;
  const y1 = a.y + a.h / 2;
  const x2 = dir > 0 ? b.x : b.x + b.w;
  const y2 = b.y + b.h / 2;
  const mx = (x1 + x2) / 2;
  return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
}

function renderMap() {
  const map = currentMap();
  if (!map || !$('#map-editor').offsetParent) return;
  if (!map.nodes.some((n) => n.id === selectedNode)) selectedNode = 'root';
  const root = map.nodes.find((n) => !n.parent);
  if (document.activeElement !== $('#map-name')) $('#map-name').value = root.text;

  // Nodos ocultos por una rama plegada.
  const hidden = new Set();
  const hide = (id) => childrenOf(map, id).forEach((c) => {
    hidden.add(c.id);
    hide(c.id);
  });
  map.nodes.filter((n) => n.collapsed).forEach((n) => hide(n.id));
  const visible = map.nodes.filter((n) => !hidden.has(n.id));

  const nodesEl = $('#map-nodes');
  const els = {};
  nodesEl.replaceChildren(
    ...visible.map((n) => {
      const depth = depthOf(map, n);
      const b = branchIndex(map, n);
      const kids = childrenOf(map, n.id).length;
      const node = el('div', {
        className: `mm-node depth-${Math.min(depth, 2)}${b >= 0 ? ` b${b}` : ''}${n.id === selectedNode ? ' selected' : ''}`,
        role: 'treeitem',
        ariaSelected: String(n.id === selectedNode),
        ariaLabel: n.text,
      });
      node.dataset.id = n.id;
      if (n.id === editingNode) {
        const input = el('textarea', { className: 'mm-input', value: n.text, rows: 1, maxLength: 120, ariaLabel: 'Texto del nodo' });
        const commit = (keep) => {
          if (editingNode !== n.id) return;
          editingNode = null;
          const v = input.value.trim();
          if (keep && v) n.text = v;
          touchMap(map);
          renderMap();
          $('#map-canvas').focus({ preventScroll: true });
        };
        input.addEventListener('keydown', (e) => {
          e.stopPropagation();
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            commit(true);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            commit(false);
          } else if (e.key === 'Tab') {
            e.preventDefault();
            commit(true);
            addNode('child');
          }
        });
        input.addEventListener('input', () => {
          input.style.height = 'auto';
          input.style.height = `${input.scrollHeight}px`;
        });
        input.addEventListener('blur', () => commit(true));
        node.append(input);
      } else {
        node.append(el('span', { className: 'mm-text' }, n.text));
      }
      if (kids && n.parent) {
        const fold = el('button', { className: 'mm-fold', title: n.collapsed ? 'Desplegar' : 'Plegar', ariaLabel: n.collapsed ? `Desplegar ${kids} ramas` : 'Plegar rama' }, n.collapsed ? `+${kids}` : '−');
        fold.addEventListener('click', (e) => {
          e.stopPropagation();
          n.collapsed = !n.collapsed;
          touchMap(map);
          renderMap();
        });
        node.append(fold);
      }
      node.addEventListener('click', (e) => {
        e.stopPropagation();
        if (editingNode === n.id) return;
        selectedNode = n.id;
        renderMap();
        $('#map-canvas').focus({ preventScroll: true });
      });
      node.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        selectedNode = n.id;
        startNodeEdit();
      });
      els[n.id] = node;
      return node;
    })
  );

  // Medir, colocar y dibujar las conexiones.
  const sizes = {};
  visible.forEach((n) => (sizes[n.id] = { w: els[n.id].offsetWidth, h: els[n.id].offsetHeight }));
  const layout = computeLayout({ ...map, nodes: visible.map((n) => (hidden.has(n.id) ? null : n)).filter(Boolean) }, sizes);
  mapLayout = layout;
  visible.forEach((n) => {
    const p = layout.pos[n.id];
    els[n.id].style.transform = `translate(${p.x}px, ${p.y}px)`;
    els[n.id].classList.toggle('left', layout.side[n.id] < 0);
  });
  const svg = $('#map-edges');
  svg.setAttribute('width', layout.width);
  svg.setAttribute('height', layout.height);
  svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
  const NS = 'http://www.w3.org/2000/svg';
  svg.replaceChildren(
    ...visible.filter((n) => n.parent).map((n) => {
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', edgePath(layout.pos[n.parent], layout.pos[n.id], layout.side[n.id]));
      path.setAttribute('class', `mm-edge b${branchIndex(map, n)}`);
      return path;
    })
  );
  const stage = $('#map-stage');
  stage.style.width = `${layout.width}px`;
  stage.style.height = `${layout.height}px`;
  stage.style.transform = `scale(${mapZoom})`;
  $('#map-sizer')?.remove();
  stage.after(el('div', { id: 'map-sizer', style: `width:${layout.width * mapZoom}px;height:${layout.height * mapZoom}px` }));

  const hasSel = selectedNode !== 'root';
  $('#mm-sibling').disabled = !hasSel;
  $('#mm-delete').disabled = !hasSel;

  if (editingNode) {
    const input = nodesEl.querySelector('.mm-input');
    input.style.height = `${input.scrollHeight}px`;
    input.focus({ preventScroll: true });
    input.select();
  }
  revealNode(selectedNode);
}

// Desplaza el lienzo para que el nodo quede a la vista.
function revealNode(id) {
  const p = mapLayout?.pos[id];
  if (!p) return;
  const c = $('#map-canvas');
  const x = p.x * mapZoom;
  const y = p.y * mapZoom;
  const w = p.w * mapZoom;
  const h = p.h * mapZoom;
  if (x < c.scrollLeft + 16) c.scrollLeft = x - 16;
  else if (x + w > c.scrollLeft + c.clientWidth - 16) c.scrollLeft = x + w - c.clientWidth + 16;
  if (y < c.scrollTop + 16) c.scrollTop = y - 16;
  else if (y + h > c.scrollTop + c.clientHeight - 16) c.scrollTop = y + h - c.clientHeight + 16;
}

// Ajusta el zoom para ver el mapa entero, sin bajar de un tamaño legible (en pantallas
// estrechas el resto se recorre deslizando), y centra el tema principal.
function fitMap() {
  if (!mapLayout) return;
  const c = $('#map-canvas');
  mapZoom = Math.max(0.6, Math.min(1.1, (c.clientWidth - 8) / mapLayout.width, (c.clientHeight - 8) / mapLayout.height));
  renderMap();
  const root = mapLayout.pos.root;
  c.scrollLeft = (root.x + root.w / 2) * mapZoom - c.clientWidth / 2;
  c.scrollTop = (root.y + root.h / 2) * mapZoom - c.clientHeight / 2;
}

function zoomBy(f) {
  const c = $('#map-canvas');
  const cx = (c.scrollLeft + c.clientWidth / 2) / mapZoom;
  const cy = (c.scrollTop + c.clientHeight / 2) / mapZoom;
  mapZoom = Math.max(0.3, Math.min(2, mapZoom * f));
  renderMap();
  c.scrollLeft = cx * mapZoom - c.clientWidth / 2;
  c.scrollTop = cy * mapZoom - c.clientHeight / 2;
}

function startNodeEdit() {
  editingNode = selectedNode;
  renderMap();
}

function addNode(kind) {
  const map = currentMap();
  const sel = map.nodes.find((n) => n.id === selectedNode);
  const parentId = kind === 'child' || !sel.parent ? sel.id : sel.parent;
  const parent = map.nodes.find((n) => n.id === parentId);
  parent.collapsed = false;
  const node = { id: uid(), parent: parentId, text: 'Nueva idea' };
  // Un hermano se inserta justo después del nodo seleccionado.
  const at = kind === 'sibling' && sel.parent ? map.nodes.indexOf(sel) + 1 : map.nodes.length;
  map.nodes.splice(at, 0, node);
  selectedNode = node.id;
  editingNode = node.id;
  touchMap(map);
  renderMap();
}

function deleteNode() {
  const map = currentMap();
  const sel = map.nodes.find((n) => n.id === selectedNode);
  if (!sel?.parent) return;
  const gone = new Set([sel.id]);
  let grew = true;
  while (grew) {
    grew = false;
    map.nodes.forEach((n) => {
      if (n.parent && gone.has(n.parent) && !gone.has(n.id)) {
        gone.add(n.id);
        grew = true;
      }
    });
  }
  withUndo(gone.size > 1 ? `Rama borrada (${gone.size} nodos)` : 'Nodo borrado', () => {
    map.nodes = map.nodes.filter((n) => !gone.has(n.id));
    map.updatedAt = Date.now();
    selectedNode = sel.parent;
  });
}

// Moverse con las flechas al nodo más cercano en esa dirección.
function moveSelection(key) {
  const from = mapLayout?.pos[selectedNode];
  if (!from) return;
  const fx = from.x + from.w / 2;
  const fy = from.y + from.h / 2;
  let best = null;
  let bestScore = Infinity;
  Object.entries(mapLayout.pos).forEach(([id, p]) => {
    if (id === selectedNode) return;
    const dx = p.x + p.w / 2 - fx;
    const dy = p.y + p.h / 2 - fy;
    const ok = { ArrowRight: dx > 4, ArrowLeft: dx < -4, ArrowDown: dy > 4, ArrowUp: dy < -4 }[key];
    if (!ok) return;
    const along = key === 'ArrowRight' || key === 'ArrowLeft' ? Math.abs(dx) : Math.abs(dy);
    const across = key === 'ArrowRight' || key === 'ArrowLeft' ? Math.abs(dy) : Math.abs(dx);
    const score = along + across * 2;
    if (score < bestScore) {
      bestScore = score;
      best = id;
    }
  });
  if (best) {
    selectedNode = best;
    renderMap();
  }
}

$('#map-canvas').addEventListener('keydown', (e) => {
  if (editingNode || e.target !== $('#map-canvas')) return;
  const keys = {
    Tab: () => addNode('child'),
    Enter: () => addNode(selectedNode === 'root' ? 'child' : 'sibling'),
    F2: startNodeEdit,
    ' ': startNodeEdit,
    Delete: deleteNode,
    Backspace: deleteNode,
    ArrowUp: () => moveSelection('ArrowUp'),
    ArrowDown: () => moveSelection('ArrowDown'),
    ArrowLeft: () => moveSelection('ArrowLeft'),
    ArrowRight: () => moveSelection('ArrowRight'),
    '+': () => zoomBy(1.2),
    '-': () => zoomBy(1 / 1.2),
  };
  if (keys[e.key]) {
    e.preventDefault();
    e.stopPropagation();
    keys[e.key]();
  }
});

// Arrastrar el fondo con el ratón mueve el mapa (en táctil se desplaza de forma nativa).
$('#map-canvas').addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'mouse' || e.target.closest('.mm-node')) return;
  const c = $('#map-canvas');
  const start = { x: e.clientX, y: e.clientY, l: c.scrollLeft, t: c.scrollTop };
  c.classList.add('panning');
  const move = (ev) => {
    c.scrollLeft = start.l - (ev.clientX - start.x);
    c.scrollTop = start.t - (ev.clientY - start.y);
  };
  const up = () => {
    c.classList.remove('panning');
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
});
$('#map-canvas').addEventListener('click', (e) => {
  if (!e.target.closest('.mm-node')) $('#map-canvas').focus({ preventScroll: true });
});

$('#mm-child').addEventListener('click', () => addNode('child'));
$('#mm-sibling').addEventListener('click', () => addNode('sibling'));
$('#mm-edit').addEventListener('click', startNodeEdit);
$('#mm-delete').addEventListener('click', deleteNode);
$('#mm-zoom-in').addEventListener('click', () => zoomBy(1.2));
$('#mm-zoom-out').addEventListener('click', () => zoomBy(1 / 1.2));
$('#mm-fit').addEventListener('click', fitMap);
$('#mm-task').addEventListener('click', () => {
  const node = currentMap()?.nodes.find((n) => n.id === selectedNode);
  if (!node) return;
  addTask(node.text);
  showToastMessage(`Tarea creada: ${node.text}`);
});

// Exportar como imagen PNG: se dibuja el mapa en un lienzo con los colores del tema actual.
function wrapText(ctx, text, maxW) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  words.forEach((w) => {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = test;
  });
  if (line) lines.push(line);
  return lines;
}

async function exportMap() {
  const map = currentMap();
  if (!map || !mapLayout) return;
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = mapLayout.width * scale;
  canvas.height = mapLayout.height * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.fillStyle = v('--bg');
  ctx.fillRect(0, 0, mapLayout.width, mapLayout.height);

  const nodes = map.nodes.filter((n) => mapLayout.pos[n.id]);
  nodes.filter((n) => n.parent && mapLayout.pos[n.parent]).forEach((n) => {
    ctx.strokeStyle = v(`--b${branchIndex(map, n)}`);
    ctx.lineWidth = 2;
    ctx.stroke(new Path2D(edgePath(mapLayout.pos[n.parent], mapLayout.pos[n.id], mapLayout.side[n.id])));
  });
  nodes.forEach((n) => {
    const p = mapLayout.pos[n.id];
    const depth = depthOf(map, n);
    const color = depth === 0 ? v('--accent') : v(`--b${branchIndex(map, n)}`);
    ctx.beginPath();
    ctx.roundRect(p.x, p.y, p.w, p.h, 10);
    ctx.fillStyle = depth === 0 ? color : v('--surface');
    ctx.fill();
    ctx.lineWidth = depth === 1 ? 2 : 1;
    ctx.strokeStyle = depth === 0 ? color : depth === 1 ? color : v('--border');
    ctx.stroke();
    if (depth >= 2) {
      ctx.fillStyle = color;
      ctx.fillRect(mapLayout.side[n.id] < 0 ? p.x + p.w - 3 : p.x, p.y + 6, 3, p.h - 12);
    }
    // Mismos tamaños que en pantalla (1.05rem y .9rem).
    const size = depth === 0 ? 16.8 : 14.4;
    ctx.font = `${depth < 2 ? 600 : 400} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.fillStyle = depth === 0 ? v('--on-accent') : v('--text');
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    const lines = wrapText(ctx, n.text, p.w - (depth === 0 ? 30 : 20));
    const lh = size * 1.3;
    lines.forEach((l, i) => ctx.fillText(l, p.x + p.w / 2, p.y + p.h / 2 + (i - (lines.length - 1) / 2) * lh));
  });

  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  const filename = `${map.title.replace(/[\\/:*?"<>|]+/g, '').slice(0, 60) || 'mapa'}.png`;
  if (window.claude?.use) {
    const downloads = await window.claude.use('downloads');
    if (downloads) {
      try {
        await downloads.save({ filename, data: blob });
        showToastMessage('Imagen guardada');
      } catch (e) {
        if (e?.code !== 'declined') showToastMessage('No se pudo guardar la imagen aquí.');
      }
      return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('#mm-export').addEventListener('click', exportMap);

// ---------- Recordatorios ----------
// Avisan dentro de la app a la hora indicada (y al abrirla, si la hora ya pasó hoy).
// Una página web solo puede avisar mientras está abierta.
const alerted = new Set(); // avisos que ya sonaron en esta sesión
const reminderKey = (t) => `${t.id}@${t.due} ${t.time}`;

function nowHM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function askNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    try {
      Notification.requestPermission().catch(() => {});
    } catch {
      // Navegador sin notificaciones: queda el aviso dentro de la app.
    }
  }
}

function pendingReminders() {
  const today = dateKey();
  const now = nowHM();
  return state.tasks
    .filter((t) => !t.done && t.time && t.due === today && t.time <= now)
    .filter((t) => t.remindedFor !== reminderKey(t) && !(t.snoozeUntil > Date.now()))
    .sort((a, b) => a.time.localeCompare(b.time));
}

function checkReminders() {
  const list = pendingReminders();
  const fresh = list.filter((t) => !alerted.has(reminderKey(t)));
  fresh.forEach((t) => {
    alerted.add(reminderKey(t));
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(`⏰ ${t.time} · ${t.title}`, { body: 'Recordatorio de Enfoque', tag: t.id });
      } catch {
        // Algunos navegadores móviles no permiten notificaciones desde la página.
      }
    }
  });
  if (fresh.length) beep();

  $('#reminders').replaceChildren(
    ...list.map((t) => {
      const done = el('button', { className: 'primary' }, 'Hecha');
      done.addEventListener('click', () => {
        t.remindedFor = reminderKey(t);
        toggleDone(t, true);
      });
      const snooze = el('button', {}, '10 min más');
      snooze.addEventListener('click', () => {
        t.snoozeUntil = Date.now() + 10 * 60 * 1000;
        alerted.delete(reminderKey(t));
        save();
        renderAll();
      });
      const close = el('button', { className: 'del', title: 'Cerrar aviso', ariaLabel: 'Cerrar aviso' }, '✕');
      close.addEventListener('click', () => {
        t.remindedFor = reminderKey(t);
        save();
        renderAll();
      });
      return el('div', { className: 'reminder', role: 'alert' }, [
        el('span', { className: 'reminder-time' }, `⏰ ${t.time}`),
        el('span', { className: 'reminder-title' }, t.title),
        el('div', { className: 'reminder-actions' }, [done, snooze, close]),
      ]);
    })
  );
}

setInterval(checkReminders, 15000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkReminders();
});

// ---------- Atajos de teclado ----------
const VIEW_KEYS = { 1: 'today', 2: 'tasks', 3: 'projects', 4: 'journal', 5: 'ideas', 6: 'timer', 7: 'habits', 8: 'progress' };

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (editingId) stopEditing();
    $('#shortcuts').hidden = true;
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest?.('#map-canvas')) return;
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
//
// Los datos se reparten en bloques (cada documento admite hasta 256 KB):
//   state            tareas, hábitos, proyectos, ajustes y estadísticas
//   ideas            notas de ideas
//   journal-AAAA-MM  entradas del diario de ese mes
//   map-<id>         cada mapa mental
// Cada bloque se sube solo cuando cambia y, si dos dispositivos lo cambian, gana el más reciente.
const sync = { col: null, writing: false, dirty: false, timeout: null };

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

const monthOf = (date) => date.slice(0, 7);

function localBuckets() {
  const out = new Map();
  out.set('state', Object.fromEntries(CORE_KEYS.map((k) => [k, state[k]])));
  out.set('ideas', { items: state.ideas });
  const months = new Set(state.journal.map((e) => monthOf(e.date)));
  // Un mes que se quedó sin entradas se sube vacío para que los demás dispositivos lo vacíen también.
  Object.keys(state.syncMeta.sent).filter((n) => n.startsWith('journal-')).forEach((n) => months.add(n.slice(8)));
  months.forEach((m) => out.set(`journal-${m}`, { items: state.journal.filter((e) => monthOf(e.date) === m) }));
  state.maps.forEach((m) => out.set(`map-${m.id}`, { map: m }));
  return out;
}

function bucketIsEmpty(name, data) {
  if (name === 'state') return !data.tasks?.length && !data.habits?.length && !data.projects?.length;
  if (name.startsWith('map-')) return !data.map;
  return !data.items?.length;
}

function applyBucket(name, data) {
  if (name === 'state') {
    const fresh = defaults();
    for (const k of CORE_KEYS) state[k] = data[k] ?? fresh[k];
    state.settings = { ...fresh.settings, ...state.settings };
  } else if (name === 'ideas') {
    state.ideas = data.items || [];
  } else if (name.startsWith('journal-')) {
    const m = name.slice(8);
    state.journal = state.journal.filter((e) => monthOf(e.date) !== m).concat(data.items || []);
  } else if (name.startsWith('map-') && data.map) {
    const i = state.maps.findIndex((x) => x.id === data.map.id);
    if (i >= 0) state.maps[i] = data.map;
    else state.maps.push(data.map);
  }
}

function removeBucket(name) {
  if (name.startsWith('map-')) state.maps = state.maps.filter((m) => `map-${m.id}` !== name);
}

function scheduleSync() {
  if (!sync.col) return;
  setSyncStatus('saving');
  clearTimeout(sync.timeout);
  sync.timeout = setTimeout(pushState, 800);
}

// Sube los bloques que cambiaron, de uno en uno; si hubo cambios mientras tanto, repite al terminar.
async function pushState() {
  if (!sync.col) return;
  if (sync.writing) {
    sync.dirty = true;
    return;
  }
  sync.writing = true;
  const meta = state.syncMeta;
  try {
    const buckets = localBuckets();
    for (const [name, data] of buckets) {
      const json = JSON.stringify(data);
      if (meta.sent[name] === json) continue;
      const now = Date.now();
      await sync.col.doc(name).set({ ...JSON.parse(json), updatedAt: now });
      meta.sent[name] = json;
      meta.times[name] = now;
    }
    // Mapas borrados en este dispositivo.
    for (const name of Object.keys(meta.sent)) {
      if (name.startsWith('map-') && !buckets.has(name)) {
        await sync.col.doc(name).delete();
        delete meta.sent[name];
        delete meta.times[name];
      }
    }
    saveLocal();
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

function receiveSnapshot(snap, first) {
  const meta = state.syncMeta;
  const local = localBuckets();
  const remoteNames = new Set();
  let changed = false;

  for (const doc of snap.docs) {
    const name = doc.id;
    remoteNames.add(name);
    const body = JSON.parse(JSON.stringify(doc.data()));
    const remoteAt = body.updatedAt || 0;
    delete body.updatedAt;
    if (remoteAt <= (meta.times[name] || 0)) continue; // ya lo tenemos (o lo subimos nosotros)

    const localData = local.get(name);
    const localJson = localData && JSON.stringify(localData);
    const localDirty = localData !== undefined && localJson !== meta.sent[name];
    // Nunca se pisa con una copia vacía lo que este dispositivo tiene sin subir.
    if (localDirty && meta.sent[name] === undefined && bucketIsEmpty(name, body) && !bucketIsEmpty(name, localData)) continue;
    // Si este bloque cambió aquí después que en la nube, gana el de aquí.
    if (localDirty && (state.updatedAt || 0) > remoteAt) continue;

    applyBucket(name, body);
    meta.sent[name] = JSON.stringify(localBuckets().get(name) ?? body);
    meta.times[name] = remoteAt;
    changed = true;
  }

  // Mapas que ya no están en la nube: otro dispositivo los borró (si aquí no cambiaron).
  for (const name of Object.keys(meta.sent)) {
    if (remoteNames.has(name) || !name.startsWith('map-')) continue;
    const localData = local.get(name);
    if (localData && JSON.stringify(localData) !== meta.sent[name]) continue;
    removeBucket(name);
    delete meta.sent[name];
    delete meta.times[name];
    changed = true;
  }

  if (changed) {
    saveLocal();
    applySettings();
    if (!timer.endsAt) setMode(timer.mode);
    renderAll();
  }
  if (first || changed) pushState();
  else setSyncStatus('synced');
}

async function startSync() {
  if (!window.claude?.use) return;
  const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
  const id = user && (await user.id());
  if (!db || !id) return;

  sync.col = db.collection(`data/users/${id}`);
  let first = true;
  sync.col.onSnapshot(
    (snap) => {
      if (snap.metadata.hasPendingWrites) return;
      receiveSnapshot(snap, first);
      first = false;
    },
    () => setSyncStatus('error')
  );
}

// ---------- Inicio ----------
applySettings();
attachPreview($('#task-title'), $('#task-preview'));
attachPreview($('#today-title'), $('#today-preview'));
attachPreview($('#pd-task-title'), $('#pd-task-preview'));
renderComposer();
setSyncStatus('local');
renderAll();
startSync();
