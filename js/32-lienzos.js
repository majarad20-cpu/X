'use strict';

// ---------- Lienzos ----------
// Un espacio infinito con tarjetas (texto en Markdown o notas enteras) unidas por flechas, como
// el Canvas de Obsidian. Se mueve arrastrando el fondo (o con la rueda), se amplía con Ctrl+rueda
// o pellizcando, y las tarjetas se arrastran, se redimensionan y se unen desde sus puntos laterales.
const CANVAS_SIDES = ['top', 'right', 'bottom', 'left'];
const cvSvg = $('#cv-edges'); // capa de flechas (se conserva entre redibujados)
const cv = { id: null, x: 0, y: 0, z: 1, selected: null, editing: null, pointers: new Map(), pinch: null };

const currentCanvas = () => state.canvases.find((c) => c.id === cv.id);

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
  c.cards.push({ id: uid(), type: 'text', x: -140, y: -60, w: 280, h: 120, text: `# ${c.title}\nDoble clic en el fondo para añadir tarjetas. Arrastra desde los puntos de una tarjeta para unirla con otra.` });
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
  const minY = Math.min(...c.cards.map((k) => k.y));
  const maxX = Math.max(...c.cards.map((k) => k.x + k.w));
  const maxY = Math.max(...c.cards.map((k) => k.y + k.h));
  cv.z = Math.min(1.2, Math.max(0.15, Math.min((r.width - 60) / (maxX - minX), (r.height - 60) / (maxY - minY))));
  cv.x = -((minX + maxX) / 2) * cv.z;
  cv.y = -((minY + maxY) / 2) * cv.z;
  applyView();
}

// ---------- Tarjetas ----------
function cardEl(c, k) {
  const node = el('div', { className: `cv-card${k.color ? ` ic-${k.color}` : ''}${cv.selected === k.id ? ' selected' : ''}${k.type === 'note' ? ' is-note' : ''}`, tabIndex: 0, role: 'group' });
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
    const head = el('div', { className: 'cv-note-head' }, ['📝 ', note ? baseName(note.path) : 'Nota borrada']);
    const body = el('div', { className: 'cv-body md' });
    const text = note ? noteText(note) : null;
    body.innerHTML = note ? (text === null ? '<p class="muted">🔒 Nota protegida</p>' : renderMd(text.slice(0, 3000), { noteId: note.id, noTasks: true })) : '<p class="muted">Esta nota ya no existe.</p>';
    node.append(head, body);
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
    if (k.type === 'note') {
      const note = noteById(k.noteId);
      if (note) openNote(note, { newTab: true });
    } else {
      cv.editing = k.id;
      renderCanvasBoard();
    }
  });
  node.addEventListener('focus', () => {
    if (cv.selected !== k.id) selectCard(k.id);
  });
  return node;
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
const SIDE_VEC = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };
function canvasEdgePath(p, ps, q, qs) {
  const d = Math.max(40, Math.hypot(q.x - p.x, q.y - p.y) / 3);
  const [ax, ay] = SIDE_VEC[ps];
  const [bx, by] = qs ? SIDE_VEC[qs] : [0, 0];
  return `M ${p.x} ${p.y} C ${p.x + ax * d} ${p.y + ay * d}, ${q.x + bx * d} ${q.y + by * d}, ${q.x} ${q.y}`;
}

function renderEdges(c) {
  const svg = cvSvg;
  const byId = new Map(c.cards.map((k) => [k.id, k]));
  const ns = 'http://www.w3.org/2000/svg';
  svg.replaceChildren();
  const defs = document.createElementNS(ns, 'defs');
  defs.innerHTML = '<marker id="cv-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"/></marker>';
  svg.append(defs);
  c.edges.forEach((ed) => {
    const a = byId.get(ed.from);
    const b = byId.get(ed.to);
    if (!a || !b) return;
    const [fs, ts] = facingSides(a, b);
    const p = anchor(a, fs);
    const q = anchor(b, ts);
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('class', `cv-edge${cv.selected === ed.id ? ' selected' : ''}`);
    g.dataset.id = ed.id;
    const hit = document.createElementNS(ns, 'path');
    hit.setAttribute('d', canvasEdgePath(p, fs, q, ts));
    hit.setAttribute('class', 'cv-edge-hit');
    const line = document.createElementNS(ns, 'path');
    line.setAttribute('d', canvasEdgePath(p, fs, q, ts));
    line.setAttribute('class', 'cv-edge-line');
    line.setAttribute('marker-end', 'url(#cv-arrow)');
    g.append(hit, line);
    if (ed.label) {
      const t = document.createElementNS(ns, 'text');
      t.setAttribute('x', String((p.x + q.x) / 2));
      t.setAttribute('y', String((p.y + q.y) / 2 - 6));
      t.setAttribute('class', 'cv-edge-label');
      t.textContent = ed.label;
      g.append(t);
    }
    g.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      selectCard(ed.id);
    });
    g.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      promptText({
        placeholder: 'Texto de la flecha (vacío para quitarlo)',
        initial: ed.label || '',
        action: 'Guardar',
        onSubmit: (v) => {
          ed.label = v.trim().slice(0, 60);
          touchCanvas(c);
          renderCanvasBoard();
        },
      });
    });
    svg.append(g);
  });
}

