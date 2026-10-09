'use strict';

// ---------- Google Calendar ----------
// Usa tu conector de Google Calendar en Claude (con tus credenciales; la app nunca ve contraseñas).
// Se activa en Ajustes. Fuera de Claude no está disponible.
const CAL_SERVER = 'Google Calendar';
const cal = { mcp: null, byDay: new Map(), range: null, status: 'off', error: null, loading: false };

const CAL_ERRORS = {
  needs_reauth: 'Tu conexión con Google Calendar caducó. Vuelve a conectarlo en claude.ai › Ajustes › Conectores.',
  server_not_connected: 'Google Calendar no está conectado. Añádelo en claude.ai › Ajustes › Conectores.',
  selection_required: 'Tienes más de un Google Calendar conectado: elige uno cuando Claude te lo pregunte.',
  not_in_manifest: 'No has permitido que esta app lea tu calendario. Puedes activarlo en el menú de permisos de la página.',
  blocked_by_policy: 'Tu organización no permite usar Google Calendar desde aquí.',
  approval_required: 'Hace falta tu aprobación para leer el calendario.',
  server_unavailable: 'Google Calendar no responde ahora mismo. Prueba en un momento.',
};
const calErrorText = (e) => CAL_ERRORS[e?.code] || (e?.code === 'tool_error' ? `Google Calendar respondió con un error: ${e.message}` : 'No se pudo cargar el calendario.');

async function startCalendar() {
  if (!window.claude?.use) return renderCalendarSettings();
  try {
    cal.mcp = await window.claude.use('mcp');
  } catch {
    cal.mcp = null;
  }
  renderMailButton();
  renderCalendarSettings();
  startGoogle();
  if (cal.mcp && state.settings.calendar) loadCalendar();
}

const calEnabled = () => !!cal.mcp && !!state.settings.calendar;

// Rango a cargar: desde el lunes de la semana visible hasta el domingo (y siempre hoy).
function calendarRange() {
  const start = addDays(weekStart(new Date()), Math.min(0, weekOffset) * 7);
  const end = addDays(weekStart(new Date()), Math.max(0, weekOffset) * 7 + 7);
  return { from: dateKey(start), to: dateKey(end), startTime: start.toISOString(), endTime: end.toISOString() };
}

function eventDays(ev) {
  if (ev.start?.dateTime) return [dateKey(new Date(ev.start.dateTime))];
  if (ev.start?.date) {
    // Día completo: la fecha de fin es exclusiva.
    const out = [];
    let d = parseKey(ev.start.date);
    const end = ev.end?.date ? parseKey(ev.end.date) : addDays(d, 1);
    for (let i = 0; d < end && i < 60; i++, d = addDays(d, 1)) out.push(dateKey(d));
    return out;
  }
  return [];
}

function eventTimeText(ev) {
  if (!ev.start?.dateTime) return 'Todo el día';
  const f = (iso) => new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  return ev.end?.dateTime ? `${f(ev.start.dateTime)}–${f(ev.end.dateTime)}` : f(ev.start.dateTime);
}

async function loadCalendar({ refresh = false } = {}) {
  if (!calEnabled() || cal.loading) return;
  const range = calendarRange();
  if (!refresh && cal.range && cal.range.from <= range.from && cal.range.to >= range.to && cal.status === 'ok') return;
  cal.loading = true;
  cal.status = cal.status === 'ok' ? 'ok' : 'loading';
  renderCalendarViews();
  try {
    const res = await cal.mcp.callTool(CAL_SERVER, 'list_events', { startTime: range.startTime, endTime: range.endTime, orderBy: 'startTime', pageSize: 250, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }, refresh ? { cache: { refresh: true } } : { cache: { staleTime: 60000 } });
    const events = Array.isArray(res?.payload?.events) ? res.payload.events : [];
    cal.byDay = new Map();
    events
      .filter((ev) => ev.status !== 'cancelled')
      .forEach((ev) =>
        eventDays(ev).forEach((k) => cal.byDay.set(k, [...(cal.byDay.get(k) || []), { id: ev.id, title: ev.summary || '(Sin título)', time: eventTimeText(ev), sort: ev.start?.dateTime || '', start: ev.start?.dateTime || '', end: ev.end?.dateTime || '', link: ev.htmlLink || '', meet: ev.conferenceUrl || '', location: ev.location || '' }]))
      );
    cal.byDay.forEach((list) => list.sort((a, b) => a.sort.localeCompare(b.sort)));
    cal.range = range;
    cal.status = 'ok';
    cal.error = null;
    cal.updatedAt = res?.cache?.storedAt || Date.now();
  } catch (e) {
    // Si ya había datos, se mantienen (salvo que se haya retirado el permiso).
    const denied = ['needs_reauth', 'server_not_connected', 'not_in_manifest', 'blocked_by_policy', 'approval_required', 'selection_required'].includes(e?.code);
    if (denied) cal.byDay = new Map();
    cal.status = 'error';
    cal.error = e;
  } finally {
    cal.loading = false;
    renderCalendarViews();
  }
}

