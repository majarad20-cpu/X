'use strict';

// ---------- Agenda del día (por horas) ----------
// Al tocar un día del calendario (Mes o Semana) se abre su agenda: las 24 horas con las tareas
// que tienen hora (y los eventos de Google Calendar), y al lado las que no tienen hora.
// Tocar una hora crea una tarea ahí; las tareas se arrastran para cambiarlas de hora y su borde
// inferior cambia cuánto duran; al tocarlas se editan (título, hora, duración, prioridad…).
const DV_HOUR = 56; // alto de una hora en píxeles
const DV_SNAP = 15; // minutos
const DV_DEFAULT_MIN = 30;
const dv = { key: null, drag: null, creating: null, popFor: null };

const hm = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const toMin = (t) => {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const snapMin = (min) => Math.max(0, Math.min(24 * 60 - DV_SNAP, Math.round(min / DV_SNAP) * DV_SNAP));
const dvTaskById = (id) => dvItems().find((x) => x.t.id === id)?.t;

function openDayView(key) {
  dv.key = key;
  $('#dayview').hidden = false;
  hideDvPop();
  renderDayView({ scroll: true });
  $('#dv-add-text').value = '';
}
function closeDayView() {
  $('#dayview').hidden = true;
  hideDvPop();
  dv.creating = null;
}

// Tareas del día: las propias, las de las notas y las repeticiones previstas.
function dvItems() {
  return dv.key ? monthTasks(dv.key, dv.key).get(dv.key) || [] : [];
}

function renderDayView({ scroll = false } = {}) {
  if ($('#dayview').hidden || !dv.key) return;
  const d = parseKey(dv.key);
  const name = d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const today = dateKey();
  $('#dv-title').textContent = name.charAt(0).toUpperCase() + name.slice(1);
  $('#dv-today').hidden = dv.key === today;
  const items = dvItems();
  const timed = items.filter(({ t }) => toMin(t.time) !== null);
  const untimed = items.filter(({ t }) => toMin(t.time) === null);

  // Sin hora
  $('#dv-untimed').replaceChildren(
    ...(untimed.length
      ? untimed.map(({ t, ghost }) => {
          const li = el('li', { className: `dv-ut p${t.priority}${t.done ? ' done' : ''}${ghost ? ' ghost' : ''}`, title: ghost ? 'Repetición prevista' : 'Arrastra a una hora para programarla' });
          if (!ghost) li.dataset.id = t.id;
          const box = el('input', { type: 'checkbox', checked: !!t.done, disabled: ghost, ariaLabel: `Completar ${t.title}` });
          box.addEventListener('change', () => dvToggle(t, box.checked));
          const title = el('span', { className: 'dv-ut-title' }, t.title);
          li.append(box, title);
          if (!ghost && !t.done) li.addEventListener('pointerdown', (e) => !e.target.closest('input') && dvStartDrag(e, t, li, 'untimed'));
          return li;
        })
      : [el('li', { className: 'muted dv-empty' }, 'Nada sin hora.')])
  );

  // Eventos de Google Calendar de todo el día
  const evs = calEnabled() ? cal.byDay.get(dv.key) || [] : [];
  const allDay = evs.filter((e) => !e.start);
  $('#dv-events').replaceChildren(...(allDay.length ? [el('h4', {}, 'Todo el día'), ...allDay.map((e) => el('a', { className: 'dv-allday', href: e.link || '#', target: '_blank', rel: 'noopener noreferrer' }, `📅 ${e.title}`))] : []));

  // Rejilla de horas
  const grid = $('#dv-grid');
  const hours = [];
  for (let h = 0; h < 24; h++) hours.push(el('div', { className: 'dv-hour', style: `top:${h * DV_HOUR}px` }, [el('span', { className: 'dv-hlabel' }, `${String(h).padStart(2, '0')}:00`)]));
  const lane = el('div', { className: 'dv-lane', style: `height:${24 * DV_HOUR}px` });
  lane.addEventListener('click', (e) => {
    if (e.target !== lane || dv.drag) return;
    const r = lane.getBoundingClientRect();
    dvStartCreate(Math.floor(((e.clientY - r.top) / DV_HOUR) * 2) * 30);
  });

  // Bloques: tareas con hora y eventos con hora, repartidos en columnas si se solapan.
  const blocks = [
    ...timed.map(({ t, ghost }) => {
      const start = toMin(t.time);
      return { kind: 'task', t, ghost, start, end: Math.min(24 * 60, start + (Number(t.duration) || DV_DEFAULT_MIN)) };
    }),
    ...evs
      .filter((e) => e.start)
      .map((e) => {
        const s = new Date(e.start);
        const en = e.end ? new Date(e.end) : new Date(s.getTime() + 30 * 60000);
        const start = dateKey(s) < dv.key ? 0 : s.getHours() * 60 + s.getMinutes();
        const end = dateKey(en) > dv.key ? 24 * 60 : en.getHours() * 60 + en.getMinutes();
        return { kind: 'event', e, start, end: Math.max(end, start + 15) };
      }),
  ].sort((a, b) => a.start - b.start || b.end - a.end);
  dvLayout(blocks);
  for (const b of blocks) lane.append(b.kind === 'task' ? dvTaskBlock(b) : dvEventBlock(b));
  if (dv.creating) lane.append(dvCreateBox(dv.creating.min));
  const nodes = [...hours, lane];
  if (dv.key === today) {
    const now = new Date();
    nodes.push(el('div', { className: 'dv-now', style: `top:${(now.getHours() + now.getMinutes() / 60) * DV_HOUR}px` }));
  }
  grid.style.height = `${24 * DV_HOUR}px`;
  grid.replaceChildren(...nodes);
  if (scroll) {
    // Se empieza a ver un poco antes de lo primero que haya (o de la hora actual, o de las 7).
    const first = blocks.length ? Math.min(...blocks.map((b) => b.start)) : null;
    const ref = dv.key === today ? Math.min(first ?? 24 * 60, new Date().getHours() * 60) : first ?? 7 * 60;
    $('#dv-scroll').scrollTop = Math.max(0, (ref / 60 - 1) * DV_HOUR);
  }
}

// Bloques que se solapan se reparten el ancho.
function dvLayout(blocks) {
  let group = [];
  let groupEnd = -1;
  const flush = () => {
    const cols = [];
    for (const b of group) {
      let c = cols.findIndex((end) => end <= b.start);
      if (c < 0) c = cols.push(0) - 1;
      cols[c] = b.end;
      b.col = c;
    }
    group.forEach((b) => (b.cols = cols.length));
    group = [];
  };
  for (const b of blocks) {
    if (b.start >= groupEnd && group.length) flush();
    group.push(b);
    groupEnd = Math.max(groupEnd, b.end);
  }
  if (group.length) flush();
}
const dvPlace = (b) => `top:${(b.start / 60) * DV_HOUR}px;height:${Math.max(22, ((b.end - b.start) / 60) * DV_HOUR - 2)}px;left:calc(${(b.col / b.cols) * 100}% + 2px);width:calc(${100 / b.cols}% - 4px)`;

function dvTaskBlock(b) {
  const { t, ghost } = b;
  const node = el('div', { className: `dv-block task p${t.priority}${t.done ? ' done' : ''}${ghost ? ' ghost' : ''}${t.virtual ? ' virtual' : ''}${b.end - b.start <= 30 ? ' short' : ''}`, style: dvPlace(b), tabIndex: 0, role: 'button', ariaLabel: `${t.time} ${t.title}` });
  if (!ghost) node.dataset.id = t.id;
  const box = el('input', { type: 'checkbox', checked: !!t.done, disabled: ghost, ariaLabel: `Completar ${t.title}` });
  box.addEventListener('pointerdown', (e) => e.stopPropagation());
  box.addEventListener('change', () => dvToggle(t, box.checked));
  const dur = b.end - b.start;
  node.append(
    el('div', { className: 'dv-bhead' }, [box, el('span', { className: 'dv-btitle' }, t.title)]),
    el('div', { className: 'dv-btime' }, `${hm(b.start)}–${hm(b.end)}${t.virtual ? ' · 📝' : ''}${ghost ? ' · ↻' : ''}`)
  );
  if (!ghost) {
    if (!t.virtual && dur >= 0) {
      const grip = el('div', { className: 'dv-grip', title: 'Arrastra para cambiar la duración' });
      grip.addEventListener('pointerdown', (e) => dvStartResize(e, t, node, b));
      node.append(grip);
    }
    node.addEventListener('pointerdown', (e) => {
      if (e.target.closest('input, .dv-grip')) return;
      dvStartDrag(e, t, node, 'timed', b);
    });
    node.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') dvOpenPop(t, node);
      // Flechas arriba/abajo: mueve 15 minutos.
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !t.done) {
        e.preventDefault();
        dvSetTime(t, snapMin(b.start + (e.key === 'ArrowUp' ? -DV_SNAP : DV_SNAP)));
        setTimeout(() => $(`.dv-block[data-id="${CSS.escape(t.id)}"]`)?.focus());
      }
    });
  }
  return node;
}

