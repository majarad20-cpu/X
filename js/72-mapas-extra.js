'use strict';

// ---------- Mapas mentales: lo esencial para hacerlos rápido ----------
// Deshacer/rehacer, arrastrar nodos, color e icono, menú del nodo, escribir el mapa como lista,
// pegar listas, ideas de Claude, plegar todo, diseño a la derecha y pasar el mapa a una nota.
// Datos nuevos en cada nodo (todos opcionales): color (0-5, se hereda en la rama), icon y noteId.

// ---------- Deshacer / rehacer ----------
const mmHist = { id: null, past: [], future: [], last: '', at: 0 };
const mmJson = (map) => JSON.stringify({ nodes: map.nodes, links: map.links || [] });

function mmReset(map) {
  Object.assign(mmHist, { id: map?.id || null, past: [], future: [], last: map ? mmJson(map) : '', at: 0 });
  mmUndoButtons();
}

// Tras cada cambio: guarda cómo estaba antes (lo que se teclea seguido cuenta como un solo paso).
function mmRecord(map) {
  if (mmHist.id !== map.id) return mmReset(map);
  const now = mmJson(map);
  if (now === mmHist.last) return;
  if (Date.now() - mmHist.at > 1000 || !mmHist.past.length) mmHist.past.push(mmHist.last);
  if (mmHist.past.length > 100) mmHist.past.shift();
  mmHist.last = now;
  mmHist.at = Date.now();
  mmHist.future = [];
  mmUndoButtons();
}

function mmStep(dir) {
  const map = currentMap();
  if (!map || mmHist.id !== map.id) return;
  const from = dir < 0 ? mmHist.past : mmHist.future;
  const to = dir < 0 ? mmHist.future : mmHist.past;
  if (!from.length) return;
  to.push(mmJson(map));
  const snap = JSON.parse(from.pop());
  map.nodes = snap.nodes;
  if (snap.links.length) map.links = snap.links;
  else delete map.links;
  mmHist.last = mmJson(map);
  mmHist.at = 0;
  if (!map.nodes.some((n) => n.id === selectedNode)) selectedNode = 'root';
  map.title = map.nodes.find((n) => !n.parent).text;
  map.updatedAt = Date.now();
  save();
  renderMap();
  mmUndoButtons();
}

function mmUndoButtons() {
  if (!$('#mm-undo')) return;
  $('#mm-undo').disabled = !mmHist.past.length;
  $('#mm-redo').disabled = !mmHist.future.length;
}

$('#mm-undo').addEventListener('click', () => mmStep(-1));
$('#mm-redo').addEventListener('click', () => mmStep(1));

// Al abrir otro mapa, el historial empieza de cero.
const mmOpenMap = openMap;
openMap = function openMapWithHistory(id) {
  mmOpenMap(id);
  mmReset(currentMap());
};

// ---------- Utilidades del árbol ----------
const mmNode = (map, id) => map.nodes.find((n) => n.id === id);
function mmDescendants(map, id) {
  const out = new Set();
  const walk = (pid) => childrenOf(map, pid).forEach((c) => {
    out.add(c.id);
    walk(c.id);
  });
  walk(id);
  return out;
}

// Mueve `id` como último hijo de `parentId` (o antes de `beforeId`).
function mmMove(map, id, parentId, beforeId = null) {
  const node = mmNode(map, id);
  if (!node?.parent || id === parentId || mmDescendants(map, id).has(parentId)) return false;
  map.nodes.splice(map.nodes.indexOf(node), 1);
  node.parent = parentId;
  const before = beforeId && mmNode(map, beforeId);
  if (before) map.nodes.splice(map.nodes.indexOf(before), 0, node);
  else {
    // Tras el último hijo de ese padre (o al final).
    const sibs = childrenOf(map, parentId);
    const last = sibs.at(-1);
    map.nodes.splice(last ? map.nodes.indexOf(last) + 1 : map.nodes.length, 0, node);
  }
  mmNode(map, parentId).collapsed = false;
  touchMap(map);
  return true;
}