function eventItem(ev) {
  const li = el('li', { className: 'cal-event' }, [
    el('span', { className: 'cal-time' }, ev.time),
    el('div', { className: 'cal-body' }, [el('span', { className: 'cal-title' }, ev.title), ev.location ? el('span', { className: 'muted cal-loc' }, ev.location) : '']),
  ]);
  const links = el('span', { className: 'cal-links' });
  if (ev.meet) links.append(el('a', { href: ev.meet, target: '_blank', rel: 'noopener noreferrer', className: 'chip' }, 'Meet'));
  if (ev.link) links.append(el('a', { href: ev.link, target: '_blank', rel: 'noopener noreferrer', className: 'cal-open', title: 'Abrir en Google Calendar' }, '↗'));
  li.append(links);
  return li;
}

function calendarBlock(key, { compact = false } = {}) {
  if (!calEnabled()) return null;
  const events = cal.byDay.get(key) || [];
  if (compact && !events.length) return null;
  const box = el('div', { className: `cal-block${compact ? ' compact' : ''}` });
  if (!compact) {
    const refresh = el('button', { className: 'link cal-refresh', title: 'Volver a cargar' }, cal.loading ? 'Cargando…' : 'Actualizar');
    refresh.addEventListener('click', () => loadCalendar({ refresh: true }));
    box.append(el('div', { className: 'cal-head' }, [el('h2', { className: 'section-title' }, '📅 Agenda de hoy'), refresh]));
  }
  if (cal.status === 'error') {
    const retry = el('button', { className: 'link' }, 'Reintentar');
    retry.addEventListener('click', () => loadCalendar({ refresh: true }));
    box.append(el('p', { className: 'cal-error' }, [calErrorText(cal.error), ' ', retry]));
  }
  if (cal.status === 'loading' && !events.length) box.append(el('p', { className: 'muted' }, 'Cargando tu calendario…'));
  else if (events.length) box.append(el('ul', { className: 'cal-list' }, events.map(eventItem)));
  else if (cal.status === 'ok' && !compact) box.append(el('p', { className: 'muted' }, 'No tienes eventos hoy.'));
  return box;
}

function renderTodayCalendar() {
  const today = $('#today-calendar');
  const block = calendarBlock(dateKey());
  today.replaceChildren(...(block ? [block] : []));
  today.hidden = !block;
}

function renderCalendarViews() {
  renderTodayCalendar();
  if (taskView === 'week' && !$('#week-pane').hidden) renderWeek();
}

// Al cambiar de semana se carga ese rango una sola vez (un error no provoca reintentos solos).
function autoLoadCalendar() {
  if (!calEnabled()) return;
  const r = calendarRange();
  const key = `${r.from}:${r.to}`;
  if (cal.attempted === key) return;
  cal.attempted = key;
  setTimeout(() => loadCalendar());
}

function renderCalendarSettings() {
  const toggle = $('#cal-enabled');
  const available = !!cal.mcp;
  toggle.checked = !!state.settings.calendar;
  toggle.disabled = !available;
  $('#cal-note').textContent = available
    ? state.settings.calendar
      ? 'Tus eventos aparecen en Hoy y en Tareas › Semana. La primera vez Claude te pedirá permiso para leer tu calendario.'
      : 'Actívalo para ver tus eventos junto a tus tareas.'
    : 'Disponible al abrir la app desde Claude con el conector de Google Calendar.';
}

$('#cal-enabled').addEventListener('change', (e) => {
  state.settings.calendar = e.target.checked;
  save();
  renderCalendarSettings();
  if (e.target.checked) loadCalendar({ refresh: true });
  else {
    cal.byDay = new Map();
    cal.status = 'off';
    renderCalendarViews();
  }
});
