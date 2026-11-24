'use strict';

// ---------- Todas las vistas en la barra de la izquierda ----------
// La barra de iconos reúne todas las vistas de la app en secciones plegables (index.html):
//   Notas                · explorador, notas periódicas, marcadores, abrir, buscar, etiquetas, buscar en todo
//   Vistas y gráficos    · grafo, grafo local, lienzos, bases, ideas y mapas, mapa y lienzo de la nota,
//                          dibujo y presentación
//   Revisar y consultar  · revisar la bóveda, preguntar a tus notas, bandeja y papelera
//   Planificar · Seguimiento · Pensar · Más · las mismas vistas de los menús de la barra de arriba
// La barra de arriba no cambia: estos botones son accesos directos. Los de una vista llevan
// data-view, así que se marcan como activos igual que los demás (12-notas.js). Los demás llaman
// a la misma función que el botón o el menú original.

Object.assign(ICONS, {
  tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="8" cy="8" r="1.5"/>',
  'graph-local': '<circle cx="12" cy="12" r="3"/><circle cx="5" cy="5" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="18" cy="19" r="2"/><path d="m6.5 6.5 3.4 3.4M17.3 7.3l-3 2.8M16.6 17.6l-2.5-3.4"/>',
  mindmap: '<rect x="9" y="10" width="6" height="4" rx="1"/><rect x="2" y="3" width="5" height="3" rx="1"/><rect x="2" y="18" width="5" height="3" rx="1"/><rect x="17" y="10.5" width="5" height="3" rx="1"/><path d="M7 4.5c2 0 2 5.5 2 7.5M7 19.5c2 0 2-5.5 2-7.5M15 12h2"/>',
  'canvas-note': '<rect x="3" y="3" width="7" height="6" rx="1"/><rect x="14" y="15" width="7" height="6" rx="1"/><rect x="14" y="3" width="7" height="6" rx="1"/><path d="M10 6h4M17.5 9v6"/>',
  slides: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M12 16v4M8 20h8M10 8l4 2-4 2z"/>',
  'search-notes': '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5"/><path d="M14 3v6h6v2"/><circle cx="16.5" cy="16.5" r="3.5"/><path d="m21 21-2-2"/>',
});

const RIB_EXTRA = {
  // Pide una nota abierta; si no la hay, lo avisa.
  withNote(fn) {
    const note = activeNote();
    if (!note) return showToastMessage('Abre una nota primero.');
    if (note.enc) return showToastMessage('Desbloquea la nota primero.');
    return fn(note);
  },
  rightPane(name) {
    panels.rpane = name;
    if (!isNarrow()) panels.right = true;
    savePanels();
    applyPanels();
    if (isNarrow() && !document.body.classList.contains('right-open')) toggleSide('right');
    renderRightPanel();
  },
};

function ribExtraButton({ view, icon, label, title, action, id }) {
  const b = el('button', { className: 'rib', title: title || label, ariaLabel: label }, [ico(icon), el('span', { className: 'rib-label' }, label)]);
  if (id) b.id = id;
  if (view) {
    b.dataset.view = view;
    b.addEventListener('click', (e) => showView(view, { newTab: e.ctrlKey || e.metaKey }));
  } else b.addEventListener('click', (e) => action(e));
  return b;
}

// Acceso directo a un botón que ya existe (en un menú de arriba): hace lo mismo que él.
const ribProxy = (sel, icon, label, title) => {
  const orig = $(sel);
  if (!orig) return null;
  return ribExtraButton({ icon, label, title: title || orig.title || label, action: () => orig.click() });
};