function dvEventBlock(b) {
  const { e } = b;
  const node = el('a', { className: 'dv-block event', style: dvPlace(b), href: e.link || '#', target: '_blank', rel: 'noopener noreferrer', title: `${e.time} ${e.title}${e.location ? ` · ${e.location}` : ''}` }, [
    el('div', { className: 'dv-btitle' }, `📅 ${e.title}`),
    el('div', { className: 'dv-btime' }, e.time),
  ]);
  return node;
}

// ---------- Crear en una hora ----------
function dvStartCreate(min) {
  dv.creating = { min };
  hideDvPop();
  renderDayView();
  $('#dv-create-input')?.focus();
}
function dvCreateBox(min) {
  const input = el('input', { id: 'dv-create-input', type: 'text', maxLength: 200, placeholder: `Tarea a las ${hm(min)}…`, ariaLabel: `Nueva tarea a las ${hm(min)}` });
  const box = el('div', { className: 'dv-create', style: `top:${(min / 60) * DV_HOUR}px;height:${DV_HOUR / 2 + 8}px` }, input);
  const done = (commit) => {
    if (!dv.creating) return;
    const text = input.value.trim();
    dv.creating = null;
    if (commit && text) addTask(text, { due: dv.key, time: hm(min) });
    else renderDayView();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      done(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      done(false);
    }
  });
  input.addEventListener('blur', () => setTimeout(() => done(true), 120));
  return box;
}

