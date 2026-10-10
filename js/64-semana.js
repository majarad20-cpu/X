'use strict';

// ---------- Planificar la semana ----------
// Vista «Planificar semana»: objetivos (en la nota Semanal/AAAA-Wss, sección «🎯 Objetivos»), siete
// columnas de lunes a domingo con eventos, tareas y carga del día, y el panel «Sin planificar».
// Las tarjetas se arrastran entre días y al panel (ratón y dedo, con cardDrag de 24) o se mueven con
// «Mover a ▸» (clic derecho, ⋯ o ← → en el asa). «Reparto automático» llena los días por prioridad
// sin pasar de la capacidad diaria; se ve antes de aplicarlo y se puede deshacer.

Object.assign(ICONS, {
  'plan-week': '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M7 14h4M7 17h8"/>',
});

const pw = { offset: 0, adding: null, preview: null, side: false, calKey: null, menuAt: null, scrollFor: null, forceGoals: false };
const PW_DAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const PW_DUR = 30; // minutos de una tarea sin duración
const PW_MAX_GOALS = 5;
const PW_GOALS_RE = /^#{1,6}\s*🎯\s*Objetivos/u;
const PW_EMPTY_GOAL = /^\s*[-*+]\s+\[ \]\s*$/;

// Ajustes: capacidad diaria (minutos), días libres (0 = lunes) y orden del panel.
const pwSet = () => ({ cap: 360, off: [5, 6], sort: 'priority', ...(state.settings.planWeek || {}) });
function pwSave(patch) {
  state.settings.planWeek = { ...pwSet(), ...patch };
  save();
}
const pwMonday = () => addDays(weekStart(new Date()), pw.offset * 7);
const pwKeys = () => Array.from({ length: 7 }, (_, i) => dateKey(addDays(pwMonday(), i)));
const pwDur = (t) => Number(t.duration) || PW_DUR;
const pwFind = (id) => allTasks().find((t) => t.id === id) || noteTasks().find((t) => t.id === id);
const pwHours = (min) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60}` : ''}` : `${min} min`);
const pwDayName = (k) => `${PW_DAYS[(parseKey(k).getDay() + 6) % 7]} ${parseKey(k).getDate()}`;
const pwByPriority = (a, b) => b.priority - a.priority || (a.due || '9999').localeCompare(b.due || '9999') || a.createdAt - b.createdAt;

function pwTitle(mon) {
  const sun = addDays(mon, 6);
  const a = mon.getMonth() === sun.getMonth() ? String(mon.getDate()) : shortDay(mon);
  return `Semana ${isoWeek(mon).week} · ${a}–${shortDay(sun)}`;
}

// ---------- Objetivos (nota semanal) ----------
// La nota de la semana que se ve; con create la crea como openPeriodicNote, pero sin abrirla.
function pwWeekNote(create = false) {
  const P = PERIODS.week;
  const ref = P.ref(pwMonday());
  const key = P.key(ref);
  const note = findNoteByName(`${P.folder}/${key}`);
  if (note || !create) return note;
  if (!state.folders.includes(P.folder)) state.folders.push(P.folder);
  const tpl = findNoteByName(`${TEMPLATE_FOLDER}/${P.tpl}`);
  return createNote({ folder: P.folder, title: key, body: tpl ? fillTemplate(tpl.body, key, ref) : weeklyDefault(ref), open: false, log: false });
}

