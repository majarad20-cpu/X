'use strict';

// ---------- Lienzos ----------
// Un espacio infinito con tarjetas (texto en Markdown, notas enteras, imágenes, enlaces web y grupos)
// unidas por flechas, como el Canvas de Obsidian (y compatible con sus archivos .canvas, JSON Canvas 1.0).
// Se mueve arrastrando el fondo (o con la rueda), se amplía con Ctrl+rueda o pellizcando, y las
// tarjetas se arrastran, se redimensionan y se unen desde sus puntos laterales. Todo tiene clic derecho.
const CANVAS_SIDES = ['top', 'right', 'bottom', 'left'];
const cvSvg = $('#cv-edges'); // capa de flechas (se conserva entre redibujados)
const cv = { id: null, x: 0, y: 0, z: 1, selected: null, editing: null, pointers: new Map(), pinch: null, clipboard: null, last: null };

const currentCanvas = () => state.canvases.find((c) => c.id === cv.id);

// Colores de JSON Canvas: «1»–«6» son los preajustes (aquí con nombre, como las ideas); también vale un #hex.
const CV_PRESETS = [
  ['1', 'red', 'Rojo', '#e5484d'],
  ['2', 'orange', 'Naranja', '#f08c00'],
  ['3', 'yellow', 'Amarillo', '#d9a400'],
  ['4', 'green', 'Verde', '#30a46c'],
  ['5', 'teal', 'Cian', '#12a594'],
  ['6', 'purple', 'Morado', '#8e4ec6'],
];
const CV_OLD_HEX = { blue: '#3b82f6', gray: '#8b8d98' }; // colores de antes sin preajuste
const CV_HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const cvHex = (color) => CV_PRESETS.find((p) => p[1] === color)?.[3] || CV_OLD_HEX[color] || (CV_HEX_RE.test(color || '') ? color : null);
const cvColorOut = (color) => CV_PRESETS.find((p) => p[1] === color)?.[0] || cvHex(color);
const cvColorIn = (color) => CV_PRESETS.find((p) => p[0] === String(color ?? ''))?.[1] || (CV_HEX_RE.test(color || '') ? color.toLowerCase() : null);
// Solo enlaces web (nada de javascript:, data:…).
function cvSafeUrl(u) {
  const s = String(u || '').trim();
  if (!s) return null;
  try {
    const x = new URL(/^[a-z][\w+.-]*:/i.test(s) ? s : `https://${s}`);
    return /^https?:$/.test(x.protocol) ? x.href : null;
  } catch {
    return null;
  }
}
// Flechas: por defecto, sin punta al salir y con punta al llegar (como JSON Canvas).
const cvEnds = (ed) => [ed.fromEnd === 'arrow' ? 'arrow' : 'none', ed.toEnd === 'none' ? 'none' : 'arrow'];

function newCanvas(title) {
  const c = { id: uid(), title: title.slice(0, 80) || 'Lienzo', cards: [], edges: [], createdAt: Date.now(), updatedAt: Date.now() };
  state.canvases.push(c);
  logEvent('map', `Nuevo lienzo: ${c.title}`, { ref: c.id });
  return c;
}

function touchCanvas(c) {
  c.updatedAt = Date.now();
  save();
}

function openCanvas(id) {
  cv.id = id;
  cv.selected = null;
  cv.editing = null;
  showView('canvas');
  renderCanvasView();
  requestAnimationFrame(() => fitCanvas());
}

function renderCanvasView() {
  const c = currentCanvas();
  $('#canvas-list-pane').hidden = !!c;
  $('#canvas-editor').hidden = !c;
  if (!c) {
    cv.id = null;
    renderCanvasList();
    return;
  }
  if (document.activeElement !== $('#canvas-name')) $('#canvas-name').value = c.title;
  renderCanvasBoard();
}

function renderCanvasList() {
  const list = state.canvases.slice().sort((a, b) => b.updatedAt - a.updatedAt);
  $('#canvas-list').replaceChildren(
    ...list.map((c) => {
      const open = el('button', { className: 'card canvas-tile' }, [
        el('strong', {}, c.title),
        el('span', { className: 'muted' }, `${plural(c.cards.length, 'tarjeta', 'tarjetas')} · ${plural(c.edges.length, 'flecha', 'flechas')}`),
        el('span', { className: 'muted' }, new Date(c.updatedAt).toLocaleDateString('es', { day: 'numeric', month: 'short' })),
      ]);
      open.addEventListener('click', () => openCanvas(c.id));
      return open;
    })
  );
  $('#canvas-empty').hidden = list.length > 0;
}

$('#canvas-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const title = $('#canvas-title').value.trim();
  if (!title) return;
  const c = newCanvas(title);
  c.cards.push({ id: uid(), type: 'text', x: -140, y: -60, w: 280, h: 120, text: `# ${c.title}\nDoble clic en el fondo para añadir tarjetas (o clic derecho para más). Arrastra desde los puntos de una tarjeta para unirla con otra.` });
  save();
  e.target.reset();
  openCanvas(c.id);
});
$('#canvas-back').addEventListener('click', () => {
  cv.id = null;
  renderCanvasView();
});
$('#canvas-name').addEventListener('change', (e) => {
  const c = currentCanvas();
  if (!c || !e.target.value.trim()) return;
  c.title = e.target.value.trim().slice(0, 80);
  touchCanvas(c);
});

// ---------- Coordenadas ----------
function viewportRect() {
  return $('#cv-viewport').getBoundingClientRect();
}
function toWorldPoint(clientX, clientY) {
  const r = viewportRect();
  return { x: (clientX - r.left - r.width / 2 - cv.x) / cv.z, y: (clientY - r.top - r.height / 2 - cv.y) / cv.z };
}
function applyView() {
  $('#cv-world').style.transform = `translate(${cv.x}px, ${cv.y}px) scale(${cv.z})`;
  $('#cv-zoom').textContent = `${Math.round(cv.z * 100)} %`;
  $('#cv-viewport').style.backgroundSize = `${24 * cv.z}px ${24 * cv.z}px`;
  $('#cv-viewport').style.backgroundPosition = `calc(50% + ${cv.x}px) calc(50% + ${cv.y}px)`;
}
function zoomAt(clientX, clientY, factor) {
  const before = toWorldPoint(clientX, clientY);
  cv.z = Math.min(2.5, Math.max(0.15, cv.z * factor));
  const r = viewportRect();
  cv.x = clientX - r.left - r.width / 2 - before.x * cv.z;
  cv.y = clientY - r.top - r.height / 2 - before.y * cv.z;
  applyView();
}
function fitCanvas() {
  const c = currentCanvas();
  const r = viewportRect();
  if (!c || !r.width) return;
  if (!c.cards.length) {
    cv.x = 0;
    cv.y = 0;
    cv.z = 1;
    return applyView();
  }
  const minX = Math.min(...c.cards.map((k) => k.x));
  const minY = Math.min(...c.cards.map((k) => k.y - (k.type === 'group' ? 30 : 0)));
  const maxX = Math.max(...c.cards.map((k) => k.x + k.w));
  const maxY = Math.max(...c.cards.map((k) => k.y + k.h));
  cv.z = Math.min(1.2, Math.max(0.15, Math.min((r.width - 60) / (maxX - minX), (r.height - 60) / (maxY - minY))));
  cv.x = -((minX + maxX) / 2) * cv.z;
  cv.y = -((minY + maxY) / 2) * cv.z;
  applyView();
}

