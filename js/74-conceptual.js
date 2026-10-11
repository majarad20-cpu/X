'use strict';

// ---------- Mapas conceptuales, formas, diagramas de flujo, Venn, ciclo, embudo y radar ----------
// map.links = [{ id, from, to, label }]: conexiones libres entre dos ideas cualesquiera, con su
// palabra de enlace. node.edgeLabel: palabra en la línea que la une con su idea madre.
// node.shape: forma de la figura (óvalo, rombo, círculo, nota, nube, hexágono). node.score: valor
// en el radar (o un número al final del texto, «Salud 7»).

DIAGRAMS.splice(1, 0,
  { id: 'concept', icon: '🔗', label: 'Mapa conceptual', hint: 'De arriba abajo con flechas. Escribe la palabra de enlace en cada línea (clic derecho › «Palabra de enlace») y une cualquier par de ideas con «Conectar con…» o arrastrando el punto ➜ de la idea elegida.' },
  { id: 'flow', icon: '🔀', label: 'Diagrama de flujo', hint: 'Pasos de arriba abajo. Cambia la forma de cada paso (inicio y fin en óvalo, decisiones en rombo) y pon «Sí» / «No» en las flechas.' });
DIAGRAMS.push(
  { id: 'venn', icon: '⭕', label: 'Diagrama de Venn', hint: 'Cada rama es un conjunto (hasta 3) con sus elementos dentro. Lo que tienen en común va en una rama que empiece por «∩» (p. ej. «∩ En común»).' },
  { id: 'cycle', icon: '🔄', label: 'Ciclo', hint: 'Cada rama es una etapa del ciclo, en orden; sus subramas, los detalles.' },
  { id: 'funnel', icon: '🔻', label: 'Embudo', hint: 'La primera rama es la boca del embudo y la última la salida; las subramas se explican al lado.' },
  { id: 'radar', icon: '🕸️', label: 'Radar', hint: 'Cada rama es un eje. Pon su puntuación al final del texto (p. ej. «Salud 7») o con clic derecho › «Puntuación». La escala va de 0 a 10.' });

// ---------- Formas ----------
const MM_SHAPES = [
  ['', '▢ Rectángulo'],
  ['oval', '⬭ Óvalo (inicio / fin)'],
  ['diamond', '◇ Rombo (decisión)'],
  ['circle', '◯ Círculo'],
  ['hex', '⬡ Hexágono'],
  ['note', '🗒 Nota adhesiva'],
  ['cloud', '☁ Nube'],
];

// Silueta para la imagen exportada (mismo dibujo que en pantalla).
function dgShapePath(ctx, shape, p) {
  const { x, y, w, h } = p;
  if (shape === 'oval' || shape === 'circle' || shape === 'cloud') return ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  if (shape === 'diamond') {
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w, y + h / 2);
    ctx.lineTo(x + w / 2, y + h);
    ctx.lineTo(x, y + h / 2);
    return ctx.closePath();
  }
  if (shape === 'hex') {
    const k = Math.min(18, w / 4);
    ctx.moveTo(x + k, y);
    ctx.lineTo(x + w - k, y);
    ctx.lineTo(x + w, y + h / 2);
    ctx.lineTo(x + w - k, y + h);
    ctx.lineTo(x + k, y + h);
    ctx.lineTo(x, y + h / 2);
    return ctx.closePath();
  }
  return ctx.roundRect(x, y, w, h, shape === 'note' ? 3 : 10);
}

