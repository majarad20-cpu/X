'use strict';

// ---------- Estado de las tareas: por hacer, en curso, hecha ----------
// En las notas, «en curso» se escribe - [/] (como en Obsidian).
const STATUS_LABEL = { todo: 'Por hacer', doing: 'En curso', done: 'Hecho' };
const statusOf = (t) => (t.done ? 'done' : t.status === 'doing' ? 'doing' : 'todo');

// Cambia la línea de la tarea en su nota; si ya no está, no toca nada y lo dice (devuelve false).
function editNoteLine(t, fn, { quiet = false } = {}) {
  const note = noteById(t.noteId);
  const i = note ? findNoteTaskLine(t.noteId, t.line, t.title) : -1; // 14: la línea actual, o -1
  if (i < 0) {
    if (!quiet) showToastMessage(`«${t.title}» cambió en su nota: no se ha modificado`);
    return false;
  }
  const lines = note.body.split('\n');
  lines[i] = fn(lines[i]);
  note.body = lines.join('\n');
  note.updatedAt = Date.now();
  return true;
}

function setStatus(t, status) {
  if (statusOf(t) === status) return;
  if (status === 'done') {
    if (t.virtual) toggleNoteTask(t.noteId, t.line, true);
    else toggleDone(t, true);
    return;
  }
  if (t.done) {
    if (t.virtual) toggleNoteTask(t.noteId, t.line, false);
    else toggleDone(t, false);
    t = t.virtual ? noteTasks().find((x) => x.noteId === t.noteId && x.line === t.line) || t : t;
  }
  if (t.virtual) editNoteLine(t, (l) => l.replace(/\[[ xX/]\]/, status === 'doing' ? '[/]' : '[ ]'));
  else if (status === 'doing') t.status = 'doing';
  else delete t.status;
  save();
  renderAll();
}

function setPriority(t, priority) {
  if (t.virtual) {
    editNoteLine(t, (l) => {
      const clean = l.replace(/\s!(alta|media|baja)\b/gi, '');
      return priority === 2 ? clean : `${clean} !${priority === 3 ? 'alta' : 'baja'}`;
    });
  } else t.priority = priority;
  save();
  renderAll();
}

function setProject(t, projectId) {
  if (t.virtual) {
    const p = projectById(projectId);
    editNoteLine(t, (l) => {
      const clean = l.replace(/(^|\s)\+[\p{L}\p{N}_-]+/u, '$1').replace(/\s+$/, '');
      return p ? `${clean} +${p.name.replace(/\s+/g, '')}` : clean;
    });
  } else t.projectId = projectId || null;
  save();
  renderAll();
}

function moveToDay(t, key) {
  setTaskDue(t, key);
  save();
  renderAll();
}

// ---------- Arrastrar tarjetas (ratón, dedo y teclado) ----------
// Se arrastra una copia que sigue al puntero; al soltar sobre un destino se llama a onDrop.
function cardDrag(e, card, { targets, onDrop, onClick }) {
  if (e.button > 0) return;
  const start = { x: e.clientX, y: e.clientY };
  let ghost = null;
  let over = null;
  const findTarget = (x, y) => document.elementFromPoint(x, y)?.closest(targets);
  const onMove = (ev) => {
    if (!ghost) {
      if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 6) return;
      const r = card.getBoundingClientRect();
      ghost = card.cloneNode(true);
      ghost.classList.add('drag-ghost');
      Object.assign(ghost.style, { width: `${r.width}px`, left: `${r.left}px`, top: `${r.top}px` });
      ghost.dataset.dx = String(start.x - r.left);
      ghost.dataset.dy = String(start.y - r.top);
      document.body.append(ghost);
      card.classList.add('dragging');
    }
    ev.preventDefault();
    ghost.style.left = `${ev.clientX - Number(ghost.dataset.dx)}px`;
    ghost.style.top = `${ev.clientY - Number(ghost.dataset.dy)}px`;
    const target = findTarget(ev.clientX, ev.clientY);
    if (target !== over) {
      over?.classList.remove('drop-over');
      over = target;
      over?.classList.add('drop-over');
    }
    const pane = $('#views-pane');
    if (ev.clientY < 70) pane.scrollBy(0, -14);
    else if (ev.clientY > window.innerHeight - 70) pane.scrollBy(0, 14);
    // Un tablero más ancho que su sitio se desplaza solo al llevar la tarjeta a un borde.
    const strip = card.closest('.board, .nb-board');
    if (strip && strip.scrollWidth > strip.clientWidth) {
      const r = strip.getBoundingClientRect();
      if (ev.clientX < r.left + 40) strip.scrollBy(-16, 0);
      else if (ev.clientX > r.right - 40) strip.scrollBy(16, 0);
    }
  };
  const onUp = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
    over?.classList.remove('drop-over');
    card.classList.remove('dragging');
    if (ghost) {
      ghost.remove();
      if (over) onDrop(over);
    } else onClick?.();
  };
  document.addEventListener('pointermove', onMove, { passive: false });
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onUp);
}