// ---------- Tarjetas ----------
// Los grupos van siempre detrás; el resto, en el orden de la lista (el último, delante).
const cvOrdered = (c) => [...c.cards.filter((k) => k.type === 'group'), ...c.cards.filter((k) => k.type !== 'group')];
// Lo que queda entero dentro de un grupo se mueve con él.
const groupChildren = (c, g) => c.cards.filter((o) => o !== g && o.x >= g.x && o.y >= g.y && o.x + o.w <= g.x + g.w && o.y + o.h <= g.y + g.h);

function cardColor(node, color) {
  if (!color) return;
  if (color.startsWith('#')) {
    node.classList.add('cv-hex');
    node.style.setProperty('--cv-c', cvHex(color) || 'transparent');
  } else node.classList.add(`ic-${color}`);
}

function cardEl(c, k) {
  const node = el('div', { className: `cv-card cv-${k.type || 'text'}${cv.selected === k.id ? ' selected' : ''}${k.type === 'note' ? ' is-note' : ''}`, tabIndex: 0, role: 'group' });
  cardColor(node, k.color);
  node.dataset.id = k.id;
  Object.assign(node.style, { left: `${k.x}px`, top: `${k.y}px`, width: `${k.w}px`, height: `${k.h}px` });
  if (cv.editing === k.id && k.type === 'text') {
    const ta = el('textarea', { className: 'cv-edit', value: k.text || '', ariaLabel: 'Texto de la tarjeta (Markdown)' });
    ta.addEventListener('blur', () => {
      k.text = ta.value;
      if (cv.editing === k.id) cv.editing = null;
      touchCanvas(c);
      renderCanvasBoard();
    });
    ta.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') ta.blur();
    });
    ta.addEventListener('pointerdown', (e) => e.stopPropagation());
    node.append(ta);
    setTimeout(() => ta.focus());
  } else if (k.type === 'note') {
    const note = noteById(k.noteId);
    node.ariaLabel = note ? `Nota ${baseName(note.path)}` : 'Nota borrada';
    const head = el('div', { className: 'cv-note-head' }, ['📝 ', note ? baseName(note.path) : 'Nota borrada', k.subpath ? el('span', { className: 'muted' }, ` ${k.subpath}`) : '']);
    const body = el('div', { className: 'cv-body md' });
    const text = note ? noteText(note) : null;
    body.innerHTML = note ? (text === null ? '<p class="muted">🔒 Nota protegida</p>' : renderMd(text.slice(0, 3000), { noteId: note.id, noTasks: true })) : '<p class="muted">Esta nota ya no existe.</p>';
    node.append(head, body);
  } else if (k.type === 'image') {
    node.ariaLabel = `Imagen ${k.name || ''}`.trim();
    const wrap = el('div', { className: 'cv-img-wrap' });
    if (k.imgId) {
      const img = el('img', { className: 'cv-img', alt: k.name || 'Imagen', draggable: false });
      const cached = files.cache.get(k.imgId);
      if (cached) img.src = cached;
      else getFile(k.imgId).then((r) => (r?.data ? (img.src = r.data) : img.replaceWith(el('p', { className: 'muted cv-missing' }, '🖼 Imagen no disponible'))));
      wrap.append(img);
    } else wrap.append(el('p', { className: 'muted cv-missing' }, `🖼 ${k.file || 'Imagen'} (no está en la app)`));
    node.append(wrap);
  } else if (k.type === 'link') {
    // Solo una ficha con el sitio: nunca se carga la página dentro del lienzo.
    const url = cvSafeUrl(k.url);
    let host = k.url || '';
    let title = k.title || '';
    try {
      const u = new URL(url);
      host = u.hostname.replace(/^www\./, '');
      if (!title) title = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '').replace(/[-_]+/g, ' ').replace(/\.\w+$/, '') || host;
    } catch {
      // Dirección rara: se muestra tal cual.
    }
    node.ariaLabel = `Enlace ${host}`;
    const open = url ? el('a', { className: 'chip cv-open', href: url, target: '_blank', rel: 'noopener noreferrer' }, 'Abrir ↗') : el('span', { className: 'muted' }, 'Dirección no válida');
    node.append(
      el('div', { className: 'cv-note-head' }, ['🔗 ', host || 'Enlace']),
      el('div', { className: 'cv-link-body' }, [el('strong', { className: 'cv-link-title' }, title || host), el('span', { className: 'muted cv-link-url' }, k.url || ''), open])
    );
  } else if (k.type === 'group') {
    node.ariaLabel = `Grupo ${k.label || ''}`.trim();
    const label = el('div', { className: 'cv-group-label', title: 'Doble clic para cambiar el nombre' }, k.label || 'Grupo');
    label.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      editCanvasCard(c, k);
    });
    node.append(label);
  } else {
    node.ariaLabel = (k.text || '').split('\n')[0].replace(/^#+\s*/, '') || 'Tarjeta vacía';
    const body = el('div', { className: 'cv-body md' });
    body.innerHTML = (k.text || '').trim() ? renderMd(k.text, { noTasks: true }) : '<p class="muted">Doble clic para escribir</p>';
    node.append(body);
  }
  // Puntos para unir con flechas y asa para cambiar el tamaño.
  CANVAS_SIDES.forEach((side) => {
    const dot = el('span', { className: `cv-dot cv-dot-${side}`, title: 'Arrastra hasta otra tarjeta para unirlas' });
    dot.addEventListener('pointerdown', (e) => startConnect(e, c, k, side));
    node.append(dot);
  });
  const grip = el('span', { className: 'cv-resize', title: 'Cambiar tamaño' });
  grip.addEventListener('pointerdown', (e) => startResize(e, c, k));
  node.append(grip);

  node.addEventListener('pointerdown', (e) => startCardMove(e, c, k, node));
  node.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    if (e.target.closest('a')) return;
    // Doble clic dentro de un grupo: tarjeta nueva en ese sitio.
    if (k.type === 'group') {
      const p = toWorldPoint(e.clientX, e.clientY);
      return addCanvasCard(c, { type: 'text', x: p.x - 100, y: p.y - 40, w: 200, h: 80, text: '' }, true);
    }
    if (k.type === 'note') openCanvasNote(k);
    else editCanvasCard(c, k);
  });
  node.addEventListener('focus', () => {
    if (cv.selected !== k.id) selectCard(k.id);
  });
  return node;
}

