'use strict';

// ---------- Clic derecho ----------
// Con el botón derecho del ratón (o la tecla de menú, o Mayús+F10) cada cosa muestra sus opciones:
// tareas (en cualquier vista), notas y carpetas del explorador, pestañas, días del calendario,
// enlaces e imágenes de una nota, la nota que se está leyendo, la barra de la izquierda y el dibujo.
// En los campos de texto se deja el menú del navegador (cortar, copiar, pegar, ortografía).

// Muestra el menú en un punto de la pantalla.
function showMenuAt(x, y, items) {
  const list = items.filter(Boolean).filter((it, i, all) => !(it.sep && (i === 0 || i === all.length - 1 || all[i - 1]?.sep)));
  if (!list.length) return;
  showMenu({ getBoundingClientRect: () => ({ bottom: y, right: x, top: y, left: x }) }, list);
  const menu = $('#note-menu');
  menu.classList.add('ctx');
  menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - menu.offsetWidth - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - menu.offsetHeight - 8))}px`;
}

const findAnyTask = (id) => allTasks().find((t) => t.id === id) || noteTasks().find((t) => t.id === id);

function setTaskPriority(t, p) {
  if (t.virtual) {
    editNoteLine(t, (l) => `${l.replace(/\s*!(alta|media|baja)\b/giu, '')}${p === 2 ? '' : ` !${p === 3 ? 'alta' : 'baja'}`}`);
  } else t.priority = p;
  save();
  renderAll();
}

function setTaskDate(t, key) {
  if (t.virtual) {
    editNoteLine(t, (l) => {
      const clean = l.replace(/\s*📅\s*\d{4}-\d{2}-\d{2}/u, '');
      return key ? `${clean} 📅 ${key}` : clean;
    });
  } else {
    t.due = key;
    if (!key) t.time = null;
  }
  save();
  renderAll();
  showToastMessage(key ? `Fecha: ${formatDue(key).toLowerCase()}` : 'Sin fecha');
}

function taskMenuItems(t) {
  const today = dateKey();
  const mon = dateKey(addDays(weekStart(new Date()), 7));
  const items = [];
  if (t.virtual) items.push({ label: '📝 Abrir en su nota', action: () => openNoteAtLine(t.noteId, t.line) }, { label: '📝 Abrir la nota en pestaña nueva', action: () => openNoteAtLine(t.noteId, t.line, { newTab: true }) });
  else items.push({ label: '✏️ Editar', action: () => (showView('tasks'), startEditing(t.id)) });
  items.push(
    { label: t.done ? '↺ Marcar como pendiente' : '✓ Marcar como hecha', action: () => (t.virtual ? toggleNoteTask(t.noteId, t.line, !t.done) : toggleDone(t, !t.done)) },
    ...(!t.done && typeof setStatus === 'function' ? [{ label: statusOf(t) === 'doing' ? '○ Quitar «en curso»' : '◐ Marcar en curso', action: () => setStatus(t, statusOf(t) === 'doing' ? 'todo' : 'doing') }] : []),
    { sep: true },
    { label: `${t.due === today ? '✓ ' : ''}📅 Para hoy`, action: () => setTaskDate(t, today) },
    { label: `${t.due === dateKey(addDays(new Date(), 1)) ? '✓ ' : ''}📅 Para mañana`, action: () => setTaskDate(t, dateKey(addDays(new Date(), 1))) },
    { label: '📅 La próxima semana (lunes)', action: () => setTaskDate(t, mon) },
    ...(t.due ? [{ label: '📅 Quitar la fecha', action: () => setTaskDate(t, null) }] : []),
    { label: '🕒 Abrir en la agenda del día', action: () => openDayView(t.due || today) },
    { sep: true },
    ...[3, 2, 1].map((p) => ({ label: `${t.priority === p ? '● ' : '○ '}Prioridad ${PRIORITY_LABEL[p].toLowerCase()}`, action: () => setTaskPriority(t, p) }))
  );
  if (!t.virtual) {
    items.push({ sep: true });
    if (cal.mcp) items.push({ label: '📅 Agendar en Google Calendar…', action: () => openSchedule({ task: t, minutes: Number(t.duration) || 30 }) });
    items.push(
      { label: '⧉ Duplicar', action: () => {
        const copy = { ...JSON.parse(JSON.stringify(t)), id: uid(), done: false, completedAt: null, createdAt: Date.now(), calEventId: undefined };
        state.tasks.push(copy);
        save();
        renderAll();
        showToastMessage('Tarea duplicada');
      } },
      { label: 'Copiar el título', action: () => copyText(t.title, 'Título copiado') },
      { label: 'Eliminar', danger: true, action: () => withUndo('Tarea borrada', () => {
        state.tasks = state.tasks.filter((x) => x.id !== t.id);
        state.archive = state.archive.filter((x) => x.id !== t.id);
      }) }
    );
  }
  return items;
}

function treeNoteItems(note) {
  return [
    { label: 'Abrir', action: () => openNote(note) },
    { label: 'Abrir en pestaña nueva', kbd: 'Ctrl+clic', action: () => openNote(note, { newTab: true }) },
    { sep: true },
    { label: 'Renombrar…', action: () => promptText({ placeholder: 'Nuevo nombre', initial: baseName(note.path), action: 'Renombrar', onSubmit: (v) => renameNote(note, v) }) },
    { label: 'Mover a carpeta…', action: () => pickFolder(note) },
    ...(note.enc ? [] : [{ label: 'Duplicar', action: () => createNote({ folder: folderOf(note.path), title: `${baseName(note.path)} (copia)`, body: note.body, edit: false }) }]),
    { label: 'Copiar enlace [[…]]', action: () => copyText(`[[${baseName(note.path)}]]`, 'Enlace copiado') },
    ...(cal.mcp && !note.enc ? [{ label: '📄 Exportar a Google Docs', action: () => exportNoteToDocs(note) }] : []),
    { sep: true },
    { label: 'Eliminar nota', danger: true, action: () => deleteNote(note) },
  ];
}

function tabMenuItems(i) {
  const tab = ws.tabs[i];
  const note = tab?.type === 'note' ? noteById(tab.id) : null;
  return [
    ...(note ? [{ label: 'Abrir en pestaña nueva', action: () => openNote(note, { newTab: true }) }] : []),
    { label: 'Cerrar', kbd: 'Ctrl+W', action: () => closeTab(i) },
    { label: 'Cerrar las demás', disabled: ws.tabs.length < 2, action: () => {
      flushNoteSave();
      ws.tabs = [ws.tabs[i]];
      ws.active = 0;
      saveTabs();
      renderAll();
    } },
    { label: 'Cerrar las de la derecha', disabled: i >= ws.tabs.length - 1, action: () => {
      flushNoteSave();
      ws.tabs = ws.tabs.slice(0, i + 1);
      ws.active = Math.min(ws.active, i);
      saveTabs();
      renderAll();
    } },
    ...(note ? [{ sep: true }, { label: 'Copiar enlace [[…]]', action: () => copyText(`[[${baseName(note.path)}]]`, 'Enlace copiado') }] : []),
  ];
}

function readingItems(e, note) {
  const sel = String(window.getSelection() || '').trim();
  const block = e.target.closest('#note-reading > [data-src]');
  const items = [];
  if (sel) items.push({ label: 'Copiar', kbd: 'Ctrl+C', action: () => copyText(sel, 'Copiado') });
  if (block && noteMode.get(note.id) === 'read') items.push({ label: '✏️ Editar este bloque', kbd: 'Doble clic', action: () => {
    const [from, to] = block.dataset.src.split('-').map(Number);
    startBlockEdit(note, from, to, block, null);
  } });
  items.push(
    { label: isEditing(note.id) ? 'Modo lectura' : 'Editar la nota entera', kbd: 'Ctrl+E', action: toggleNoteMode },
    { label: '✏️ Nuevo dibujo…', action: () => openDrawing() },
    ...(typeof noteAIAvailable === 'function' && noteAIAvailable(note) ? [{ label: '✨ Claude en esta nota…', kbd: 'Ctrl+J', action: openNoteAI }] : []),
    { sep: true },
    ...noteMenuItems(note)
  );
  return items;
}

document.addEventListener('contextmenu', (e) => {
  const t = e.target;
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
    const sel = xdSelectedEls();
    return show(
      sel.length
        ? [
            { label: 'Duplicar', kbd: 'Ctrl+D', action: xdDuplicate },
            { label: 'Copiar', kbd: 'Ctrl+C', action: () => (xd.clipboard = JSON.parse(JSON.stringify(sel.flatMap((x) => [x, xdBoundText(x)].filter(Boolean))))) },
            ...(sel.length > 1 ? [{ label: 'Agrupar', kbd: 'Ctrl+G', action: () => xdGroup(true) }] : []),
            ...(sel.some((x) => x.groupIds?.length) ? [{ label: 'Desagrupar', kbd: 'Ctrl+Mayús+G', action: () => xdGroup(false) }] : []),
            { sep: true },
            { label: 'Traer al frente', kbd: 'Ctrl+Mayús+]', action: () => xdReorder('front') },
            { label: 'Enviar al fondo', kbd: 'Ctrl+Mayús+[', action: () => xdReorder('back') },
            { sep: true },
            { label: 'Borrar', kbd: 'Supr', danger: true, action: () => xdMutate(() => xdDelete(sel.map((x) => x.id))) },
          ]
        : [
            ...(xd.clipboard ? [{ label: 'Pegar', kbd: 'Ctrl+V', action: () => document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: new DataTransfer() })) }] : []),
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
      hideDvPop?.();
      return show(taskMenuItems(task));
    }
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
      ...(cal.mcp ? [{ label: '🎯 Reservar tiempo en Google Calendar…', action: () => {
        openSchedule({ minutes: 60 });
        $('#gsched-date').value = key;
        loadFreeSlots();
      } }] : []),
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
  if (folderRow) {
    e.preventDefault();
    folderRow.querySelector('.tree-more')?.click();
    const menu = $('#note-menu');
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - menu.offsetHeight - 8))}px`;
    return;
  }
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
    return show([
      { label: 'Abrir', action: () => showView(rib.dataset.view) },
      { label: 'Abrir en pestaña nueva', kbd: 'Ctrl+clic', action: () => showView(rib.dataset.view, { newTab: true }) },
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
      { label: 'Ver en grande', action: () => {
        $('#image-viewer-img').src = img.src;
        $('#image-viewer-caption').textContent = img.alt;
        $('#image-viewer').hidden = false;
        updateViewerEdit(img);
      } },
      ...(id && typeof extractImageText === 'function' && typeof aiReady === 'function' && aiReady() ? [{ label: '📝 Sacar el texto (Claude)', action: () => extractImageText(id) }] : []),
    ]);
  }

  // La nota abierta (lectura)
  const note = activeNote();
  if (note && t.closest('#note-reading, .note-inner')) return show(readingItems(e, note));
});

// La tecla de menú con una tarea o una fila del explorador enfocada también abre su menú.
$('#note-menu').addEventListener('keydown', (e) => {
  const items = [...$$('#note-menu .menu-item:not([disabled])')];
  const i = items.indexOf(document.activeElement);
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    hideMenu();
  }
});