// Sube o baja el nodo entre sus hermanos.
function mmShift(dir) {
  const map = currentMap();
  const node = map && mmNode(map, selectedNode);
  if (!node?.parent) return;
  const sibs = childrenOf(map, node.parent);
  const i = sibs.indexOf(node);
  const other = sibs[i + dir];
  if (!other) return;
  map.nodes.splice(map.nodes.indexOf(node), 1);
  map.nodes.splice(map.nodes.indexOf(other) + (dir > 0 ? 1 : 0), 0, node);
  touchMap(map);
  renderMap();
}

// ---------- Arrastrar nodos ----------
// Ratón, lápiz o dedo: al mover un nodo más de 6 px aparece una copia que sigue al puntero; al
// soltarlo sobre otro nodo pasa a ser su hijo. Mantener pulsado sin moverse abre el menú del nodo.
let mmDragEnd = 0;
const mmJustDragged = () => Date.now() - mmDragEnd < 300;

function mmNodeExtras(map, n, node) {
  if (n.noteId) {
    const note = noteById(n.noteId);
    const b = el('button', { className: 'mm-link', title: note ? `Abrir la nota «${baseName(note.path)}»` : 'La nota ya no existe', ariaLabel: 'Abrir la nota enlazada' }, '📝');
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (note) openNote(note);
    });
    node.append(b);
  }
  node.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    selectedNode = n.id;
    renderMap();
    showMenu({ x: e.clientX, y: e.clientY }, mmMenuItems());
  });
  node.addEventListener('pointerdown', (e) => mmPointerDown(e, map, n, node));
}

// Arrastrar una idea la mueve libremente por el plano (con todo lo que cuelga de ella) y las líneas
// la siguen. Con Mayús, o desde el menú, se suelta sobre otra idea para cambiarla de rama.
let mmDragActive = false;
function mmPointerDown(e, map, n, node) {
  if (e.button !== 0 || editingNode || e.target.closest('.mm-fold, .mm-link')) return;
  const start = { x: e.clientX, y: e.clientY };
  const reparent = e.shiftKey;
  const base = { dx: n.dx || 0, dy: n.dy || 0 };
  let ghost = null;
  let target = null;
  let dragging = false;
  let frame = 0;
  const press = e.pointerType !== 'mouse' && setTimeout(() => {
    // Pulsación larga sin moverse: menú del nodo (en tablet y móvil).
    cleanup();
    selectedNode = n.id;
    renderMap();
    mmDragEnd = Date.now();
    showMenu({ x: start.x, y: start.y }, mmMenuItems());
  }, 550);
  const move = (ev) => {
    if (!dragging && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 6) return;
    clearTimeout(press);
    if (!n.parent) return; // el tema central se queda; el fondo se arrastra para moverse por el mapa
    dragging = true;
    if (!reparent) {
      // Mover: se redibuja a cada fotograma con el nuevo desplazamiento.
      mmDragActive = true;
      selectedNode = n.id;
      n.dx = Math.round(base.dx + (ev.clientX - start.x) / mapZoom);
      n.dy = Math.round(base.dy + (ev.clientY - start.y) / mapZoom);
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0;
        renderMap();
        $(`#map-nodes [data-id="${n.id}"]`)?.classList.add('mm-moving');
      });
      return;
    }
    if (!ghost) {
      ghost = node.cloneNode(true);
      ghost.classList.add('mm-ghost');
      ghost.style.transform = '';
      document.body.append(ghost);
      node.classList.add('mm-dragging');
    }
    ghost.style.left = `${ev.clientX + 8}px`;
    ghost.style.top = `${ev.clientY + 8}px`;
    const over = document.elementsFromPoint(ev.clientX, ev.clientY).find((x) => x.classList?.contains('mm-node') && !x.classList.contains('mm-ghost'));
    const id = over?.dataset.id;
    const ok = id && id !== n.id && !mmDescendants(map, n.id).has(id);
    if (target && target !== over) target.classList.remove('mm-drop');
    target = ok ? over : null;
    target?.classList.add('mm-drop');
  };
  const cleanup = () => {
    clearTimeout(press);
    cancelAnimationFrame(frame);
    frame = 0;
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', cancel);
    ghost?.remove();
    node.classList.remove('mm-dragging');
    target?.classList.remove('mm-drop');
  };
  const cancel = () => {
    cleanup();
    if (dragging && !reparent) {
      Object.assign(n, base);
      mmDragActive = false;
      renderMap();
    }
  };
  const up = () => {
    const dropOn = target?.dataset.id;
    cleanup();
    if (!dragging) return;
    mmDragEnd = Date.now();
    mmDragActive = false;
    if (!reparent) {
      if (!n.dx) delete n.dx;
      if (!n.dy) delete n.dy;
      touchMap(map);
      renderMap();
      return;
    }
    if (dropOn && mmMove(map, n.id, dropOn)) {
      selectedNode = n.id;
      renderMap();
    }
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', cancel);
}