function openCanvasNote(k) {
  const note = noteById(k.noteId);
  if (note) openNote(note, { newTab: true, heading: (k.subpath || '').replace(/^#/, '') });
}

function selectCard(id) {
  cv.selected = id;
  $$('#cv-world .cv-card').forEach((n) => n.classList.toggle('selected', n.dataset.id === id));
  $$('#cv-edges .cv-edge').forEach((n) => n.classList.toggle('selected', n.dataset.id === id));
  renderCanvasTools();
}

// ---------- Flechas ----------
function anchor(k, side) {
  return {
    top: { x: k.x + k.w / 2, y: k.y },
    right: { x: k.x + k.w, y: k.y + k.h / 2 },
    bottom: { x: k.x + k.w / 2, y: k.y + k.h },
    left: { x: k.x, y: k.y + k.h / 2 },
  }[side];
}
// El lado de cada tarjeta que mira hacia la otra.
function facingSides(a, b) {
  const dx = b.x + b.w / 2 - (a.x + a.w / 2);
  const dy = b.y + b.h / 2 - (a.y + a.h / 2);
  if (Math.abs(dx) * a.h > Math.abs(dy) * a.w) return dx > 0 ? ['right', 'left'] : ['left', 'right'];
  return dy > 0 ? ['bottom', 'top'] : ['top', 'bottom'];
}
// Los lados fijados (de Obsidian) se respetan; si no, los que se miran.
function edgeSides(ed, a, b) {
  const [fs, ts] = facingSides(a, b);
  return [CANVAS_SIDES.includes(ed.fromSide) ? ed.fromSide : fs, CANVAS_SIDES.includes(ed.toSide) ? ed.toSide : ts];
}
const SIDE_VEC = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };
function edgeControls(p, ps, q, qs) {
  const d = Math.max(40, Math.hypot(q.x - p.x, q.y - p.y) / 3);
  const [ax, ay] = SIDE_VEC[ps];
  const [bx, by] = qs ? SIDE_VEC[qs] : [0, 0];
  return [{ x: p.x + ax * d, y: p.y + ay * d }, { x: q.x + bx * d, y: q.y + by * d }];
}
function canvasEdgePath(p, ps, q, qs) {
  const [a, b] = edgeControls(p, ps, q, qs);
  return `M ${p.x} ${p.y} C ${a.x} ${a.y}, ${b.x} ${b.y}, ${q.x} ${q.y}`;
}

function renderEdges(c) {
  const svg = cvSvg;
  const byId = new Map(c.cards.map((k) => [k.id, k]));
  const ns = 'http://www.w3.org/2000/svg';
  svg.replaceChildren();
  // Una punta por color (las de SVG no heredan el color de la línea).
  const hexes = [...new Set(c.edges.map((ed) => cvHex(ed.color)).filter(Boolean))];
  const defs = document.createElementNS(ns, 'defs');
  defs.innerHTML = [['cv-arrow', 'currentColor'], ...hexes.map((h, i) => [`cv-arrow-${i}`, h])]
    .map(([id, fill]) => `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${fill}"/></marker>`)
    .join('');
  svg.append(defs);
  c.edges.forEach((ed) => {
    const a = byId.get(ed.from);
    const b = byId.get(ed.to);
    if (!a || !b) return;
    const [fs, ts] = edgeSides(ed, a, b);
    const p = anchor(a, fs);
    const q = anchor(b, ts);
    const hex = cvHex(ed.color);
    const mark = `url(#${hex ? `cv-arrow-${hexes.indexOf(hex)}` : 'cv-arrow'})`;
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('class', `cv-edge${cv.selected === ed.id ? ' selected' : ''}`);
    if (hex) g.style.color = hex;
    g.dataset.id = ed.id;
    const hit = document.createElementNS(ns, 'path');
    hit.setAttribute('d', canvasEdgePath(p, fs, q, ts));
    hit.setAttribute('class', 'cv-edge-hit');
    const line = document.createElementNS(ns, 'path');
    line.setAttribute('d', canvasEdgePath(p, fs, q, ts));
    line.setAttribute('class', 'cv-edge-line');
    const [fe, te] = cvEnds(ed);
    if (te === 'arrow') line.setAttribute('marker-end', mark);
    if (fe === 'arrow') line.setAttribute('marker-start', mark);
    g.append(hit, line);
    if (ed.label) {
      // En la mitad de la curva.
      const [k1, k2] = edgeControls(p, fs, q, ts);
      const t = document.createElementNS(ns, 'text');
      t.setAttribute('x', String((p.x + 3 * k1.x + 3 * k2.x + q.x) / 8));
      t.setAttribute('y', String((p.y + 3 * k1.y + 3 * k2.y + q.y) / 8 - 6));
      t.setAttribute('class', 'cv-edge-label');
      t.textContent = ed.label;
      g.append(t);
    }
    g.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      e.stopPropagation();
      selectCard(ed.id);
    });
    g.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      editEdgeLabel(c, ed);
    });
    svg.append(g);
  });
}

function editEdgeLabel(c, ed) {
  promptText({
    placeholder: 'Texto de la flecha',
    initial: ed.label || '',
    action: 'Guardar',
    onSubmit: (v) => {
      ed.label = v.trim().slice(0, 200);
      if (!ed.label) delete ed.label;
      touchCanvas(c);
      renderCanvasBoard();
    },
  });
}

let cvRendering = false;
function renderCanvasBoard() {
  const c = currentCanvas();
  // Al quitar una tarjeta en edición salta su «blur», que pediría otro redibujado a medias.
  if (!c || cvRendering) return;
  cvRendering = true;
  try {
    $('#cv-world').replaceChildren(cvSvg, ...cvOrdered(c).map((k) => cardEl(c, k)));
  } finally {
    cvRendering = false;
  }
  // Las flechas, por encima de los grupos y por debajo de las tarjetas.
  const firstCard = $('#cv-world .cv-card:not(.cv-group)');
  if (firstCard) firstCard.before(cvSvg);
  renderEdges(c);
  applyView();
  renderCanvasTools();
  $('#cv-hint').hidden = c.cards.length > 1;
}

function renderCanvasTools() {
  const c = currentCanvas();
  const card = c?.cards.find((k) => k.id === cv.selected);
  const edge = c?.edges.find((e) => e.id === cv.selected);
  $('#cv-selection').hidden = !card && !edge;
  $('#cv-color').hidden = !card && !edge;
  $('#cv-open-note').hidden = !(card && card.type === 'note');
}

