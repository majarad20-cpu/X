'use strict';

// ---------- Grafo de notas ----------
// Simulación de fuerzas sencilla: los nodos se repelen, los enlaces actúan como muelles
// y una leve gravedad los mantiene centrados. Se dibuja en un <canvas>.
const GRAPH_OPTS_KEY = 'enfoque:graph';
let graphOpts = { tags: false, ghosts: true, orphans: true, filter: '', depth: 1 };
try {
  graphOpts = { ...graphOpts, ...JSON.parse(localStorage.getItem(GRAPH_OPTS_KEY)) };
} catch {
  // Valores por defecto.
}
const saveGraphOpts = () => {
  try {
    localStorage.setItem(GRAPH_OPTS_KEY, JSON.stringify(graphOpts));
  } catch {
    // Sin almacenamiento.
  }
};

// Repulsión entre todos los pares: exacta con pocos nodos.
function repelExact(nodes, strength) {
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 1) {
        dx = Math.random() - 0.5;
        dy = Math.random() - 0.5;
        d2 = 1;
      }
      if (d2 > 250000) continue;
      const f = strength / d2;
      const d = Math.sqrt(d2);
      a.vx += (dx / d) * f;
      a.vy += (dy / d) * f;
      b.vx -= (dx / d) * f;
      b.vy -= (dy / d) * f;
    }
  }
}

// Con muchos nodos, aproximación de Barnes-Hut: los grupos lejanos empujan como un solo punto
// situado en su centro, así que cada paso cuesta n·log n en vez de n².
function repelApprox(nodes, strength) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
  }
  const size = Math.max(maxX - minX, maxY - minY, 1) + 1;
  const root = { x0: minX, y0: minY, size, mass: 0, cx: 0, cy: 0, body: null, kids: null };
  const insert = (cell, n, depth) => {
    for (;;) {
      cell.cx = (cell.cx * cell.mass + n.x) / (cell.mass + 1);
      cell.cy = (cell.cy * cell.mass + n.y) / (cell.mass + 1);
      cell.mass++;
      if (!cell.kids && !cell.body) {
        cell.body = n;
        return;
      }
      if (!cell.kids) {
        if (depth > 40) return; // puntos casi iguales: se cuentan como masa, sin dividir más
        const half = cell.size / 2;
        cell.kids = [0, 1, 2, 3].map((q) => ({ x0: cell.x0 + (q & 1) * half, y0: cell.y0 + (q >> 1) * half, size: half, mass: 0, cx: 0, cy: 0, body: null, kids: null }));
        const old = cell.body;
        cell.body = null;
        const qo = (old.x >= cell.x0 + half ? 1 : 0) + (old.y >= cell.y0 + half ? 2 : 0);
        const k = cell.kids[qo];
        k.cx = old.x;
        k.cy = old.y;
        k.mass = 1;
        k.body = old;
      }
      const half = cell.size / 2;
      cell = cell.kids[(n.x >= cell.x0 + half ? 1 : 0) + (n.y >= cell.y0 + half ? 2 : 0)];
      depth++;
    }
  };
  for (const n of nodes) insert(root, n, 0);
  const THETA2 = 0.81;
  const stack = [];
  for (const a of nodes) {
    stack.length = 0;
    stack.push(root);
    while (stack.length) {
      const c = stack.pop();
      if (!c.mass || c.body === a) continue;
      let dx = a.x - c.cx;
      let dy = a.y - c.cy;
      let d2 = dx * dx + dy * dy;
      if (c.kids && (c.size * c.size) / Math.max(d2, 1) > THETA2) {
        for (const k of c.kids) stack.push(k);
        continue;
      }
      if (d2 > 250000) continue;
      if (d2 < 1) {
        dx = Math.random() - 0.5;
        dy = Math.random() - 0.5;
        d2 = 1;
      }
      const f = (strength * c.mass) / d2;
      const d = Math.sqrt(d2);
      a.vx += (dx / d) * f;
      a.vy += (dy / d) * f;
    }
  }
}