// ---------- Cambios en las tareas ----------
function dvToggle(t, done) {
  if (t.virtual) toggleNoteTask(t.noteId, t.line, done);
  else toggleDone(t, done);
}

// Pone (o quita, con null) la hora de una tarea; en las de una nota, cambia «⏰ HH:MM» en su línea.
function dvSetTime(t, min, duration = null) {
  const time = min === null ? null : hm(min);
  if (t.virtual) {
    editNoteLine(t, (l) => {
      const clean = l.replace(/\s*⏰\s*\d{1,2}:\d{2}/u, '');
      return time ? `${clean} ⏰ ${time}` : clean;
    });
    if (!t.due) editNoteLine(t, (l) => (/📅/u.test(l) ? l : `${l} 📅 ${dv.key}`));
  } else {
    t.time = time;
    if (!t.due || t.due !== dv.key) t.due = dv.key;
    if (duration !== null) t.duration = duration === DV_DEFAULT_MIN ? undefined : duration;
  }
  save();
  renderAll();
}

// ---------- Arrastrar y cambiar la duración ----------
function dvStartDrag(e, t, node, from, b = null) {
  if (e.button > 0) return;
  e.preventDefault();
  const start = { x: e.clientX, y: e.clientY };
  const lane = $('#dv-grid .dv-lane');
  let moved = false;
  let ghost = null;
  const offset = b ? e.clientY - node.getBoundingClientRect().top : 10;
  const dur = b ? b.end - b.start : Number(t.duration) || DV_DEFAULT_MIN;
  dv.drag = { t };
  const minAt = (y) => snapMin(((y - offset - lane.getBoundingClientRect().top) / DV_HOUR) * 60);
  const move = (ev) => {
    if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 5) return;
    if (!moved) {
      moved = true;
      ghost = el('div', { className: `dv-block task dv-ghost p${t.priority}` }, [el('div', { className: 'dv-btitle' }, t.title), el('div', { className: 'dv-btime' })]);
      lane.append(ghost);
      node.classList.add('dragging');
    }
    const overSide = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('#dv-side');
    $('#dv-side').classList.toggle('drop', !!overSide);
    ghost.hidden = !!overSide;
    const m = minAt(ev.clientY);
    ghost.style.cssText = `top:${(m / 60) * DV_HOUR}px;height:${Math.max(22, (dur / 60) * DV_HOUR - 2)}px;left:2px;right:2px;`;
    ghost.querySelector('.dv-btime').textContent = `${hm(m)}–${hm(Math.min(24 * 60, m + dur))}`;
    // Cerca de los bordes, la agenda se desplaza sola.
    const sc = $('#dv-scroll').getBoundingClientRect();
    if (ev.clientY < sc.top + 30) $('#dv-scroll').scrollTop -= 12;
    else if (ev.clientY > sc.bottom - 30) $('#dv-scroll').scrollTop += 12;
  };
  const up = (ev) => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    $('#dv-side').classList.remove('drop');
    setTimeout(() => (dv.drag = null));
    if (!moved) {
      if (from === 'timed') dvOpenPop(t, node);
      else dvOpenPop(t, node);
      return;
    }
    ghost?.remove();
    node.classList.remove('dragging');
    const overSide = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('#dv-side');
    const overGrid = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('#dv-scroll');
    if (overSide && from === 'timed') dvSetTime(t, null);
    else if (overGrid) dvSetTime(t, minAt(ev.clientY));
    else renderDayView();
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}