// Cambiar de rama desde el menú (sin arrastrar): se elige la idea de la que colgará.
function mmPickParent() {
  const map = currentMap();
  const node = map && mmNode(map, selectedNode);
  if (!node?.parent) return;
  const banned = mmDescendants(map, node.id);
  pickFrom('Colgar esta idea de…', map.nodes.filter((x) => x.id !== node.id && x.id !== node.parent && !banned.has(x.id)).map((x) => ({
    label: `${x.icon ? `${x.icon} ` : ''}${x.text}`,
    detail: x.parent ? '' : 'Tema central',
    action: () => {
      delete node.dx;
      delete node.dy;
      if (mmMove(map, node.id, x.id)) renderMap();
    },
  })));
}

// Volver a la colocación automática.
function mmResetPositions(all) {
  const map = currentMap();
  if (!map) return;
  const ids = all ? null : new Set([selectedNode, ...mmDescendants(map, selectedNode)]);
  map.nodes.forEach((x) => {
    if (ids && !ids.has(x.id)) return;
    delete x.dx;
    delete x.dy;
  });
  touchMap(map);
  renderMap();
  if (all) fitMap();
}

// Doble clic en un hueco del plano: idea nueva conectada a la elegida, justo ahí.
$('#map-canvas').addEventListener('dblclick', (e) => {
  if (e.target.closest('.mm-node') || editingNode) return;
  const map = currentMap();
  if (!map || !mapLayout) return;
  const parent = mmNode(map, selectedNode) || mmNode(map, 'root');
  const node = { id: uid(), parent: parent.id, text: 'Nueva idea' };
  map.nodes.push(node);
  parent.collapsed = false;
  selectedNode = node.id;
  const c = $('#map-canvas');
  const centerOf = () => {
    const r = $(`#map-nodes [data-id="${node.id}"]`)?.getBoundingClientRect();
    return r ? [r.left + r.width / 2, r.top + r.height / 2] : null;
  };
  // Sin que el lienzo se desplace solo: se mide dónde cae y se corrige hasta el punto del clic.
  mmDragActive = true;
  try {
    renderMap();
    const at = centerOf();
    if (at) {
      node.dx = Math.round((e.clientX - at[0]) / mapZoom);
      node.dy = Math.round((e.clientY - at[1]) / mapZoom);
    }
    editingNode = node.id;
    touchMap(map);
    renderMap();
    const now = centerOf();
    if (now) {
      c.scrollLeft += now[0] - e.clientX;
      c.scrollTop += now[1] - e.clientY;
    }
  } finally {
    mmDragActive = false;
  }
});

// ---------- Estilo: color e icono ----------
const MM_ICONS = ['⭐', '❗', '❓', '✅', '💡', '🎯', '⚠️', '❤️', '🔥', '📌', '💰', '📅', '👤', '🔗', '🚀', '🧩'];
const MM_COLORS = ['Azul', 'Naranja', 'Verde', 'Amarillo', 'Rosa', 'Verde oscuro'];

function mmSet(fn) {
  const map = currentMap();
  const node = map && mmNode(map, selectedNode);
  if (!node) return;
  fn(node);
  touchMap(map);
  renderMap();
}

