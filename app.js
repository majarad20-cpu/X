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
    const fresh = defaults();
    return { ...fresh, ...data, settings: { ...fresh.settings, ...data.settings } };
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
  const snapshot = JSON.stringify(Object.fromEntries(SYNCED_KEYS.filter((k) => k !== 'updatedAt').map((k) => [k, state[k]])));
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
  const parsed = parseInput(text);
  priority = parsed.priority ?? priority;
  due = parsed.due ?? due;
  repeat = parsed.repeat ?? repeat;
  state.tasks.push({
    id: uid(),
    title: parsed.title,
    tags: parsed.tags,
    priority,
    due: due || (repeat ? dateKey() : null),
    repeat: repeat || null,
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
    const parsed = parseInput(text);
    t.title = parsed.title;
    t.tags = parsed.tags;
    t.priority = parsed.priority ?? Number(priority.value);
    t.repeat = parsed.repeat ?? (repeat.value || null);
    t.due = parsed.due ?? (due.value || (t.repeat ? dateKey() : null));
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
    if (p.repeat) chips.push(`↻ ${REPEAT_LABEL[p.repeat]}`);
    if (p.priority) chips.push(`Prioridad ${PRIORITY_LABEL[p.priority].toLowerCase()}`);
    (p.tags || []).forEach((tag) => chips.push(`#${tag}`));
    preview.replaceChildren(...chips.map((c) => el('span', { className: 'tag' }, c)));
    preview.hidden = !chips.length;
  };
  input.addEventListener('input', update);
  input.form.addEventListener('reset', () => setTimeout(update));
  update();
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
  const data = Object.fromEntries(SYNCED_KEYS.map((k) => [k, state[k]]));
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
  const json = JSON.stringify({ app: 'enfoque', version: 1, data: Object.fromEntries(SYNCED_KEYS.map((k) => [k, state[k]])) });
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
    for (const k of SYNCED_KEYS) if (k !== 'updatedAt') state[k] = data[k] ?? fresh[k];
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
  state.settings = { ...defaults().settings, ...state.settings };
  applySettings();
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
applySettings();
attachPreview($('#task-title'), $('#task-preview'));
attachPreview($('#today-title'), $('#today-preview'));
setSyncStatus('local');
renderAll();
startSync();
