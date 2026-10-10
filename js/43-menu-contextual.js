'use strict';

// ---------- Clic derecho ----------
// Con el botón derecho del ratón (o la tecla de menú, o Mayús+F10) cada cosa muestra sus opciones:
// tareas (en cualquier vista), notas y carpetas del explorador, pestañas, días del calendario,
// enlaces e imágenes de una nota, la nota que se está leyendo, la barra de la izquierda y el dibujo.
// En los campos de texto se deja el menú del navegador (cortar, copiar, pegar, ortografía).

// Muestra el menú en un punto de la pantalla.
const showMenuAt = (x, y, items) => showMenu({ x, y }, items);

const findAnyTask = (id) => allTasks().find((t) => t.id === id) || noteTasks().find((t) => t.id === id);
// Las acciones que llevan a otra vista cierran antes la agenda del día (si no, quedan detrás).
const leaveDayView = () => !$('#dayview').hidden && closeDayView();

// Fecha de una tarea (en las de una nota, cambia «📅 …» en su línea; también fechas como «📅 mañana»).
function setTaskDate(t, key) {
  if (key) setTaskDue(t, key);
  else if (t.virtual) {
    editNoteLine(t, (l) => l.replace(/\s*📅\s*([^#!⏰📅✅+]+?)\s*(?=[#!⏰📅✅+]|$)/u, ' ').replace(/\s+$/, ''));
  } else {
    t.due = null;
    t.time = null;
  }
  save();
  renderAll();
  showToastMessage(key ? `Fecha: ${formatDue(key).toLowerCase()}` : 'Sin fecha');
}
// En una tarea de nota la fecha puede venir del nombre de la nota diaria (sin «📅» que quitar).
const hasOwnDate = (t) => !!t.due && (!t.virtual || /📅/u.test(noteById(t.noteId)?.body.split('\n')[t.line] || ''));

// Abre la tarea en el editor de la lista (la única vista donde se edita entera).
function editTaskInList(t) {
  leaveDayView();
  showView('tasks');
  if (taskView !== 'list') $('[data-taskview="list"]').click();
  if (tagFilter && !(t.tags || []).includes(tagFilter)) setTagFilter(null);
  startEditing(t.id);
  reveal(document.querySelector('.view.active .task-edit'), { block: 'center' });
}

function duplicateTask(t) {
  const copy = JSON.parse(JSON.stringify(t));
  Object.assign(copy, { id: uid(), done: false, completedAt: null, createdAt: Date.now(), order: Date.now(), pomodoros: 0 });
  for (const k of ['calEventId', 'status', 'remindedFor', 'snoozeUntil', 'noteId']) delete copy[k]; // la copia no comparte la nota
  copy.subtasks = (copy.subtasks || []).map((st) => ({ ...st, id: uid(), done: false }));
  state.tasks.push(copy);
  save();
  renderAll();
  showToastMessage('Tarea duplicada');
}

function taskMenuItems(t) {
  const today = dateKey();
  const tomorrow = dateKey(addDays(new Date(), 1));
  const items = [];
  if (t.virtual)
    items.push(
      { label: '📝 Abrir en su nota', action: () => (leaveDayView(), openNoteAtLine(t.noteId, t.line)) },
      { label: '📝 Abrir la nota en pestaña nueva', action: () => (leaveDayView(), openNoteAtLine(t.noteId, t.line, { newTab: true })) }
    );
  else items.push({ label: '✏️ Editar', action: () => editTaskInList(t) });
  items.push(
    { label: t.done ? '↺ Marcar como pendiente' : '✓ Marcar como hecha', action: () => (t.virtual ? toggleNoteTask(t.noteId, t.line, !t.done) : toggleDone(t, !t.done)) },
    ...(!t.done ? [{ label: statusOf(t) === 'doing' ? '○ Quitar «en curso»' : '◐ Marcar en curso', action: () => setStatus(t, statusOf(t) === 'doing' ? 'todo' : 'doing') }] : []),
    { sep: true },
    { label: `${t.due === today ? '✓ ' : ''}📅 Para hoy`, action: () => setTaskDate(t, today) },
    { label: `${t.due === tomorrow ? '✓ ' : ''}📅 Para mañana`, action: () => setTaskDate(t, tomorrow) },
    { label: '📅 La próxima semana (lunes)', action: () => setTaskDate(t, dateKey(nextMonday())) },
    ...(hasOwnDate(t) ? [{ label: '📅 Quitar la fecha', action: () => setTaskDate(t, null) }] : []),
    { label: '🕒 Abrir en la agenda del día', action: () => openDayView(t.due || today) },
    { sep: true },
    ...[3, 2, 1].map((p) => ({ label: `${t.priority === p ? '● ' : '○ '}Prioridad ${PRIORITY_LABEL[p].toLowerCase()}`, action: () => setPriority(t, p) }))
  );
  items.push(...ctxExtra('task', t)); // «Enlazar con…», «Ver relacionado…» (60-relaciones.js)
  // Hecha en una nota: quitar su línea (con «Deshacer»).
  if (t.virtual && t.done) items.push({ sep: true }, { label: '🗑 Eliminar la línea', danger: true, action: () => deleteNoteTaskLine(t) });
  if (!t.virtual) {
    items.push({ sep: true });
    if (cal.mcp) items.push({ label: '📅 Agendar en Google Calendar…', action: () => openSchedule({ task: t, minutes: Number(t.duration) || 30 }) });
    items.push(
      { label: '⧉ Duplicar', action: () => duplicateTask(t) },
      { label: 'Copiar el título', action: () => copyText(t.title, 'Título copiado') },
      // Hechas: archivar ya o, si está archivada, devolverla a la lista.
      ...(t.done ? [state.archive.includes(t) ? { label: '↩ Restaurar a la lista', action: () => restoreTask(t) } : { label: '🗄 Archivar', action: () => archiveTasks([t]) }] : []),
      { label: 'Eliminar', danger: true, action: () => deleteTask(t) }
    );
  }
  return items;
}

const isOpenInTab = (tab) => ws.tabs.some((x) => sameTab(x, tab));
// Otros módulos añaden opciones a estos menús (p. ej. los marcadores): (tipo, cosa) => [opciones].
const CTX_MENU_EXTRA = [];
const ctxExtra = (kind, x) => CTX_MENU_EXTRA.flatMap((f) => f(kind, x) || []);
// Lienzos hechos con las notas de una carpeta o con los enlaces de una nota (32-lienzos.js).
if (typeof canvasCtxItems === 'function') CTX_MENU_EXTRA.push(canvasCtxItems);
// Dictar en el editor y Claude sobre una transcripción de voz (35-voz.js).
if (typeof voiceCtxItems === 'function') CTX_MENU_EXTRA.push(voiceCtxItems);

function treeNoteItems(note) {
  return [
    { label: 'Abrir', action: () => openNote(note) },
    ...(isOpenInTab({ type: 'note', id: note.id }) ? [] : [{ label: 'Abrir en pestaña nueva', kbd: 'Ctrl+clic', action: () => openNote(note, { newTab: true }) }]),
    { sep: true },
    { label: 'Renombrar…', action: () => promptText({ placeholder: 'Nuevo nombre', initial: baseName(note.path), action: 'Renombrar', onSubmit: (v) => renameNote(note, v) }) },
    { label: 'Mover a carpeta…', action: () => pickFolder(note) },
    ...(note.enc ? [] : [{ label: 'Duplicar', action: () => duplicateNote(note) }]),
    { label: 'Copiar enlace [[…]]', action: () => copyNoteLink(note) },
    ...(cal.mcp && !note.enc ? [{ label: '📄 Exportar a Google Docs', action: () => exportNoteToDocs(note) }] : []),
    ...ctxExtra('note', note),
    { sep: true },
    { label: 'Eliminar nota', danger: true, action: () => deleteNote(note) },
  ];
}

function tabMenuItems(i) {
  const tab = ws.tabs[i];
  const note = tab?.type === 'note' ? noteById(tab.id) : null;
  const closeWhere = (keep) => {
    flushNoteSave();
    const activeTabObj = ws.tabs[ws.active];
    ws.tabs = ws.tabs.filter((x, k) => keep(k));
    ws.active = Math.max(0, ws.tabs.indexOf(activeTabObj));
    if (!ws.tabs.includes(activeTabObj)) ws.active = Math.min(i, ws.tabs.length - 1);
    saveTabs();
    renderAll();
  };
  return [
    { label: 'Cerrar', kbd: 'Ctrl+W', action: () => (flushNoteSave(), closeTab(i)) },
    { label: 'Cerrar las demás', disabled: ws.tabs.length < 2, action: () => closeWhere((k) => k === i) },
    { label: 'Cerrar las de la derecha', disabled: i >= ws.tabs.length - 1, action: () => closeWhere((k) => k <= i) },
    ...(note ? [{ sep: true }, { label: 'Copiar enlace [[…]]', action: () => copyNoteLink(note) }] : []),
  ];
}

function readingItems(e, note) {
  const sel = String(window.getSelection() || '').trim();
  const block = e.target.closest('#note-reading > [data-src]');
  const items = [];
  if (sel) items.push({ label: 'Copiar', kbd: 'Ctrl+C', action: () => copyText(sel, 'Copiado') });
  if (block && noteMode.get(note.id) === 'read') {
    const point = { x: e.clientX, y: e.clientY };
    items.push({ label: '✏️ Editar este bloque', kbd: 'Doble clic', action: () => {
      // Si ya se editaba otro bloque, se cierra (las líneas pueden haber cambiado) y se busca de nuevo.
      let target = block;
      if (blockEdit || !block.isConnected) {
        endBlockEdit();
        target = document.elementFromPoint(point.x, point.y)?.closest('#note-reading > [data-src]');
      }
      if (!target) return;
      const [from, to] = target.dataset.src.split('-').map(Number);
      startBlockEdit(note, from, to, target, point);
    } });
    items.push(...ctxExtra('block', { note, block }));
  }
  // Vistas (⚙), estilo del bloque e «Insertar…» (54-constructor-consultas.js).
  items.push(...ctxExtra('reading', { note, e }));
  items.push(
    { label: isEditing(note.id) ? 'Modo lectura' : 'Editar la nota entera', kbd: 'Ctrl+E', action: toggleNoteMode },
    { label: '✏️ Nuevo dibujo…', action: () => openDrawing() },
    ...(typeof noteAIAvailable === 'function' && noteAIAvailable(note) ? [{ label: '✨ Claude en esta nota…', kbd: 'Ctrl+J', action: openNoteAI }] : []),
    ...(e.target.closest('#note-reading :is(h1, h2, h3, h4, h5, h6)[data-line]') ? ctxExtra('heading', { note, el: e.target.closest('h1, h2, h3, h4, h5, h6') }) : []),
    { sep: true },
    ...noteMenuItems(note)
  );
  return items;
}

document.addEventListener('contextmenu', (e) => {
  const t = e.target;
  // Editor de la nota: cortar, copiar, pegar y estilo del párrafo (51-formato.js). Con Mayús, el del navegador.
  if (t.id === 'note-editor' && !e.shiftKey && typeof editorMenuItems === 'function') {
    e.preventDefault();
    const c = !e.clientX && !e.clientY ? caretCoords(t, t.selectionStart) : null;
    return showMenuAt(c ? c.left : e.clientX, c ? c.top + c.lh : e.clientY, [...editorMenuItems(t), ...ctxExtra('editor', t)]);
  }
  // Campos de texto: el menú del navegador. El lienzo de los Lienzos tiene su propio manejo.
  if (t.closest('input, textarea, select, [contenteditable="true"], #cv-viewport, .xd-text')) return;
  // Con teclado (tecla de menú o Mayús+F10) el menú sale junto al elemento con el foco.
  let { clientX: x, clientY: y } = e;
  if (!x && !y) {
    const r = t.getBoundingClientRect();
    x = r.left + 12;
    y = r.bottom;
  }
  const show = (items) => {
    e.preventDefault();
    showMenuAt(x, y, items);
  };

  // Dibujo
  if (t.closest('#draw-canvas')) {
    // Como en Excalidraw: el clic derecho elige lo que hay debajo (o nada, sobre el fondo).
    const hit = xdHitElement(xdPoint(e));
    if (hit && !xd.selected.has(hit.id)) xdSelect(xdGroupMembers(hit));
    else if (!hit) xdSelect([]);
    const sel = xdSelectedEls();
    return show(
      sel.length
        ? [
            { label: 'Duplicar', kbd: 'Ctrl+D', action: xdDuplicate },
            { label: 'Copiar', kbd: 'Ctrl+C', action: () => navigator.clipboard?.writeText(xdCopySelection()).catch(() => {}) },
            ...(sel.length > 1 ? [{ label: 'Agrupar', kbd: 'Ctrl+G', action: () => xdGroup(true) }] : []),
            ...(sel.some((x) => x.groupIds?.length) ? [{ label: 'Desagrupar', kbd: 'Ctrl+Mayús+G', action: () => xdGroup(false) }] : []),
            { sep: true },
            { label: 'Traer al frente', kbd: 'Ctrl+Mayús+]', action: () => xdReorder('front') },
            { label: 'Enviar al fondo', kbd: 'Ctrl+Mayús+[', action: () => xdReorder('back') },
            { sep: true },
            { label: 'Borrar', kbd: 'Supr', danger: true, action: () => xdMutate(() => xdDelete(sel.map((x) => x.id))) },
          ]
        : [
            ...(xd.clipboard ? [{ label: 'Pegar', kbd: 'Ctrl+V', action: () => xdPasteElements(xd.clipboard) }] : []),
            { label: 'Seleccionar todo', kbd: 'Ctrl+A', action: () => xdSelect(xdLive().filter((x) => !x.containerId).map((x) => x.id)) },
            { label: 'Encajar todo', kbd: 'Mayús+1', action: xdFit },
            { label: `${xd.grid ? '✓ ' : ''}Cuadrícula`, kbd: "Ctrl+'", action: () => ((xd.grid = !xd.grid), xdScheduleRender()) },
            { label: 'Deshacer', kbd: 'Ctrl+Z', disabled: !xd.history.length, action: xdUndo },
          ]
    );
  }

  // Tareas (lista, tablero, mes, agenda, proyectos, hoy…)
  const taskEl = t.closest('.task[data-id], .kcard[data-id], .mg-chip[data-id], .dv-block.task[data-id], .dv-ut[data-id]');
  if (taskEl) {
    const task = findAnyTask(taskEl.dataset.id);
    if (task) {
      hideDvPop();
      return show(taskMenuItems(task));
    }
  }

  // Ficha [[tarea:…]], [[proyecto:…]]… y cosas con «Relacionado» (proyecto, idea, hábito: 60-relaciones.js)
  const elink = t.closest('a.elink');
  if (elink) return show(elinkMenuItems(elink));
  const relEl = t.closest('[data-rel-type][data-rel-id]');
  if (relEl) {
    const items = relCtxItems(relEl.dataset.relType, relEl.dataset.relId);
    if (items.length) return show(items);
  }

  // Día del calendario
  const day = t.closest('.mg-day[data-key]');
  if (day) {
    const key = day.dataset.key;
    return show([
      { label: '🕒 Abrir la agenda del día', action: () => openDayView(key) },
      { label: '＋ Nueva tarea este día…', action: () => {
        openDayView(key);
        $('#dv-add-text').focus();
      } },
      ...(cal.mcp && key >= dateKey() ? [{ label: '🎯 Reservar tiempo en Google Calendar…', action: () => openSchedule({ minutes: 60, date: key }) }] : []),
    ]);
  }
  // Hueco libre de la agenda del día
  if (t.closest('#dv-grid .dv-lane') && !t.closest('.dv-block')) {
    const lane = t.closest('.dv-lane').getBoundingClientRect();
    const min = Math.floor(((y - lane.top) / DV_HOUR) * 2) * 30;
    return show([{ label: `＋ Nueva tarea a las ${hm(min)}`, action: () => dvStartCreate(min) }]);
  }

  // Explorador de archivos
  const fileRow = t.closest('.tree-row.file[data-id]');
  if (fileRow) {
    const note = noteById(fileRow.dataset.id);
    if (note) return show(treeNoteItems(note));
  }
  const folderRow = t.closest('.tree-row.folder');
  if (folderRow?.title) return show([...folderMenuItems(folderRow.title), ...ctxExtra('folder', folderRow.title)]);
  if (t.closest('#file-tree')) {
    return show([
      { label: 'Nueva nota', kbd: 'Ctrl+N', action: () => createNote({}) },
      { label: 'Nueva carpeta', action: () => $('#new-folder').click() },
    ]);
  }

  // Pestañas
  const tabEl = t.closest('.ws-tab');
  if (tabEl) {
    const i = [...$$('#ws-tabs .ws-tab')].indexOf(tabEl);
    if (i >= 0) return show(tabMenuItems(i));
  }

  // Barra de la izquierda
  const rib = t.closest('.rib[data-view]');
  if (rib) {
    const view = rib.dataset.view;
    return show([
      { label: 'Abrir', action: () => showView(view) },
      ...(isOpenInTab({ type: 'view', view }) ? [] : [{ label: 'Abrir en pestaña nueva', kbd: 'Ctrl+clic', action: () => showView(view, { newTab: true }) }]),
    ]);
  }

  // Enlaces e imágenes dentro de una nota
  const link = t.closest('a.wikilink');
  if (link && t.closest('#note-reading, #rp-backlinks, .embed')) {
    const target = link.dataset.target;
    return show([
      { label: 'Abrir', action: () => openNoteByLink(target, { heading: link.dataset.heading, fromNote: activeNote() }) },
      { label: 'Abrir en pestaña nueva', kbd: 'Ctrl+clic', action: () => openNoteByLink(target, { heading: link.dataset.heading, newTab: true, fromNote: activeNote() }) },
      { label: 'Copiar enlace', action: () => copyText(`[[${target}${link.dataset.heading ? `#${link.dataset.heading}` : ''}]]`, 'Enlace copiado') },
    ]);
  }
  const ext = t.closest('a.external');
  if (ext) return; // enlaces web: el menú del navegador (abrir en otra pestaña, copiar…)
  const img = t.closest('#note-reading img.note-img');
  if (img) {
    const id = img.dataset.img;
    return show([
      ...(id && xdDrawingIds.has(id) ? [{ label: '✏️ Editar el dibujo', action: () => openDrawingFile(id) }] : []),
      ...(img.src ? [{ label: 'Ver en grande', action: () => {
        $('#image-viewer-img').src = img.src;
        $('#image-viewer-img').alt = img.alt;
        $('#image-viewer-caption').textContent = img.alt;
        $('#image-viewer').hidden = false;
        $('#image-viewer-close').focus();
        updateViewerEdit(img);
      } }] : []),
      ...(id && typeof extractImageText === 'function' && typeof aiReady === 'function' && aiReady() ? [{ label: '📝 Sacar el texto (Claude)', action: () => extractImageText(id) }] : []),
    ]);
  }

  // La nota abierta (lectura)
  const note = activeNote();
  if (note && t.closest('#note-reading, .note-inner')) return show(readingItems(e, note));
});

// Teclado dentro de un menú abierto: flechas para moverse, Enter para elegir, Esc para cerrar.
// Las teclas no siguen hasta la app (el dibujo, la agenda o los atajos generales no deben recibirlas).
$('#note-menu').addEventListener('keydown', (e) => {
  e.stopPropagation();
  const items = [...$$('#note-menu .menu-item:not([disabled])')];
  const i = items.indexOf(document.activeElement);
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const next = i < 0 ? (e.key === 'ArrowDown' ? 0 : items.length - 1) : (i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
    items[next]?.focus();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    hideMenu();
  }
});