// ---------- Interacción ----------
function startCardMove(e, c, k, node) {
  if (e.button > 0 || cv.editing === k.id || e.target.closest('a, input, .cv-dot, .cv-resize')) return;
  e.stopPropagation();
  selectCard(k.id);
  // Un grupo arrastra lo que tiene dentro.
  const group = k.type === 'group' ? groupChildren(c, k) : [];
  const start = { x: e.clientX, y: e.clientY, list: [k, ...group].map((o) => ({ o, x: o.x, y: o.y })) };
  let moved = false;
  const onMove = (ev) => {
    const dx = (ev.clientX - start.x) / cv.z;
    const dy = (ev.clientY - start.y) / cv.z;
    if (!moved && Math.hypot(dx, dy) < 3) return;
    moved = true;
    for (const s of start.list) {
      s.o.x = Math.round(s.x + dx);
      s.o.y = Math.round(s.y + dy);
      // Un re-render (p. ej. al perder el foco) puede haber cambiado el nodo.
      let n = s.o === k ? node : null;
      if (!n?.isConnected) n = $(`#cv-world .cv-card[data-id="${CSS.escape(s.o.id)}"]`);
      if (s.o === k && n) node = n;
      if (!n) continue;
      n.style.left = `${s.o.x}px`;
      n.style.top = `${s.o.y}px`;
    }
    renderEdges(c);
  };
  const onUp = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    if (moved) touchCanvas(c);
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}

function startResize(e, c, k) {
  e.stopPropagation();
  e.preventDefault();
  const start = { x: e.clientX, y: e.clientY, w: k.w, h: k.h };
  const node = $(`#cv-world .cv-card[data-id="${CSS.escape(k.id)}"]`);
  const onMove = (ev) => {
    k.w = Math.max(140, Math.round(start.w + (ev.clientX - start.x) / cv.z));
    k.h = Math.max(70, Math.round(start.h + (ev.clientY - start.y) / cv.z));
    node.style.width = `${k.w}px`;
    node.style.height = `${k.h}px`;
    renderEdges(c);
  };
  const onUp = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    touchCanvas(c);
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}

function startConnect(e, c, k, side) {
  e.stopPropagation();
  e.preventDefault();
  const svg = cvSvg;
  const ns = 'http://www.w3.org/2000/svg';
  const temp = document.createElementNS(ns, 'path');
  temp.setAttribute('class', 'cv-edge-line cv-edge-temp');
  temp.setAttribute('marker-end', 'url(#cv-arrow)');
  svg.append(temp);
  const from = anchor(k, side);
  let target = null;
  const onMove = (ev) => {
    const q = toWorldPoint(ev.clientX, ev.clientY);
    temp.setAttribute('d', canvasEdgePath(from, side, q, null));
    const hit = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.cv-card');
    const id = hit && hit.dataset.id !== k.id ? hit.dataset.id : null;
    if (id !== target) {
      $$('#cv-world .cv-card.drop-over').forEach((n) => n.classList.remove('drop-over'));
      target = id;
      if (hit && id) hit.classList.add('drop-over');
    }
  };
  const onUp = (ev) => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    temp.remove();
    $$('#cv-world .cv-card.drop-over').forEach((n) => n.classList.remove('drop-over'));
    if (target) {
      if (!c.edges.some((ed) => (ed.from === k.id && ed.to === target) || (ed.from === target && ed.to === k.id))) c.edges.push({ id: uid(), from: k.id, to: target });
    } else {
      // Soltar en el vacío crea una tarjeta nueva ya unida.
      const q = toWorldPoint(ev.clientX, ev.clientY);
      if (Math.hypot(q.x - from.x, q.y - from.y) > 40) {
        const card = { id: uid(), type: 'text', x: Math.round(q.x - 120), y: Math.round(q.y - 50), w: 240, h: 100, text: '' };
        c.cards.push(card);
        c.edges.push({ id: uid(), from: k.id, to: card.id });
        cv.editing = card.id;
        cv.selected = card.id;
      }
    }
    touchCanvas(c);
    renderCanvasBoard();
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}

// Fondo: arrastrar mueve la vista; con dos dedos, se amplía.
const viewport = $('#cv-viewport');
viewport.addEventListener('pointerdown', (e) => {
  cv.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (cv.pointers.size === 2) {
    const [a, b] = [...cv.pointers.values()];
    cv.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: cv.z };
    return;
  }
  if (e.target.closest('.cv-card, .cv-edge') || e.button > 0) return;
  if (cv.selected) selectCard(null);
  const start = { x: e.clientX, y: e.clientY, vx: cv.x, vy: cv.y };
  const onMove = (ev) => {
    if (cv.pinch) return;
    cv.x = start.vx + ev.clientX - start.x;
    cv.y = start.vy + ev.clientY - start.y;
    applyView();
  };
  const onUp = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
});
viewport.addEventListener('pointermove', (e) => {
  cv.last = { x: e.clientX, y: e.clientY };
  if (!cv.pointers.has(e.pointerId)) return;
  cv.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (cv.pinch && cv.pointers.size === 2) {
    const [a, b] = [...cv.pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, (cv.pinch.z * (d / cv.pinch.d)) / cv.z);
  }
});
const endPointer = (e) => {
  cv.pointers.delete(e.pointerId);
  if (cv.pointers.size < 2) cv.pinch = null;
};
viewport.addEventListener('pointerup', endPointer);
viewport.addEventListener('pointercancel', endPointer);
viewport.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0025));
    else {
      cv.x -= e.deltaX;
      cv.y -= e.deltaY;
      applyView();
    }
  },
  { passive: false }
);
viewport.addEventListener('dblclick', (e) => {
  if (e.target.closest('.cv-card, .cv-edge')) return;
  const c = currentCanvas();
  if (!c) return;
  const p = toWorldPoint(e.clientX, e.clientY);
  addCanvasCard(c, { type: 'text', x: p.x - 120, y: p.y - 50, text: '' }, true);
});

// Si el sitio está ocupado, la tarjeta nueva se coloca a la derecha de lo que estorba.
function freeSpot(c, k) {
  for (let i = 0; i < 30; i++) {
    const hit = c.cards.find((o) => o.type !== 'group' && k.x < o.x + o.w + 20 && k.x + k.w + 20 > o.x && k.y < o.y + o.h + 20 && k.y + k.h + 20 > o.y);
    if (!hit) return;
    k.x = hit.x + hit.w + 40;
  }
}

const CV_SIZE = { note: [320, 220], link: [300, 130], group: [520, 360], image: [280, 200] };
function addCanvasCard(c, card, edit = false, { avoid = false } = {}) {
  const [w, h] = CV_SIZE[card.type] || [240, 100];
  const k = { w, h, ...card, id: uid() };
  k.x = Math.round(k.x);
  k.y = Math.round(k.y);
  if (avoid) freeSpot(c, k);
  c.cards.push(k);
  cv.selected = k.id;
  cv.editing = edit ? k.id : null;
  touchCanvas(c);
  renderCanvasBoard();
  return k;
}

