'use strict';

// ---------- Google: Drive, Docs, Calendar y Gmail ----------
// Todo pasa por los conectores de claude.ai de quien usa la app (cal.mcp, de 16-calendario.js):
// la app nunca ve contraseñas. Las acciones que cambian algo (crear un archivo, un evento o
// enviar un correo) solo se hacen cuando lo pides o lo dejas activado aquí.
const DRIVE = 'Google Drive';
const GMAIL = 'Gmail';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const G_ERRORS = {
  needs_reauth: (s) => `Tu conexión con ${s} caducó. Vuelve a conectarlo en claude.ai › Ajustes › Conectores.`,
  server_not_connected: (s) => `${s} no está conectado. Añádelo en claude.ai › Ajustes › Conectores.`,
  selection_required: (s) => `Tienes más de una cuenta de ${s} conectada: elige una cuando Claude te lo pregunte.`,
  not_in_manifest: (s) => `Esta app no tiene permiso para usar ${s}. Actívalo en el menú de permisos de la página.`,
  not_granted: (s) => `No diste permiso para usar ${s}. Puedes darlo en el menú de permisos de la página.`,
  blocked_by_policy: (s) => `Tu organización no permite usar ${s} desde aquí.`,
  approval_required: (s) => `Hace falta tu aprobación para usar ${s}.`,
  server_unavailable: (s) => `${s} no responde ahora mismo. Prueba en un momento.`,
};
const gErrorText = (e, server) => (G_ERRORS[e?.code] ? G_ERRORS[e.code](server) : `${server} respondió con un error${e?.message ? `: ${e.message}` : ''}.`);
const gSettings = () => (state.settings.google ||= {});
const gAvailable = () => !!cal.mcp;
const gCall = (server, tool, input) => cal.mcp.callTool(server, tool, input).then((r) => r?.payload ?? {});
const localStamp = (d) => `${dateKey(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;
const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

// Texto -> base64 y vuelta, en UTF-8 (tildes y emojis incluidos).
const b64ToText = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));

async function startGoogle() {
  renderGoogleSettings();
  renderVaultSettings();
  $('#focus-block').hidden = !gAvailable();
  if (!gAvailable()) return;
  // Lo automático va después de que la app se haya dibujado y sin bloquear nada.
  setTimeout(runGoogleAutomations, 4000);
}

async function runGoogleAutomations() {
  const g = gSettings();
  if (g.driveAuto && g.driveLast !== dateKey()) await backupToDrive({ auto: true });
  if (vaultOn()) await syncVault({ adopt: !Object.keys(vaultMap().files).length });
  // Un envío sin confirmar de esta semana solo se repite a mano.
  if (g.weekly && weeklyDue() && g.weeklySending?.week !== weekKey()) await sendWeeklySummary({ auto: true });
}

// ---------- Copia en Google Drive ----------
// Carpeta «Enfoque» en Mi unidad: se busca una vez y se recuerda su id.
async function driveFolder() {
  const g = gSettings();
  if (g.driveFolder) return g.driveFolder;
  const found = await gCall(DRIVE, 'search_files', { query: `title = 'Enfoque' and mimeType = '${FOLDER_MIME}' and owner = 'me'`, pageSize: 5, excludeContentSnippets: true });
  let folder = (found.files || []).find((f) => f.mimeType === FOLDER_MIME);
  if (!folder) folder = await gCall(DRIVE, 'create_file', { title: 'Enfoque', contentMimeType: FOLDER_MIME });
  if (!folder?.id) throw new Error('sin carpeta');
  Object.assign(gSettings(), { driveFolder: folder.id, driveFolderUrl: folder.viewUrl || `https://drive.google.com/drive/folders/${folder.id}` });
  save();
  return folder.id;
}

const driveStatus = (text, isError = false) => {
  const n = $('#gdrive-status');
  n.textContent = text;
  n.classList.toggle('error', isError);
};