function dvStartResize(e, t, node, b) {
  e.preventDefault();
  e.stopPropagation();
  const y0 = e.clientY;
  dv.drag = { t };
  let end = b.end;
  const move = (ev) => {
    // Se cuenta desde donde se agarró el borde (sin saltos al empezar).
    end = Math.max(b.start + DV_SNAP, Math.min(24 * 60, Math.round((b.end + ((ev.clientY - y0) / DV_HOUR) * 60) / DV_SNAP) * DV_SNAP));
    node.style.height = `${Math.max(22, ((end - b.start) / 60) * DV_HOUR - 2)}px`;
    node.querySelector('.dv-btime').textContent = `${hm(b.start)}–${hm(end)}`;
  };
  const up = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    setTimeout(() => (dv.drag = null));
    if (end !== b.end) dvSetTime(t, b.start, end - b.start);
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}

// ---------- Editar una tarea ----------
function hideDvPop() {
  $('#dv-pop').hidden = true;
  dv.popFor = null;
}
function dvOpenPop(t, anchor) {
  const pop = $('#dv-pop');
  dv.popFor = t.id;
  const title = el('input', { type: 'text', value: t.title, maxLength: 200, ariaLabel: 'Título' });
  const time = el('input', { type: 'time', value: t.time || '', step: 300, ariaLabel: 'Hora' });
  const dur = el('select', { ariaLabel: 'Duración' }, [15, 30, 45, 60, 90, 120, 180, 240].map((m) => el('option', { value: m, selected: (Number(t.duration) || DV_DEFAULT_MIN) === m }, m < 60 ? `${m} min` : `${m / 60} h`.replace('.5', ' h 30').replace(' h h', ' h'))));
  const prio = el('select', { ariaLabel: 'Prioridad' }, [3, 2, 1].map((p) => el('option', { value: p, selected: p === t.priority }, PRIORITY_LABEL[p])));
  const date = el('input', { type: 'date', value: t.due || dv.key, ariaLabel: 'Fecha' });
  const notes = el('textarea', { rows: 3, placeholder: 'Notas', ariaLabel: 'Notas' });
  notes.value = t.notes || '';
  const saveBtn = el('button', { className: 'primary', type: 'submit' }, 'Guardar');
  const actions = [saveBtn];
  if (!t.virtual) {
    const del = el('button', { type: 'button', className: 'danger-btn' }, 'Borrar');
    del.addEventListener('click', () => {
      hideDvPop();
      deleteTask(t);
    });
    actions.push(del);
    if (cal.mcp) {
      const g = el('button', { type: 'button' }, '📅 Google Calendar');
      g.addEventListener('click', () => {
        hideDvPop();
        openSchedule({ task: t, minutes: Number(t.duration) || DV_DEFAULT_MIN });
      });
      actions.push(g);
    }
  } else {
    const open = el('button', { type: 'button' }, '📝 Abrir la nota');
    open.addEventListener('click', () => {
      closeDayView();
      openNoteAtLine(t.noteId, t.line);
    });
    actions.push(open);
  }
  const rows = [
    el('label', {}, ['Título', title]),
    el('div', { className: 'dv-pop-row' }, [el('label', {}, ['Día', date]), el('label', {}, ['Hora', time]), ...(t.virtual ? [] : [el('label', {}, ['Duración', dur])])]),
    ...(t.virtual ? [el('p', { className: 'muted' }, 'Tarea de una nota: el título y la prioridad se cambian en la nota.')] : [el('label', {}, ['Prioridad', prio]), notes]),
    el('div', { className: 'row' }, actions),
  ];
  if (t.virtual) title.disabled = true;
  const form = el('form', { className: 'dv-pop-form' }, rows);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const min = toMin(time.value);
    if (t.virtual) {
      if (date.value && date.value !== t.due) editNoteLine(t, (l) => (/📅\s*\d{4}-\d{2}-\d{2}/u.test(l) ? l.replace(/📅\s*\d{4}-\d{2}-\d{2}/u, `📅 ${date.value}`) : `${l} 📅 ${date.value}`));
      hideDvPop();
      return dvSetTime({ ...t, due: date.value || t.due }, min);
    }
    t.title = title.value.trim() || t.title;
    t.priority = Number(prio.value);
    t.notes = notes.value;
    t.due = date.value || t.due;
    t.time = min === null ? null : hm(min);
    const d = Number(dur.value);
    t.duration = d === DV_DEFAULT_MIN ? undefined : d;
    hideDvPop();
    save();
    renderAll();
    if (t.due !== dv.key) showToastMessage(`Tarea movida al ${formatDue(t.due).toLowerCase()}`);
  });
  pop.replaceChildren(el('div', { className: 'dv-pop-head' }, [el('strong', {}, t.virtual ? 'Tarea de una nota' : 'Editar tarea'), (() => {
    const x = el('button', { type: 'button', className: 'side-btn', ariaLabel: 'Cerrar' }, '✕');
    x.addEventListener('click', hideDvPop);
    return x;
  })()]), form);
  pop.hidden = false;
  // Junto a la tarea, sin salirse de la ventana.
  const r = anchor.getBoundingClientRect();
  const box = pop.offsetParent.getBoundingClientRect();
  const w = pop.offsetWidth;
  const h = pop.offsetHeight;
  let left = r.right - box.left + 8;
  if (left + w > box.width - 8) left = Math.max(8, r.left - box.left - w - 8);
  pop.style.left = `${left}px`;
  pop.style.top = `${Math.max(8, Math.min(r.top - box.top, box.height - h - 8))}px`;
  (t.virtual ? time : title).focus();
}

