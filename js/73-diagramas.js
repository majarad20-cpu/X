'use strict';

// ---------- Tipos de diagrama y plantillas ----------
// El mismo árbol de nodos se puede ver como mapa mental, mapa radial, organigrama, esquema con
// llaves, espina de pescado, proceso, línea de tiempo, matriz o pirámide (map.kind). Cambiar de tipo
// no toca los datos. map.edge elige las líneas (curvas, rectas o escalonadas) y map.cols las columnas
// de la matriz. Cada disposición devuelve { pos, side, width, height, paths, ox, oy }: `paths` son
// trazos SVG (en coordenadas sin desplazar: se mueven ox, oy) que se dibujan igual en pantalla y en
// la imagen exportada.
const DIAGRAMS = [
  { id: 'mindmap', icon: '🧠', label: 'Mapa mental', hint: 'El tema en el centro y las ideas en ramas a los lados.' },
  { id: 'radial', icon: '🌞', label: 'Mapa radial', hint: 'Las ramas salen en círculo alrededor del tema.' },
  { id: 'org', icon: '🏢', label: 'Organigrama / árbol', hint: 'De arriba abajo: cada rama cuelga de su nodo. Sirve para equipos, jerarquías y árboles de decisión.' },
  { id: 'outline', icon: '🗂️', label: 'Esquema (cuadro sinóptico)', hint: 'De izquierda a derecha, con llaves que agrupan cada nivel.' },
  { id: 'fishbone', icon: '🐟', label: 'Espina de pescado', hint: 'El tema central es el problema; cada rama, una categoría de causas; sus subramas, las causas.' },
  { id: 'process', icon: '➡️', label: 'Proceso', hint: 'Cada rama es un paso, en orden de izquierda a derecha; sus subramas, los detalles del paso.' },
  { id: 'timeline', icon: '📅', label: 'Línea de tiempo', hint: 'Cada rama es un momento, en orden; sus subramas, lo que pasó.' },
  { id: 'matrix', icon: '▦', label: 'Matriz', hint: 'Cada rama es una casilla (FODA, Eisenhower…); sus subramas, lo que va dentro.' },
  { id: 'pyramid', icon: '🔺', label: 'Pirámide', hint: 'La primera rama es la cima y la última la base; las subramas se explican al lado.' },
];
const diagramOf = (map) => DIAGRAMS.find((d) => d.id === map?.kind) || DIAGRAMS[0];
const diagramIcon = (map) => diagramOf(map).icon;

// ---------- Utilidades ----------
const dgRoot = (map) => map.nodes.find((n) => !n.parent);
const dgKids = (map, id) => childrenOf(map, id);
const dgColor = (map, n) => (n.parent ? `b${branchIndex(map, n)}` : 'accent');

// Descendientes en orden, con su nivel relativo (para listarlos en una casilla o junto a un paso).
function dgFlat(map, id, depth = 0, out = []) {
  dgKids(map, id).forEach((k) => {
    out.push({ n: k, depth });
    dgFlat(map, k.id, depth + 1, out);
  });
  return out;
}

// Coloca un nodo por su centro.
const dgAt = (pos, sizes, n, cx, cy) => (pos[n.id] = { x: cx - sizes[n.id].w / 2, y: cy - sizes[n.id].h / 2, w: sizes[n.id].w, h: sizes[n.id].h });

// Ajusta todo a coordenadas positivas con margen.
function dgFinish(map, pos, paths, extra = [], side = {}) {
  const PAD = 40;
  const pts = [...Object.values(pos).flatMap((p) => [[p.x, p.y], [p.x + p.w, p.y + p.h]]), ...extra];
  const minX = Math.min(...pts.map((p) => p[0])) - PAD;
  const minY = Math.min(...pts.map((p) => p[1])) - PAD;
  const maxX = Math.max(...pts.map((p) => p[0])) + PAD;
  const maxY = Math.max(...pts.map((p) => p[1])) + PAD;
  Object.values(pos).forEach((p) => {
    p.x -= minX;
    p.y -= minY;
  });
  const sides = {};
  map.nodes.forEach((n) => (sides[n.id] = side[n.id] ?? 1));
  return { pos, side: sides, width: maxX - minX, height: maxY - minY, paths, ox: -minX, oy: -minY };
}

const dgRect = (x, y, w, h, r = 12) => `M${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x + r} Q${x},${y + h} ${x},${y + h - r} V${y + r} Q${x},${y} ${x + r},${y} Z`;
const dgDot = (x, y, r = 5) => `M${x - r},${y} a${r},${r} 0 1,0 ${r * 2},0 a${r},${r} 0 1,0 ${-r * 2},0`;

// Línea entre dos cajas según el estilo elegido (de lado a lado).
function dgEdge(style, a, b, dir) {
  const x1 = dir > 0 ? a.x + a.w : a.x;
  const y1 = a.y + a.h / 2;
  const x2 = dir > 0 ? b.x : b.x + b.w;
  const y2 = b.y + b.h / 2;
  if (style === 'straight') return `M${x1},${y1} L${x2},${y2}`;
  if (style === 'elbow') {
    const mx = (x1 + x2) / 2;
    return `M${x1},${y1} H${mx} V${y2} H${x2}`;
  }
  return edgePath(a, b, dir);
}