// Líneas de la sección «🎯 Objetivos»: [h, end) con h el título.
function pwGoalSection(lines) {
  const h = lines.findIndex((l) => PW_GOALS_RE.test(l));
  if (h < 0) return null;
  let end = h + 1;
  while (end < lines.length && !/^#{1,6}\s/.test(lines[end])) end++;
  return { h, end };
}
const pwGoalText = (s) => s.replace(/\s*(📅|✅)\s*\d{4}-\d{2}-\d{2}/gu, '').trim();

function pwGoals(note) {
  if (!note || note.enc) return [];
  const lines = note.body.split('\n');
  const s = pwGoalSection(lines);
  if (!s) return [];
  const out = [];
  for (let i = s.h + 1; i < s.end; i++) {
    const m = lines[i].match(NOTE_TASK_RE);
    if (m && m[3].trim()) out.push({ line: i, done: m[2].toLowerCase() === 'x', text: pwGoalText(m[3]), due: m[3].match(/📅\s*(\d{4}-\d{2}-\d{2})/u)?.[1] || null });
  }
  return out;
}

// Objetivos de todas las notas semanales: no cuentan como «sin planificar».
let pwGoalCache = { rev: -1, ids: new Set() };
function pwGoalIds() {
  if (pwGoalCache.rev === dataRev) return pwGoalCache.ids;
  const ids = new Set();
  state.notes.forEach((n) => folderOf(n.path) === PERIODS.week.folder && pwGoals(n).forEach((g) => ids.add(`n:${n.id}:${g.line}`)));
  pwGoalCache = { rev: dataRev, ids };
  return ids;
}

// Cambia las líneas de la nota semanal (creándola si hace falta) y redibuja.
function pwEditWeekNote(fn) {
  const note = pwWeekNote(true);
  if (note.enc) return;
  const lines = note.body.split('\n');
  fn(lines);
  note.body = lines.join('\n');
  note.updatedAt = Date.now();
  pw.preview = null; // las líneas de las tareas de la nota pueden moverse
}
const pwGoalsDone = () => {
  pw.forceGoals = true;
  save();
  renderAll();
  pw.forceGoals = false;
};

function pwAddGoal(text) {
  text = text.trim();
  if (!text) return;
  pwEditWeekNote((lines) => {
    const s = pwGoalSection(lines);
    if (!s) {
      while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
      lines.push('', '## 🎯 Objetivos', `- [ ] ${text}`, '');
      return;
    }
    const empty = lines.slice(s.h + 1, s.end).findIndex((l) => PW_EMPTY_GOAL.test(l));
    if (empty >= 0) return void (lines[s.h + 1 + empty] = `- [ ] ${text}`);
    let at = s.end;
    while (at > s.h + 1 && !lines[at - 1].trim()) at--;
    lines.splice(at, 0, `- [ ] ${text}`);
  });
  pwGoalsDone();
  $('#pw-goals [data-goal="new"]')?.focus();
}

// Línea actual del objetivo en la nota semanal: la suya si aún es él; si no, el único de la
// sección con ese texto. Si ya no está, se avisa, se redibuja y da -1.
function pwGoalLine(g) {
  const note = pwWeekNote();
  const lines = note && !note.enc ? note.body.split('\n') : [];
  const ok = (i) => {
    const m = lines[i]?.match(NOTE_TASK_RE);
    return !!m && pwGoalText(m[3]) === g.text;
  };
  let i = ok(g.line) ? g.line : -1;
  const s = i < 0 && pwGoalSection(lines);
  if (s) {
    const hits = lines.map((_, j) => j).filter((j) => j > s.h && j < s.end && ok(j));
    if (hits.length === 1) i = hits[0];
  }
  if (i < 0) {
    showToastMessage('El objetivo cambió en la nota semanal: no se ha modificado');
    pwGoalsDone();
  }
  return i;
}

// Nuevo texto de un objetivo: se conservan su casilla y sus fechas (📅, ✅).
function pwEditGoal(g, text) {
  if (!text.trim()) return pwDelGoal(g);
  if (text.trim() === g.text) return;
  const i = pwGoalLine(g);
  if (i < 0) return;
  pwEditWeekNote((lines) => {
    const m = lines[i].match(NOTE_TASK_RE);
    const keep = [...m[3].matchAll(/(📅|✅)\s*\d{4}-\d{2}-\d{2}/gu)].map((x) => x[0]);
    lines[i] = `${m[1]}- [${m[2]}] ${[text.trim(), ...keep].join(' ')}`;
  });
  pwGoalsDone();
}

function pwDelGoal(g) {
  const i = pwGoalLine(g);
  if (i >= 0) withUndo('Objetivo borrado', () => pwEditWeekNote((lines) => lines.splice(i, 1)));
}

// Fecha del objetivo: el domingo de la semana, solo si se pide.
function pwGoalDue(g) {
  const sunday = pwKeys()[6];
  const i = pwGoalLine(g);
  if (i < 0) return;
  pwEditWeekNote((lines) => {
    const l = lines[i].replace(/\s*📅\s*\d{4}-\d{2}-\d{2}/u, '');
    lines[i] = g.due ? l : `${l.replace(/\s+$/, '')} 📅 ${sunday}`;
  });
  pwGoalsDone();
}

function pwRenderGoals() {
  const box = $('#pw-goals');
  // Mientras se escribe en un objetivo, otro redibujado no le quita el texto.
  if (!pw.forceGoals && box.contains(document.activeElement) && document.activeElement.matches('input[type="text"]')) return;
  const note = pwWeekNote();
  const openBtn = el('button', { className: 'chip', type: 'button', title: 'Abrir la nota de esta semana' }, '📝 Nota semanal');
  openBtn.addEventListener('click', () => openPeriodicNote('week', pwMonday()));
  const head = el('div', { className: 'pw-goals-head' }, [el('h3', {}, '🎯 Objetivos de la semana'), openBtn]);
  if (note?.enc) return box.replaceChildren(head, el('p', { className: 'muted' }, 'La nota semanal está protegida: ábrela para ver sus objetivos.'));
  const goals = pwGoals(note);
  const sunday = pwKeys()[6];
  const rows = goals.map((g, i) => {
    const check = el('input', { type: 'checkbox', checked: g.done, ariaLabel: `Objetivo cumplido: ${g.text}` });
    check.addEventListener('change', () => toggleNoteTask(note.id, g.line, check.checked));
    const input = el('input', { type: 'text', value: g.text, maxLength: 200, ariaLabel: `Objetivo ${i + 1}` });
    input.dataset.goal = String(i);
    input.addEventListener('change', () => pwEditGoal(g, input.value));
    input.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), input.blur()));
    const due = el('button', { className: `pw-goal-due${g.due ? ' on' : ''}`, type: 'button', ariaPressed: String(!!g.due), title: g.due ? 'Quitar la fecha' : `Fecha: domingo ${parseKey(sunday).getDate()} (aparece en Tareas ese día)` }, g.due ? `📅 ${formatDue(g.due)}` : '📅');
    due.addEventListener('click', () => pwGoalDue(g));
    const del = el('button', { className: 'del', type: 'button', title: 'Borrar objetivo', ariaLabel: 'Borrar objetivo' }, '✕');
    del.addEventListener('click', () => pwDelGoal(g));
    return el('li', { className: `pw-goal${g.done ? ' done' : ''}` }, [check, input, due, del]);
  });
  const parts = [head, el('ul', { className: 'pw-goal-list' }, rows)];
  if (goals.length < PW_MAX_GOALS) {
    const input = el('input', { type: 'text', placeholder: goals.length ? 'Otro objetivo…' : 'Tu primer objetivo (de 3 a 5 por semana)', maxLength: 200, ariaLabel: 'Nuevo objetivo' });
    input.dataset.goal = 'new';
    const form = el('form', { className: 'row pw-goal-add' }, [input, el('button', { type: 'submit' }, 'Añadir')]);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      pwAddGoal(input.value);
    });
    parts.push(form);
  }
  box.replaceChildren(...parts);
}