// Nodos y enlaces a partir de las notas. Con `center`, solo su vecindario hasta `depth` saltos.
function buildGraphData({ center = null, depth = 1, tags = false, ghosts = true, orphans = true, filter = '' } = {}) {
  const nodes = new Map();
  const links = new Map();
  const tops = [...new Set(state.notes.filter((n) => n.path.includes('/')).map((n) => n.path.split('/')[0]))].sort();
  state.notes.forEach((n) => {
    const top = n.path.includes('/') ? n.path.split('/')[0] : '';
    nodes.set(`n:${n.id}`, { id: `n:${n.id}`, kind: 'note', note: n, label: baseName(n.path), group: top ? tops.indexOf(top) % BRANCH_COUNT : -1 });
  });
  const link = (a, b) => {
    if (a === b) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (!links.has(key)) links.set(key, { a, b });
  };
  state.notes.forEach((n) => {
    linksIn(n.body).forEach((l) => {
      // Los enlaces a tareas, proyectos, ideas o hábitos ([[tarea:ID|…]]) no son notas «sin crear».
      if (!l.target || /^(tarea|proyecto|idea|h[aá]bito):/i.test(l.target)) return;
      const t = findNoteByName(l.target);
      if (t) link(`n:${n.id}`, `n:${t.id}`);
      else if (ghosts) {
        const gid = `g:${l.target.toLowerCase()}`;
        if (!nodes.has(gid)) nodes.set(gid, { id: gid, kind: 'ghost', target: l.target, label: baseName(l.target), group: -2 });
        link(`n:${n.id}`, gid);
      }
    });
    if (tags) {
      tagsIn(n.body).forEach((t) => {
        const tid = `t:${t}`;
        if (!nodes.has(tid)) nodes.set(tid, { id: tid, kind: 'tag', tag: t, label: `#${t}`, group: -3 });
        link(`n:${n.id}`, tid);
      });
    }
  });

  let keep = new Set(nodes.keys());
  if (center && nodes.has(center)) {
    keep = new Set([center]);
    let frontier = [center];
    for (let d = 0; d < depth; d++) {
      const next = [];
      links.forEach(({ a, b }) => {
        if (frontier.includes(a) && !keep.has(b)) next.push(b);
        if (frontier.includes(b) && !keep.has(a)) next.push(a);
      });
      next.forEach((x) => keep.add(x));
      frontier = next;
    }
  }
  // El filtro muestra las notas que coinciden y sus vecinas directas.
  if (filter) {
    const f = filter.toLowerCase();
    const hits = new Set([...keep].filter((id) => nodes.get(id).label.toLowerCase().includes(f)));
    const near = new Set(hits);
    links.forEach(({ a, b }) => {
      if (hits.has(a) && keep.has(b)) near.add(b);
      if (hits.has(b) && keep.has(a)) near.add(a);
    });
    keep = near;
  }
  const list = [...links.values()].filter((l) => keep.has(l.a) && keep.has(l.b));
  const degree = new Map();
  list.forEach((l) => {
    degree.set(l.a, (degree.get(l.a) || 0) + 1);
    degree.set(l.b, (degree.get(l.b) || 0) + 1);
  });
  if (!orphans && !center) keep = new Set([...keep].filter((id) => degree.get(id)));
  return {
    nodes: [...keep].map((id) => ({ ...nodes.get(id), degree: degree.get(id) || 0 })),
    links: list.filter((l) => keep.has(l.a) && keep.has(l.b)),
    groups: tops,
  };
}

class GraphView {
  constructor(canvas, { local = false, onOpen } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.local = local;
    this.onOpen = onOpen;
    this.nodes = [];
    this.links = [];
    this.byId = new Map();
    this.scale = 1;
    this.panX = 0;
    this.panY = 0;
    this.alpha = 0;
    this.hover = null;
    this.raf = null;
    this.pointers = new Map();
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.bind();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
  }

  setData({ nodes, links }, { activeId = null } = {}) {
    const old = this.byId;
    this.byId = new Map();
    // Los nodos que ya existían conservan su posición; los nuevos aparecen junto a un vecino.
    this.nodes = nodes.map((n, i) => {
      const prev = old.get(n.id);
      const angle = i * 2.399963;
      const r = 30 * Math.sqrt(i + 1);
      const node = { ...n, x: prev ? prev.x : Math.cos(angle) * r, y: prev ? prev.y : Math.sin(angle) * r, vx: 0, vy: 0, fixed: false };
      this.byId.set(n.id, node);
      return node;
    });
    this.links = links.map((l) => ({ a: this.byId.get(l.a), b: this.byId.get(l.b) })).filter((l) => l.a && l.b);
    this.neighbors = new Map(this.nodes.map((n) => [n.id, new Set()]));
    this.links.forEach((l) => {
      this.neighbors.get(l.a.id).add(l.b.id);
      this.neighbors.get(l.b.id).add(l.a.id);
    });
    this.activeId = activeId;
    // Un nodo resaltado que ya no existe (p. ej. una nota «sin crear» que se acaba de crear) se olvida.
    if (this.hover && !this.byId.has(this.hover)) this.hover = null;
    const isNew = this.nodes.some((n) => !old.has(n.id));
    this.heat(isNew ? 1 : 0.3);
    if (isNew && old.size === 0) {
      this.pendingFit = true;
      this.autoFit = true;
    }
  }