// ---------- Disposiciones ----------
function dgMindmap(map, sizes) {
  const L = computeLayout(map, sizes);
  const style = map.edge || 'curve';
  if (style === 'curve') return L; // el dibujo de siempre
  L.paths = map.nodes.filter((n) => n.parent && L.pos[n.parent]).map((n) => ({ d: dgEdge(style, L.pos[n.parent], L.pos[n.id], L.side[n.id]), stroke: dgColor(map, n), link: [n.parent, n.id] }));
  L.ox = 0;
  L.oy = 0;
  return L;
}

function dgRadial(map, sizes) {
  const root = dgRoot(map);
  const pos = {};
  const side = {};
  const paths = [];
  dgAt(pos, sizes, root, 0, 0);
  const leaves = (n) => {
    const k = dgKids(map, n.id);
    return k.length ? k.reduce((a, c) => a + leaves(c), 0) : 1;
  };
  const top = dgKids(map, root.id);
  const total = Math.max(1, top.reduce((a, c) => a + leaves(c), 0));
  const R = Math.max(170, top.reduce((a, c) => a + (sizes[c.id].w + sizes[c.id].h) / 2, 0) / 4.5, total * 26);
  const STEP = 190;
  const place = (n, a0, a1, r) => {
    const a = (a0 + a1) / 2;
    const cx = Math.cos(a) * r;
    const cy = Math.sin(a) * r * 0.82;
    dgAt(pos, sizes, n, cx, cy);
    side[n.id] = cx < -4 ? -1 : 1;
    let acc = a0;
    const kids = dgKids(map, n.id);
    const sum = kids.reduce((s, k) => s + leaves(k), 0);
    kids.forEach((k) => {
      const span = ((a1 - a0) * leaves(k)) / sum;
      place(k, acc, acc + span, r + STEP);
      acc += span;
    });
  };
  let acc = -Math.PI / 2;
  top.forEach((k) => {
    const span = (2 * Math.PI * leaves(k)) / total;
    place(k, acc, acc + span, R);
    acc += span;
  });
  const center = (p) => [p.x + p.w / 2, p.y + p.h / 2];
  const style = map.edge || 'curve';
  map.nodes.filter((n) => n.parent && pos[n.parent]).forEach((n) => {
    const [x1, y1] = center(pos[n.parent]);
    const [x2, y2] = center(pos[n.id]);
    const d = style === 'curve' ? `M${x1},${y1} Q${(x1 + x2) / 2 + (y2 - y1) * 0.15},${(y1 + y2) / 2 - (x2 - x1) * 0.15} ${x2},${y2}` : `M${x1},${y1} L${x2},${y2}`;
    paths.push({ d, stroke: dgColor(map, n), link: [n.parent, n.id] });
  });
  return dgFinish(map, pos, paths, [], side);
}

function dgOrg(map, sizes) {
  const GX = 22;
  const GY = 54;
  const root = dgRoot(map);
  const pos = {};
  const paths = [];
  const W = {};
  const leafGroup = (n) => n.parent && dgKids(map, n.id).length && dgKids(map, n.id).every((k) => !dgKids(map, k.id).length);
  const measure = (n) => {
    const ks = dgKids(map, n.id);
    const own = sizes[n.id].w;
    if (!ks.length) return (W[n.id] = own);
    if (leafGroup(n)) return (W[n.id] = Math.max(own, 26 + Math.max(...ks.map((k) => sizes[k.id].w))));
    ks.forEach(measure);
    return (W[n.id] = Math.max(own, ks.reduce((a, k) => a + W[k.id], 0) + GX * (ks.length - 1)));
  };
  measure(root);
  // Altura de cada nivel (para que los hermanos queden alineados).
  const rowH = [];
  const depthWalk = (n, d) => {
    rowH[d] = Math.max(rowH[d] || 0, sizes[n.id].h);
    if (!leafGroup(n)) dgKids(map, n.id).forEach((k) => depthWalk(k, d + 1));
  };
  depthWalk(root, 0);
  const rowTop = (d) => rowH.slice(0, d).reduce((a, h) => a + h + GY, 0);
  const style = map.edge === 'curve' ? 'curve' : map.edge === 'straight' ? 'straight' : 'elbow';
  const place = (n, left, d) => {
    const s = sizes[n.id];
    const cx = left + W[n.id] / 2;
    pos[n.id] = { x: cx - s.w / 2, y: rowTop(d) + (rowH[d] - s.h) / 2, w: s.w, h: s.h };
    const p = pos[n.id];
    const ks = dgKids(map, n.id);
    if (!ks.length) return;
    if (leafGroup(n)) {
      const lx = p.x + 12;
      let y = p.y + p.h + 14;
      ks.forEach((k) => {
        const ksz = sizes[k.id];
        pos[k.id] = { x: lx + 14, y, w: ksz.w, h: ksz.h };
        paths.push({ d: `M${lx},${p.y + p.h} V${y + ksz.h / 2} H${lx + 14}`, stroke: dgColor(map, k), link: [n.id, k.id] });
        y += ksz.h + 10;
      });
      return;
    }
    let x = left + (W[n.id] - (ks.reduce((a, k) => a + W[k.id], 0) + GX * (ks.length - 1))) / 2;
    ks.forEach((k) => {
      place(k, x, d + 1);
      const c = pos[k.id];
      const x1 = p.x + p.w / 2;
      const y1 = p.y + p.h;
      const x2 = c.x + c.w / 2;
      const y2 = c.y;
      const my = (y1 + y2) / 2;
      const dd = style === 'straight' ? `M${x1},${y1} L${x2},${y2}` : style === 'curve' ? `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}` : `M${x1},${y1} V${my} H${x2} V${y2}`;
      paths.push({ d: dd, stroke: dgColor(map, k), link: [n.id, k.id] });
      x += W[k.id] + GX;
    });
  };
  place(root, 0, 0);
  return dgFinish(map, pos, paths);
}