async function backupJson() {
  const data = Object.fromEntries(DATA_KEYS.map((k) => [k, state[k]]));
  let images = await backupFiles();
  const base = { app: 'enfoque', version: 1, exportedAt: new Date().toISOString(), data };
  // Las imágenes y notas de voz van en la copia si no la hacen demasiado grande para subirla.
  const size = images.reduce((n, f) => n + (f.data?.length || 0), 0);
  const withFiles = size < 4 * 1024 * 1024;
  if (!withFiles) images = [];
  return { json: JSON.stringify({ ...base, files: images }), withFiles };
}

let driveBusy = false;
async function backupToDrive({ auto = false } = {}) {
  if (!gAvailable()) return driveStatus('Google Drive solo está disponible al abrir la app desde Claude.', true);
  if (driveBusy) return;
  driveBusy = true;
  const btn = $('#gdrive-now');
  btn.disabled = true;
  driveStatus('Guardando la copia en Google Drive…');
  try {
    const { json, withFiles } = await backupJson();
    const title = `enfoque-copia-${dateKey()}-${String(new Date().getHours()).padStart(2, '0')}${String(new Date().getMinutes()).padStart(2, '0')}.json`;
    const input = { title, textContent: json, contentMimeType: 'application/json', disableConversionToGoogleType: true };
    let file;
    try {
      file = await gCall(DRIVE, 'create_file', { ...input, parentId: await driveFolder() });
    } catch (e) {
      // La carpeta pudo borrarse: se busca o se crea otra y se reintenta una vez.
      if (e?.code !== 'tool_error' || !gSettings().driveFolder) throw e;
      delete gSettings().driveFolder;
      file = await gCall(DRIVE, 'create_file', { ...input, parentId: await driveFolder() });
    }
    const g = gSettings();
    g.driveLast = dateKey();
    g.driveLastAt = Date.now();
    g.driveLastUrl = file?.viewUrl || '';
    save();
    renderGoogleSettings(withFiles ? '' : ' Las imágenes no se incluyeron porque ocupan demasiado (siguen en la copia descargada).');
    if (auto) showToastMessage('Copia diaria guardada en Google Drive');
  } catch (e) {
    driveStatus(`No se pudo guardar la copia. ${gErrorText(e, DRIVE)}`, true);
  } finally {
    driveBusy = false;
    btn.disabled = false;
  }
}

async function listDriveBackups() {
  const box = $('#gdrive-backups');
  driveStatus('Buscando tus copias en Google Drive…');
  try {
    const folder = await driveFolder();
    const res = await gCall(DRIVE, 'search_files', { query: `parentId = '${folder}' and title contains 'enfoque-copia'`, pageSize: 20, excludeContentSnippets: true });
    const files = (res.files || []).sort((a, b) => String(b.modifiedTime).localeCompare(String(a.modifiedTime))).slice(0, 10);
    box.hidden = false;
    if (!files.length) {
      box.replaceChildren(el('li', { className: 'muted' }, 'Todavía no hay copias en tu carpeta «Enfoque».'));
      return driveStatus('');
    }
    box.replaceChildren(
      ...files.map((f) => {
        const when = f.modifiedTime ? new Date(f.modifiedTime).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' }) : f.title;
        const btn = el('button', { className: 'chip' }, 'Restaurar');
        btn.addEventListener('click', () => restoreFromDrive(f, btn));
        return el('li', { className: 'g-item' }, [el('span', {}, [el('strong', {}, when), ' ', el('span', { className: 'muted' }, f.fileSize ? `${Math.round(f.fileSize / 1024)} KB` : '')]), btn]);
      })
    );
    driveStatus('Restaurar sustituye tus datos actuales (podrás deshacerlo unos segundos).');
  } catch (e) {
    driveStatus(`No se pudieron listar las copias. ${gErrorText(e, DRIVE)}`, true);
  }
}