function viewCenter() {
  const r = viewportRect();
  return toWorldPoint(r.left + r.width / 2, r.top + r.height / 2);
}
// Dónde poner lo pegado: bajo el ratón si está en el lienzo, si no en el centro.
function pastePoint() {
  const r = viewportRect();
  const l = cv.last;
  return l && l.x >= r.left && l.x <= r.right && l.y >= r.top && l.y <= r.bottom ? toWorldPoint(l.x, l.y) : viewCenter();
}

// ---------- Tipos de tarjeta ----------
function pickCanvasNote(c, p, k = null) {
  openPicker({
    placeholder: k ? 'Elegir otra nota para esta tarjeta' : 'Buscar una nota para añadirla al lienzo',
    items: (q) =>
      state.notes
        .filter((n) => !q || n.path.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 30)
        .map((n) => ({ label: baseName(n.path), detail: folderOf(n.path), action: () => {
          if (k) {
            k.noteId = n.id;
            delete k.subpath;
            touchCanvas(c);
            return renderCanvasBoard();
          }
          const at = p || viewCenter();
          addCanvasCard(c, { type: 'note', noteId: n.id, x: at.x - 160, y: at.y - 110 }, false, { avoid: !p });
        } })),
  });
}

// Guarda la imagen como las de las notas (img:ID) y devuelve su registro.
async function storeCanvasImage(file) {
  const { data, type, width, height } = await compressImage(file);
  const rec = { id: uid(), name: imageName(file), type, data, width, height, createdAt: Date.now() };
  if (!(await putFile(rec))) throw new Error('no se pudo guardar');
  scheduleFilesSync();
  return rec;
}
const imageCardSize = (rec, w = 280) => [w, Math.round(Math.min(640, Math.max(80, (w * (rec.height || 1)) / (rec.width || 1))))];

async function addCanvasImageFile(c, file, p, k = null) {
  if (!file?.type?.startsWith('image/')) return null;
  try {
    const rec = await storeCanvasImage(file);
    if (k) {
      Object.assign(k, { type: 'image', imgId: rec.id, name: rec.name });
      [, k.h] = imageCardSize(rec, k.w);
      delete k.file;
      touchCanvas(c);
      renderCanvasBoard();
      return k;
    }
    const [w, h] = imageCardSize(rec);
    const at = p || viewCenter();
    return addCanvasCard(c, { type: 'image', imgId: rec.id, name: rec.name, x: at.x - w / 2, y: at.y - h / 2, w, h }, false, { avoid: !p });
  } catch {
    showToastMessage('No se pudo añadir la imagen.');
    return null;
  }
}

function pickCanvasImage(c, p, k = null) {
  const input = el('input', { type: 'file', accept: 'image/*', hidden: true, className: 'cv-file-input' });
  input.addEventListener('change', () => {
    const f = input.files[0];
    input.remove();
    if (f) addCanvasImageFile(c, f, p, k);
  });
  document.body.append(input);
  input.click();
}

function promptCanvasLink(c, p, k = null) {
  promptText({
    placeholder: 'Dirección web (https://…)',
    initial: k?.url || '',
    action: k ? 'Guardar' : 'Añadir enlace',
    onSubmit: (v) => {
      const url = cvSafeUrl(v);
      if (!url) return showToastMessage('Esa dirección no vale: tiene que ser una web (http o https).');
      if (k) {
        k.url = url;
        touchCanvas(c);
        return renderCanvasBoard();
      }
      const at = p || viewCenter();
      addCanvasCard(c, { type: 'link', url, x: at.x - 150, y: at.y - 65 }, false, { avoid: !p });
    },
  });
}

function addCanvasGroup(c, p) {
  const at = p || viewCenter();
  const g = addCanvasCard(c, { type: 'group', label: 'Grupo', x: at.x - 260, y: at.y - 180 });
  editCanvasCard(c, g);
  return g;
}

// «Editar» según el tipo de tarjeta.
function editCanvasCard(c, k) {
  if (k.type === 'note') return pickCanvasNote(c, null, k);
  if (k.type === 'image') return pickCanvasImage(c, null, k);
  if (k.type === 'link') return promptCanvasLink(c, null, k);
  if (k.type === 'group') {
    return promptText({ placeholder: 'Nombre del grupo', initial: k.label || '', action: 'Guardar', onSubmit: (v) => {
      k.label = v.trim().slice(0, 120);
      touchCanvas(c);
      renderCanvasBoard();
    } });
  }
  cv.editing = k.id;
  renderCanvasBoard();
}

function setCanvasColor(c, obj, color) {
  if (color) obj.color = color;
  else delete obj.color;
  touchCanvas(c);
  renderCanvasBoard();
}
function canvasColorItems(c, obj) {
  const cur = obj.color || '';
  return [
    { label: `${cur ? '' : '✓ '}Sin color`, action: () => setCanvasColor(c, obj, '') },
    ...CV_PRESETS.map(([, name, label]) => ({ label: `${cur === name ? '✓ ' : ''}● ${label}`, action: () => setCanvasColor(c, obj, name) })),
    ...(cur && !CV_PRESETS.some((p) => p[1] === cur) ? [{ label: `✓ Otro (${cvHex(cur) || cur})`, disabled: true, action: () => {} }] : []),
  ];
}

const CV_DIRS = [
  ['none', 'arrow', '→ Hacia el destino'],
  ['arrow', 'none', '← Hacia el origen'],
  ['arrow', 'arrow', '↔ En los dos sentidos'],
  ['none', 'none', '— Sin flechas'],
];
function setEdgeEnds(c, ed, fromEnd, toEnd) {
  if (fromEnd === 'arrow') ed.fromEnd = 'arrow';
  else delete ed.fromEnd;
  if (toEnd === 'none') ed.toEnd = 'none';
  else delete ed.toEnd;
  touchCanvas(c);
  renderCanvasBoard();
}

function duplicateCanvasCard(c, k) {
  const clone = (o) => ({ ...JSON.parse(JSON.stringify(o)), id: uid(), x: o.x + 30, y: o.y + 30 });
  const copy = clone(k);
  // Un grupo se duplica con lo que tiene dentro.
  const inner = k.type === 'group' ? groupChildren(c, k).map(clone) : [];
  c.cards.push(copy, ...inner);
  cv.selected = copy.id;
  touchCanvas(c);
  renderCanvasBoard();
  return copy;
}

function reorderCanvasCard(c, k, where) {
  c.cards = c.cards.filter((o) => o !== k);
  if (where === 'front') c.cards.push(k);
  else c.cards.unshift(k);
  touchCanvas(c);
  renderCanvasBoard();
}

function deleteCanvasItem(c, id) {
  cv.selected = id;
  deleteSelected();
}