function cardMeta(t) {
  const bits = [];
  if (t.due) bits.push(el('span', { className: !t.done && t.due < dateKey() ? 'overdue' : '' }, formatDue(t.due)));
  if (t.time) bits.push(`⏰ ${t.time}`);
  const p = projectById(t.projectId);
  if (p && boardGroup !== 'project') bits.push(`📁 ${p.name}`);
  if (t.virtual) bits.push(`📝 ${baseName(noteById(t.noteId)?.path || '')}`);
  (t.tags || []).slice(0, 3).forEach((tag) => bits.push(`#${tag}`));
  const meta = el('div', { className: 'kc-meta' });
  bits.forEach((b, i) => meta.append(...(i ? [' · ', b] : [b])));
  return meta;
}

// ---------- Tablero ----------
let boardGroup = 'status'; // status | project | priority
const BOARD_LIMIT = 80;

function boardColumns() {
  const done7 = dateKey(addDays(new Date(), -7));
  const doneAt = (t) => (t.virtual ? t.doneOn : t.completedAt && dateKey(new Date(t.completedAt))) || '';
  const tasks = state.tasks
    .concat(noteTasks())
    .filter((t) => !tagFilter || (t.tags || []).includes(tagFilter))
    .filter((t) => !t.done || (boardGroup === 'status' && doneAt(t) >= done7));
  if (boardGroup === 'priority') {
    return [3, 2, 1].map((p) => ({ key: String(p), title: PRIORITY_LABEL[p], cls: `p${p}`, tasks: tasks.filter((t) => t.priority === p), drop: (t) => setPriority(t, p) }));
  }
  if (boardGroup === 'project') {
    const projects = state.projects.filter((p) => p.status === 'active');
    return [
      ...projects.map((p) => ({ key: p.id, title: p.name, pcolor: p.color, tasks: tasks.filter((t) => t.projectId === p.id), drop: (t) => setProject(t, p.id) })),
      { key: 'none', title: 'Sin proyecto', tasks: tasks.filter((t) => !t.projectId || !projects.some((p) => p.id === t.projectId)), drop: (t) => setProject(t, null) },
    ];
  }
  return ['todo', 'doing', 'done'].map((s) => ({ key: s, title: STATUS_LABEL[s], cls: `st-${s}`, tasks: tasks.filter((t) => statusOf(t) === s), drop: (t) => setStatus(t, s) }));
}