function mmStyleMenu(anchor) {
  const map = currentMap();
  const node = map && mmNode(map, selectedNode);
  if (!node) return;
  showMenu(anchor, [
    ...(node.parent ? [
      ...MM_COLORS.map((name, i) => ({ label: `● ${name}${node.color === i ? '  ✓' : ''}`, action: () => mmSet((x) => (x.color = i)) })),
      { label: `○ Color de la rama${Number.isInteger(node.color) ? '' : '  ✓'}`, action: () => mmSet((x) => delete x.color) },
      { sep: true },
    ] : []),
    { label: '😀 Poner icono…', action: () => pickFrom('Icono del nodo…', [
      ...MM_ICONS.map((ic) => ({ label: `${ic}${node.icon === ic ? '  ✓' : ''}`, action: () => mmSet((x) => (x.icon = ic)) })),
      { label: 'Otro (escribe o pega un emoji)…', action: () => promptText({ placeholder: 'Emoji para el nodo', action: 'Poner icono', onSubmit: (q) => mmSet((x) => (x.icon = [...q.trim()].slice(0, 2).join(''))) }) },
    ]) },
    ...(node.icon ? [{ label: '✕ Quitar icono', action: () => mmSet((x) => delete x.icon) }] : []),
  ]);
}
$('#mm-style').addEventListener('click', (e) => mmStyleMenu(e.currentTarget));

// ---------- Menú del nodo ----------
function mmMenuItems() {
  const map = currentMap();
  const node = map && mmNode(map, selectedNode);
  if (!node) return [];
  const isRoot = !node.parent;
  const kids = childrenOf(map, node.id).length;
  const note = node.noteId && noteById(node.noteId);
  return [
    { label: '＋ Nueva idea conectada', kbd: 'Tab', action: () => addNode('child') },
    { label: '✏️ Editar texto', kbd: 'F2', action: startNodeEdit },
    { label: '🎨 Color e icono…', action: () => mmStyleMenu({ x: innerWidth / 2 - 100, y: 140 }) },
    ...(aiReady() ? [{ label: '✨ Ideas de Claude para esta rama', action: mmAiIdeas }] : []),
    { sep: true },
    ...(isRoot ? [] : [
      { label: '↪ Colgar de otra idea…', kbd: 'Mayús+arrastrar', action: mmPickParent },
      ...(node.dx || node.dy ? [{ label: '↺ Volver a su sitio', action: () => mmResetPositions(false) }] : []),
      { label: '⬆ Subir', kbd: 'Alt+↑', action: () => mmShift(-1) },
      { label: '⬇ Bajar', kbd: 'Alt+↓', action: () => mmShift(1) },
    ]),
    ...(kids ? [{ label: node.collapsed ? '▸ Desplegar rama' : '▾ Plegar rama', action: () => mmSet((x) => (x.collapsed = !x.collapsed)) }] : []),
    { sep: true },
    note ? { label: `📝 Abrir «${baseName(note.path)}»`, action: () => openNote(note) } : { label: '📝 Crear nota de este nodo', action: () => mmNodeToNote(node) },
    { label: '🔗 Enlazar con una nota…', action: () => mmLinkNote(node) },
    ...(note ? [{ label: '✕ Quitar enlace a la nota', action: () => mmSet((x) => delete x.noteId) }] : []),
    { label: '→ Tarea', action: () => {
      addTask(node.text);
      showToastMessage(`Tarea creada: ${node.text}`);
    } },
    ...(isRoot ? [] : [{ sep: true }, { label: '🗑 Borrar', kbd: 'Supr', danger: true, action: deleteNode }]),
  ];
}
$('#mm-more').addEventListener('click', (e) => {
  const map = currentMap();
  if (!map) return;
  showMenu(e.currentTarget, [
    { label: '↺ Colocar todo automáticamente', disabled: !map.nodes.some((x) => x.dx || x.dy), action: () => mmResetPositions(true) },
    { sep: true },
    { label: '▾ Plegar todas las ramas', action: () => mmFoldAll(true) },
    { label: '▸ Desplegar todo', action: () => mmFoldAll(false) },
    { sep: true },
    { label: `⇆ Ramas a los dos lados${map.layout === 'right' ? '' : '  ✓'}`, action: () => mmLayout(null) },
    { label: `→ Ramas solo a la derecha${map.layout === 'right' ? '  ✓' : ''}`, action: () => mmLayout('right') },
    { sep: true },
    { label: '📝 Pasar el mapa a una nota (lista)', action: () => mmMapToNote(map) },
    { label: '📋 Copiar como lista', action: () => copyText(mmOutline(map), 'Mapa copiado como lista') },
    { label: '🖼 Descargar imagen', action: exportMap },
  ]);
});