// ---------- Más disposiciones ----------
// Mapa conceptual y diagrama de flujo: el organigrama con flechas.
function dgArrowTips(L) {
  L.paths.forEach((p) => {
    if (!p.link || p.arrow) return;
    // Dirección del último tramo: H (horizontal), V (vertical) o la recta/curva hasta el final.
    const nums = p.d.match(/-?[\d.]+/g).map(Number);
    const last = p.d.trim().match(/([HVLC])[^HVLC]*$/)?.[1];
    let ex;
    let ey;
    let ux;
    let uy;
    if (last === 'H') {
      const m = p.d.match(/M(-?[\d.]+),(-?[\d.]+)(?:[^M]*V(-?[\d.]+))?[^M]*H(-?[\d.]+)$/);
      ey = m ? +(m[3] ?? m[2]) : nums.at(-2);
      ex = nums.at(-1);
      const before = nums.at(-2);
      ux = Math.sign(ex - (m ? +m[1] : before)) || 1;
      uy = 0;
    } else {
      ex = last === 'V' ? nums.at(-2) : nums.at(-2);
      ey = nums.at(-1);
      if (last === 'V') {
        // M x,y V my H x2 V y2: la x final es la del H anterior.
        const h = p.d.match(/H(-?[\d.]+)\s*V(-?[\d.]+)$/);
        if (h) ex = +h[1];
        else ex = nums[0];
      }
      const px = last === 'V' ? ex : nums.at(-4);
      const py = last === 'V' ? ey - 1 : nums.at(-3);
      const len = Math.hypot(ex - px, ey - py) || 1;
      ux = (ex - px) / len;
      uy = (ey - py) / len;
    }
    p.d += ` M${ex - ux * 11 - uy * 6},${ey - uy * 11 + ux * 6} L${ex},${ey} L${ex - ux * 11 + uy * 6},${ey - uy * 11 - ux * 6}`;
    p.arrow = true;
  });
}
DG_LAYOUTS.concept = (map, sizes) => {
  const L = dgOrg({ ...map, edge: map.edge || 'straight', noGroup: true }, sizes);
  dgArrowTips(L);
  return L;
};
DG_LAYOUTS.flow = (map, sizes) => {
  const L = dgOrg({ ...map, edge: map.edge || 'elbow', noGroup: true }, sizes);
  dgArrowTips(L);
  return L;
};

function dgVenn(map, sizes) {
  const root = dgRoot(map);
  const pos = {};
  const paths = [];
  const top = dgKids(map, root.id);
  const common = top.filter((t) => /^\s*[∩&]/.test(t.text));
  const sets = top.filter((t) => !common.includes(t)).slice(0, 3);
  const extra = top.filter((t) => !common.includes(t) && !sets.includes(t));
  const stackH = (list) => list.reduce((a, it) => a + sizes[it.n.id].h + 6, 0);
  const widest = (list) => Math.max(0, ...list.map((it) => sizes[it.n.id].w + it.depth * 14));
  const content = sets.map((s) => ({ s, items: dgFlat(map, s.id) }));
  const commonItems = common.flatMap((c) => [{ n: c, depth: 0 }, ...dgFlat(map, c.id, 1)]);
  const R = Math.max(150, ...content.map((c) => Math.max(widest(c.items) + 40, (stackH(c.items) + sizes[c.s.id].h) * 0.9)), widest(commonItems) + 30);
  const n = Math.max(1, sets.length);
  const centers = n === 1 ? [[0, 0]] : n === 2 ? [[-R * 0.62, 0], [R * 0.62, 0]] : [[-R * 0.6, -R * 0.35], [R * 0.6, -R * 0.35], [0, R * 0.62]];
  content.forEach(({ s, items }, i) => {
    const [cx, cy] = centers[i];
    const col = dgColor(map, s);
    paths.push({ d: `M${cx - R},${cy} a${R},${R} 0 1,0 ${2 * R},0 a${R},${R} 0 1,0 ${-2 * R},0`, stroke: col, fill: col, alpha: 0.16, w: 2, owner: s.id });
    // Lo propio de cada conjunto, hacia fuera (lejos del centro común).
    const ox = n === 1 ? 0 : cx * 0.55;
    const oy = n === 3 ? cy * 0.55 : 0;
    const total = sizes[s.id].h + 10 + stackH(items);
    let y = cy + oy - total / 2;
    dgAt(pos, sizes, s, cx + ox, y + sizes[s.id].h / 2);
    y += sizes[s.id].h + 10;
    items.forEach(({ n: it, depth }) => {
      const sz = sizes[it.id];
      pos[it.id] = { x: cx + ox - sz.w / 2 + depth * 14, y, w: sz.w, h: sz.h };
      y += sz.h + 6;
    });
  });
  // Lo común, en el centro de todos los círculos.
  const cx = centers.slice(0, n).reduce((a, c) => a + c[0], 0) / n;
  const cy = centers.slice(0, n).reduce((a, c) => a + c[1], 0) / n;
  let y = cy - stackH(commonItems) / 2;
  commonItems.forEach(({ n: it, depth }) => {
    const sz = sizes[it.id];
    pos[it.id] = { x: cx - sz.w / 2 + depth * 14, y, w: sz.w, h: sz.h };
    y += sz.h + 6;
  });
  // Ramas de más (cuarto conjunto…): debajo, en fila.
  let ex = -R;
  const below = Math.max(...centers.slice(0, n).map((c) => c[1])) + R + 40;
  extra.forEach((t) => {
    const items = [{ n: t, depth: 0 }, ...dgFlat(map, t.id, 1)];
    let yy = below;
    items.forEach(({ n: it, depth }) => {
      const sz = sizes[it.id];
      pos[it.id] = { x: ex + depth * 14, y: yy, w: sz.w, h: sz.h };
      yy += sz.h + 6;
    });
    ex += widest(items) + 30;
  });
  const minY = Math.min(...centers.slice(0, n).map((c) => c[1])) - R;
  dgAt(pos, sizes, root, cx, minY - sizes[root.id].h / 2 - 20);
  const pts = centers.slice(0, n).flatMap(([x, yy]) => [[x - R, yy - R], [x + R, yy + R]]);
  return dgFinish(map, pos, paths, pts);
}