// ---------- Botones y teclado ----------
const dvShift = (n) => {
  dv.key = dateKey(addDays(parseKey(dv.key), n));
  dv.creating = null;
  hideDvPop();
  renderDayView({ scroll: true });
};
$('#dv-prev').addEventListener('click', () => dvShift(-1));
$('#dv-next').addEventListener('click', () => dvShift(1));
$('#dv-today').addEventListener('click', () => {
  dv.key = dateKey();
  renderDayView({ scroll: true });
});
$('#dv-close').addEventListener('click', closeDayView);
$('#dayview').addEventListener('click', (e) => {
  if (e.target.id === 'dayview') closeDayView();
  else if (!$('#dv-pop').hidden && !e.target.closest('#dv-pop, .dv-block, .dv-ut')) hideDvPop();
});
$('#dv-add').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('#dv-add-text').value.trim();
  if (!text) return;
  addTask(text, { due: dv.key });
  $('#dv-add-text').value = '';
  $('#dv-add-text').focus();
});
document.addEventListener('keydown', (e) => {
  if ($('#dayview').hidden) return;
  if (e.key === 'Escape') {
    if (!$('#dv-pop').hidden) hideDvPop();
    else closeDayView();
    return;
  }
  if (e.target.closest('input, textarea, select')) return;
  if (e.key === 'ArrowLeft' && !e.target.closest('.dv-block')) dvShift(-1);
  if (e.key === 'ArrowRight' && !e.target.closest('.dv-block')) dvShift(1);
});
RENDER_HOOKS.push(() => renderDayView());
// La hora actual avanza.
setInterval(() => !$('#dayview').hidden && dv.key === dateKey() && renderDayView(), 60000);

COMMANDS_EXTRA.push(() => [{ label: 'Abrir la agenda de hoy (por horas)', action: () => openDayView(dateKey()) }]);