function dgOutline(map, sizes) {
  const GAP = 44;
  const GY = 8;
  const root = dgRoot(map);
  const pos = {};
  const paths = [];
  const H = {};
  const measure = (n) => {
    const ks = dgKids(map, n.id);
    const own = sizes[n.id].h;
    if (!ks.length) return (H[n.id] = own);
    ks.forEach(measure);
    return (H[n.id] = Math.max(own, ks.reduce((a, k) => a + H[k.id], 0) + GY * (ks.length - 1)));
  };
  measure(root);
  const place = (n, x, top) => {
    const s = sizes[n.id];
    pos[n.id] = { x, y: top + (H[n.id] - s.h) / 2, w: s.w, h: s.h };
    const p = pos[n.id];
    const ks = dgKids(map, n.id);
    if (!ks.length) return;
    const sum = ks.reduce((a, k) => a + H[k.id], 0) + GY * (ks.length - 1);
    let y = top + (H[n.id] - sum) / 2;
    ks.forEach((k) => {
      place(k, x + s.w + GAP, y);
      y += H[k.id] + GY;
    });
    const first = pos[ks[0].id];
    const last = pos[ks.at(-1).id];
    const ym = p.y + p.h / 2;
    const bx = p.x + p.w + 14;
    const y0 = Math.min(first.y + first.h / 2, ym) - (ks.length > 1 ? 0 : 0);
    const y1 = Math.max(last.y + last.h / 2, ym);
    const col = dgColor(map, ks[0]).replace(/^accent$/, 'muted');
    paths.push({ d: `M${p.x + p.w},${ym} H${bx}`, stroke: n.parent ? dgColor(map, n) : 'muted', group: [n.id, ks.map((k) => k.id)] });
    if (ks.length === 1) paths.push({ d: `M${bx},${ym} H${first.x}`, stroke: col, link: [n.id, ks[0].id] });
    else paths.push({ d: `M${bx + 16},${y0} C${bx + 7},${y0} ${bx + 9},${ym} ${bx},${ym} C${bx + 9},${ym} ${bx + 7},${y1} ${bx + 16},${y1}`, stroke: n.parent ? dgColor(map, n) : 'muted', w: 2.4, group: [n.id, ks.map((k) => k.id)] });
  };
  place(root, 0, 0);
  return dgFinish(map, pos, paths);
}

function dgFishbone(map, sizes) {
  const root = dgRoot(map);
  const pos = {};
  const paths = [];
  const SLOPE = 0.5;
  const head = sizes[root.id];
  pos[root.id] = { x: 0, y: -head.h / 2, w: head.w, h: head.h };
  const cats = dgKids(map, root.id);
  let edge = -40; // borde derecho de la siguiente columna
  let minX = 0;
  for (let i = 0; i < cats.length; i += 2) {
    const pair = cats.slice(i, i + 2);
    const items = pair.map((c) => dgFlat(map, c.id));
    const rowOf = (list) => list.reduce((a, it) => a + sizes[it.n.id].h + 8, 0);
    const boneH = Math.max(80, 46 + Math.max(...items.map(rowOf)));
    const widest = Math.max(0, ...items.flat().map((it) => sizes[it.n.id].w + it.depth * 14));
    const colW = Math.max(...pair.map((c) => sizes[c.id].w / 2), 40) + widest + SLOPE * boneH + 50;
    const sx = edge;
    pair.forEach((c, j) => {
      const up = j === 0 ? -1 : 1;
      const tipX = sx - SLOPE * boneH;
      const tipY = up * boneH;
      const s = sizes[c.id];
      pos[c.id] = { x: tipX - s.w / 2, y: up < 0 ? tipY - s.h - 6 : tipY + 6, w: s.w, h: s.h };
      paths.push({ d: `M${sx},0 L${tipX},${tipY}`, stroke: dgColor(map, c), w: 2.5, owner: c.id });
      let t = 34;
      items[j].forEach(({ n, depth }) => {
        const sz = sizes[n.id];
        const y = up * (t + sz.h / 2);
        const xb = sx - SLOPE * Math.abs(y);
        const right = xb - 10 - depth * 14;
        pos[n.id] = { x: right - sz.w, y: y - sz.h / 2, w: sz.w, h: sz.h };
        paths.push({ d: `M${xb},${y} H${right}`, stroke: dgColor(map, n), w: 1.5, link: [n.parent, n.id] });
        minX = Math.min(minX, right - sz.w);
        t += sz.h + 8;
      });
      minX = Math.min(minX, pos[c.id].x);
    });
    edge -= colW;
  }
  const tail = Math.min(edge + 30, minX) - 10;
  paths.unshift({ d: `M${tail},0 H0`, stroke: 'text', w: 3.5 });
  paths.unshift({ d: `M${tail},0 L${tail - 22},-16 M${tail},0 L${tail - 22},16`, stroke: 'text', w: 3 });
  return dgFinish(map, pos, paths, [[tail - 30, -20], [tail - 30, 20]]);
}