function dgCycle(map, sizes) {
  const root = dgRoot(map);
  const pos = {};
  const paths = [];
  const steps = dgKids(map, root.id);
  const n = steps.length;
  const R = Math.max(150, (steps.reduce((a, s) => a + Math.max(sizes[s.id].w, sizes[s.id].h) + 40, 0)) / (2 * Math.PI));
  dgAt(pos, sizes, root, 0, 0);
  const ang = (i) => -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, n);
  steps.forEach((s, i) => {
    const a = ang(i);
    const cx = Math.cos(a) * R;
    const cy = Math.sin(a) * R;
    dgAt(pos, sizes, s, cx, cy);
    // Detalles hacia fuera del círculo.
    const items = dgFlat(map, s.id);
    let d = Math.max(sizes[s.id].w, sizes[s.id].h) / 2 + 22;
    items.forEach(({ n: it, depth }) => {
      const sz = sizes[it.id];
      const ix = cx + Math.cos(a) * (d + sz.w / 2);
      const iy = cy + Math.sin(a) * (d + sz.h / 2);
      pos[it.id] = { x: ix - sz.w / 2 + depth * 10, y: iy - sz.h / 2, w: sz.w, h: sz.h };
      d += (Math.abs(Math.cos(a)) * sz.w + Math.abs(Math.sin(a)) * sz.h) + 8;
    });
  });
  // Flechas en arco entre etapas seguidas.
  if (n > 1) {
    steps.forEach((s, i) => {
      const t = steps[(i + 1) % n];
      const gap = (k) => Math.min(0.9, (Math.max(sizes[k.id].w, sizes[k.id].h) / 2 + 12) / R);
      const a0 = ang(i) + gap(s);
      const a1 = ang(i + 1) - gap(t);
      if (a1 <= a0) return;
      const x0 = Math.cos(a0) * R;
      const y0 = Math.sin(a0) * R;
      const x1 = Math.cos(a1) * R;
      const y1 = Math.sin(a1) * R;
      // Punta tangente al círculo en el final.
      const tx = -Math.sin(a1);
      const ty = Math.cos(a1);
      const nx = Math.cos(a1);
      const ny = Math.sin(a1);
      const head = `M${x1 - tx * 12 + nx * 8},${y1 - ty * 12 + ny * 8} L${x1},${y1} L${x1 - tx * 12 - nx * 8},${y1 - ty * 12 - ny * 8}`;
      paths.push({ d: `M${x0},${y0} A${R},${R} 0 0,1 ${x1},${y1} ${head}`, stroke: dgColor(map, t), w: 3, link: [s.id, t.id], arrow: true });
    });
  }
  return dgFinish(map, pos, paths, [[-R - 20, -R - 20], [R + 20, R + 20]]);
}