async function restoreFromDrive(f, btn) {
  btn.disabled = true;
  btn.textContent = 'Descargando…';
  try {
    const res = await gCall(DRIVE, 'download_file_content', { fileId: f.id });
    restoreBackup(b64ToText(res.content || ''));
    driveStatus('Copia restaurada desde Google Drive.');
    $('#gdrive-backups').hidden = true;
  } catch (e) {
    driveStatus(`No se pudo descargar la copia. ${gErrorText(e, DRIVE)}`, true);
    btn.disabled = false;
    btn.textContent = 'Restaurar';
  }
}

// ---------- Exportar una nota a Google Docs ----------
// La nota se convierte a HTML (con títulos, listas, tablas, negritas…) y Drive la convierte en un
// documento de Google. Los enlaces entre notas quedan como texto y las imágenes van dentro si caben.
async function noteToHtml(note, text) {
  const box = document.createElement('div');
  box.innerHTML = renderMd(text, { noTasks: true });
  box.querySelectorAll('a.wikilink, a.tag-link, a[data-go]').forEach((a) => a.replaceWith(document.createTextNode(a.textContent)));
  box.querySelectorAll('.footnotes .fn-back, .block-anchor, .query').forEach((n) => n.remove());
  box.querySelectorAll('input[type=checkbox]').forEach((c) => c.replaceWith(document.createTextNode(c.checked ? '☑ ' : '☐ ')));
  box.querySelectorAll('.task-glyph').forEach((g) => g.replaceWith(document.createTextNode(`${g.textContent} `)));
  box.querySelectorAll('.math').forEach((m) => m.replaceWith(document.createTextNode(m.dataset.tex || m.textContent)));
  box.querySelectorAll('.mermaid-box').forEach((m) => m.replaceWith(Object.assign(document.createElement('pre'), { textContent: decodeURIComponent(m.dataset.src || '') })));
  box.querySelectorAll('.note-audio').forEach((a) => a.replaceWith(document.createTextNode(`[${a.querySelector('.na-label')?.textContent || 'Nota de voz'}]`)));
  box.querySelectorAll('details').forEach((d) => {
    const div = document.createElement('div');
    div.className = d.className;
    div.innerHTML = d.innerHTML.replace(/<\/?summary[^>]*>/g, (t) => (t.startsWith('</') ? '</div>' : '<div class="callout-title">'));
    d.replaceWith(div);
  });
  box.querySelectorAll('.callout').forEach((c) => c.setAttribute('style', 'border-left:3px solid #6366f1;padding:6px 12px;background:#f4f4ff'));
  let budget = 3 * 1024 * 1024;
  for (const img of box.querySelectorAll('img[data-img]')) {
    const f = await getFile(img.dataset.img).catch(() => null);
    if (f?.data && f.data.length < budget) {
      budget -= f.data.length;
      img.src = f.data;
      img.removeAttribute('data-img');
      if (f.width) img.setAttribute('width', String(Math.min(f.width, 600)));
    } else img.replaceWith(document.createTextNode(`[Imagen: ${img.alt || ''}]`));
  }
  box.querySelectorAll('*').forEach((n) => [...n.attributes].forEach((a) => /^(data-|class$|id$|title$|aria-|loading$|referrerpolicy$)/.test(a.name) && n.removeAttribute(a.name)));
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escHtml(baseName(note.path))}</title></head><body><h1>${escHtml(baseName(note.path))}</h1>${box.innerHTML}</body></html>`;
}

async function exportNoteToDocs(note = activeNote()) {
  if (!note) return;
  if (!gAvailable()) return showToastMessage('Google Docs solo está disponible al abrir la app desde Claude.');
  const text = noteText(note);
  if (text === null) return showToastMessage('Desbloquea la nota para exportarla.');
  if (note.enc) return showToastMessage('Las notas con contraseña no se exportan (en Google Docs quedarían sin cifrar).');
  endBlockEdit?.();
  flushNoteSave();
  showToastMessage('Creando el documento en Google Docs…');
  try {
    const html = await noteToHtml(note, text);
    let parentId;
    try {
      parentId = await driveFolder();
    } catch {
      parentId = undefined; // sin carpeta: va a Mi unidad
    }
    const file = await gCall(DRIVE, 'create_file', { title: baseName(note.path), textContent: html, contentMimeType: 'text/html', ...(parentId ? { parentId } : {}) });
    const url = file.viewUrl || (file.id ? `https://docs.google.com/document/d/${file.id}/edit` : '');
    note.gdoc = { id: file.id || '', url, at: Date.now() };
    save();
    showGoogleLink('Documento creado en Google Docs', url, 'Abrir');
  } catch (e) {
    showToastMessage(`No se pudo crear el documento. ${gErrorText(e, 'Google Drive')}`);
  }
}