function mmFoldAll(fold) {
  const map = currentMap();
  map.nodes.forEach((n) => {
    if (n.parent && childrenOf(map, n.id).length) n.collapsed = fold;
  });
  touchMap(map);
  renderMap();
  fitMap();
}

function mmLayout(layout) {
  const map = currentMap();
  if (layout) map.layout = layout;
  else delete map.layout;
  map.updatedAt = Date.now();
  save();
  renderMap();
  fitMap();
}

// ---------- Lista con sangrías ↔ mapa ----------
function mmOutline(map, id = mmNode(map, 'root') ? 'root' : map.nodes.find((n) => !n.parent).id, depth = 0) {
  const n = mmNode(map, id);
  const line = `${'  '.repeat(depth)}${depth ? '- ' : ''}${n.icon ? `${n.icon} ` : ''}${n.text}`;
  return [line, ...childrenOf(map, id).map((c) => mmOutline(map, c.id, depth + 1))].join('\n');
}

// Líneas con sangría (espacios o tabuladores) → [{ depth, text }]. Quita viñetas y números.
function mmParseLines(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim());
  const indents = [...new Set(lines.map((l) => l.match(/^[ \t]*/)[0].replace(/\t/g, '    ').length))].sort((a, b) => a - b);
  return lines.map((l) => ({
    depth: indents.indexOf(l.match(/^[ \t]*/)[0].replace(/\t/g, '    ').length),
    text: l.trim().replace(/^(?:[-*+•·]|\d+[.)])\s+/, '').replace(/^\[[ xX]\]\s+/, '').slice(0, 120),
  })).filter((x) => x.text);
}

// Añade las líneas como ramas de `parentId` respetando la sangría.
function mmAddLines(map, parentId, items) {
  const stack = [{ depth: -1, id: parentId }];
  let first = null;
  items.forEach(({ depth, text, icon }) => {
    while (stack.length > 1 && stack.at(-1).depth >= depth) stack.pop();
    const node = { id: uid(), parent: stack.at(-1).id, text, ...(icon ? { icon } : {}) };
    map.nodes.push(node);
    first ||= node;
    stack.push({ depth, id: node.id });
  });
  mmNode(map, parentId).collapsed = false;
  return first;
}