(() => {
  const items = (g) => $(`.ribbon [data-group="${g}"] .rib-gitems`);
  const put = (g, list) => list.filter(Boolean).forEach((b) => items(g)?.append(b));
  const notes = items('notes');
  if (!notes || !items('rib-vistas')) return;

  // Notas: además de lo que ya tiene, la búsqueda, las etiquetas y la búsqueda global.
  put('notes', [
    ribExtraButton({ icon: 'search-notes', label: 'Buscar en las notas', title: 'Buscar en las notas (con operadores: tag:, path:, [propiedad]…)', id: 'rib-lsearch', action: () => { showLeftPane('search'); $('#note-search')?.focus(); } }),
    ribExtraButton({ icon: 'tag', label: 'Etiquetas', title: 'Etiquetas de todas las notas', id: 'rib-tags', action: () => showLeftPane('tags') }),
    ribProxy('#gs-open', 'search', 'Buscar en todo', 'Buscar en todo: notas, tareas, proyectos, ideas… (Ctrl+K)'),
  ]);

  // Vistas y gráficos: grafo, lienzos y bases pasan aquí desde «Notas» (con sus eventos).
  put('rib-vistas', [
    $('#rib-graph'),
    ribExtraButton({ icon: 'graph-local', label: 'Grafo local', title: 'Grafo local de la nota abierta (panel derecho)', id: 'rib-graph-local', action: () => RIB_EXTRA.rightPane('graph') }),
    $('.ribbon [data-view="canvas"]'),
    $('.ribbon [data-view="bases"]'),
    ribExtraButton({ view: 'ideas', icon: 'bulb', label: 'Ideas y mapas', title: 'Ideas y mapas: mapa mental, radial, organigrama, esquema, espina de pescado, proceso, línea de tiempo, matriz, pirámide, mapa conceptual, flujo, Venn, ciclo, embudo y radar' }),
    ribExtraButton({ icon: 'mindmap', label: 'Mapa de la nota', title: 'Crear un mapa mental con los títulos y listas de la nota abierta', id: 'rib-note-map', action: () => RIB_EXTRA.withNote(mapFromNote) }),
    typeof canvasFromLinks === 'function' && ribExtraButton({ icon: 'canvas-note', label: 'Lienzo de la nota', title: 'Crear un lienzo con la nota abierta y sus enlaces', id: 'rib-note-canvas', action: () => RIB_EXTRA.withNote(canvasFromLinks) }),
    typeof openDrawing === 'function' && ribExtraButton({ icon: 'pencil', label: 'Nuevo dibujo', title: 'Nuevo dibujo (pizarra al estilo Excalidraw)', id: 'rib-draw', action: () => openDrawing() }),
    typeof startPresentation === 'function' && ribExtraButton({ icon: 'slides', label: 'Presentar la nota', title: 'Presentar la nota abierta como diapositivas (separadas por «---»)', id: 'rib-present', action: () => RIB_EXTRA.withNote(startPresentation) }),
  ]);

  put('rib-revisar', [
    ribExtraButton({ view: 'revision', icon: 'stethoscope', label: 'Revisar la bóveda', title: 'Revisar la bóveda: estado de todas las notas' }),
    ribExtraButton({ view: 'ask', icon: 'sparkle', label: 'Preguntar', title: 'Preguntar a tus notas' }),
    ribExtraButton({ view: 'inbox', icon: 'inbox', label: 'Bandeja', title: 'Bandeja de entrada' }),
    ribExtraButton({ view: 'trash', icon: 'trash', label: 'Papelera', title: 'Papelera de notas' }),
  ]);

  put('rib-plan', [
    ribExtraButton({ view: 'today', icon: 'sun', label: 'Hoy' }),
    ribProxy('#rib-compass', 'compass', 'Mi brújula'),
    ribExtraButton({ view: 'tasks', icon: 'check', label: 'Tareas' }),
    ribExtraButton({ view: 'projects', icon: 'briefcase', label: 'Proyectos' }),
    ribExtraButton({ view: 'review', icon: 'review', label: 'Revisión semanal' }),
    ribExtraButton({ view: 'plan', icon: 'plan-week', label: 'Planificar semana' }),
  ]);

  put('rib-seguir', [
    ribExtraButton({ view: 'timer', icon: 'timer', label: 'Pomodoro' }),
    ribExtraButton({ view: 'habits', icon: 'flame', label: 'Hábitos' }),
    ribExtraButton({ view: 'progress', icon: 'chart', label: 'Progreso' }),
    ribExtraButton({ view: 'finanzas', icon: 'coin', label: 'Finanzas' }),
  ]);

  put('rib-pensar', [
    ribExtraButton({ view: 'journal', icon: 'book', label: 'Diario' }),
    ribExtraButton({ view: 'stoa', icon: 'pillar', label: 'Estoicismo', title: 'Estoicismo: máxima del día, premeditatio y examen de la noche' }),
  ]);

  put('rib-mas', [
    ribExtraButton({ view: 'shared', icon: 'users', label: 'Listas compartidas' }),
    ribProxy('#rib-palette', 'command', 'Comandos', 'Paleta de comandos (Ctrl+P)'),
    ribExtraButton({ view: 'settings', icon: 'gear', label: 'Ajustes' }),
  ]);

  // Una sección sin botones (por ejemplo, si un módulo no se cargó) no se enseña.
  $$('.ribbon .rib-group').forEach((g) => { g.hidden = !g.querySelector('.rib-gitems > *'); });

  // La bandeja lleva el mismo número que la de arriba.
  const srcBadge = $('.prodbar [data-view="inbox"] .rib-badge');
  const dst = $('.ribbon [data-group="rib-revisar"] [data-view="inbox"]');
  if (srcBadge && dst) {
    const badge = el('span', { className: 'rib-badge', hidden: true });
    dst.append(badge);
    const copy = () => { badge.hidden = srcBadge.hidden; badge.textContent = srcBadge.textContent; };
    copy();
    new MutationObserver(copy).observe(srcBadge, { attributes: true, childList: true, characterData: true, subtree: true });
  }

})();