// Embudo: como la pirámide pero al revés (ancho arriba, estrecho abajo).
function dgFunnel(map, sizes) {
  const root = dgRoot(map);
  const pos = {};
  const paths = [];
  const levels = dgKids(map, root.id);
  const n = Math.max(1, levels.length);
  const B = Math.max(420, ...levels.map((l) => (sizes[l.id].w + 60) * 1.4));
  const widthAt = (k) => B * (1 - (0.78 * k) / n);
  let y = 0;
  levels.forEach((l, i) => {
    const items = dgFlat(map, l.id);
    const itemsH = items.reduce((a, it) => a + sizes[it.n.id].h + 6, 0);
    const bandH = Math.max(sizes[l.id].h + 26, 58, itemsH + 10);
    const tw = widthAt(i);
    const bw = widthAt(i + 1);
    const col = dgColor(map, l);
    paths.push({ d: `M${-tw / 2},${y} L${tw / 2},${y} L${bw / 2},${y + bandH} L${-bw / 2},${y + bandH} Z`, stroke: col, fill: col, alpha: 0.22, w: 1.5, owner: l.id });
    const cy = y + bandH / 2;
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

// Radar: un eje por rama, con su puntuación (0 a 10, o hasta la mayor si alguna pasa de 10).
const dgScore = (n) => {
  if (Number.isFinite(n.score)) return n.score;
  const m = n.text.match(/(-?\d+(?:[.,]\d+)?)\s*(?:\/\s*\d+)?\s*$/);
  return m ? Number(m[1].replace(',', '.')) : null;
};
function dgRadar(map, sizes) {
  const root = dgRoot(map);
  const pos = {};
  const paths = [];
  const axes = dgKids(map, root.id);
  const n = axes.length;
  const R = Math.max(170, n * 22);
  const max = Math.max(10, ...axes.map((a) => dgScore(a) || 0));
  dgAt(pos, sizes, root, 0, -R - 90 - Math.max(0, ...axes.map((a) => sizes[a.id].h)) - sizes[root.id].h / 2);
  const ang = (i) => -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, n);
  if (n >= 3) {
    [0.2, 0.4, 0.6, 0.8, 1].forEach((f) => {
      const pts = axes.map((_, i) => `${Math.cos(ang(i)) * R * f},${Math.sin(ang(i)) * R * f}`);
      paths.push({ d: `M${pts.join(' L')} Z`, stroke: 'border', w: 1 });
    });
  }
  axes.forEach((a, i) => paths.push({ d: `M0,0 L${Math.cos(ang(i)) * R},${Math.sin(ang(i)) * R}`, stroke: 'border', w: 1 }));
  const scored = axes.map((a, i) => {
    const v = Math.max(0, Math.min(max, dgScore(a) || 0));
    return [Math.cos(ang(i)) * R * (v / max), Math.sin(ang(i)) * R * (v / max)];
  });
  if (n >= 3) paths.push({ d: `M${scored.map((p) => p.join(',')).join(' L')} Z`, stroke: 'accent', fill: 'accent', alpha: 0.25, w: 2.5 });
  scored.forEach(([x, y], i) => paths.push({ d: dgDot(x, y, 4), stroke: dgColor(map, axes[i]), fill: dgColor(map, axes[i]), alpha: 1, w: 1 }));
  axes.forEach((a, i) => {
    const s = sizes[a.id];
    const cx = Math.cos(ang(i)) * (R + 26 + s.w / 2 * Math.abs(Math.cos(ang(i))));
    const cy = Math.sin(ang(i)) * (R + 20 + s.h / 2 * Math.abs(Math.sin(ang(i))));
    dgAt(pos, sizes, a, cx, cy);
    // Notas del eje, debajo de su etiqueta.
    let y = pos[a.id].y + s.h + 6;
    dgFlat(map, a.id).forEach(({ n: it, depth }) => {
      const sz = sizes[it.id];
      pos[it.id] = { x: cx - sz.w / 2 + depth * 12, y, w: sz.w, h: sz.h };
      y += sz.h + 6;
    });
  });
  return dgFinish(map, pos, paths, [[-R, -R], [R, R]]);
}
Object.assign(DG_LAYOUTS, { venn: dgVenn, cycle: dgCycle, funnel: dgFunnel, radar: dgRadar });

// ---------- Conexiones libres y palabras de enlace ----------
const LABEL_KINDS = new Set(['mindmap', 'radial', 'org', 'outline', 'concept', 'flow']);
const mapLinks = (map) => (map.links || []).filter((l) => map.nodes.some((n) => n.id === l.from) && map.nodes.some((n) => n.id === l.to));

// Punto donde una línea toca una caja (por el lado que mira a `to`).
function dgFacing(a, b) {
  const ac = [a.x + a.w / 2, a.y + a.h / 2];
  const bc = [b.x + b.w / 2, b.y + b.h / 2];
  const dx = bc[0] - ac[0];
  const dy = bc[1] - ac[1];
  if (Math.abs(dx) * 0.6 >= Math.abs(dy)) return [dx > 0 ? a.x + a.w : a.x, ac[1]];
  return [ac[0], dy > 0 ? a.y + a.h : a.y];
}

// Tras colocar todo: líneas por defecto como trazos, conexiones libres y palabras de enlace.
function dgDecorate(map, L) {
  L.ox = L.ox || 0;
  L.oy = L.oy || 0;
  const raw = (id) => ({ ...L.pos[id], x: L.pos[id].x - L.ox, y: L.pos[id].y - L.oy });
  const kind = diagramOf(map).id;
  const links = mapLinks(map).filter((l) => L.pos[l.from] && L.pos[l.to]);
  const edgeLabels = LABEL_KINDS.has(kind) ? map.nodes.filter((n) => n.parent && n.edgeLabel && L.pos[n.id] && L.pos[n.parent]) : [];
  if (!links.length && !edgeLabels.length) return L;
  // El mapa mental de siempre dibuja sus líneas aparte: se pasan a trazos para añadir lo demás.
  if (!L.paths) L.paths = map.nodes.filter((n) => n.parent && L.pos[n.parent] && L.pos[n.id]).map((n) => ({ d: edgePath(raw(n.parent), raw(n.id), L.side[n.id]), stroke: `b${branchIndex(map, n)}` }));
  L.labels = [];
  links.forEach((l) => {
    const a = raw(l.from);
    const b = raw(l.to);
    // Línea discontinua y punta abierta (sin relleno: la curva no es una figura).
    const d = dgConnector(a, b, true).replace(/ Z$/, '');
    L.paths.push({ d, stroke: 'muted', w: 2, dash: '6 5', xlink: l.id });
    const p1 = dgFacing(a, b);
    const p2 = dgFacing(b, a);
    L.labels.push({ x: (p1[0] + p2[0]) / 2, y: (p1[1] + p2[1]) / 2, text: l.label || '', link: l.id });
  });
  edgeLabels.forEach((n) => {
    const a = raw(n.parent);
    const b = raw(n.id);
    const p1 = dgFacing(a, b);
    const p2 = dgFacing(b, a);
    L.labels.push({ x: (p1[0] + p2[0]) / 2, y: (p1[1] + p2[1]) / 2, text: n.edgeLabel, node: n.id });
  });
  return L;
}

// Etiquetas (palabras de enlace) como texto encima de las líneas; un clic las edita.
function dgRenderLabels(map, L, nodesEl) {
  nodesEl.querySelectorAll('.mm-elabel').forEach((x) => x.remove());
  (L.labels || []).forEach((lb) => {
    const t = el('button', { className: `mm-elabel${lb.text ? '' : ' empty'}`, title: lb.link ? 'Conexión: clic para cambiar la palabra, invertir o borrar' : 'Palabra de enlace: clic para cambiarla' }, lb.text || '＋');
    t.style.transform = `translate(${lb.x + L.ox}px, ${lb.y + L.oy}px) translate(-50%, -50%)`;
    t.addEventListener('click', (e) => {
      e.stopPropagation();
      if (lb.link) linkMenu(lb.link, { x: e.clientX, y: e.clientY });
      else mmEditEdgeLabel(map.nodes.find((n) => n.id === lb.node));
    });
    t.addEventListener('pointerdown', (e) => e.stopPropagation());
    nodesEl.append(t);
  });
}

function linkMenu(id, anchor) {
  const map = currentMap();
  const l = map?.links?.find((x) => x.id === id);
  if (!l) return;
  showMenu(anchor, [
    { label: '✏️ Palabra de enlace…', action: () => promptLinkLabel(l) },
    { label: '⇄ Invertir la dirección', action: () => {
      [l.from, l.to] = [l.to, l.from];
      touchMap(map);
      renderMap();
    } },
    { label: '🗑 Borrar la conexión', danger: true, action: () => {
      map.links = map.links.filter((x) => x.id !== id);
      if (!map.links.length) delete map.links;
      touchMap(map);
      renderMap();
    } },
  ]);
}

function promptLinkLabel(l) {
  const map = currentMap();
  pickFrom('Palabra de enlace…', [
    ...['causa', 'produce', 'es parte de', 'incluye', 'depende de', 'se relaciona con', 'por ejemplo', 'Sí', 'No'].map((w) => ({ label: w, action: () => {
      l.label = w;
      touchMap(map);
      renderMap();
    } })),
    { label: '✏️ Escribir otra…', action: () => promptText({ placeholder: 'Palabra o frase de enlace', initial: l.label || '', action: 'Poner', onSubmit: (q) => {
      l.label = q.trim().slice(0, 40);
      touchMap(map);
      renderMap();
    } }) },
    ...(l.label ? [{ label: '✕ Sin palabra', action: () => {
      delete l.label;
      touchMap(map);
      renderMap();
    } }] : []),
  ]);
}

function mmEditEdgeLabel(node) {
  if (!node?.parent) return;
  promptLinkLabel(new Proxy({}, {
    get: (_, k) => (k === 'label' ? node.edgeLabel : undefined),
    set: (_, k, v) => {
      if (k === 'label') node.edgeLabel = v;
      return true;
    },
    deleteProperty: (_, k) => {
      if (k === 'label') delete node.edgeLabel;
      return true;
    },
  }));
}

function addLink(map, from, to, label) {
  if (from === to) return null;
  map.links ||= [];
  if (map.links.some((l) => (l.from === from && l.to === to) || (l.from === to && l.to === from))) {
    showToastMessage('Esas dos ideas ya están conectadas');
    return null;
  }
  const l = { id: uid(), from, to, ...(label ? { label } : {}) };
  map.links.push(l);
  touchMap(map);
  renderMap();
  return l;
}

function pickLinkTarget() {
  const map = currentMap();
  const from = map && map.nodes.find((n) => n.id === selectedNode);
  if (!from) return;
  pickFrom('Conectar con…', map.nodes.filter((n) => n.id !== from.id).map((n) => ({
    label: `${n.icon ? `${n.icon} ` : ''}${n.text}`,
    action: () => {
      const l = addLink(map, from.id, n.id);
      if (l) promptLinkLabel(l);
    },
  })));
}

// Punto ➜ en la idea elegida: arrastrarlo hasta otra idea crea una conexión; un clic abre la lista.
function dgConnectHandle(map, n, node) {
  if (n.id !== selectedNode) return;
  const h = el('button', { className: 'mm-handle', title: 'Arrastra hasta otra idea para conectarlas (o clic para elegirla)', ariaLabel: 'Conectar con otra idea' }, '➜');
  h.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    const stage = $('#map-stage');
    const svg = $('#map-edges');
    const NS = 'http://www.w3.org/2000/svg';
    const line = document.createElementNS(NS, 'path');
    line.setAttribute('class', 'mm-temp-link');
    svg.append(line);
    const p = mapLayout.pos[n.id];
    const from = [p.x + p.w / 2, p.y + p.h / 2];
    let target = null;
    let moved = false;
    const move = (ev) => {
      moved = true;
      const r = stage.getBoundingClientRect();
      const x = (ev.clientX - r.left) / mapZoom;
      const y = (ev.clientY - r.top) / mapZoom;
      line.setAttribute('d', `M${from[0]},${from[1]} L${x},${y}`);
      const over = document.elementsFromPoint(ev.clientX, ev.clientY).find((x2) => x2.classList?.contains('mm-node'));
      if (target && target !== over) target.classList.remove('mm-drop');
      target = over && over.dataset.id !== n.id ? over : null;
      target?.classList.add('mm-drop');
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      line.remove();
      target?.classList.remove('mm-drop');
      mmDragEnd = Date.now();
      if (!moved) return pickLinkTarget();
      if (target) {
        const l = addLink(map, n.id, target.dataset.id);
        if (l) promptLinkLabel(l);
      }
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  });
  node.append(h);
}
const dgPrevExtras = mmNodeExtras;
mmNodeExtras = function nodeExtrasWithHandle(map, n, node) {
  dgPrevExtras(map, n, node);
  dgConnectHandle(map, n, node);
};

// ---------- Menú de la idea: forma, conexiones, palabra de enlace y puntuación ----------
const dgPrevMenu = mmMenuItems;
mmMenuItems = function menuWithConcept() {
  const items = dgPrevMenu();
  const map = currentMap();
  const node = map && map.nodes.find((n) => n.id === selectedNode);
  if (!node) return items;
  const kind = diagramOf(map).id;
  const extra = [
    { label: '🔷 Forma…', action: () => pickFrom('Forma de la figura…', MM_SHAPES.map(([id, label]) => ({ label: `${label}${(node.shape || '') === id ? '  ✓' : ''}`, action: () => mmSet((x) => (id ? (x.shape = id) : delete x.shape)) }))) },
    { label: '🔗 Conectar con otra idea…', action: pickLinkTarget },
    ...(node.parent && LABEL_KINDS.has(kind) ? [{ label: `🏷 Palabra de enlace${node.edgeLabel ? `: «${node.edgeLabel}»` : ''}…`, action: () => mmEditEdgeLabel(node) }] : []),
    ...(kind === 'radar' && node.parent && node.parent === map.nodes.find((n) => !n.parent).id ? [{ label: `📊 Puntuación${dgScore(node) != null ? `: ${dgScore(node)}` : ''}…`, action: () => pickFrom('Puntuación del eje (0 a 10)…', Array.from({ length: 11 }, (_, v) => ({ label: `${v}`, action: () => mmSet((x) => {
      x.score = v;
      x.text = x.text.replace(/\s*(-?\d+(?:[.,]\d+)?)\s*(?:\/\s*\d+)?\s*$/, '').trim() || x.text;
    }) }))) }] : []),
    ...((map.links || []).some((l) => l.from === node.id || l.to === node.id) ? [{ label: '✕ Quitar sus conexiones', action: () => {
      map.links = map.links.filter((l) => l.from !== node.id && l.to !== node.id);
      if (!map.links.length) delete map.links;
      touchMap(map);
      renderMap();
    } }] : []),
  ];
  const at = items.findIndex((i) => i.sep);
  items.splice(at < 0 ? items.length : at, 0, ...extra);
  return items;
};

// En el radar, la puntuación se ve en la etiqueta del eje.
const dgPrevExtras2 = mmNodeExtras;
mmNodeExtras = function nodeExtrasWithScore(map, n, node) {
  dgPrevExtras2(map, n, node);
  if (map.kind === 'radar' && Number.isFinite(n.score) && n.parent === map.nodes.find((x) => !x.parent)?.id) {
    node.querySelector('.mm-text')?.append(el('span', { className: 'mm-score' }, ` ${n.score}`));
  }
};

// ---------- Dibujo de etiquetas en la imagen ----------
const dgPrevCanvas = diagramCanvas;
diagramCanvas = function diagramCanvasWithLabels(ctx, L, v) {
  dgPrevCanvas(ctx, L, v);
  if (!L.labels?.length) return;
  ctx.save();
  ctx.translate(L.ox || 0, L.oy || 0);
  ctx.font = '600 12px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  L.labels.filter((l) => l.text).forEach((l) => {
    const w = ctx.measureText(l.text).width + 12;
    ctx.fillStyle = v('--bg');
    ctx.beginPath();
    ctx.roundRect(l.x - w / 2, l.y - 10, w, 20, 8);
    ctx.fill();
    ctx.fillStyle = v('--muted');
    ctx.fillText(l.text, l.x, l.y);
  });
  ctx.restore();
};