// Editor de lista: todo el mapa como texto; al guardar se rehace conservando lo que coincide.
function mmOpenOutline() {
  const map = currentMap();
  if (!map) return;
  const back = el('div', { className: 'modal-back', role: 'dialog', ariaLabel: 'Escribir el mapa como lista' });
  const ta = el('textarea', { className: 'notes mm-outline', rows: 18, value: mmOutline(map), spellcheck: true, ariaLabel: 'Mapa como lista' });
  const ok = el('button', { className: 'primary' }, 'Aplicar al mapa');
  const cancel = el('button', {}, 'Cancelar');
  const close = () => back.remove();
  ta.addEventListener('keydown', (e) => {
    // Tab / Mayús+Tab sangran o quitan sangría a las líneas elegidas.
    if (e.key === 'Tab') {
      e.preventDefault();
      const { selectionStart: s, selectionEnd: f, value } = ta;
      const a = value.lastIndexOf('\n', s - 1) + 1;
      const block = value.slice(a, f);
      const next = e.shiftKey ? block.replace(/^ {1,2}/gm, '') : block.replace(/^/gm, '  ');
      ta.setRangeText(next, a, f, 'select');
      if (!e.shiftKey && s === f) ta.setSelectionRange(s + 2, s + 2);
    } else if (e.key === 'Escape') close();
    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) ok.click();
  });
  ok.addEventListener('click', () => {
    const items = mmParseLines(ta.value);
    if (!items.length) return close();
    const [head, ...rest] = items;
    const old = map.nodes;
    const root = old.find((n) => !n.parent);
    const used = new Set([root.id]);
    // Se reutiliza el nodo con el mismo texto bajo el mismo padre (conserva color, icono, nota…).
    const reuse = (parentId, text) => old.find((n) => !used.has(n.id) && n.parent === parentId && n.text === text) || old.find((n) => !used.has(n.id) && n.parent && n.text === text);
    const nodes = [{ ...root, text: head.text.replace(/^\p{Extended_Pictographic}️?\s+/u, '') || root.text }];
    const stack = [{ depth: head.depth, id: root.id }];
    rest.forEach(({ depth, text }) => {
      while (stack.length > 1 && stack.at(-1).depth >= depth) stack.pop();
      const parent = stack.at(-1).id;
      let icon;
      const m = text.match(/^(\p{Extended_Pictographic}️?)\s+(.*)$/u);
      if (m) [icon, text] = [m[1], m[2]];
      const prev = reuse(parent, text);
      const node = prev ? { ...prev, parent, text } : { id: uid(), parent, text };
      if (prev) used.add(prev.id);
      if (icon) node.icon = icon;
      else if (m === null && prev?.icon) delete node.icon;
      nodes.push(node);
      stack.push({ depth, id: node.id });
    });
    map.nodes = nodes;
    if (!nodes.some((n) => n.id === selectedNode)) selectedNode = root.id;
    touchMap(map);
    close();
    renderMap();
    fitMap();
  });
  cancel.addEventListener('click', close);
  back.addEventListener('click', (e) => e.target === back && close());
  back.append(el('div', { className: 'modal mm-outline-modal' }, [
    el('h3', {}, '☰ Escribir el mapa como lista'),
    el('p', { className: 'muted' }, 'La primera línea es el tema central. Cada sangría (Tab o dos espacios) es un nivel más. Puedes empezar una línea con un emoji como icono.'),
    ta,
    el('div', { className: 'row' }, [ok, cancel, el('span', { className: 'muted' }, 'Ctrl+Enter aplica')]),
  ]));
  document.body.append(back);
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
}
$('#mm-outline').addEventListener('click', mmOpenOutline);

// Pegar una lista con el mapa activo: cada línea es una rama del nodo elegido (con sus niveles).
$('#map-canvas').addEventListener('paste', (e) => {
  if (editingNode || e.target !== $('#map-canvas')) return;
  const text = e.clipboardData?.getData('text/plain') || '';
  const items = mmParseLines(text);
  if (!items.length) return;
  e.preventDefault();
  const map = currentMap();
  const first = mmAddLines(map, selectedNode, items);
  touchMap(map);
  if (first) selectedNode = first.id;
  renderMap();
  showToastMessage(`${plural(items.length, 'rama añadida', 'ramas añadidas')} desde el portapapeles`);
});

// ---------- Notas ----------
function mmNodeToNote(node) {
  const map = currentMap();
  const sub = { ...map, nodes: [{ ...node, parent: null }, ...[...mmDescendants(map, node.id)].map((id) => mmNode(map, id))] };
  const body = childrenOf(sub, node.id).map((c) => mmOutline(sub, c.id, 1)).join('\n').replace(/^ {2}/gm, '');
  const note = createNote({ title: node.text.slice(0, 80), body: `# ${node.text}\n\n*Del mapa mental «${map.title}».*\n\n${body}\n`, open: false });
  node.noteId = note.id;
  touchMap(map);
  renderMap();
  openNote(note, { newTab: true });
}