function boardCard(t, columns, ci) {
  if (!t.virtual && t.id === editingId) return el('div', { className: 'kcard editing' }, el('ul', { className: 'list' }, taskItem(t)));
  const check = el('input', { type: 'checkbox', checked: t.done, ariaLabel: 'Completar' });
  check.addEventListener('change', () => (t.virtual ? toggleNoteTask(t.noteId, t.line, check.checked) : toggleDone(t, check.checked)));
  const title = el('button', { className: 'kc-title', title: t.virtual ? 'Abrir en su nota' : 'Editar' }, t.title);
  title.addEventListener('click', (e) => (t.virtual ? openNoteAtLine(t.noteId, t.line, { newTab: e.ctrlKey || e.metaKey }) : startEditing(t.id)));
  const handle = el('button', { className: 'kc-handle', title: 'Arrastra a otra columna (o usa ← →)', ariaLabel: `Mover «${t.title}» (flechas izquierda y derecha)` }, '⠿');
  const card = el('div', { className: `kcard p${t.priority}${t.done ? ' done' : ''}` }, [el('div', { className: 'kc-row' }, [handle, check, el('div', { className: 'kc-body' }, [title, cardMeta(t)])])]);
  card.dataset.id = t.id;
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    cardDrag(e, card, {
      targets: '.kcol',
      onDrop: (col) => {
        const target = columns.find((c) => c.key === col.dataset.key);
        if (target && col.dataset.key !== columns[ci].key) target.drop(t);
      },
    });
  });
  handle.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next = columns[ci + (e.key === 'ArrowLeft' ? -1 : 1)];
    if (!next) return;
    next.drop(t);
    $(`.kcol[data-key="${CSS.escape(next.key)}"] .kcard[data-id="${CSS.escape(t.id)}"] .kc-handle`)?.focus();
  });
  return card;
}

function renderBoard() {
  $$('[data-boardgroup]').forEach((b) => {
    b.classList.toggle('active', b.dataset.boardgroup === boardGroup);
    b.ariaPressed = String(b.dataset.boardgroup === boardGroup);
  });
  const columns = boardColumns();
  $('#board').replaceChildren(
    ...columns.map((c, ci) => {
      const list = c.tasks.sort(byImportance);
      const col = el('section', { className: `kcol${c.cls ? ` ${c.cls}` : ''}`, ariaLabel: c.title }, [
        el('header', { className: 'kcol-head' }, [el('span', { className: 'kcol-title' }, c.title), el('span', { className: 'kcol-count' }, String(list.length))]),
      ]);
      col.dataset.key = c.key;
      if (c.pcolor) col.dataset.pcolor = c.pcolor;
      const cards = el('div', { className: 'kcol-cards' }, list.slice(0, BOARD_LIMIT).map((t) => boardCard(t, columns, ci)));
      if (list.length > BOARD_LIMIT) cards.append(el('p', { className: 'muted kcol-more' }, `y ${list.length - BOARD_LIMIT} más (usa la Lista o filtra por etiqueta)`));
      if (!list.length) cards.append(el('p', { className: 'kcol-empty' }, 'Arrastra tareas aquí'));
      col.append(cards);
      return col;
    })
  );
}

$$('[data-boardgroup]').forEach((b) =>
  b.addEventListener('click', () => {
    boardGroup = b.dataset.boardgroup;
    renderBoard();
  })
);

// ---------- Mes ----------
let monthOffset = 0;
let monthDay = null; // día seleccionado (AAAA-MM-DD)
let monthAdding = false;

function monthTasks(fromKey, toKey) {
  const tasks = allTasks().concat(noteTasks()).filter((t) => !tagFilter || (t.tags || []).includes(tagFilter));
  const byDay = new Map();
  const add = (k, item) => byDay.set(k, [...(byDay.get(k) || []), item]);
  tasks.forEach((t) => {
    if (t.due && t.due >= fromKey && t.due <= toKey) add(t.due, { t });
    occurrencesBetween(t, fromKey, toKey).forEach((k) => add(k, { t, ghost: true }));
  });
  byDay.forEach((list) => list.sort((a, b) => (a.ghost ? 1 : 0) - (b.ghost ? 1 : 0) || (a.t.done ? 1 : 0) - (b.t.done ? 1 : 0) || byImportance(a.t, b.t)));
  return byDay;
}