// Pegar: una tarjeta copiada aquí, imágenes, una dirección web (tarjeta de enlace) o texto.
function pasteCanvasText(c, p, text) {
  const t = text.trim();
  if (!t) return null;
  const url = /^https?:\/\/\S+$/i.test(t) && cvSafeUrl(t);
  if (url) return addCanvasCard(c, { type: 'link', url, x: p.x - 150, y: p.y - 65 });
  return addCanvasCard(c, { type: 'text', text: t, x: p.x - 120, y: p.y - 50 });
}
function pasteCanvasCard(c, p) {
  const k = JSON.parse(JSON.stringify(cv.clipboard));
  return addCanvasCard(c, { ...k, x: p.x - k.w / 2, y: p.y - k.h / 2 });
}
async function pasteCanvas(c, p) {
  if (cv.clipboard) return pasteCanvasCard(c, p);
  let text = '';
  try {
    text = await navigator.clipboard.readText();
  } catch {
    // Sin permiso: Ctrl+V sí funciona.
  }
  if (!text.trim()) return showToastMessage('No hay nada que pegar (prueba con Ctrl+V).');
  return pasteCanvasText(c, p, text);
}
viewport.addEventListener('paste', (e) => {
  const c = currentCanvas();
  if (!c || e.target.closest('textarea, input')) return;
  const p = pastePoint();
  const imgs = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
  e.preventDefault();
  if (imgs.length) return imgs.forEach((f, i) => addCanvasImageFile(c, f, { x: p.x + i * 30, y: p.y + i * 30 }));
  if (cv.clipboard) return pasteCanvasCard(c, p);
  pasteCanvasText(c, p, e.clipboardData?.getData('text/plain') || '');
});
// Si se copia otra cosa fuera del lienzo, lo pegado será eso y no la tarjeta.
document.addEventListener('copy', (e) => {
  if (!e.target.closest?.('#cv-viewport')) cv.clipboard = null;
});
// Arrastrar imágenes desde el equipo.
viewport.addEventListener('dragover', (e) => {
  if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});
viewport.addEventListener('drop', async (e) => {
  const c = currentCanvas();
  const list = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
  if (!c || !list.length) return;
  e.preventDefault();
  const p = toWorldPoint(e.clientX, e.clientY);
  for (const [i, f] of list.entries()) await addCanvasImageFile(c, f, { x: p.x + i * 40, y: p.y + i * 40 });
});

// ---------- Clic derecho ----------
function canvasBackgroundItems(c, p) {
  return [
    { label: '📝 Nueva tarjeta de texto', kbd: 'Doble clic', action: () => addCanvasCard(c, { type: 'text', x: p.x - 120, y: p.y - 50, text: '' }, true) },
    { label: '📄 Nueva nota…', action: () => pickCanvasNote(c, p) },
    { label: '🖼 Nueva imagen…', action: () => pickCanvasImage(c, p) },
    { label: '🔗 Nuevo enlace…', action: () => promptCanvasLink(c, p) },
    { label: '▭ Nuevo grupo', action: () => addCanvasGroup(c, p) },
    { sep: true },
    { label: 'Pegar', kbd: 'Ctrl+V', action: () => pasteCanvas(c, p) },
    { sep: true },
    { label: 'Encajar todo', action: fitCanvas },
    { label: '⤓ Exportar como .canvas', action: () => exportCanvasFile(c) },
  ];
}
function canvasCardItems(c, k, at) {
  const url = k.type === 'link' && cvSafeUrl(k.url);
  return [
    { label: 'Color ▸', action: () => showMenu(at, canvasColorItems(c, k)) },
    { label: k.type === 'group' ? '✏️ Cambiar el nombre' : '✏️ Editar', kbd: 'Enter', action: () => editCanvasCard(c, k) },
    ...(k.type === 'note' && noteById(k.noteId) ? [{ label: '📝 Abrir nota', action: () => openCanvasNote(k) }] : []),
    ...(url ? [{ label: 'Abrir enlace ↗', action: () => window.open(url, '_blank', 'noopener,noreferrer') }] : []),
    { sep: true },
    { label: 'Duplicar', kbd: 'Ctrl+D', action: () => duplicateCanvasCard(c, k) },
    { label: 'Copiar', kbd: 'Ctrl+C', action: () => (cv.clipboard = JSON.parse(JSON.stringify(k))) },
    { label: 'Traer al frente', action: () => reorderCanvasCard(c, k, 'front') },
    { label: 'Enviar atrás', action: () => reorderCanvasCard(c, k, 'back') },
    { sep: true },
    { label: 'Eliminar', kbd: 'Supr', danger: true, action: () => deleteCanvasItem(c, k.id) },
  ];
}
function canvasEdgeItems(c, ed, at) {
  const [fe, te] = cvEnds(ed);
  return [
    { label: 'Etiqueta…', kbd: 'Doble clic', action: () => editEdgeLabel(c, ed) },
    ...(ed.label ? [{ label: 'Quitar la etiqueta', action: () => (delete ed.label, touchCanvas(c), renderCanvasBoard()) }] : []),
    { label: 'Color ▸', action: () => showMenu(at, canvasColorItems(c, ed)) },
    { sep: true },
    ...CV_DIRS.map(([f, t, label]) => ({ label: `${fe === f && te === t ? '✓ ' : ''}${label}`, action: () => setEdgeEnds(c, ed, f, t) })),
    { sep: true },
    { label: 'Eliminar', kbd: 'Supr', danger: true, action: () => deleteCanvasItem(c, ed.id) },
  ];
}
viewport.addEventListener('contextmenu', (e) => {
  const c = currentCanvas();
  if (!c || e.target.closest('textarea, input')) return;
  e.preventDefault();
  const cardNode = e.target.closest('.cv-card');
  const edgeNode = e.target.closest('.cv-edge');
  let { clientX: x, clientY: y } = e;
  const keyboard = !x && !y;
  // Con teclado (tecla de menú o Mayús+F10): lo elegido.
  let id = cardNode?.dataset.id || edgeNode?.dataset.id || (keyboard ? cv.selected : null);
  if (keyboard) {
    const r = (id && $(`#cv-world [data-id="${CSS.escape(id)}"]`))?.getBoundingClientRect() || viewportRect();
    x = r.left + Math.min(r.width / 2, 40);
    y = r.top + Math.min(r.height / 2, 40);
  }
  const at = { x, y };
  const k = c.cards.find((o) => o.id === id);
  const ed = !k && c.edges.find((o) => o.id === id);
  if (k || ed) selectCard(id);
  else id = null;
  showMenu(at, k ? canvasCardItems(c, k, at) : ed ? canvasEdgeItems(c, ed, at) : canvasBackgroundItems(c, toWorldPoint(x, y)));
});