function mmLinkNote(node) {
  pickFrom('Enlazar el nodo con la nota…', state.notes.filter((n) => !n.enc).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 300).map((n) => ({
    label: baseName(n.path),
    detail: folderOf(n.path),
    action: () => mmSet((x) => (x.noteId = n.id)),
  })));
}

function mmMapToNote(map) {
  const body = childrenOf(map, map.nodes.find((n) => !n.parent).id).map((c) => mmOutline(map, c.id, 1)).join('\n').replace(/^ {2}/gm, '');
  const note = createNote({ title: map.title.slice(0, 80), body: `# ${map.title}\n\n${body}\n`, open: false });
  openNote(note, { newTab: true });
  showToastMessage('Nota creada con el mapa como lista');
}

// ---------- Ideas de Claude ----------
async function mmAiIdeas() {
  const map = currentMap();
  const node = map && mmNode(map, selectedNode);
  if (!node || !aiReady()) return;
  const path = [];
  for (let x = node; x; x = x.parent && mmNode(map, x.parent)) path.unshift(x.text);
  const have = childrenOf(map, node.id).map((c) => c.text);
  const btn = $('#mm-ai');
  btn.disabled = true;
  btn.textContent = '✨ Pensando…';
  try {
    const data = await ai.sample.json(`Ayudas a completar un mapa mental en español.
Tema central: «${path[0]}».
Rama en la que estamos: ${path.map((p) => `«${p}»`).join(' › ')}.
${have.length ? `Ya tiene estas subramas (no las repitas): ${have.map((h) => `«${h}»`).join(', ')}.` : 'Aún no tiene subramas.'}
Propón entre 4 y 7 subramas nuevas para «${node.text}»: ideas concretas, distintas entre sí, de 1 a 6 palabras cada una, sin numerar.
Responde solo con JSON: {"ramas": ["…", "…"]}`, { modelTier: 'quick' });
    const ramas = (data?.ramas || []).map((r) => String(r).trim().slice(0, 120)).filter(Boolean).slice(0, 8);
    if (!ramas.length) throw { code: 'empty_completion' };
    mmAddLines(map, node.id, ramas.map((text) => ({ depth: 0, text })));
    touchMap(map);
    renderMap();
    showToastMessage(`Claude añadió ${plural(ramas.length, 'rama', 'ramas')} (Ctrl+Z para deshacer)`);
  } catch (e) {
    if (AI_FATAL.includes(e?.code)) {
      ai.unavailable = true;
      renderAIControls();
    }
    showToastMessage(aiErrorText(e));
  } finally {
    btn.disabled = false;
    btn.textContent = '✨ Ideas';
  }
}
$('#mm-ai').addEventListener('click', mmAiIdeas);

// ---------- Teclado ----------
$('#map-canvas').addEventListener('keydown', (e) => {
  if (editingNode || e.target !== $('#map-canvas')) return;
  const k = e.key.toLowerCase();
  const mod = e.ctrlKey || e.metaKey;
  let fn = null;
  if (mod && k === 'z') fn = () => mmStep(e.shiftKey ? 1 : -1);
  else if (mod && k === 'y') fn = () => mmStep(1);
  else if (e.altKey && e.key === 'ArrowUp') fn = () => mmShift(-1);
  else if (e.altKey && e.key === 'ArrowDown') fn = () => mmShift(1);
  else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) fn = () => {
    const r = $(`#map-nodes [data-id="${selectedNode}"]`)?.getBoundingClientRect();
    if (r) showMenu({ x: r.left + 10, y: r.bottom }, mmMenuItems());
  };
  if (!fn) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  fn();
}, true);

COMMANDS_EXTRA.push(() => (currentMap() && ideaView === 'maps' ? [
  { label: 'Mapa: escribir como lista', action: mmOpenOutline },
  { label: 'Mapa: plegar todas las ramas', action: () => mmFoldAll(true) },
  { label: 'Mapa: desplegar todo', action: () => mmFoldAll(false) },
  { label: 'Mapa: pasar a una nota', action: () => mmMapToNote(currentMap()) },
] : []));