function dgProcess(map, sizes) {
  const root = dgRoot(map);
  const pos = {};
  const paths = [];
  const steps = dgKids(map, root.id);
  const GAP = 64;
  const stepH = Math.max(0, ...steps.map((s) => sizes[s.id].h));
  let x = 0;
  steps.forEach((s, i) => {
    const items = dgFlat(map, s.id);
    const colW = Math.max(sizes[s.id].w, ...items.map((it) => sizes[it.n.id].w + it.depth * 14));
    const cx = x + colW / 2;
    dgAt(pos, sizes, s, cx, stepH / 2);
    let y = stepH + 22;
    items.forEach(({ n, depth }) => {
      const sz = sizes[n.id];
      pos[n.id] = { x: cx - sz.w / 2 + depth * 14, y, w: sz.w, h: sz.h };
      y += sz.h + 10;
    });
    if (items.length) paths.push({ d: `M${cx},${pos[s.id].y + pos[s.id].h} V${pos[items.at(-1).n.id].y}`, stroke: dgColor(map, s), w: 1.5, dash: '4 4', owner: s.id });
    if (i) {
      const prev = pos[steps[i - 1].id];
      const x1 = prev.x + prev.w + 6;
      const x2 = pos[s.id].x - 8;
      paths.push({ d: `M${x1},${stepH / 2} H${x2} M${x2 - 10},${stepH / 2 - 7} L${x2},${stepH / 2} L${x2 - 10},${stepH / 2 + 7} Z`, stroke: 'muted', fill: 'muted', alpha: 1, w: 2.5, link: [steps[i - 1].id, s.id], arrow: true });
    }
    x += colW + GAP;
  });
  const total = Math.max(x - GAP, 0);
  dgAt(pos, sizes, root, total / 2, -sizes[root.id].h / 2 - 34);
  return dgFinish(map, pos, paths);
}

function dgTimeline(map, sizes) {
  const root = dgRoot(map);
  const pos = {};
  const paths = [];
  const evs = dgKids(map, root.id);
  const r = sizes[root.id];
  pos[root.id] = { x: -r.w - 30, y: -r.h / 2, w: r.w, h: r.h };
  let x = 30;
  let end = 30;
  evs.forEach((e, i) => {
    const items = dgFlat(map, e.id);
    const w = Math.max(sizes[e.id].w, ...items.map((it) => sizes[it.n.id].w + it.depth * 14));
    const cx = x + w / 2;
    const up = i % 2 === 0 ? -1 : 1;
    const s = sizes[e.id];
    pos[e.id] = { x: cx - s.w / 2, y: up < 0 ? -44 - s.h : 44, w: s.w, h: s.h };
    paths.push({ d: `M${cx},0 V${up * 44}`, stroke: dgColor(map, e), w: 2, owner: e.id });
    paths.push({ d: dgDot(cx, 0, 6), stroke: dgColor(map, e), fill: dgColor(map, e), alpha: 1, w: 1, owner: e.id });
    let y = up < 0 ? pos[e.id].y - 8 : pos[e.id].y + s.h + 8;
    items.forEach(({ n, depth }) => {
      const sz = sizes[n.id];
      const top = up < 0 ? y - sz.h : y;
      pos[n.id] = { x: cx - sz.w / 2 + depth * 14, y: top, w: sz.w, h: sz.h };
      y = up < 0 ? top - 8 : top + sz.h + 8;
    });
    // Los momentos alternan arriba y abajo: el siguiente puede solaparse a medias en horizontal.
    x += Math.max(70, w * 0.62);
    end = Math.max(end, cx + w / 2);
  });
  paths.unshift({ d: `M0,0 H${end + 30}`, stroke: 'text', w: 3 });
  paths.unshift({ d: `M${end + 30},-7 L${end + 44},0 L${end + 30},7 Z`, stroke: 'text', fill: 'text', alpha: 1, w: 1 });
  return dgFinish(map, pos, paths, [[end + 50, 0]]);
}