// ---------- Barra ----------
$('#cv-add-text').addEventListener('click', () => {
  const c = currentCanvas();
  const p = viewCenter();
  addCanvasCard(c, { type: 'text', x: p.x - 120, y: p.y - 50, text: '' }, true, { avoid: true });
});
$('#cv-add-note').addEventListener('click', () => pickCanvasNote(currentCanvas(), null));
$('#cv-add-image')?.addEventListener('click', () => pickCanvasImage(currentCanvas(), null));
$('#cv-add-link')?.addEventListener('click', () => promptCanvasLink(currentCanvas(), null));
$('#cv-add-group')?.addEventListener('click', () => addCanvasGroup(currentCanvas(), null));
$('#cv-export')?.addEventListener('click', () => currentCanvas() && exportCanvasFile(currentCanvas()));
$('#cv-fit').addEventListener('click', fitCanvas);
$('#cv-zoom-in').addEventListener('click', () => {
  const r = viewportRect();
  zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.2);
});
$('#cv-zoom-out').addEventListener('click', () => {
  const r = viewportRect();
  zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / 1.2);
});

function deleteSelected() {
  const c = currentCanvas();
  if (!c || !cv.selected) return;
  const id = cv.selected;
  withUndo(c.cards.some((k) => k.id === id) ? 'Tarjeta borrada' : 'Flecha borrada', () => {
    c.cards = c.cards.filter((k) => k.id !== id);
    c.edges = c.edges.filter((ed) => ed.id !== id && ed.from !== id && ed.to !== id);
    c.updatedAt = Date.now();
    cv.selected = null;
  });
}
$('#cv-delete').addEventListener('click', deleteSelected);
$('#cv-open-note').addEventListener('click', () => {
  const k = currentCanvas()?.cards.find((x) => x.id === cv.selected);
  if (k) openCanvasNote(k);
});
$('#cv-color').addEventListener('click', () => {
  const c = currentCanvas();
  const obj = c?.cards.find((x) => x.id === cv.selected) || c?.edges.find((x) => x.id === cv.selected);
  if (obj) showMenu($('#cv-color'), canvasColorItems(c, obj));
});

// Teclado: Supr borra, Enter edita, flechas mueven la tarjeta elegida, Ctrl+C/D copia y duplica.
viewport.addEventListener('keydown', (e) => {
  const c = currentCanvas();
  if (!c || cv.editing || e.target.tagName === 'TEXTAREA') return;
  const k = c.cards.find((x) => x.id === cv.selected);
  const mod = e.ctrlKey || e.metaKey;
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    deleteSelected();
  } else if (e.key === 'Enter' && k) {
    e.preventDefault();
    if (k.type === 'note') openCanvasNote(k);
    else editCanvasCard(c, k);
  } else if (mod && k && e.key.toLowerCase() === 'c') {
    cv.clipboard = JSON.parse(JSON.stringify(k));
  } else if (mod && k && e.key.toLowerCase() === 'd') {
    e.preventDefault();
    duplicateCanvasCard(c, k);
  } else if (k && e.key.startsWith('Arrow')) {
    e.preventDefault();
    const step = e.shiftKey ? 50 : 10;
    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
    const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
    for (const o of [k, ...(k.type === 'group' ? groupChildren(c, k) : [])]) {
      o.x += dx;
      o.y += dy;
    }
    touchCanvas(c);
    renderCanvasBoard();
    $(`#cv-world .cv-card[data-id="${CSS.escape(k.id)}"]`)?.focus();
  }
});

// Los enlaces dentro de las tarjetas abren su nota.
$('#cv-world').addEventListener('click', (e) => {
  const link = e.target.closest('a.wikilink');
  if (link) {
    e.preventDefault();
    openNoteByLink(link.dataset.target, { heading: link.dataset.heading, newTab: true });
  }
});

// Borrar el lienzo desde su barra.
$('#cv-delete-canvas').addEventListener('click', () => {
  const c = currentCanvas();
  if (!c) return;
  withUndo(`Lienzo «${c.title}» borrado`, () => {
    state.canvases = state.canvases.filter((x) => x.id !== c.id);
    cv.id = null;
  });
});

// ---------- JSON Canvas (.canvas de Obsidian) ----------
// attach(imgId) da la ruta del archivo de una imagen en la bóveda (o null si no está).
const cvAttachPath = (id, rec) => `adjuntos/${id}.${EXT[(rec?.type || '').split(';')[0]] || 'png'}`;
function canvasToJson(c, attach = (id) => cvAttachPath(id)) {
  const nodes = cvOrdered(c).map((k) => {
    const n = { id: k.id, type: 'text', x: Math.round(k.x), y: Math.round(k.y), width: Math.round(k.w), height: Math.round(k.h) };
    const color = cvColorOut(k.color);
    if (color) n.color = color;
    // Lo que no se supo leer al importar vuelve a salir como era.
    if (k.raw) return { ...k.raw, ...n, type: k.raw.type };
    if (k.type === 'note') {
      const note = noteById(k.noteId);
      if (!note) return { ...n, text: '_(Nota borrada)_' };
      return { ...n, type: 'file', file: `${note.path}.md`, ...(k.subpath ? { subpath: k.subpath } : {}) };
    }
    if (k.type === 'image') {
      const file = (k.imgId && attach(k.imgId)) || k.file;
      return file ? { ...n, type: 'file', file } : { ...n, text: '_(Imagen que falta)_' };
    }
    if (k.type === 'link') return { ...n, type: 'link', url: k.url || '' };
    if (k.type === 'group') return { ...n, type: 'group', ...(k.label ? { label: k.label } : {}) };
    return { ...n, text: k.text || '' };
  });
  const byId = new Map(c.cards.map((k) => [k.id, k]));
  const edges = c.edges
    .filter((ed) => byId.has(ed.from) && byId.has(ed.to))
    .map((ed) => {
      const [fromSide, toSide] = edgeSides(ed, byId.get(ed.from), byId.get(ed.to));
      const [fromEnd, toEnd] = cvEnds(ed);
      const out = { id: ed.id, fromNode: ed.from, fromSide, toNode: ed.to, toSide };
      if (fromEnd !== 'none') out.fromEnd = fromEnd;
      if (toEnd !== 'arrow') out.toEnd = toEnd;
      const color = cvColorOut(ed.color);
      if (color) out.color = color;
      if (ed.label) out.label = ed.label;
      return out;
    });
  return { nodes, edges };
}

async function exportCanvasFile(c) {
  const recs = new Map((await allFiles()).map((f) => [f.id, f]));
  const json = canvasToJson(c, (id) => (recs.has(id) ? cvAttachPath(id, recs.get(id)) : null));
  return offerDownload(`${cleanName(c.title) || 'Lienzo'}.canvas`, JSON.stringify(json, null, '\t'), 'application/json');
}