// ---------- Días y panel ----------
function pwDayItems(keys) {
  const map = new Map(keys.map((k) => [k, []]));
  allTasks().concat(noteTasks()).forEach((t) => {
    if (t.due && map.has(t.due)) map.get(t.due).push({ t });
    occurrencesBetween(t, keys[0], keys[6]).forEach((k) => map.get(k)?.push({ t, ghost: true }));
  });
  map.forEach((l) => l.sort((a, b) => (a.ghost ? 1 : 0) - (b.ghost ? 1 : 0) || a.t.done - b.t.done || (a.t.time || '99').localeCompare(b.t.time || '99') || byImportance(a.t, b.t)));
  return map;
}

// Pendientes sin fecha y vencidas (las de la semana que se ve ya están en su día).
function pwUnplanned(keys) {
  const today = dateKey();
  const goals = pwGoalIds();
  return state.tasks.concat(noteTasks()).filter((t) => !t.done && !goals.has(t.id) && (!t.due || (t.due < today && !keys.includes(t.due))));
}

function pwSetDue(t, key) {
  if (key) return setTaskDue(t, key);
  if (t.virtual) editNoteLine(t, (l) => l.replace(/\s*📅\s*([^#!⏰📅✅+]+?)\s*(?=[#!⏰📅✅+]|$)/u, ' ').replace(/\s+$/, ''));
  else {
    t.due = null;
    t.time = null;
  }
}

// Cambia el día de una tarea (null = sin fecha), con «Deshacer».
function pwMove(t, key) {
  if ((t.due || null) === key) return;
  if (!key && t.virtual && !hasOwnDate(t)) return showToastMessage('Esta tarea toma la fecha de su nota diaria');
  withUndo(`«${t.title}» → ${key ? pwDayName(key) : 'sin fecha'}`, () => pwSetDue(t, key));
}

const pwToggle = (t, done) => (t.virtual ? toggleNoteTask(t.noteId, t.line, done) : toggleDone(t, done));
const pwOpen = (t) => (t.virtual ? openNoteAtLine(t.noteId, t.line) : editTaskInList(t));

// ---------- Menús ----------
const pwSub = (items) => (pw.menuAt ? showMenu(pw.menuAt, items) : null);
function pwMenu(t) {
  const items = [
    { label: t.virtual ? '📝 Abrir en su nota' : '✏️ Abrir', action: () => pwOpen(t) },
    { label: t.done ? '↺ Marcar como pendiente' : '✓ Marcar hecha', action: () => pwToggle(t, !t.done) },
    { sep: true },
    { label: 'Mover a ▸', action: () => pwSub(pwMoveItems(t)) },
    { label: 'Prioridad ▸', action: () => pwSub([3, 2, 1].map((p) => ({ label: `${t.priority === p ? '● ' : '○ '}${PRIORITY_LABEL[p]}`, action: () => setPriority(t, p) }))) },
  ];
  if (!t.virtual)
    items.push({ label: 'Duración ▸', action: () => pwSub([15, 30, 45, 60, 90, 120, 180, 240].map((d) => ({ label: `${pwDur(t) === d ? '● ' : '○ '}${pwHours(d)}`, action: () => {
      t.duration = d === PW_DUR ? undefined : d;
      save();
      renderAll();
    } }))) });
  items.push({ sep: true }, { label: '🕒 Abrir agenda del día', action: () => openDayView(t.due || pwKeys()[0]) });
  return items;
}
const pwMoveItems = (t) => [
  ...pwKeys().map((k) => ({ label: `${t.due === k ? '✓ ' : ''}${capFirst(pwDayName(k))}`, action: () => pwMove(t, k) })),
  { sep: true },
  { label: `${t.due ? '' : '✓ '}Sin fecha`, disabled: !!t.virtual && !!t.due && !hasOwnDate(t), action: () => pwMove(t, null) },
];

function pwDayMenu(k) {
  const i = pwKeys().indexOf(k);
  const off = pwSet().off.includes(i);
  return [
    { label: '🕒 Abrir la agenda del día', action: () => openDayView(k) },
    { label: '✨ Planificar este día', action: () => openPlanDay(k) },
    { label: '＋ Nueva tarea este día', action: () => pwStartAdd(k) },
    { sep: true },
    { label: off ? '💼 Marcar como día de trabajo' : '💤 Marcar como día libre', action: () => pwToggleOff(i) },
  ];
}

function pwToggleOff(i) {
  const off = pwSet().off;
  pwSave({ off: off.includes(i) ? off.filter((x) => x !== i) : [...off, i].sort() });
  renderPlanWeek();
}

function pwStartAdd(k) {
  pw.adding = pw.adding === k ? null : k;
  renderPlanWeek();
  $('#pw-days .pw-add-form input')?.focus();
}

// ---------- Tarjetas ----------
function pwCard(t, { ghost = false, preview = false } = {}) {
  const today = dateKey();
  const overdue = !t.done && t.due && t.due < today;
  const card = el('li', { className: `pw-card p${t.priority}${t.done ? ' done' : ''}${overdue ? ' overdue' : ''}${ghost ? ' ghost' : ''}${preview ? ' preview' : ''}${t.virtual ? ' from-note' : ''}` });
  card.dataset.id = t.id;
  const meta = [];
  if (t.time) meta.push(`⏰ ${t.time}`);
  meta.push(pwHours(pwDur(t)));
  if (ghost) meta.push(`↻ ${REPEAT_LABEL[t.repeat]}`);
  if (preview) meta.push('propuesta');
  if (overdue) meta.push(el('span', { className: 'overdue' }, `Vencida: ${formatDue(t.due)}`));
  const p = projectById(t.projectId);
  if (p) meta.push(`📁 ${p.name}`);
  if (t.virtual) meta.push(`📝 ${baseName(noteById(t.noteId)?.path || '')}`);
  const metaEl = el('div', { className: 'pw-meta' });
  meta.forEach((m, i) => metaEl.append(...(i ? [' · ', m] : [m])));
  if (ghost || preview) {
    card.append(el('div', { className: 'pw-card-row' }, el('div', { className: 'pw-body' }, [el('span', { className: 'pw-ctitle' }, t.title), metaEl])));
    return card;
  }
  const check = el('input', { type: 'checkbox', checked: t.done, ariaLabel: 'Completar' });
  check.addEventListener('change', () => pwToggle(t, check.checked));
  const handle = el('button', { className: 'pw-handle', type: 'button', title: 'Arrastra a otro día (o usa ← →)', ariaLabel: `Mover «${t.title}» (flechas izquierda y derecha)` }, '⠿');
  handle.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const keys = pwKeys();
    const i = keys.indexOf(t.due);
    const next = i < 0 ? (e.key === 'ArrowRight' ? keys[0] : null) : e.key === 'ArrowRight' ? keys[i + 1] : i ? keys[i - 1] : null;
    if (!next && i < 0) return;
    pwMove(t, next || null);
    $(`#view-plan .pw-card[data-id="${CSS.escape(t.id)}"] .pw-handle`)?.focus();
  });
  const title = el('button', { className: 'pw-ctitle', type: 'button', title: t.virtual ? 'Abrir en su nota' : 'Abrir' }, t.title);
  title.addEventListener('click', () => pwOpen(t));
  const more = el('button', { className: 'pw-more', type: 'button', title: 'Opciones', ariaLabel: `Opciones de «${t.title}»` }, '⋯');
  more.addEventListener('click', () => {
    pw.menuAt = more;
    showMenu(more, pwMenu(t));
  });
  card.append(el('div', { className: 'pw-card-row' }, [handle, check, el('div', { className: 'pw-body' }, [title, metaEl]), more]));
  card.addEventListener('pointerdown', (e) => pwDragStart(e, t, card));
  return card;
}

// Ratón: desde cualquier punto de la tarjeta; dedo: desde el asa (si no, se desplaza la página).
function pwDragStart(e, t, card) {
  if (e.button > 0 || e.target.closest('input, .pw-more')) return;
  if (e.pointerType !== 'mouse' && !e.target.closest('.pw-handle')) return;
  e.preventDefault();
  // Las columnas pueden ser más anchas que su sitio: se desplazan al llevar la tarjeta a un borde.
  const strip = $('#pw-days');
  const edge = (ev) => {
    if (strip.scrollWidth <= strip.clientWidth) return;
    const r = strip.getBoundingClientRect();
    if (ev.clientY < r.top || ev.clientY > r.bottom) return;
    if (ev.clientX < r.left + 40) strip.scrollBy(-18, 0);
    else if (ev.clientX > r.right - 40) strip.scrollBy(18, 0);
  };
  const stop = () => {
    document.removeEventListener('pointermove', edge);
    document.removeEventListener('pointerup', stop);
    document.removeEventListener('pointercancel', stop);
  };
  document.addEventListener('pointermove', edge);
  document.addEventListener('pointerup', stop);
  document.addEventListener('pointercancel', stop);
  cardDrag(e, card, { targets: '#view-plan .pw-day, #pw-side', onDrop: (target) => pwMove(t, target.dataset.key || null) });
}

// ---------- Columnas ----------
function pwEvents(k) {
  if (!calEnabled()) return null;
  const evs = cal.byDay.get(k) || [];
  if (!evs.length) return null;
  return el('ul', { className: 'pw-events' }, evs.map((ev) => el('li', { className: 'pw-ev', title: `${ev.time} · ${ev.title}` }, [el('span', { className: 'pw-ev-time' }, ev.time === 'Todo el día' ? 'Todo el día' : ev.time.split('–')[0]), ' ', ev.title])));
}

function pwDay(k, i, list, prev, s, today) {
  const d = parseKey(k);
  const off = s.off.includes(i);
  const load = list.filter((x) => !x.t.done).reduce((n, x) => n + pwDur(x.t), 0) + prev.reduce((n, t) => n + pwDur(t), 0);
  const ratio = s.cap ? load / s.cap : 0;
  const level = ratio > 1 ? ' over' : ratio >= 0.85 ? ' warn' : '';
  const name = `${PW_DAYS[i]} ${d.getDate()} de ${MONTHS_ES[d.getMonth()]}`;
  const dname = el('button', { className: 'pw-dname', type: 'button', title: 'Abrir la agenda del día', ariaLabel: `Agenda del ${name}` }, [
    el('span', { className: 'pw-dow' }, capFirst(PW_DAYS[i].slice(0, 3))),
    el('span', { className: 'pw-dnum' }, `${d.getDate()} ${MONTHS_ES[d.getMonth()].slice(0, 3)}`),
    k === today ? el('span', { className: 'today-badge' }, 'Hoy') : '',
  ]);
  dname.addEventListener('click', () => openDayView(k));
  const tool = (txt, title, fn, extra = {}) => {
    const b = el('button', { className: 'pw-dtool', type: 'button', title, ariaLabel: `${title} (${name})`, ...extra }, txt);
    b.addEventListener('click', fn);
    return b;
  };
  const head = el('header', { className: 'pw-dhead' }, [
    dname,
    el('div', { className: 'pw-dtools' }, [
      tool('+', 'Añadir tarea este día', () => pwStartAdd(k), { className: 'pw-dtool pw-add' }),
      tool('✨', 'Planificar mi día', () => openPlanDay(k), { className: 'pw-dtool pw-plan' }),
      tool('💤', off ? 'Día libre: el reparto automático lo salta' : 'Marcar como día libre', () => pwToggleOff(i), { className: `pw-dtool pw-off${off ? ' on' : ''}`, ariaPressed: String(off) }),
    ]),
  ]);
  const bar = el('div', { className: 'pw-bar' }, el('span', { style: `width:${Math.min(100, Math.round(ratio * 100))}%` }));
  const loadEl = el('div', { className: 'pw-load', title: `Carga estimada: ${pwHours(load)} de ${pwHours(s.cap)}` }, [bar, el('span', { className: 'pw-load-text' }, `${pwHours(load)} / ${pwHours(s.cap)}`)]);
  const col = el('section', { className: `pw-day${k === today ? ' is-today' : ''}${k < today ? ' past' : ''}${off ? ' off' : ''}${level}`, ariaLabel: name }, [head, loadEl]);
  col.dataset.key = k;
  const evs = pwEvents(k);
  if (evs) col.append(evs);
  if (pw.adding === k) {
    const input = el('input', { type: 'text', placeholder: 'Nueva tarea', required: true, maxLength: 200, ariaLabel: `Nueva tarea el ${name}` });
    input.addEventListener('keydown', (e) => e.key === 'Escape' && ((pw.adding = null), renderPlanWeek()));
    const form = el('form', { className: 'pw-add-form' }, [input, el('button', { type: 'submit', className: 'primary' }, 'Añadir')]);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!input.value.trim()) return;
      pw.adding = null;
      addTask(input.value.trim(), { due: k });
    });
    col.append(form);
  }
  const cards = [...list.map((x) => pwCard(x.t, { ghost: x.ghost })), ...prev.map((t) => pwCard(t, { preview: true }))];
  if (cards.length) col.append(el('ul', { className: 'pw-cards' }, cards));
  else if (pw.adding !== k && !evs) col.append(el('p', { className: 'pw-free' }, off ? 'Día libre' : 'Libre'));
  return col;
}