let cvRendering = false;
function renderCanvasBoard() {
  const c = currentCanvas();
  // Al quitar una tarjeta en edición salta su «blur», que pediría otro redibujado a medias.
  if (!c || cvRendering) return;
  cvRendering = true;
  try {
    $('#cv-world').replaceChildren(cvSvg, ...c.cards.map((k) => cardEl(c, k)));
  } finally {
    cvRendering = false;
  }
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
  $('#cv-color').hidden = !card;
  $('#cv-open-note').hidden = !(card && card.type === 'note');
}

// ---------- Interacción ----------
function startCardMove(e, c, k, node) {
  if (e.button > 0 || cv.editing === k.id || e.target.closest('a, input, .cv-dot, .cv-resize')) return;
  e.stopPropagation();
  selectCard(k.id);
  const start = { x: e.clientX, y: e.clientY, kx: k.x, ky: k.y };
  let moved = false;
  const onMove = (ev) => {
    const dx = (ev.clientX - start.x) / cv.z;
    const dy = (ev.clientY - start.y) / cv.z;
    if (!moved && Math.hypot(dx, dy) < 3) return;
    moved = true;
    k.x = Math.round(start.kx + dx);
    k.y = Math.round(start.ky + dy);
    node.style.left = `${k.x}px`;
    node.style.top = `${k.y}px`;
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
    const hit = c.cards.find((o) => k.x < o.x + o.w + 20 && k.x + k.w + 20 > o.x && k.y < o.y + o.h + 20 && k.y + k.h + 20 > o.y);
    if (!hit) return;
    k.x = hit.x + hit.w + 40;
  }
}

function addCanvasCard(c, card, edit = false, { avoid = false } = {}) {
  const k = { id: uid(), w: card.type === 'note' ? 320 : 240, h: card.type === 'note' ? 220 : 100, ...card };
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

$('#cv-add-text').addEventListener('click', () => {
  const c = currentCanvas();
  const p = viewCenter();
  addCanvasCard(c, { type: 'text', x: p.x - 120, y: p.y - 50, text: '' }, true, { avoid: true });
});
$('#cv-add-note').addEventListener('click', () => {
  const c = currentCanvas();
  openPicker({
    placeholder: 'Buscar una nota para añadirla al lienzo',
    items: (q) =>
      state.notes
        .filter((n) => !q || n.path.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 30)
        .map((n) => ({ label: baseName(n.path), detail: folderOf(n.path), action: () => {
          const p = viewCenter();
          addCanvasCard(c, { type: 'note', noteId: n.id, x: p.x - 160, y: p.y - 110 }, false, { avoid: true });
        } })),
  });
});
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
  const note = k && noteById(k.noteId);
  if (note) openNote(note, { newTab: true });
});
$('#cv-color').addEventListener('click', () => {
  const c = currentCanvas();
  const k = c?.cards.find((x) => x.id === cv.selected);
  if (!k) return;
  showMenu(
    $('#cv-color'),
    IDEA_COLORS.map(([color, label]) => ({
      label: `${(k.color || '') === color ? '✓ ' : ''}${label}`,
      action: () => {
        if (color) k.color = color;
        else delete k.color;
        touchCanvas(c);
        renderCanvasBoard();
      },
    }))
  );
});

// Teclado: Supr borra, Enter edita, flechas mueven la tarjeta elegida.
viewport.addEventListener('keydown', (e) => {
  const c = currentCanvas();
  if (!c || cv.editing || e.target.tagName === 'TEXTAREA') return;
  const k = c.cards.find((x) => x.id === cv.selected);
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    deleteSelected();
  } else if (e.key === 'Enter' && k) {
    e.preventDefault();
    if (k.type === 'text') {
      cv.editing = k.id;
      renderCanvasBoard();
    } else {
      const note = noteById(k.noteId);
      if (note) openNote(note, { newTab: true });
    }
  } else if (k && e.key.startsWith('Arrow')) {
    e.preventDefault();
    const step = e.shiftKey ? 50 : 10;
    k.x += e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
    k.y += e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
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