// Aviso con un enlace para abrir lo que se acaba de crear (dura más que un aviso normal).
function showGoogleLink(text, url, label) {
  if (!url) return showToastMessage(text);
  let bar = $('#g-linkbar');
  if (!bar) {
    bar = el('div', { id: 'g-linkbar', className: 'g-linkbar', role: 'status' });
    document.body.append(bar);
  }
  const close = el('button', { className: 'link', ariaLabel: 'Cerrar' }, '✕');
  close.addEventListener('click', () => (bar.hidden = true));
  bar.replaceChildren(el('span', {}, text), el('a', { href: url, target: '_blank', rel: 'noopener noreferrer', className: 'chip' }, `${label} ↗`), close);
  bar.hidden = false;
  clearTimeout(bar.timer);
  bar.timer = setTimeout(() => (bar.hidden = true), 12000);
}

// ---------- Agendar en Google Calendar ----------
const sched = { task: null, title: '', busy: [] };

function openSchedule({ task = null, title = '', minutes = null, date = null } = {}) {
  if (!gAvailable()) return showToastMessage('Google Calendar solo está disponible al abrir la app desde Claude.');
  sched.task = task;
  const now = new Date();
  // Por defecto: el día y la hora de la tarea, o la próxima media hora.
  const next = new Date(now.getTime() + 15 * 60000);
  next.setMinutes(next.getMinutes() < 30 ? 30 : 60, 0, 0);
  $('#gsched-title').textContent = task ? '📅 Agendar en Google Calendar' : '🎯 Reservar tiempo de concentración';
  $('#gsched-name').value = task ? task.title : title || '🎯 Concentración';
  $('#gsched-date').value = date && date >= dateKey() ? date : task?.due && task.due >= dateKey() ? task.due : dateKey(next);
  $('#gsched-time').value = task?.time || `${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}`;
  $('#gsched-dur').value = String(minutes || (task ? 30 : 60));
  $('#gsched-status').textContent = '';
  $('#gsched-ok').disabled = false;
  $('#gsched').hidden = false;
  $('#gsched-name').focus();
  loadFreeSlots();
}

const closeSchedule = () => ($('#gsched').hidden = true);

// Huecos libres del día elegido entre las 8:00 y las 20:00 (desde ahora, si es hoy).
async function loadFreeSlots() {
  const day = $('#gsched-date').value;
  const box = $('#gsched-slots');
  if (!day) return box.replaceChildren();
  $('#gsched-free-label').textContent = 'Buscando huecos libres…';
  box.replaceChildren();
  try {
    const start = parseKey(day);
    const end = addDays(start, 1);
    const res = await cal.mcp.callTool('Google Calendar', 'list_events', { startTime: start.toISOString(), endTime: end.toISOString(), orderBy: 'startTime', pageSize: 100, timeZone: tz() }, { cache: { staleTime: 30000 } });
    if ($('#gsched-date').value !== day) return;
    sched.busy = (res?.payload?.events || [])
      .filter((ev) => ev.status !== 'cancelled' && ev.start?.dateTime && ev.end?.dateTime && ev.transparency !== 'transparent')
      .map((ev) => [new Date(ev.start.dateTime).getTime(), new Date(ev.end.dateTime).getTime()]);
    renderFreeSlots();
  } catch (e) {
    $('#gsched-free-label').textContent = `No se pudieron ver los huecos libres. ${gErrorText(e, 'Google Calendar')}`;
  }
}