function renderMonth() {
  const base = new Date();
  const first = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1);
  const start = weekStart(first);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const fromKey = dateKey(days[0]);
  const toKey = dateKey(days[41]);
  const today = dateKey();
  if (!monthDay || monthDay < fromKey || monthDay > toKey) monthDay = monthOffset === 0 ? today : dateKey(first);
  const title = first.toLocaleDateString('es', { month: 'long', year: 'numeric' });
  $('#month-title').textContent = title.charAt(0).toUpperCase() + title.slice(1);
  $('#month-today').hidden = monthOffset === 0;
  const byDay = monthTasks(fromKey, toKey);
  if (typeof calEnsure === 'function') calEnsure(); // tras la medianoche, los eventos de la semana nueva

  const head = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'].map((d) => el('div', { className: 'mg-dow' }, d));
  const cells = days.map((d) => {
    const key = dateKey(d);
    const items = byDay.get(key) || [];
    const events = calEnabled() ? cal.byDay.get(key) || [] : [];
    const pending = items.filter((x) => !x.t.done).length;
    const cell = el('div', {
      className: `mg-day${d.getMonth() !== first.getMonth() ? ' other' : ''}${key === today ? ' today' : ''}${key === monthDay ? ' selected' : ''}${key < today ? ' past' : ''}`,
      role: 'button',
      tabIndex: 0,
      ariaLabel: `${d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}: ${pending} pendientes${events.length ? `, ${events.length} eventos` : ''}`,
    });
    cell.dataset.key = key;
    const num = el('div', { className: 'mg-num' }, [String(d.getDate())]);
    if (events.length) num.append(el('span', { className: 'mg-ev', title: events.map((e) => `${e.time} ${e.title}`).join('\n') }, `● ${events.length}`));
    cell.append(num);
    items.slice(0, 3).forEach(({ t, ghost }) => {
      const chip = el('div', { className: `mg-chip p${t.priority}${t.done ? ' done' : ''}${ghost ? ' ghost' : ''}`, title: `${t.title}${ghost ? ' (repetición prevista)' : ''}` }, t.title);
      if (!ghost) chip.dataset.id = t.id;
      if (!ghost && !t.done) {
        chip.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          cardDrag(e, chip, {
            targets: '.mg-day',
            onDrop: (target) => target.dataset.key !== key && moveToDay(t, target.dataset.key),
            onClick: () => {
              selectMonthDay(key);
              openDayView(key);
            },
          });
        });
      }
      cell.append(chip);
    });
    if (items.length > 3) cell.append(el('div', { className: 'mg-more' }, `+${items.length - 3}`));
    if (typeof npMonthChips === 'function') cell.append(...npMonthChips(key)); // notas con fecha (52)
    cell.addEventListener('click', () => {
      selectMonthDay(key);
      openDayView(key);
    });
    cell.addEventListener('keydown', (e) => {
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectMonthDay(key);
        openDayView(key);
      } else if (step) {
        e.preventDefault();
        const next = dateKey(addDays(parseKey(key), step));
        if (next < fromKey || next > toKey) {
          monthOffset += step > 0 ? 1 : -1;
          monthDay = next;
          renderMonth();
        } else selectMonthDay(next);
        $(`.mg-day[data-key="${next}"]`)?.focus();
      }
    });
    return cell;
  });
  $('#month-grid').replaceChildren(...head, ...cells);
  renderMonthDay(byDay);
}

function selectMonthDay(key) {
  monthDay = key;
  monthAdding = false;
  renderMonth();
}

function renderMonthDay(byDay) {
  const key = monthDay;
  const d = parseKey(key);
  const name = d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
  const items = byDay.get(key) || [];
  const input = el('input', { type: 'text', placeholder: 'Nueva tarea para este día (p. ej. Dentista a las 10)', maxLength: 200, ariaLabel: 'Nueva tarea' });
  const form = el('form', { className: 'row day-form' }, [input, el('button', { type: 'submit', className: 'primary' }, 'Añadir')]);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!input.value.trim()) return;
    addTask(input.value.trim(), { due: key });
    $('#month-day .day-form input')?.focus();
  });
  const evs = calendarBlock(key, { compact: true });
  const notes = typeof npDayList === 'function' && npDayList(key);
  $('#month-day').replaceChildren(
    el('h3', { className: 'md-title' }, [name.charAt(0).toUpperCase() + name.slice(1), key === dateKey() ? el('span', { className: 'today-badge' }, 'Hoy') : '']),
    ...(evs ? [evs] : []),
    ...(notes ? [notes] : []),
    items.length ? el('ul', { className: 'list' }, items.map(({ t, ghost }) => (ghost ? ghostItem(t) : taskItem(t)))) : el('p', { className: 'day-free' }, 'Sin tareas este día.'),
    form
  );
}