function dgMatrix(map, sizes) {
  const root = dgRoot(map);
  const pos = {};
  const paths = [];
  const cells = dgKids(map, root.id);
  const cols = Math.min(Math.max(1, map.cols || (cells.length <= 4 ? 2 : cells.length <= 9 ? 3 : 4)), Math.max(1, cells.length));
  const PAD = 14;
  const content = cells.map((c) => {
    const items = dgFlat(map, c.id);
    return {
      c,
      items,
      w: Math.max(sizes[c.id].w, ...items.map((it) => sizes[it.n.id].w + it.depth * 14)),
      h: sizes[c.id].h + (items.length ? 10 : 0) + items.reduce((a, it) => a + sizes[it.n.id].h + 6, 0),
    };
  });
  const cellW = Math.max(200, ...content.map((x) => x.w)) + PAD * 2;
  const rows = Math.ceil(cells.length / cols);
  const rowH = Array.from({ length: rows }, (_, r) => Math.max(110, ...content.slice(r * cols, r * cols + cols).map((x) => x.h)) + PAD * 2);
  const GAP = 12;
  content.forEach((x, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const ox = c * (cellW + GAP);
    const oy = rowH.slice(0, r).reduce((a, h) => a + h + GAP, 0);
    const col = dgColor(map, x.c);
    paths.push({ d: dgRect(ox, oy, cellW, rowH[r]), stroke: col, fill: col, alpha: 0.08, w: 1.5, owner: x.c.id });
    const hs = sizes[x.c.id];
    pos[x.c.id] = { x: ox + PAD, y: oy + PAD, w: hs.w, h: hs.h };
    let y = oy + PAD + hs.h + 10;
    x.items.forEach(({ n, depth }) => {
      const sz = sizes[n.id];
      pos[n.id] = { x: ox + PAD + depth * 14, y, w: sz.w, h: sz.h };
      y += sz.h + 6;
    });
  });
  const total = cols * cellW + (cols - 1) * GAP;
  dgAt(pos, sizes, root, total / 2, -sizes[root.id].h / 2 - 22);
  return dgFinish(map, pos, paths, [[0, 0], [total, rowH.reduce((a, h) => a + h + GAP, 0)]]);
}

function dgPyramid(map, sizes) {
  const root = dgRoot(map);
  const pos = {};
  const paths = [];
  const levels = dgKids(map, root.id);
  const n = Math.max(1, levels.length);
  const B = Math.max(380, ...levels.map((l, i) => (sizes[l.id].w + 40) * (n / (i + 0.7))));
  let y = 0;
  levels.forEach((l, i) => {
    const items = dgFlat(map, l.id);
    const itemsH = items.reduce((a, it) => a + sizes[it.n.id].h + 6, 0);
    const bandH = Math.max(sizes[l.id].h + 26, 58, itemsH + 10);
    const tw = (B * i) / n;
    const bw = (B * (i + 1)) / n;
    const col = dgColor(map, l);
    paths.push({ d: `M${-tw / 2},${y} L${tw / 2},${y} L${bw / 2},${y + bandH} L${-bw / 2},${y + bandH} Z`, stroke: col, fill: col, alpha: 0.22, w: 1.5, owner: l.id });
    const cy = y + bandH * (i === 0 ? 0.62 : 0.5);
    dgAt(pos, sizes, l, 0, cy);
    if (items.length) {
      const ix = B / 2 + 50;
      let iy = cy - itemsH / 2;
      paths.push({ d: `M${(tw + bw) / 4 + 4},${cy} H${ix - 10}`, stroke: col, w: 1.2, dash: '3 4', owner: l.id });
      items.forEach(({ n: it, depth }) => {
        const sz = sizes[it.id];
        pos[it.id] = { x: ix + depth * 14, y: iy, w: sz.w, h: sz.h };
        iy += sz.h + 6;
      });
    }
    y += bandH + 4;
  });
  dgAt(pos, sizes, root, 0, -sizes[root.id].h / 2 - 26);
  return dgFinish(map, pos, paths, [[-B / 2, 0], [B / 2, y]]);
}

const DG_LAYOUTS = { radial: dgRadial, org: dgOrg, outline: dgOutline, fishbone: dgFishbone, process: dgProcess, timeline: dgTimeline, matrix: dgMatrix, pyramid: dgPyramid };
function diagramLayout(map, sizes) {
  return (DG_LAYOUTS[map.kind] || dgMindmap)(map, sizes);
}

// ---------- Dibujo de los trazos ----------
const dgCss = (c) => (c === 'muted' ? 'var(--muted)' : c === 'text' ? 'var(--text)' : `var(--${c})`);
function diagramSvg(L) {
  const NS = 'http://www.w3.org/2000/svg';
  const g = document.createElementNS(NS, 'g');
  g.setAttribute('transform', `translate(${L.ox || 0},${L.oy || 0})`);
  L.paths.forEach((p) => {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', p.d);
    path.setAttribute('class', 'dg-path');
    if (p.tx || p.ty) path.setAttribute('transform', `translate(${p.tx || 0},${p.ty || 0})`);
    path.style.stroke = p.stroke ? dgCss(p.stroke) : 'none';
    path.style.strokeWidth = p.w || 2;
    path.style.fill = p.fill ? (p.alpha >= 1 ? dgCss(p.fill) : `color-mix(in srgb, ${dgCss(p.fill)} ${Math.round((p.alpha ?? 0.1) * 100)}%, transparent)`) : 'none';
    if (p.dash) path.style.strokeDasharray = p.dash;
    g.append(path);
  });
  return g;
}

