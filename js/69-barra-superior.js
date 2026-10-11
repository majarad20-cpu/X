'use strict';

// ---------- Barra superior: productividad ----------
// A la izquierda (la barra de iconos) queda lo de notas y pensar; arriba, lo de hacer: Hoy y los
// menús Planificar, Seguimiento y Más, «＋ Nuevo», el Pomodoro en marcha, buscar, Drive y Ajustes.
// Los elementos de los menús son los mismos botones .rib[data-view] de antes (12-notas.js los abre).
const tb = { open: null };

function tbClose() {
  if (!tb.open) return;
  tb.open.querySelector('.tb-menu').hidden = true;
  tb.open.querySelector('.tb-head').ariaExpanded = 'false';
  tb.open = null;
}

function tbOpen(dd, { focus = false } = {}) {
  tbClose();
  const menu = dd.querySelector('.tb-menu');
  const head = dd.querySelector('.tb-head');
  if (dd.dataset.group === 'new') tbFillNew(menu);
  menu.hidden = false;
  head.ariaExpanded = 'true';
  tb.open = dd;
  // Posición fija bajo el botón: la barra puede desplazarse en horizontal en pantallas estrechas.
  const r = head.getBoundingClientRect();
  const w = menu.offsetWidth;
  menu.style.top = `${Math.round(r.bottom + 4)}px`;
  menu.style.left = `${Math.round(Math.max(8, Math.min(r.left, innerWidth - w - 8)))}px`;
  if (focus) tbItems(menu)[0]?.focus();
}

const tbItems = (menu) => [...menu.querySelectorAll('button:not([hidden]):not(:disabled)')];

// «＋ Nuevo»: se rehace al abrirlo (otros módulos añaden tipos de captura).
function tbFillNew(menu) {
  const item = (label, action) => {
    const b = el('button', { className: 'tb-item', role: 'menuitem' }, label);
    b.addEventListener('click', action);
    return b;
  };
  const focusField = (view, sel) => () => {
    showView(view);
    setTimeout(() => $(sel)?.focus(), 30);
  };
  menu.replaceChildren(
    item('📝 Nota', () => createNote({ folder: activeNote() ? folderOf(activeNote().path) : '' })),
    ...CAPTURE_KINDS.filter(([k]) => k !== 'note').map(([k, icon, name]) => item(`${icon} ${name}…`, () => openCapture(k))),
    item('🔥 Hábito…', focusField('habits', '#habit-name')),
    item('📁 Proyecto…', focusField('projects', '#project-name')),
    item('📓 Nota diaria', () => openDailyNote())
  );
}

$$('.prodbar .tb-dd').forEach((dd) => {
  const head = dd.querySelector('.tb-head');
  const menu = dd.querySelector('.tb-menu');
  head.addEventListener('click', () => (tb.open === dd ? tbClose() : tbOpen(dd)));
  head.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      tbOpen(dd, { focus: true });
    }
  });
  menu.querySelectorAll('.rib').forEach((b) => b.setAttribute('role', 'menuitem'));
  // Elegir algo cierra el menú (la acción de cada botón la ponen sus módulos).
  menu.addEventListener('click', (e) => e.target.closest('button') && setTimeout(tbClose));
  menu.addEventListener('keydown', (e) => {
    const items = tbItems(menu);
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      if (e.key === 'Escape') e.preventDefault();
      tbClose();
      if (e.key === 'Escape') head.focus();
    }
  });
});
document.addEventListener('pointerdown', (e) => tb.open && !tb.open.contains(e.target) && tbClose(), true);
document.addEventListener('keydown', (e) => e.key === 'Escape' && tb.open && tbClose());
addEventListener('resize', tbClose);

// El menú que contiene la sección abierta se marca (la clase active la pone 12-notas.js).
function tbMarkActive() {
  $$('.prodbar .tb-dd').forEach((dd) => dd.querySelector('.tb-head').classList.toggle('has-active', !!dd.querySelector('.tb-menu .active')));
}
new MutationObserver(tbMarkActive).observe($('.prodbar'), { subtree: true, attributes: true, attributeFilter: ['class'] });

// ---------- Contadores ----------
function tbCount(btn, text, alert = false) {
  let c = btn.querySelector('.tb-count');
  if (!c) btn.append((c = el('span', { className: 'tb-count' })));
  c.hidden = !text;
  c.textContent = text || '';
  c.classList.toggle('alert', alert);
}

function renderTopbarCounts() {
  const today = dateKey();
  const due = state.tasks.concat(noteTasks()).filter(isDueToday);
  const overdue = due.filter((t) => t.due < today).length;
  const badge = $('.prodbar .tb-today .tb-badge');
  badge.hidden = !due.length;
  badge.textContent = due.length > 99 ? '99+' : String(due.length);
  badge.classList.toggle('alert', overdue > 0);
  $('.prodbar .tb-today').title = due.length ? `Hoy: ${due.length} para hoy${overdue ? `, ${overdue} vencidas` : ''}` : 'Hoy';
  const tasksBtn = $('.prodbar .rib[data-view="tasks"]');
  if (tasksBtn) tbCount(tasksBtn, due.length ? String(due.length) : '', overdue > 0);
  const habits = state.habits.filter((h) => !h.archived);
  const habitsBtn = $('.prodbar .rib[data-view="habits"]');
  if (habitsBtn) tbCount(habitsBtn, habits.length ? `${habits.filter((h) => h.log[today]).length}/${habits.length}` : '');
  // Punto rojo en «Planificar» si hay tareas vencidas o cosas en la bandeja.
  const inbox = typeof inboxCount === 'function' ? inboxCount() : 0;
  const dot = $('.prodbar [data-group="plan"] .tb-dot');
  dot.hidden = !overdue && !inbox;
  dot.title = [overdue && `${overdue} tareas vencidas`, inbox && `${inbox} en la bandeja`].filter(Boolean).join(' · ');
}

// ---------- Pomodoro en marcha ----------
function renderTopbarPomo() {
  const btn = $('#tb-pomo');
  const left = timer.endsAt ? Math.max(0, Math.round((timer.endsAt - Date.now()) / 1000)) : timer.remaining;
  const show = !!timer.endsAt || timer.remaining < timer.total;
  btn.hidden = !show;
  if (!show) return;
  const text = `${timer.endsAt ? (timer.mode === 'focus' ? '🍅' : '☕') : '⏸'} ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  if (btn.textContent !== text) btn.textContent = text;
  btn.title = `${timer.endsAt ? 'Pomodoro en marcha' : 'Pomodoro en pausa'}${timer.ctx?.label ? `: ${timer.ctx.label}` : ''} (abrir)`;
}
$('#tb-pomo').addEventListener('click', () => showView('timer'));
setInterval(renderTopbarPomo, 1000);

RENDER_HOOKS.push(() => {
  renderTopbarCounts();
  renderTopbarPomo();
});
renderTopbarCounts();
renderTopbarPomo();
tbMarkActive();