function freeSlots(day, minutes) {
  const start = parseKey(day);
  let from = new Date(start).setHours(8, 0, 0, 0);
  const until = new Date(start).setHours(20, 0, 0, 0);
  if (day === dateKey()) from = Math.max(from, Math.ceil((Date.now() + 5 * 60000) / (15 * 60000)) * 15 * 60000);
  const busy = sched.busy.slice().sort((a, b) => a[0] - b[0]);
  const out = [];
  let t = from;
  for (const [s, e] of [...busy, [until, until]]) {
    if (s - t >= minutes * 60000 && t < until) out.push([t, Math.min(s, until)]);
    t = Math.max(t, e);
    if (out.length >= 6) break;
  }
  return out;
}

function renderFreeSlots() {
  const minutes = Number($('#gsched-dur').value);
  const slots = freeSlots($('#gsched-date').value, minutes);
  const f = (ms) => new Date(ms).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  $('#gsched-free-label').textContent = slots.length ? `Huecos libres de ${formatMinutes(minutes)} o más ese día:` : 'No quedan huecos libres de esa duración entre las 8:00 y las 20:00.';
  $('#gsched-slots').replaceChildren(
    ...slots.map(([s, e]) => {
      const b = el('button', { type: 'button', className: 'chip' }, `${f(s)}–${f(e)}`);
      b.addEventListener('click', () => {
        $('#gsched-time').value = new Date(s).toTimeString().slice(0, 5);
        $$('#gsched-slots .chip').forEach((x) => x.classList.toggle('active', x === b));
      });
      return b;
    })
  );
}

async function createScheduledEvent(e) {
  e.preventDefault();
  const title = $('#gsched-name').value.trim();
  const day = $('#gsched-date').value;
  const time = $('#gsched-time').value;
  const minutes = Number($('#gsched-dur').value);
  if (!title || !day || !time) return;
  const [y, m, d] = day.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const start = new Date(y, m - 1, d, hh, mm);
  const end = new Date(start.getTime() + minutes * 60000);
  const clash = sched.busy.some(([s, en]) => s < end.getTime() && en > start.getTime());
  const btn = $('#gsched-ok');
  btn.disabled = true;
  $('#gsched-status').textContent = 'Creando el evento…';
  try {
    // Hora local sin desfase + zona horaria: el conector la interpreta en tu zona.
    const ev = await gCall('Google Calendar', 'create_event', { summary: title, startTime: localStamp(start), endTime: localStamp(end), timeZone: tz(), description: sched.task ? 'Tarea de Enfoque.' : 'Tiempo de concentración reservado desde Enfoque.' });
    const t = sched.task;
    if (t) {
      t.calEventId = ev.id || 'creado';
      // Si la tarea no tenía fecha u hora, toma las del evento.
      if (!t.due) t.due = day;
      if (!t.time) t.time = time;
    }
    save();
    closeSchedule();
    showGoogleLink(`Evento creado: ${title} · ${start.toLocaleString('es', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${clash ? ' (coincide con otro evento)' : ''}`, ev.htmlLink || '', 'Ver en Calendar');
    if (calEnabled()) loadCalendar({ refresh: true });
    renderAll();
  } catch (err) {
    // Un fallo de conexión no garantiza que el evento no se creara: no se reintenta solo.
    $('#gsched-status').textContent = err?.code === 'server_unavailable' || err?.code === 'upstream_error' ? 'No se pudo confirmar. Revisa tu calendario antes de volver a intentarlo.' : gErrorText(err, 'Google Calendar');
    btn.disabled = false;
  }
}