  heat(a = 0.5) {
    this.alpha = Math.max(this.alpha, a);
    if (this.reduced) {
      // Sin animación: se calcula la posición final y se dibuja una vez.
      for (let i = 0; i < 300 && this.alpha > 0.02; i++) this.step();
      if (this.pendingFit) this.fit();
      this.draw();
      return;
    }
    if (!this.raf) this.raf = requestAnimationFrame(() => this.loop());
  }

  loop() {
    this.raf = null;
    if (!this.canvas.offsetParent) return; // oculto: se para hasta que vuelva a verse
    for (let i = 0; i < (this.nodes.length > 1500 ? 1 : 2); i++) this.step();
    if (this.pendingFit && this.alpha < 0.3) this.fit();
    // Al terminar de colocarse se vuelve a encuadrar, salvo que se haya movido o ampliado a mano.
    if (this.alpha <= 0.02 && this.autoFit) {
      this.autoFit = false;
      this.fit();
    }
    this.draw();
    if (this.alpha > 0.02) this.raf = requestAnimationFrame(() => this.loop());
  }

  step() {
    const nodes = this.nodes;
    const k = this.alpha;
    const REPEL = this.local ? 900 : 1400;
    const LEN = this.local ? 60 : 80;
    if (nodes.length > 1500) repelApprox(nodes, REPEL * k);
    else repelExact(nodes, REPEL * k);
    this.links.forEach(({ a, b }) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = ((d - LEN) / d) * 0.06 * k;
      a.vx += dx * f;
      a.vy += dy * f;
      b.vx -= dx * f;
      b.vy -= dy * f;
    });
    nodes.forEach((n) => {
      n.vx -= n.x * 0.004 * k;
      n.vy -= n.y * 0.004 * k;
      if (n.fixed) {
        n.vx = 0;
        n.vy = 0;
        return;
      }
      n.vx *= 0.6;
      n.vy *= 0.6;
      n.x += n.vx;
      n.y += n.vy;
    });
    this.alpha *= 0.985;
  }

  radius(n) {
    return (n.kind === 'note' ? 4 : 3.5) + Math.min(10, Math.sqrt(n.degree) * 2);
  }

  resize() {
    const p = this.canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const w = p.clientWidth;
    const h = p.clientHeight;
    if (!w || !h) return;
    this.w = w;
    this.h = h;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.dpr = dpr;
    if (this.pendingFit && this.alpha < 0.3) this.fit();
    this.draw();
  }

  toScreen(n) {
    return { x: this.w / 2 + this.panX + n.x * this.scale, y: this.h / 2 + this.panY + n.y * this.scale };
  }

  toWorld(x, y) {
    return { x: (x - this.w / 2 - this.panX) / this.scale, y: (y - this.h / 2 - this.panY) / this.scale };
  }

  fit() {
    this.pendingFit = false;
    if (!this.nodes.length || !this.w) return;
    const xs = this.nodes.map((n) => n.x);
    const ys = this.nodes.map((n) => n.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    // Margen lateral para que quepan los nombres, que son más anchos que los puntos.
    const padX = Math.min(90, this.w * 0.22);
    const s = Math.min((this.w - 2 * padX) / Math.max(1, maxX - minX), (this.h - 90) / Math.max(1, maxY - minY));
    this.scale = Math.max(0.2, Math.min(this.local ? 1.6 : 2, s));
    this.panX = -((minX + maxX) / 2) * this.scale;
    this.panY = -((minY + maxY) / 2) * this.scale;
    this.draw();
  }

  zoom(f, cx = this.w / 2, cy = this.h / 2) {
    this.autoFit = false;
    const before = this.toWorld(cx, cy);
    this.scale = Math.max(0.15, Math.min(4, this.scale * f));
    this.panX = cx - this.w / 2 - before.x * this.scale;
    this.panY = cy - this.h / 2 - before.y * this.scale;
    this.draw();
  }

  colors() {
    const css = getComputedStyle(document.documentElement);
    const v = (n) => css.getPropertyValue(n).trim();
    return { text: v('--text'), muted: v('--muted'), border: v('--border'), accent: v('--accent'), bg: v('--editor'), b: [0, 1, 2, 3, 4, 5].map((i) => v(`--b${i}`)), tag: v('--mid') };
  }

  draw() {
    const ctx = this.ctx;
    if (!this.w) return;
    const c = this.colors();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    const focus = this.hover || (this.local ? this.activeId : null);
    const near = focus ? this.neighbors.get(focus) || new Set() : null;
    const dim = (id) => focus && id !== focus && !near.has(id);

    // Las líneas se dibujan por tandas (un solo trazo por estilo) y sin las que quedan fuera de la vista.
    const W = this.w, H = this.h;
    const off = (p, q) => (p.x < 0 && q.x < 0) || (p.y < 0 && q.y < 0) || (p.x > W && q.x > W) || (p.y > H && q.y > H);
    const normal = new Path2D();
    const hotPath = new Path2D();
    this.links.forEach(({ a, b }) => {
      const pa = this.toScreen(a);
      const pb = this.toScreen(b);
      if (off(pa, pb)) return;
      const path = focus && (a.id === focus || b.id === focus) ? hotPath : normal;
      path.moveTo(pa.x, pa.y);
      path.lineTo(pb.x, pb.y);
    });
    ctx.lineWidth = 1;
    ctx.strokeStyle = c.border;
    ctx.globalAlpha = focus ? 0.25 : 0.8;
    ctx.stroke(normal);
    if (focus) {
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = c.accent;
      ctx.globalAlpha = 0.9;
      ctx.stroke(hotPath);
    }
    ctx.globalAlpha = 1;

    const showAll = this.scale > (this.local ? 0.6 : 1.1) || this.nodes.length < 25;
    this.nodes.forEach((n) => {
      const p = this.toScreen(n);
      if (p.x < -60 || p.y < -30 || p.x > W + 60 || p.y > H + 30) return;
      const r = this.radius(n) * Math.max(0.6, Math.min(1.4, this.scale));
      const color = n.kind === 'ghost' ? c.muted : n.kind === 'tag' ? c.tag : n.group >= 0 ? c.b[n.group] : c.accent;
      ctx.globalAlpha = dim(n.id) ? 0.25 : 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      if (n.kind === 'ghost') {
        ctx.fillStyle = c.bg;
        ctx.fill();
        ctx.setLineDash([2, 2]);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.fillStyle = color;
        ctx.fill();
      }
      if (n.id === this.activeId || n.id === this.hover) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = c.text;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (showAll || n.id === focus || (near && near.has(n.id)) || n.id === this.activeId) {
        ctx.font = `${n.id === focus ? 600 : 400} 12px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = n.kind === 'ghost' ? c.muted : c.text;
        const label = n.label.length > 28 ? `${n.label.slice(0, 27)}…` : n.label;
        ctx.fillText(label, p.x, p.y + r + 4);
      }
    });
    ctx.globalAlpha = 1;
  }

  nodeAt(x, y) {
    let best = null;
    let bestD = Infinity;
    this.nodes.forEach((n) => {
      const p = this.toScreen(n);
      const r = this.radius(n) * Math.max(0.6, Math.min(1.4, this.scale)) + 6;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < r && d < bestD) {
        best = n;
        bestD = d;
      }
    });
    return best;
  }

  bind() {
    const cv = this.canvas;
    const pos = (e) => {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    cv.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      cv.setPointerCapture(e.pointerId);
      const p = pos(e);
      this.pointers.set(e.pointerId, p);
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), scale: this.scale };
        this.drag = null;
        return;
      }
      const n = this.nodeAt(p.x, p.y);
      this.drag = { node: n, start: p, panX: this.panX, panY: this.panY, moved: false };
      if (n) n.fixed = true;
    });
    cv.addEventListener('pointermove', (e) => {
      const p = pos(e);
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, p);
      if (this.pinch && this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.zoom((this.pinch.scale * (d / this.pinch.d)) / this.scale, (a.x + b.x) / 2, (a.y + b.y) / 2);
        return;
      }
      if (this.drag) {
        if (Math.hypot(p.x - this.drag.start.x, p.y - this.drag.start.y) > 4) this.drag.moved = true;
        if (!this.drag.moved) return;
        if (this.drag.node) {
          const w = this.toWorld(p.x, p.y);
          this.drag.node.x = w.x;
          this.drag.node.y = w.y;
          this.heat(0.3);
        } else {
          this.autoFit = false;
          this.panX = this.drag.panX + (p.x - this.drag.start.x);
          this.panY = this.drag.panY + (p.y - this.drag.start.y);
        }
        this.draw();
        return;
      }
      const n = this.nodeAt(p.x, p.y);
      const id = n ? n.id : null;
      if (id !== this.hover) {
        this.hover = id;
        cv.style.cursor = n ? 'pointer' : 'grab';
        cv.title = n ? (n.kind === 'ghost' ? `${n.label} (aún no existe: clic para crearla)` : n.kind === 'tag' ? `${n.label}: clic para buscar` : n.note.path) : '';
        this.draw();
      }
    });
    const end = (e) => {
      this.pointers.delete(e.pointerId);
      if (this.pinch) {
        if (this.pointers.size < 2) this.pinch = null;
        return;
      }
      const d = this.drag;
      this.drag = null;
      if (!d) return;
      if (d.node) d.node.fixed = false;
      if (!d.moved && d.node && e.type === 'pointerup') this.onOpen?.(d.node, { newTab: e.ctrlKey || e.metaKey });
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', () => {
      if (this.hover && !this.drag) {
        this.hover = null;
        this.draw();
      }
    });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = pos(e);
      this.zoom(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
    }, { passive: false });
    cv.addEventListener('dblclick', (e) => {
      const p = pos(e);
      if (!this.nodeAt(p.x, p.y)) this.fit();
    });
  }
}

function openGraphNode(n, { newTab = false } = {}) {
  if (n.kind === 'note') openNote(n.note, { newTab });
  else if (n.kind === 'ghost') openNoteByLink(n.target, { newTab });
  else if (n.kind === 'tag') searchTag(n.tag);
}

let globalGraph = null;
let localGraph = null;

function renderGraph() {
  if (!globalGraph) globalGraph = new GraphView($('#graph-canvas'), { onOpen: openGraphNode });
  const data = buildGraphData(graphOpts);
  globalGraph.setData(data);
  $('#graph-count').textContent = `${plural(data.nodes.length, 'nodo', 'nodos')} · ${plural(data.links.length, 'enlace', 'enlaces')}`;
  $('#graph-legend').replaceChildren(
    ...[['', -1], ...data.groups.map((g, i) => [g, i % BRANCH_COUNT])].map(([g, i]) =>
      el('span', { className: 'gl-item' }, [el('span', { className: `gl-dot ${i < 0 ? 'root' : `b${i}`}` }), g || 'Raíz'])
    ),
    ...(graphOpts.ghosts ? [el('span', { className: 'gl-item' }, [el('span', { className: 'gl-dot ghost' }), 'Sin crear'])] : []),
    ...(graphOpts.tags ? [el('span', { className: 'gl-item' }, [el('span', { className: 'gl-dot tag' }), 'Etiqueta'])] : [])
  );
  $('#graph-empty').hidden = data.nodes.length > 0;
  ['tags', 'ghosts', 'orphans'].forEach((k) => {
    $(`[data-gopt="${k}"]`).classList.toggle('active', !!graphOpts[k]);
    $(`[data-gopt="${k}"]`).ariaPressed = String(!!graphOpts[k]);
  });
  globalGraph.resize();
}

function renderLocalGraph() {
  const note = activeNote();
  $('#local-graph-empty').hidden = !!note;
  $('#local-graph-wrap').hidden = !note;
  if (!note || panels.rpane !== 'graph') return;
  if (!localGraph) localGraph = new GraphView($('#local-canvas'), { local: true, onOpen: openGraphNode });
  const data = buildGraphData({ center: `n:${note.id}`, depth: graphOpts.depth, ghosts: graphOpts.ghosts, tags: graphOpts.tags });
  localGraph.setData(data, { activeId: `n:${note.id}` });
  localGraph.resize();
  localGraph.pendingFit = true;
  localGraph.autoFit = true;
  if (localGraph.reduced) localGraph.fit();
  $('#local-depth').value = String(graphOpts.depth);
}

$$('[data-gopt]').forEach((b) =>
  b.addEventListener('click', () => {
    const k = b.dataset.gopt;
    graphOpts[k] = !graphOpts[k];
    saveGraphOpts();
    renderGraph();
    renderLocalGraph();
  })
);
$('#graph-filter').addEventListener('input', (e) => {
  graphOpts.filter = e.target.value.trim();
  renderGraph();
});
$('#graph-fit').addEventListener('click', () => globalGraph?.fit());
$('#graph-zoom-in').addEventListener('click', () => globalGraph?.zoom(1.25));
$('#graph-zoom-out').addEventListener('click', () => globalGraph?.zoom(0.8));
$('#local-depth').addEventListener('change', (e) => {
  graphOpts.depth = Number(e.target.value);
  saveGraphOpts();
  renderLocalGraph();
});
$('#rib-graph').addEventListener('click', (e) => openTab({ type: 'graph' }, { newTab: e.ctrlKey || e.metaKey }));

// ---------- Mapa mental desde una nota ----------
// Raíz = título de la nota; ramas = títulos (#, ##…) y, dentro de cada uno, sus listas.
function plainText(s) {
  return s
    .replace(/!?\[\[([^\]|]+\|)?([^\]]+)\]\]/g, '$2')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|~~|==|`)/g, '')
    .replace(/(^|\s)[*_](\S[^*_]*\S|\S)[*_](?=\s|$)/g, '$1$2')
    .replace(/✅\s*\d{4}-\d{2}-\d{2}/u, '')
    .trim();
}

function outlineNodes(note) {
  const nodes = [{ id: 'root', parent: null, text: baseName(note.path) }];
  const heads = [{ level: 0, id: 'root' }];
  let list = [];
  let inCode = false;
  note.body.split('\n').forEach((line) => {
    if (/^\s*```/.test(line)) inCode = !inCode;
    if (inCode) return;
    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) {
      const level = h[1].length;
      // Un primer título igual al nombre de la nota es la propia raíz.
      if (nodes.length === 1 && plainText(h[2]).toLowerCase() === nodes[0].text.toLowerCase()) {
        heads.push({ level, id: 'root' });
        list = [];
        return;
      }
      while (heads.length > 1 && heads[heads.length - 1].level >= level) heads.pop();
      const node = { id: uid(), parent: heads[heads.length - 1].id, text: plainText(h[2]).slice(0, 120) };
      nodes.push(node);
      heads.push({ level, id: node.id });
      list = [];
      return;
    }
    const li = line.match(/^(\s*)([-*+]|\d+[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/);
    if (li && li[4].trim()) {
      const indent = li[1].replace(/\t/g, '    ').length;
      while (list.length && list[list.length - 1].indent >= indent) list.pop();
      const parent = list.length ? list[list.length - 1].id : heads[heads.length - 1].id;
      const box = li[3] === undefined ? '' : li[3] === ' ' ? '☐ ' : '☑ ';
      const node = { id: uid(), parent, text: `${box}${plainText(li[4])}`.slice(0, 120) };
      nodes.push(node);
      list.push({ indent, id: node.id });
    } else if (line.trim() && !/^\s/.test(line)) {
      list = [];
    }
  });
  // Sin títulos ni listas: las ramas son las notas que enlaza.
  if (nodes.length === 1) {
    [...new Set(linksIn(note.body).map((l) => l.target).filter(Boolean))].forEach((t) => nodes.push({ id: uid(), parent: 'root', text: baseName(t) }));
  }
  return nodes;
}

function mapFromNote(note) {
  const nodes = outlineNodes(note);
  if (nodes.length === 1) {
    showToastMessage('Esta nota no tiene títulos, listas ni enlaces para hacer un mapa.');
    return;
  }
  let map = state.maps.find((m) => m.sourceNoteId === note.id);
  if (map) {
    withUndo('Mapa actualizado desde la nota', () => {
      map.nodes = nodes;
      map.title = nodes[0].text;
      map.updatedAt = Date.now();
    });
  } else {
    map = newMap(nodes[0].text);
    map.nodes = nodes;
    map.sourceNoteId = note.id;
    save();
  }
  openMap(map.id);
}

$('#map-refresh').addEventListener('click', () => {
  const map = currentMap();
  const note = map && noteById(map.sourceNoteId);
  if (!note) return;
  withUndo('Mapa actualizado desde la nota', () => {
    map.nodes = outlineNodes(note);
    map.title = map.nodes[0].text;
    map.updatedAt = Date.now();
    selectedNode = 'root';
  });
  fitMap();
});
$('#map-source').addEventListener('click', () => {
  const note = noteById(currentMap()?.sourceNoteId);
  if (note) openNote(note);
});
