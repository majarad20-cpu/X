'use strict';

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

// ---------- Espacio ----------
// Cada bloque de la nube admite 256 KB. La copia local va en IndexedDB (sin el límite de unos 5 MB
// de localStorage, que solo se usa si IndexedDB no está disponible).
const BLOCK_LIMIT = 256 * 1024;
const LOCAL_LIMIT = 5 * 1024 * 1024;
// Bytes en UTF-8 del JSON, contados sin crear copias (un Blob por bloque era lento con miles de notas).
function bytes(data) {
  const s = JSON.stringify(data) || '';
  let n = s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) continue;
    if (c < 0x800) n += 1;
    else if (c >= 0xd800 && c < 0xdc00) {
      n += 2; // par sustituto: 4 bytes para los dos caracteres
      i++;
    } else n += 2;
  }
  return n;
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

const monthName = (m) => {
  const s = parseKey(`${m}-01`).toLocaleDateString('es', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

// Un renglón por apartado; en los que tienen varios bloques se muestra el más lleno.
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function storageReport() {
  const buckets = localBuckets();
  const size = (name) => bytes({ ...buckets.get(name), updatedAt: 0 });
  const worst = (prefix) => [...buckets.keys()].filter((n) => n.startsWith(prefix)).map((n) => ({ n, b: size(n) })).sort((a, b) => b.b - a.b)[0];
  const rows = [{ key: 'state', label: 'Tareas, hábitos y proyectos', detail: `${plural(state.tasks.length, 'tarea activa', 'tareas activas')} · ${plural(state.habits.length, 'hábito', 'hábitos')} · ${plural(state.projects.length, 'proyecto', 'proyectos')}`, b: size('state') }];
  rows.push({ key: 'ideas', label: 'Ideas', detail: plural(state.ideas.length, 'idea', 'ideas'), b: size('ideas') });
  const j = worst('journal-');
  rows.push({ key: 'journal', label: 'Diario', detail: j ? `Mes más lleno: ${monthName(j.n.slice(8))} · ${plural(state.journal.length, 'entrada', 'entradas')} en total` : 'Sin entradas', b: j ? j.b : 0 });
  const a = worst('archive-');
  rows.push({ key: 'archive', label: 'Archivo de tareas', detail: a ? `Mes más lleno: ${monthName(a.n.slice(8))} · ${plural(state.archive.length, 'tarea archivada', 'tareas archivadas')}` : 'Vacío: aquí pasan las tareas completadas hace más de 7 días', b: a ? a.b : 0 });
  const l = worst('log-');
  rows.push({ key: 'log', label: 'Bitácora', detail: l ? `Mes más lleno: ${monthName(l.n.slice(4))} · ${plural(state.log.filter((e) => !e.removed).length, 'hito', 'hitos')} en total` : 'Sin hitos todavía', b: l ? l.b : 0 });
  const nt = worst('note-');
  const ntTitle = nt && noteById(nt.n.slice(5))?.path;
  rows.push({ key: 'notes', label: 'Notas', detail: nt ? `Nota más grande: ${ntTitle} · ${plural(state.notes.length, 'nota', 'notas')}` : 'Sin notas', b: nt ? nt.b : 0 });
  const m = worst('map-');
  const mapTitle = m && state.maps.find((x) => `map-${x.id}` === m.n)?.title;
  rows.push({ key: 'maps', label: 'Mapas mentales', detail: m ? `Mapa más grande: ${mapTitle} · ${plural(state.maps.length, 'mapa', 'mapas')}` : 'Sin mapas', b: m ? m.b : 0 });
  rows.forEach((r) => {
    r.limit = BLOCK_LIMIT;
    r.ratio = r.b / BLOCK_LIMIT;
  });
  const local = bytes(state);
  if (idb.ok) {
    // IndexedDB: el límite lo pone el navegador (normalmente una parte grande del disco libre).
    const limit = Math.max(idb.quota || 0, local * 2, 50 * 1024 * 1024);
    const imgs = files.count ? ` · más ${plural(files.count, 'imagen', 'imágenes')} (${formatBytes(files.bytes)})` : '';
    rows.push({ key: 'local', label: 'Copia en este dispositivo', detail: `Todo junto, en la base de datos del navegador${idb.persisted ? ' (protegida contra borrado automático)' : ''}${imgs}`, b: local + files.bytes, limit, ratio: (local + files.bytes) / limit });
  } else rows.push({ key: 'local', label: 'Copia en este dispositivo', detail: 'Todo junto, guardado en el navegador', b: local, limit: LOCAL_LIMIT, ratio: local / LOCAL_LIMIT });
  return rows;
}

function storageLevel(ratio) {
  if (ratio >= 1) return { cls: 'critical', text: 'Lleno: este apartado ya no se sincroniza' };
  if (ratio >= 0.95) return { cls: 'critical', text: 'Casi lleno' };
  if (ratio >= 0.8) return { cls: 'warning', text: 'Acercándose al límite' };
  return { cls: 'ok', text: '' };
}

const STORAGE_TIPS = {
  state: 'Borra tareas completadas o proyectos terminados que ya no necesites.',
  ideas: 'Borra ideas antiguas o pásalas a un mapa mental.',
  journal: 'Ese mes tiene mucho texto; los meses siguientes empiezan con su propio espacio.',
  archive: 'Usa «Borrar tareas completadas» en Tareas para vaciar el archivo.',
  maps: 'Divide ese mapa en varios más pequeños.',
  log: 'Los meses siguientes empiezan con su propio espacio.',
  notes: 'Divide esa nota en varias y enlázalas con [[ ]].',
  local: 'Descarga una copia de seguridad y borra lo que ya no uses.',
};

function renderStorage() {
  const rows = storageReport();
  $('#storage-meter').replaceChildren(
    ...rows.map((r) => {
      const pct = Math.min(100, Math.round(r.ratio * 100));
      const level = storageLevel(r.ratio);
      const row = el('div', { className: `storage-row ${level.cls}` }, [
        el('div', { className: 'sr-head' }, [
          el('span', { className: 'sr-label' }, r.label),
          el('span', { className: 'sr-num' }, `${formatBytes(r.b)} de ${formatBytes(r.limit)} · ${pct < 1 && r.b ? '<1' : pct} %`),
        ]),
        el('div', { className: 'sr-track', role: 'progressbar', ariaValueNow: String(pct), ariaValueMin: '0', ariaValueMax: '100', ariaLabel: r.label },
          el('div', { className: 'sr-fill', style: `width: ${Math.max(pct, r.b ? 1 : 0)}%` })),
        el('div', { className: 'sr-detail' }, r.detail),
      ]);
      if (level.text) row.append(el('div', { className: 'sr-alert' }, `⚠ ${level.text}. ${STORAGE_TIPS[r.key]}`));
      return row;
    })
  );
}

// Punto de aviso en el botón de Ajustes cuando algún apartado pasa del 80 %.
function updateStorageWarning() {
  const full = storageReport().some((r) => r.ratio >= 0.8);
  $('#open-settings').classList.toggle('warn', full);
  $('#open-settings').title = full ? 'Ajustes · el espacio se está llenando' : 'Ajustes';
}

// ---------- Atajos de teclado ----------
const VIEW_KEYS = { 1: 'today', 2: 'tasks', 3: 'projects', 4: 'journal', 5: 'ideas', 6: 'timer', 7: 'habits', 8: 'progress' };

document.addEventListener('keydown', (e) => {
  // Con el dibujo abierto, el teclado es suyo (31-dibujo.js).
  if (!$('#draw').hidden) return;
  // Atajos de las notas: funcionan también mientras se escribe.
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  if (mod && !e.altKey && !e.shiftKey && ['o', 'p', 'n', 'e', 'g'].includes(k)) {
    e.preventDefault();
    if (k === 'g') openTab({ type: 'graph' });
    else if (k === 'o') openSwitcher();
    else if (k === 'p') openPalette();
    else if (k === 'n') createNote({ folder: activeNote() ? folderOf(activeNote().path) : '' });
    else if (k === 'e') toggleNoteMode();
    return;
  }
  if (mod && e.shiftKey && !e.altKey && k === 'e') {
    e.preventDefault();
    toggleSplit();
    return;
  }
  if (e.altKey && !mod && k === 'd') {
    e.preventDefault();
    openDailyNote();
    return;
  }
  if (e.key === 'Escape') {
    if (!$('#picker').hidden) return;
    if (!$('#note-menu').hidden) return hideMenu();
    if (document.body.classList.contains('left-open') || document.body.classList.contains('right-open')) return closeDrawers();
    if (editingId) stopEditing();
    $('#shortcuts').hidden = true;
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest?.('#map-canvas, #cv-viewport')) return;
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