$('#gsched-form').addEventListener('submit', createScheduledEvent);
$('#gsched-close').addEventListener('click', closeSchedule);
$('#gsched-cancel').addEventListener('click', closeSchedule);
$('#gsched').addEventListener('click', (e) => e.target.id === 'gsched' && closeSchedule());
$('#gsched-date').addEventListener('change', loadFreeSlots);
$('#gsched-dur').addEventListener('change', renderFreeSlots);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#gsched').hidden) closeSchedule();
});
$('#focus-block').addEventListener('click', () => {
  const task = state.tasks.find((t) => t.id === $('#timer-task').value);
  openSchedule({ title: task ? `🎯 ${task.title}` : '🎯 Concentración', minutes: 60 });
});

// ---------- Resumen semanal por Gmail ----------
const weekKey = (d = new Date()) => dateKey(weekStart(d));
// Toca enviarlo si esta semana ya llegó el día elegido y aún no se ha enviado.
function weeklyDue() {
  const g = gSettings();
  const day = Number(g.weeklyDay ?? 1);
  const idx = (d) => (d + 6) % 7; // lunes = 0
  return g.weeklySent !== weekKey() && idx(new Date().getDay()) >= idx(day);
}

function weeklyData() {
  const today = new Date();
  const end = addDays(today, -1);
  const from = addDays(today, -7);
  const inRange = (k) => k >= dateKey(from) && k <= dateKey(end);
  const done = state.log.filter((x) => x.type === 'task' && !x.removed && inRange(x.date));
  const notes = state.notes.filter((n) => n.createdAt >= from.getTime() && n.createdAt < new Date(today).setHours(0, 0, 0, 0));
  const pending = allTasks().concat(typeof noteTasks === 'function' ? noteTasks() : []).filter((t) => !t.done);
  const next7 = pending.filter((t) => t.due && t.due >= dateKey() && t.due <= dateKey(addDays(today, 6))).sort((a, b) => a.due.localeCompare(b.due) || (b.priority || 0) - (a.priority || 0));
  const overdue = pending.filter((t) => t.due && t.due < dateKey());
  const habits = state.habits.map((h) => ({ name: h.name, count: [...Array(7)].filter((_, i) => h.log?.[dateKey(addDays(from, i))]).length, goal: goalOf(h) }));
  return {
    from,
    end,
    done,
    pomos: sumDays(state.pomodoros, end, 7),
    minutes: sumDays(state.focusMinutes, end, 7),
    notes,
    next7,
    overdue,
    habits,
  };
}