function diagramCanvas(ctx, L, v) {
  ctx.save();
  ctx.translate(L.ox || 0, L.oy || 0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  L.paths.forEach((p) => {
    const path = new Path2D(p.d);
    ctx.save();
    if (p.tx || p.ty) ctx.translate(p.tx || 0, p.ty || 0);
    if (p.fill) {
      ctx.globalAlpha = p.alpha ?? 0.1;
      ctx.fillStyle = v(`--${p.fill}`);
      ctx.fill(path);
      ctx.globalAlpha = 1;
    }
    if (p.stroke) {
      ctx.strokeStyle = v(`--${p.stroke}`);
      ctx.lineWidth = p.w || 2;
      ctx.setLineDash(p.dash ? p.dash.split(' ').map(Number) : []);
      ctx.stroke(path);
    }
    ctx.restore();
  });
  ctx.restore();
}

// ---------- Elegir tipo y estilo ----------
function setDiagram(patch) {
  const map = currentMap();
  if (!map) return;
  Object.entries(patch).forEach(([k, val]) => (val == null ? delete map[k] : (map[k] = val)));
  map.updatedAt = Date.now();
  save();
  renderDiagramBar();
  renderMap();
  fitMap();
}

function renderDiagramBar() {
  const map = currentMap();
  const btn = $('#mm-kind');
  if (!btn || !map) return;
  const d = diagramOf(map);
  btn.textContent = `${d.icon} ${d.label} ▾`;
  $('#mm-kind-hint').textContent = d.hint;
}

$('#mm-kind').addEventListener('click', (e) => {
  const map = currentMap();
  if (!map) return;
  const cur = diagramOf(map).id;
  const edges = ['mindmap', 'radial', 'org'].includes(cur);
  const edge = map.edge || (cur === 'org' ? 'elbow' : 'curve');
  showMenu(e.currentTarget, [
    ...DIAGRAMS.map((d) => ({ label: `${d.icon} ${d.label}${d.id === cur ? '  ✓' : ''}`, action: () => setDiagram({ kind: d.id === 'mindmap' ? null : d.id }) })),
    ...(edges ? [
      { sep: true },
      ...[['curve', '〰 Líneas curvas'], ['straight', '／ Líneas rectas'], ['elbow', '⌐ Líneas en ángulo']].map(([id, label]) => ({ label: `${label}${edge === id ? '  ✓' : ''}`, action: () => setDiagram({ edge: id === (cur === 'org' ? 'elbow' : 'curve') ? null : id }) })),
    ] : []),
    ...(cur === 'matrix' ? [
      { sep: true },
      ...[1, 2, 3, 4].map((c) => ({ label: `▦ ${c} ${c === 1 ? 'columna' : 'columnas'}${(map.cols || 0) === c ? '  ✓' : ''}`, action: () => setDiagram({ cols: c }) })),
      { label: `▦ Columnas automáticas${map.cols ? '' : '  ✓'}`, action: () => setDiagram({ cols: null }) },
    ] : []),
    { sep: true },
    { label: '📋 Empezar desde una plantilla…', action: openDiagramTemplates },
  ]);
});

// Al abrir un mapa, la barra muestra su tipo.
const dgOpenMap = openMap;
openMap = function openMapWithKind(id) {
  dgOpenMap(id);
  renderDiagramBar();
};

// El tipo elegido al crear el mapa.
const dgNewMap = newMap;
newMap = function newMapWithKind(title) {
  const map = dgNewMap(title);
  const kind = $('#map-kind')?.value;
  if (kind && kind !== 'mindmap' && document.activeElement?.closest?.('#map-form')) map.kind = kind;
  return map;
};

// ---------- Plantillas ----------
const DIAGRAM_TEMPLATES = [
  { kind: 'mindmap', icon: '💡', label: 'Lluvia de ideas', text: 'Tema\n  ¿Qué?\n  ¿Por qué?\n  ¿Quién?\n  ¿Cómo?\n  ¿Cuándo?\n  ¿Dónde?' },
  { kind: 'mindmap', icon: '🚀', label: 'Plan de proyecto', text: 'Proyecto\n  🎯 Objetivo\n    Resultado esperado\n  ✅ Tareas\n    Tarea 1\n    Tarea 2\n  🧰 Recursos\n  ⚠️ Riesgos\n  📅 Fechas\n    Inicio\n    Entrega\n  👤 Equipo' },
  { kind: 'mindmap', icon: '📚', label: 'Resumen de un libro', text: 'Título del libro\n  💡 Ideas clave\n    Idea 1\n    Idea 2\n  🗣️ Citas\n  👤 Personajes o conceptos\n  🛠️ Cómo lo aplico\n  ❓ Preguntas' },
  { kind: 'radial', icon: '🛞', label: 'Rueda de la vida', text: 'Mi vida\n  Salud\n  Familia y pareja\n  Amistades\n  Trabajo\n  Dinero\n  Crecimiento personal\n  Ocio\n  Hogar' },
  { kind: 'org', icon: '🏢', label: 'Organigrama', text: 'Dirección\n  Operaciones\n    Equipo A\n    Equipo B\n  Finanzas\n    Contabilidad\n  Marketing\n    Redes sociales\n    Contenido' },
  { kind: 'org', icon: '🌳', label: 'Árbol de decisión', text: '¿Qué decido?\n  Opción A\n    ✅ Pros\n    ❌ Contras\n  Opción B\n    ✅ Pros\n    ❌ Contras\n  Opción C\n    ✅ Pros\n    ❌ Contras' },
  { kind: 'outline', icon: '🗂️', label: 'Cuadro sinóptico', text: 'Tema\n  Concepto 1\n    Característica\n    Ejemplo\n  Concepto 2\n    Característica\n    Ejemplo\n  Concepto 3\n    Característica\n    Ejemplo' },
  { kind: 'fishbone', icon: '🐟', label: 'Espina de pescado (6M)', text: 'Problema\n  Personas\n    Causa\n  Métodos\n    Causa\n  Máquinas\n    Causa\n  Materiales\n    Causa\n  Medición\n    Causa\n  Entorno\n    Causa' },
  { kind: 'process', icon: '➡️', label: 'Proceso en 5 pasos', text: 'Proceso\n  1. Inicio\n    Qué se necesita\n  2. Preparar\n  3. Hacer\n  4. Revisar\n  5. Entregar' },
  { kind: 'process', icon: '🔁', label: 'Ciclo PDCA', text: 'Mejora continua\n  Planificar\n    Objetivo\n    Plan\n  Hacer\n    Ejecutar\n  Verificar\n    Medir resultados\n  Actuar\n    Ajustar' },
  { kind: 'timeline', icon: '📅', label: 'Línea de tiempo', text: 'Historia\n  Etapa 1\n    Qué pasó\n  Etapa 2\n    Qué pasó\n  Etapa 3\n    Qué pasó\n  Etapa 4\n    Qué pasó' },
  { kind: 'timeline', icon: '🗓️', label: 'Mi año en trimestres', text: 'Mi año\n  Enero - marzo\n    Meta\n  Abril - junio\n    Meta\n  Julio - septiembre\n    Meta\n  Octubre - diciembre\n    Meta' },
  { kind: 'matrix', icon: '🧭', label: 'FODA / DAFO', text: 'FODA\n  💪 Fortalezas\n    \n  🩹 Debilidades\n    \n  🌱 Oportunidades\n    \n  ⚠️ Amenazas\n    ' },
  { kind: 'matrix', icon: '🗂️', label: 'Matriz de Eisenhower', text: 'Prioridades\n  🔥 Urgente e importante: hacer ya\n  📅 Importante, no urgente: planificar\n  🤝 Urgente, no importante: delegar\n  🗑️ Ni urgente ni importante: eliminar' },
  { kind: 'matrix', icon: '📊', label: 'Esfuerzo / impacto', text: 'Ideas\n  ⭐ Mucho impacto, poco esfuerzo\n  🏔️ Mucho impacto, mucho esfuerzo\n  🍬 Poco impacto, poco esfuerzo\n  🚫 Poco impacto, mucho esfuerzo' },
  { kind: 'matrix', icon: '⚖️', label: 'Pros y contras', text: 'Decisión\n  ✅ A favor\n    \n  ❌ En contra\n    ' },
  { kind: 'pyramid', icon: '🔺', label: 'Pirámide de Maslow', text: 'Necesidades\n  Autorrealización\n  Reconocimiento\n  Afiliación\n  Seguridad\n  Fisiológicas' },
  { kind: 'pyramid', icon: '🎯', label: 'De la visión a las tareas', text: 'Mi plan\n  Visión\n    Hacia dónde voy\n  Objetivos\n    Del año\n  Proyectos\n    En marcha\n  Tareas\n    De esta semana' },
];

function createFromTemplate(t) {
  const items = mmParseLines(t.text.replace(/\n\s+(?=\n|$)/g, ''));
  const [head, ...rest] = items;
  const map = dgNewMap(head.text);
  if (t.kind !== 'mindmap') map.kind = t.kind;
  rest.forEach((x) => (x.depth -= 1));
  mmAddLines(map, 'root', rest.map(({ depth, text }) => {
    const m = text.match(/^(\p{Extended_Pictographic}️?)\s+(.*)$/u);
    return { depth, text: m ? m[2] : text, icon: m?.[1] };
  }));
  save();
  openMap(map.id);
}

function openDiagramTemplates() {
  pickFrom('Plantillas de mapas y diagramas…', DIAGRAM_TEMPLATES.map((t) => ({
    label: `${t.icon} ${t.label}`,
    detail: `${diagramOf({ kind: t.kind }).icon} ${diagramOf({ kind: t.kind }).label}`,
    action: () => createFromTemplate(t),
  })));
}
$('#map-templates').addEventListener('click', openDiagramTemplates);

COMMANDS_EXTRA.push(() => [{ label: 'Mapas y diagramas: empezar desde una plantilla…', action: openDiagramTemplates }]);

// ---------- Posición libre: cada nodo se puede mover con el ratón o el dedo ----------
// node.dx / node.dy desplazan el nodo (y todo lo que cuelga de él) desde donde lo pondría el diagrama.
// Las líneas que llegan a un nodo movido se vuelven a trazar; las casillas y franjas de un nodo
// (matriz, pirámide, línea de tiempo…) se mueven con él.
function mmOffsets(map) {
  const off = {};
  const get = (n) => {
    if (off[n.id]) return off[n.id];
    const up = n.parent ? get(map.nodes.find((x) => x.id === n.parent) || { id: '_', dx: 0, dy: 0 }) : [0, 0];
    return (off[n.id] = [up[0] + (n.dx || 0), up[1] + (n.dy || 0)]);
  };
  map.nodes.forEach(get);
  return off;
}

// Línea entre dos cajas (coordenadas del dibujo), por los lados que se miran.
function dgConnector(a, b, arrow = false) {
  const ac = [a.x + a.w / 2, a.y + a.h / 2];
  const bc = [b.x + b.w / 2, b.y + b.h / 2];
  const dx = bc[0] - ac[0];
  const dy = bc[1] - ac[1];
  let d;
  let end;
  let dir;
  if (Math.abs(dx) * 0.6 >= Math.abs(dy)) {
    const s = Math.sign(dx) || 1;
    const x1 = s > 0 ? a.x + a.w : a.x;
    const x2 = s > 0 ? b.x : b.x + b.w;
    const mx = (x1 + x2) / 2;
    d = `M${x1},${ac[1]} C${mx},${ac[1]} ${mx},${bc[1]} ${x2},${bc[1]}`;
    end = [x2, bc[1]];
    dir = [s, 0];
  } else {
    const s = Math.sign(dy) || 1;
    const y1 = s > 0 ? a.y + a.h : a.y;
    const y2 = s > 0 ? b.y : b.y + b.h;
    const my = (y1 + y2) / 2;
    d = `M${ac[0]},${y1} C${ac[0]},${my} ${bc[0]},${my} ${bc[0]},${y2}`;
    end = [bc[0], y2];
    dir = [0, s];
  }
  if (arrow) {
    const [ex, ey] = end;
    const [ux, uy] = dir;
    d += ` M${ex - ux * 10 - uy * 7},${ey - uy * 10 - ux * 7} L${ex},${ey} L${ex - ux * 10 + uy * 7},${ey - uy * 10 + ux * 7} Z`;
  }
  return d;
}

function mmApplyOffsets(map, L) {
  const off = mmOffsets(map);
  const moved = (id) => off[id] && (off[id][0] || off[id][1]);
  if (!map.nodes.some((n) => moved(n.id))) return L;
  L.ox = L.ox || 0;
  L.oy = L.oy || 0;
  Object.entries(L.pos).forEach(([id, p]) => {
    if (!off[id]) return;
    p.x += off[id][0];
    p.y += off[id][1];
  });
  const raw = (id) => ({ ...L.pos[id], x: L.pos[id].x - L.ox, y: L.pos[id].y - L.oy });
  if (L.paths) {
    const out = [];
    L.paths.forEach((p) => {
      if (p.link && L.pos[p.link[0]] && L.pos[p.link[1]]) {
        const [a, b] = p.link;
        if ((off[a]?.[0] || 0) !== (off[b]?.[0] || 0) || (off[a]?.[1] || 0) !== (off[b]?.[1] || 0)) return out.push({ ...p, d: dgConnector(raw(a), raw(b), p.arrow) });
        if (moved(b)) return out.push({ ...p, tx: off[b][0], ty: off[b][1] });
        return out.push(p);
      }
      if (p.group) {
        const [from, kids] = p.group;
        if (kids.some((k) => (off[k]?.[0] || 0) !== (off[from]?.[0] || 0) || (off[k]?.[1] || 0) !== (off[from]?.[1] || 0))) {
          // La llave ya no cuadra: una línea a cada hijo.
          if (p.d.includes('C')) kids.forEach((k) => L.pos[k] && out.push({ stroke: p.stroke, w: 2, d: dgConnector(raw(from), raw(k)) }));
          return;
        }
        if (moved(from)) return out.push({ ...p, tx: off[from][0], ty: off[from][1] });
        return out.push(p);
      }
      if (p.owner && moved(p.owner)) return out.push({ ...p, tx: off[p.owner][0], ty: off[p.owner][1] });
      out.push(p);
    });
    L.paths = out;
  }
  // Que todo siga dentro del lienzo.
  const PAD = 40;
  const ps = Object.values(L.pos);
  const minX = Math.min(PAD, ...ps.map((p) => p.x));
  const minY = Math.min(PAD, ...ps.map((p) => p.y));
  const sx = PAD - minX;
  const sy = PAD - minY;
  ps.forEach((p) => {
    p.x += sx;
    p.y += sy;
  });
  L.ox += sx;
  L.oy += sy;
  L.width = Math.max(L.width + sx, ...ps.map((p) => p.x + p.w + PAD));
  L.height = Math.max(L.height + sy, ...ps.map((p) => p.y + p.h + PAD));
  return L;
}