// ---------- Plantillas nuevas ----------
DIAGRAM_TEMPLATES.push(
  { kind: 'concept', icon: '🔗', label: 'Mapa conceptual', text: 'Concepto principal\n  Idea A\n    Ejemplo\n  Idea B\n    Característica\n  Idea C' },
  { kind: 'flow', icon: '🔀', label: 'Diagrama de flujo', text: 'Inicio\n  Recoger la información\n    ¿Está completa?\n      Revisar y continuar\n        Fin\n      Pedir lo que falta' },
  { kind: 'venn', icon: '⭕', label: 'Comparar dos opciones (Venn)', text: 'Comparación\n  Opción A\n    Solo de A\n  Opción B\n    Solo de B\n  ∩ En común\n    Lo que comparten' },
  { kind: 'venn', icon: '🎯', label: 'Ikigai (Venn de 3)', text: 'Mi propósito\n  Lo que amo\n    \n  Lo que se me da bien\n    \n  Lo que el mundo necesita\n    \n  ∩ Mi ikigai\n    ' },
  { kind: 'cycle', icon: '🔄', label: 'Ciclo de hábito', text: 'Hábito\n  Señal\n  Deseo\n  Respuesta\n  Recompensa' },
  { kind: 'cycle', icon: '🔁', label: 'Ciclo PDCA (circular)', text: 'Mejora continua\n  Planificar\n  Hacer\n  Verificar\n  Actuar' },
  { kind: 'funnel', icon: '🔻', label: 'Embudo de ventas', text: 'Ventas\n  Conocen la marca\n  Se interesan\n  Lo consideran\n  Compran\n  Repiten' },
  { kind: 'radar', icon: '🕸️', label: 'Rueda de la vida (radar)', text: 'Mi vida hoy\n  Salud 5\n  Familia 5\n  Amistades 5\n  Trabajo 5\n  Dinero 5\n  Crecimiento 5\n  Ocio 5\n  Hogar 5' },
  { kind: 'radar', icon: '🧠', label: 'Mis habilidades (radar)', text: 'Habilidades\n  Comunicación 6\n  Organización 7\n  Creatividad 8\n  Técnica 5\n  Liderazgo 6' }
);

// El diagrama de flujo de la plantilla: formas y «Sí» / «No» en las flechas.
const dgPrevCreate = createFromTemplate;
createFromTemplate = function createFromTemplateWithShapes(t) {
  dgPrevCreate(t);
  if (t.label !== 'Diagrama de flujo') return;
  const map = currentMap();
  const by = (text) => map.nodes.find((n) => n.text === text);
  by('Inicio').shape = 'oval';
  by('Fin').shape = 'oval';
  by('¿Está completa?').shape = 'diamond';
  by('Revisar y continuar').edgeLabel = 'Sí';
  by('Pedir lo que falta').edgeLabel = 'No';
  touchMap(map);
  renderMap();
  fitMap();
};

COMMANDS_EXTRA.push(() => (currentMap() && ideaView === 'maps' ? [{ label: 'Mapa: conectar la idea elegida con otra…', action: pickLinkTarget }] : []));