function pwRenderSide(keys) {
  const s = pwSet();
  const q = $('#pw-filter').value.trim().toLowerCase();
  const all = pwUnplanned(keys);
  const list = all.filter((t) => !q || `${t.title} ${(t.tags || []).map((x) => `#${x}`).join(' ')} ${projectById(t.projectId)?.name || ''}`.toLowerCase().includes(q));
  const sorts = { priority: pwByPriority, created: (a, b) => a.createdAt - b.createdAt, title: (a, b) => a.title.localeCompare(b.title, 'es') };
  list.sort(sorts[s.sort] || pwByPriority);
  const groups = new Map();
  list.forEach((t) => {
    const p = projectById(t.projectId);
    const k = p ? p.id : '';
    if (!groups.has(k)) groups.set(k, { p, tasks: [] });
    groups.get(k).tasks.push(t);
  });
  const order = [...groups.values()].sort((a, b) => (a.p ? state.projects.indexOf(a.p) : 1e9) - (b.p ? state.projects.indexOf(b.p) : 1e9));
  $('#pw-side-count').textContent = String(all.length);
  $('#pw-side').classList.toggle('open', pw.side);
  $('#pw-side-toggle').ariaExpanded = String(pw.side);
  $('#pw-side-toggle').textContent = pw.side ? 'Ocultar' : 'Ver';
  $('#pw-side-list').replaceChildren(
    ...(order.length
      ? order.map(({ p, tasks }) => {
          const h = el('h4', { className: 'pw-group' }, [p ? `📁 ${p.name}` : 'Sin proyecto', el('span', { className: 'muted' }, ` ${tasks.length}`)]);
          if (p) h.dataset.pcolor = p.color;
          return el('div', { className: 'pw-group-box' }, [h, el('ul', { className: 'pw-cards' }, tasks.map((t) => pwCard(t)))]);
        })
      : [el('p', { className: 'pw-free' }, q ? 'Nada coincide con el filtro.' : 'Todo tiene fecha. 🎉 Arrastra aquí una tarea para quitársela.')])
  );
}

// ---------- Reparto automático ----------
// Por prioridad: las altas en el primer día con sitio; las demás, en el día menos cargado.
// Solo días desde hoy, que no sean libres, y sin pasar de la capacidad.
function pwAutoPlan() {
  const s = pwSet();
  const today = dateKey();
  const keys = pwKeys();
  const days = keys.filter((k, i) => !s.off.includes(i) && k >= today);
  if (!days.length) return showToastMessage('No quedan días de trabajo en esta semana');
  const items = pwDayItems(keys);
  const load = new Map(days.map((k) => [k, items.get(k).filter((x) => !x.t.done).reduce((n, x) => n + pwDur(x.t), 0)]));
  const tasks = pwUnplanned(keys).filter((t) => !(t.tags || []).includes('algun-dia')).sort(pwByPriority);
  const plan = [];
  let left = 0;
  tasks.forEach((t) => {
    const d = pwDur(t);
    const fits = days.filter((k) => load.get(k) + d <= s.cap);
    if (!fits.length) return void left++;
    const k = t.priority === 3 ? fits[0] : fits.reduce((a, b) => (load.get(b) < load.get(a) ? b : a));
    load.set(k, load.get(k) + d);
    plan.push({ ref: pwRef(t), key: k });
  });
  if (!plan.length) return showToastMessage(tasks.length ? 'No cabe nada más: los días ya están llenos' : 'No hay tareas sin planificar');
  pw.preview = { plan, left, offset: pw.offset, rev: dataRev };
  renderPlanWeek();
}

// La propuesta guarda referencias, no tareas: tras deshacer o editar una nota se buscan de nuevo.
const pwRef = (t) => (t.virtual ? { virtual: true, noteId: t.noteId, line: t.line, title: t.title } : { id: t.id });
function pwResolve(ref) {
  if (!ref.virtual) return state.tasks.find((t) => t.id === ref.id && !t.done) || null;
  const i = findNoteTaskLine(ref.noteId, ref.line, ref.title);
  const note = noteById(ref.noteId);
  const t = i < 0 ? null : parseNoteTask(note, i, note.body.split('\n')[i]);
  return t && !t.done ? t : null;
}

function pwApplyPlan() {
  if (!pw.preview) return;
  const plan = pw.preview.plan.map((x) => ({ t: pwResolve(x.ref), key: x.key }));
  pw.preview = null;
  const ok = plan.filter((x) => x.t);
  const gone = plan.length - ok.length;
  if (!ok.length) {
    renderPlanWeek();
    return showToastMessage('Las tareas de la propuesta ya no están: vuelve a calcular el reparto');
  }
  // Las de las notas se reescriben en su línea actual (setTaskDue la comprueba de nuevo).
  withUndo(`Reparto automático: ${plural(ok.length, 'tarea', 'tareas')}${gone ? ` · ${plural(gone, 'ya no estaba', 'ya no estaban')}` : ''}`, () => ok.forEach(({ t, key }) => setTaskDue(t, key, { quiet: true })));
}

// Tareas de la propuesta, buscadas de nuevo (las que ya no están no se muestran).
const pwPreviewItems = () => (pw.preview?.plan || []).map((x) => ({ x, t: pwResolve(x.ref) })).filter((y) => y.t);

function pwRenderPreview() {
  const box = $('#pw-preview');
  // Otra semana o datos cambiados (una nota editada, deshacer…): la propuesta ya no vale.
  if (pw.preview && (pw.preview.offset !== pw.offset || pw.preview.rev !== dataRev)) pw.preview = null;
  box.hidden = !pw.preview;
  if (!pw.preview) return box.replaceChildren();
  const { left } = pw.preview;
  const plan = pwPreviewItems();
  const apply = el('button', { className: 'primary', type: 'button' }, `Aplicar (${plan.length})`);
  apply.addEventListener('click', pwApplyPlan);
  const cancel = el('button', { type: 'button' }, 'Cancelar');
  cancel.addEventListener('click', () => ((pw.preview = null), renderPlanWeek()));
  box.replaceChildren(
    el('h3', {}, '⚡ Reparto automático'),
    el('p', { className: 'muted' }, `Propuesta: ${plural(plan.length, 'tarea', 'tareas')} repartidas por prioridad, hasta ${pwHours(pwSet().cap)} al día${left ? ` · ${plural(left, 'tarea no cabe', 'tareas no caben')}` : ''}. Quita lo que no quieras y aplica.`),
    el('ul', { className: 'pw-prev-list' }, plan.map(({ x, t }) => {
      const rm = el('button', { className: 'del', type: 'button', title: 'Quitar de la propuesta', ariaLabel: `Quitar «${t.title}»` }, '✕');
      rm.addEventListener('click', () => {
        pw.preview.plan = pw.preview.plan.filter((y) => y !== x);
        if (!pw.preview.plan.length) pw.preview = null;
        renderPlanWeek();
      });
      return el('li', { className: `pw-prev-row p${t.priority}` }, [el('span', { className: 'pw-prev-title' }, t.title), el('span', { className: 'muted' }, `→ ${capFirst(pwDayName(x.key))} · ${pwHours(pwDur(t))}`), rm]);
    })),
    el('div', { className: 'row' }, [apply, cancel])
  );
}

// ---------- Calendario ----------
// Carga los eventos de la semana que se ve (loadCalendar usa la semana de la vista Semana).
function pwCalendar(keys) {
  if (!calEnabled() || cal.loading) return;
  if (cal.range && cal.range.from <= keys[0] && cal.range.to > keys[6] && cal.status === 'ok') return;
  const key = `${keys[0]}:${keys[6]}`;
  if (pw.calKey === key) return;
  pw.calKey = key;
  const keep = weekOffset;
  weekOffset = pw.offset;
  const done = loadCalendar();
  weekOffset = keep;
  done.then(() => activeTab()?.view === 'plan' && renderPlanWeek());
}

// ---------- Dibujar ----------
function renderPlanWeek() {
  const keys = pwKeys();
  const s = pwSet();
  const today = dateKey();
  $('#pw-title').textContent = pwTitle(pwMonday());
  $('#pw-now').hidden = pw.offset === 0;
  if (document.activeElement !== $('#pw-cap')) $('#pw-cap').value = String(s.cap / 60);
  $('#pw-sort').value = s.sort;
  pwRenderGoals();
  pwRenderPreview();
  const items = pwDayItems(keys);
  const prev = new Map();
  pwPreviewItems().forEach(({ x, t }) => prev.set(x.key, [...(prev.get(x.key) || []), t]));
  const strip = $('#pw-days');
  const sl = strip.scrollLeft;
  strip.replaceChildren(...keys.map((k, i) => pwDay(k, i, items.get(k), prev.get(k) || [], s, today)));
  strip.scrollLeft = sl;
  // En pantallas estrechas se empieza por hoy (o por el lunes).
  if (pw.scrollFor !== pw.offset && isNarrow()) {
    pw.scrollFor = pw.offset;
    const col = strip.querySelector('.pw-day.is-today') || strip.firstElementChild;
    strip.scrollLeft = col.offsetLeft - strip.firstElementChild.offsetLeft;
  }
  pwRenderSide(keys);
  pwCalendar(keys);
}

// Abre la vista en la semana de hoy (0) o en la siguiente (1).
function openPlanWeek(offset = 0) {
  pw.offset = offset;
  pw.preview = null;
  pw.adding = null;
  if (!$('#dayview').hidden) closeDayView();
  showView('plan');
  renderPlanWeek();
}

// ---------- Botones ----------
const pwGo = (n) => () => {
  pw.offset = n === 0 ? 0 : pw.offset + n;
  pw.adding = null;
  renderPlanWeek();
};
$('#pw-prev').addEventListener('click', pwGo(-1));
$('#pw-next').addEventListener('click', pwGo(1));
$('#pw-now').addEventListener('click', pwGo(0));
$('#pw-auto').addEventListener('click', pwAutoPlan);
$('#pw-cap').addEventListener('change', (e) => {
  const h = Number(e.target.value);
  if (h > 0) pwSave({ cap: Math.round(Math.min(24, h) * 60) });
  renderPlanWeek();
});
$('#pw-sort').addEventListener('change', (e) => {
  pwSave({ sort: e.target.value });
  renderPlanWeek();
});
$('#pw-filter').addEventListener('input', () => pwRenderSide(pwKeys()));
$('#pw-side-toggle').addEventListener('click', () => {
  pw.side = !pw.side;
  pwRenderSide(pwKeys());
});

// Clic derecho (o tecla de menú) en una tarjeta o en un día.
$('#view-plan').addEventListener('contextmenu', (e) => {
  if (e.target.closest('input, textarea, select')) return;
  const card = e.target.closest('.pw-card[data-id]:not(.ghost):not(.preview)');
  const day = e.target.closest('.pw-day[data-key]');
  const t = card && pwFind(card.dataset.id);
  const items = t ? pwMenu(t) : day ? pwDayMenu(day.dataset.key) : null;
  if (!items) return;
  e.preventDefault();
  e.stopPropagation();
  let { clientX: x, clientY: y } = e;
  if (!x && !y) {
    const r = e.target.getBoundingClientRect();
    x = r.left + 12;
    y = r.bottom;
  }
  pw.menuAt = { x, y };
  showMenuAt(x, y, items);
});

// En Hoy (domingo y lunes) y al final de la revisión semanal.
$('#today-planweek').addEventListener('click', () => openPlanWeek(new Date().getDay() === 0 ? 1 : 0));
$('#review-plan').addEventListener('click', () => openPlanWeek(1));
COMMANDS_EXTRA.push(() => [
  { label: '📋 Planificar la semana', action: () => openPlanWeek(0) },
  { label: '📋 Planificar la semana siguiente', action: () => openPlanWeek(1) },
]);