// Busca la nota de un nodo «file» por su ruta en la bóveda.
function cvResolveFile(file) {
  const f = String(file || '').replace(/^\.?\//, '');
  if (!/\.md$/i.test(f)) return null;
  const path = f.replace(/\.md$/i, '').toLowerCase();
  const note = state.notes.find((n) => n.path.toLowerCase() === path) || findNoteByName(path);
  return note ? { noteId: note.id } : null;
}

// Crea un lienzo a partir de un .canvas (texto o JSON ya leído). resolve(file) -> { noteId } | { imgId } | null.
function canvasFromJson(json, title, resolve = cvResolveFile) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (!data || typeof data !== 'object') throw new Error('no es un .canvas');
  const c = newCanvas(String(title || 'Lienzo'));
  const num = (v, d) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Math.round(Number(v)) : d);
  const ids = new Map(); // id del archivo -> id en la app (por si se repiten)
  for (const n of Array.isArray(data.nodes) ? data.nodes : []) {
    if (!n || typeof n !== 'object' || n.id == null) continue;
    const id = ids.has(String(n.id)) ? uid() : String(n.id);
    ids.set(String(n.id), id);
    const k = { id, x: num(n.x, 0), y: num(n.y, 0), w: Math.max(40, num(n.width, 240)), h: Math.max(30, num(n.height, 100)) };
    const color = cvColorIn(n.color);
    if (color) k.color = color;
    const file = String(n.file || '');
    const r = n.type === 'file' ? resolve(file) : null;
    if (n.type === 'text') Object.assign(k, { type: 'text', text: String(n.text ?? '') });
    else if (r?.noteId) Object.assign(k, { type: 'note', noteId: r.noteId }, n.subpath ? { subpath: String(n.subpath) } : {});
    else if (r?.imgId) Object.assign(k, { type: 'image', imgId: r.imgId, name: baseName(file).replace(/\.[^.]+$/, '') });
    else if (n.type === 'file' && /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(file)) Object.assign(k, { type: 'image', file });
    else if (n.type === 'link') Object.assign(k, { type: 'link', url: String(n.url || '') });
    else if (n.type === 'group') Object.assign(k, { type: 'group', label: String(n.label || '') });
    else {
      // Un tipo (o archivo) que la app no sabe mostrar: queda como texto con un aviso, y al exportar sale igual.
      const what = n.type === 'file' ? `el archivo «${file}», que no está en la app` : `una tarjeta de tipo «${String(n.type || '?')}» que Enfoque no sabe mostrar`;
      Object.assign(k, { type: 'text', text: `> ⚠️ Del lienzo de Obsidian: ${what}.\n\n${String(n.text || n.label || n.url || file || '')}`.trim(), raw: n });
    }
    c.cards.push(k);
  }
  for (const e of Array.isArray(data.edges) ? data.edges : []) {
    const from = ids.get(String(e?.fromNode));
    const to = ids.get(String(e?.toNode));
    if (!from || !to) continue;
    const ed = { id: e.id != null && !c.edges.some((x) => x.id === String(e.id)) ? String(e.id) : uid(), from, to };
    if (CANVAS_SIDES.includes(e.fromSide)) ed.fromSide = e.fromSide;
    if (CANVAS_SIDES.includes(e.toSide)) ed.toSide = e.toSide;
    if (e.fromEnd === 'arrow') ed.fromEnd = 'arrow';
    if (e.toEnd === 'none') ed.toEnd = 'none';
    const color = cvColorIn(e.color);
    if (color) ed.color = color;
    if (e.label) ed.label = String(e.label).slice(0, 200);
    c.edges.push(ed);
  }
  touchCanvas(c);
  return c;
}

// ---------- Lienzos hechos a partir de notas ----------
// Une con flechas las notas del lienzo que se enlazan entre sí (si es en los dos sentidos, una flecha doble).
function linkNoteCards(c) {
  const byNote = new Map(c.cards.filter((k) => k.type === 'note').map((k) => [k.noteId, k]));
  for (const a of byNote.values()) {
    const note = noteById(a.noteId);
    if (!note || note.enc) continue;
    for (const l of linksIn(note.body)) {
      const b = l.target && byNote.get(findNoteByName(l.target)?.id);
      if (!b || b === a || c.edges.some((ed) => ed.from === a.id && ed.to === b.id)) continue;
      const back = c.edges.find((ed) => ed.from === b.id && ed.to === a.id);
      if (back) back.fromEnd = 'arrow';
      else c.edges.push({ id: uid(), from: a.id, to: b.id });
    }
  }
}

function canvasFromFolder(folder) {
  const pre = `${folder.toLowerCase()}/`;
  const notes = state.notes.filter((n) => n.path.toLowerCase().startsWith(pre)).sort((a, b) => a.path.localeCompare(b.path, 'es'));
  if (!notes.length) return showToastMessage('Esta carpeta no tiene notas.');
  const c = newCanvas(baseName(folder));
  const cols = Math.ceil(Math.sqrt(notes.length));
  notes.forEach((n, i) => c.cards.push({ id: uid(), type: 'note', noteId: n.id, x: (i % cols) * 380, y: Math.floor(i / cols) * 280, w: 320, h: 220 }));
  linkNoteCards(c);
  touchCanvas(c);
  openCanvas(c.id);
  return c;
}

function canvasFromLinks(note) {
  const out = note.enc ? [] : linksIn(note.body).map((l) => l.target && findNoteByName(l.target));
  const others = [...new Set([...out, ...backlinksOf(note).linked.map((x) => x.note)])].filter((n) => n && n.id !== note.id);
  if (!others.length) return showToastMessage('Esta nota no tiene enlaces ni enlaces entrantes.');
  const c = newCanvas(`Enlaces de ${baseName(note.path)}`);
  c.cards.push({ id: uid(), type: 'note', noteId: note.id, x: -160, y: -110, w: 320, h: 220, color: 'purple' });
  const r = Math.max(460, (others.length * 380) / (2 * Math.PI));
  others.forEach((n, i) => {
    const a = (i / others.length) * 2 * Math.PI - Math.PI / 2;
    c.cards.push({ id: uid(), type: 'note', noteId: n.id, x: Math.round(Math.cos(a) * r - 140), y: Math.round(Math.sin(a) * r - 90), w: 280, h: 180 });
  });
  linkNoteCards(c);
  touchCanvas(c);
  openCanvas(c.id);
  return c;
}

NOTE_MENU_EXTRA.push((note) => (note.enc ? null : { label: '🧩 Crear lienzo con sus enlaces', action: () => canvasFromLinks(note) }));
// Clic derecho en el explorador (43-menu-contextual.js lo añade a CTX_MENU_EXTRA).
function canvasCtxItems(kind, x) {
  if (kind === 'folder') return [{ label: '🧩 Crear lienzo con estas notas', action: () => canvasFromFolder(x) }];
  if (kind === 'note' && !x.enc) return [{ label: '🧩 Crear lienzo con sus enlaces', action: () => canvasFromLinks(x) }];
  return [];
}