$('#month-prev').addEventListener('click', () => {
  monthOffset--;
  monthDay = null;
  renderMonth();
});
$('#month-next').addEventListener('click', () => {
  monthOffset++;
  monthDay = null;
  renderMonth();
});
$('#month-today').addEventListener('click', () => {
  monthOffset = 0;
  monthDay = dateKey();
  renderMonth();
});

// ---------- Sugerencias para hoy ----------
// Como «Mi día»: tareas que convendría mirar hoy aunque no venzan hoy.
function suggestions() {
  const today = dateKey();
  const hidden = state.settings.suggestHidden?.date === today ? state.settings.suggestHidden.ids : [];
  const soon = dateKey(addDays(new Date(), 3));
  const ageDays = (t) => Math.floor((Date.now() - (t.createdAt || Date.now())) / 864e5);
  const out = [];
  state.tasks
    .concat(noteTasks())
    .filter((t) => !t.done && !isDueToday(t) && !hidden.includes(t.id) && !(t.tags || []).includes('algun-dia'))
    .forEach((t) => {
      let reason = null;
      let rank = 9;
      if (t.status === 'doing') [reason, rank] = ['En curso', 0];
      else if (t.due && t.due <= soon) [reason, rank] = [`Vence ${formatDue(t.due).toLowerCase()}`, 1];
      else if (!t.due && t.priority === 3) [reason, rank] = ['Prioridad alta, sin fecha', 2];
      else if (!t.due && !t.repeat && ageDays(t) >= 14) [reason, rank] = [`Esperando desde hace ${ageDays(t)} días`, 3];
      if (reason) out.push({ t, reason, rank });
    });
  return out.sort((a, b) => a.rank - b.rank || (a.t.due || '9').localeCompare(b.t.due || '9') || byImportance(a.t, b.t)).slice(0, 5);
}

function hideSuggestion(ids) {
  const today = dateKey();
  const prev = state.settings.suggestHidden?.date === today ? state.settings.suggestHidden.ids : [];
  state.settings.suggestHidden = { date: today, ids: [...new Set([...prev, ...ids])] };
  save();
  renderToday();
}

function renderSuggestions() {
  const box = $('#today-suggest');
  const list = suggestions();
  box.hidden = !list.length;
  if (!list.length) return;
  $('#suggest-list').replaceChildren(
    ...list.map(({ t, reason }) => {
      const add = el('button', { className: 'chip primary-chip', title: 'Hacerla hoy' }, '+ Hoy');
      add.addEventListener('click', () => {
        setTaskDue(t, dateKey());
        save();
        renderAll();
        showToastMessage(`«${t.title}» pasa a hoy`);
      });
      const no = el('button', { className: 'sg-dismiss', title: 'No sugerir hoy', ariaLabel: `No sugerir «${t.title}» hoy` }, '✕');
      no.addEventListener('click', () => hideSuggestion([t.id]));
      return el('li', { className: 'sg-row' }, [
        el('div', { className: 'sg-body' }, [el('span', { className: 'sg-title' }, t.title), el('span', { className: 'muted sg-why' }, `${reason}${t.virtual ? ` · 📝 ${baseName(noteById(t.noteId)?.path || '')}` : ''}`)]),
        add,
        no,
      ]);
    })
  );
}

$('#suggest-hide').addEventListener('click', () => hideSuggestion(suggestions().map((s) => s.t.id)));