function weeklyHtml(w) {
  const f = (d) => d.toLocaleDateString('es', { day: 'numeric', month: 'long' });
  const li = (items, fn, empty) => (items.length ? `<ul>${items.map((x) => `<li>${fn(x)}</li>`).join('')}</ul>` : `<p style="color:#666">${empty}</p>`);
  const day = (k) => parseKey(k).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' });
  const stat = (n, label) => `<td style="padding:8px 14px;text-align:center"><div style="font-size:22px;font-weight:700">${n}</div><div style="color:#666;font-size:12px">${label}</div></td>`;
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;color:#1f2937">
<h2 style="margin:0 0 4px">Tu semana en Enfoque</h2>
<p style="color:#666;margin:0 0 16px">Del ${f(w.from)} al ${f(w.end)}</p>
<table style="border-collapse:collapse;background:#f4f4ff;border-radius:8px"><tr>${stat(w.done.length, 'tareas hechas')}${stat(w.pomos, 'pomodoros')}${stat(formatMinutes(w.minutes), 'de enfoque')}${stat(w.notes.length, 'notas nuevas')}</tr></table>
<h3>✅ Lo que hiciste</h3>${li(w.done.slice(-25), (x) => escHtml(x.text), 'Esta semana no marcaste tareas como hechas.')}
${w.habits.length ? `<h3>🔥 Hábitos</h3>${li(w.habits, (h) => `${escHtml(h.name)}: ${h.count} de ${Math.min(7, h.goal)}`, '')}` : ''}
<h3>📅 Lo que viene (próximos 7 días)</h3>${li(w.next7.slice(0, 25), (t) => `<strong>${day(t.due)}</strong>${t.time ? ` ${t.time}` : ''} · ${escHtml(t.title)}`, 'No tienes tareas con fecha para los próximos días.')}
${w.overdue.length ? `<h3>⚠️ Atrasadas (${w.overdue.length})</h3>${li(w.overdue.slice(0, 15), (t) => `${escHtml(t.title)} <span style="color:#b91c1c">(${day(t.due)})</span>`, '')}` : ''}
<p style="color:#888;font-size:12px;margin-top:24px">Enviado por Enfoque. Puedes desactivarlo en Ajustes › Resumen semanal por Gmail.</p></div>`;
}

function weeklyText(w) {
  return [
    `Tu semana en Enfoque (${w.from.toLocaleDateString('es')} – ${w.end.toLocaleDateString('es')})`,
    `${w.done.length} tareas hechas · ${w.pomos} pomodoros · ${formatMinutes(w.minutes)} de enfoque · ${w.notes.length} notas nuevas`,
    '',
    'Lo que hiciste:',
    ...w.done.slice(-25).map((x) => `- ${x.text}`),
    '',
    'Lo que viene:',
    ...w.next7.slice(0, 25).map((t) => `- ${t.due}${t.time ? ` ${t.time}` : ''} ${t.title}`),
  ].join('\n');
}

const weeklyStatus = (text, isError = false) => {
  const n = $('#gweekly-status');
  n.textContent = text;
  n.classList.toggle('error', isError);
};

const weeklyRecipient = () => $('#gweekly-to').value.trim() || gSettings().weeklyTo || '';

let weeklyBusy = false;
async function sendWeeklySummary({ auto = false } = {}) {
  if (!gAvailable()) return weeklyStatus('Gmail solo está disponible al abrir la app desde Claude.', true);
  if (weeklyBusy) return;
  const to = weeklyRecipient();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    weeklyStatus('Escribe el correo al que quieres recibir el resumen.', true);
    if (!auto) $('#gweekly-to').focus();
    return;
  }
  const btn = $('#gweekly-send');
  btn.disabled = true;
  weeklyBusy = true;
  weeklyStatus('Enviando el resumen…');
  const w = weeklyData();
  // Marca de envío en curso: si la respuesta no llega, no se reenvía solo.
  gSettings().weeklySending = { week: weekKey(), at: Date.now() };
  save();
  try {
    await gCall(GMAIL, 'send_message', { to: [to], subject: `Tu semana en Enfoque · ${w.from.toLocaleDateString('es', { day: 'numeric', month: 'short' })} – ${w.end.toLocaleDateString('es', { day: 'numeric', month: 'short' })}`, body: weeklyText(w), htmlBody: weeklyHtml(w) });
    const g = gSettings();
    g.weeklySent = weekKey();
    g.weeklySentAt = Date.now();
    delete g.weeklySending;
    save();
    renderGoogleSettings();
    if (auto) showToastMessage('Resumen semanal enviado a tu correo');
  } catch (e) {
    const g = gSettings();
    // Un fallo de conexión no garantiza que el correo no saliera.
    const unsure = e?.code === 'server_unavailable' || (!G_ERRORS[e?.code] && e?.code !== 'tool_error');
    if (unsure && g.weeklySending) g.weeklySending.unconfirmed = true;
    else delete g.weeklySending;
    save();
    weeklyStatus(unsure ? 'No se pudo confirmar el envío. Revisa tu correo antes de enviarlo otra vez.' : `No se pudo enviar. ${gErrorText(e, GMAIL)}`, true);
  } finally {
    weeklyBusy = false;
    btn.disabled = false;
  }
}

// ---------- Ajustes ----------
function renderGoogleSettings(extra = '') {
  const g = gSettings();
  const ok = gAvailable();
  ['#gdrive-auto', '#gdrive-now', '#gdrive-list', '#gweekly-on', '#gweekly-send', '#gweekly-day', '#gweekly-to'].forEach((s) => ($(s).disabled = !ok));
  $('#gdrive-auto').checked = !!g.driveAuto;
  $('#gweekly-on').checked = !!g.weekly;
  $('#gweekly-day').value = String(g.weeklyDay ?? 1);
  if (document.activeElement !== $('#gweekly-to')) $('#gweekly-to').value = g.weeklyTo || '';
  const when = (ms) => new Date(ms).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });
  if (!ok) {
    driveStatus('Disponible al abrir la app desde Claude con el conector de Google Drive.');
    weeklyStatus('Disponible al abrir la app desde Claude con el conector de Gmail.');
    return;
  }
  driveStatus(g.driveLastAt ? `Última copia en Drive: ${when(g.driveLastAt)}.${extra}` : 'Aún no has guardado ninguna copia en Drive.');
  if (g.driveFolderUrl) {
    const a = el('a', { href: g.driveFolderUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Abrir la carpeta ↗');
    $('#gdrive-status').append(' ', a);
  }
  if (g.weeklySending?.unconfirmed && g.weeklySending.week === weekKey()) return weeklyStatus('No se pudo confirmar el último envío. Revisa tu correo antes de enviarlo otra vez.', true);
  weeklyStatus(g.weekly && !g.weeklyTo ? 'Escribe el correo al que quieres recibirlo.' : g.weeklySentAt ? `Último resumen enviado: ${when(g.weeklySentAt)}.` : g.weekly ? 'Se enviará el día elegido, la próxima vez que abras la app.' : '');
}

$('#gdrive-auto').addEventListener('change', (e) => {
  gSettings().driveAuto = e.target.checked;
  save();
  if (e.target.checked && gSettings().driveLast !== dateKey()) backupToDrive();
});
$('#gdrive-now').addEventListener('click', () => backupToDrive());
$('#gdrive-list').addEventListener('click', listDriveBackups);
$('#gweekly-on').addEventListener('change', (e) => {
  gSettings().weekly = e.target.checked;
  save();
  renderGoogleSettings();
});
$('#gweekly-day').addEventListener('change', (e) => {
  gSettings().weeklyDay = Number(e.target.value);
  save();
});
$('#gweekly-to').addEventListener('change', (e) => {
  gSettings().weeklyTo = e.target.value.trim();
  save();
  renderGoogleSettings();
});
$('#gweekly-send').addEventListener('click', () => sendWeeklySummary());
$('#gweekly-preview').addEventListener('click', () => {
  const box = $('#gweekly-sample');
  box.hidden = !box.hidden;
  if (!box.hidden) box.innerHTML = weeklyHtml(weeklyData());
});

NOTE_MENU_EXTRA.push((note) => (!gAvailable() || note.enc ? null : { label: note.gdoc?.url ? '📄 Exportar a Google Docs otra vez' : '📄 Exportar a Google Docs', action: () => exportNoteToDocs(note) }));
COMMANDS_EXTRA.push((note) => !gAvailable() ? [] : [
  ...(note && !note.enc ? [{ label: 'Exportar la nota a Google Docs', action: () => exportNoteToDocs(note) }] : []),
  { label: 'Guardar una copia en Google Drive', action: () => backupToDrive() },
  { label: 'Reservar tiempo de concentración en Google Calendar', action: () => openSchedule({ minutes: 60 }) },
  { label: 'Enviarme el resumen semanal por Gmail', action: () => sendWeeklySummary() },
]);
renderGoogleSettings();
