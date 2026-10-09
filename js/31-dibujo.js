'use strict';

// ---------- Dibujo (al estilo Excalidraw) ----------
// Una pizarra infinita con figuras de trazo «a mano» (rectángulos, rombos, elipses), flechas y
// líneas que se enganchan a las figuras, lápiz con presión, texto (también dentro de las figuras),
// imágenes, selección, mover, cambiar tamaño, girar, agrupar, capas, deshacer, zoom y cuadrícula.
// Los elementos usan el mismo formato que Excalidraw, así que se pueden abrir y guardar archivos
// .excalidraw (también los .excalidraw.md de Obsidian). En la nota se guarda una imagen y, junto a
// ella, la escena para volver a editarla: al tocar el dibujo en la nota se abre otra vez aquí.
const XD_STROKES = ['#1e1e1e', '#e03131', '#2f9e44', '#1971c2', '#f08c00', '#9c36b5'];
const XD_BGS = ['transparent', '#ffc9c9', '#b2f2bb', '#a5d8ff', '#ffec99', '#eebefa'];
const XD_CANVAS_BGS = [['#ffffff', 'Blanco'], ['#f8f9fa', 'Gris claro'], ['#fdf8e7', 'Papel'], ['transparent', 'Transparente']];
const XD_FONTS = { 1: '"Kalam", "Segoe Print", "Comic Sans MS", cursive', 2: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', 3: 'ui-monospace, "Cascadia Code", Menlo, Consolas, monospace' };
const XD_FONT_SIZES = [[16, 'S'], [20, 'M'], [28, 'L'], [36, 'XL']];
const XD_ACCENT = '#6965db';
const XD_LINE_H = 1.25;
const XD_PAD = 6; // margen del texto dentro de una figura
const XD_SHAPES = new Set(['rectangle', 'diamond', 'ellipse']);
const XD_LINEAR = new Set(['arrow', 'line']);
const XD_ICONS = {
  lock: '<path d="M7 11V8a5 5 0 0 1 10 0v3"/><rect x="5" y="11" width="14" height="10" rx="2"/>',
  unlock: '<path d="M7 11V8a5 5 0 0 1 9.6-2"/><rect x="5" y="11" width="14" height="10" rx="2"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11.5v-8a1.5 1.5 0 0 1 3 0V12M14 11.5V5.5a1.5 1.5 0 0 1 3 0V13M17 9.5a1.5 1.5 0 0 1 3 0V15a7 7 0 0 1-7 7h-1.5a7 7 0 0 1-5.6-2.8L3.3 15.6a1.6 1.6 0 0 1 2.4-2.1L8 15.5"/>',
  selection: '<path d="M5 3l14 8-6 1.5L10 19z"/>',
  rectangle: '<rect x="4" y="5" width="16" height="14" rx="2"/>',
  diamond: '<path d="M12 3l9 9-9 9-9-9z"/>',
  ellipse: '<circle cx="12" cy="12" r="8.5"/>',
  arrow: '<path d="M4 20L20 4M20 4h-8M20 4v8"/>',
  line: '<path d="M4 20L20 4"/>',
  freedraw: '<path d="M4 20c3-1 4-4 6-8s4-6 6-6 3 2 1 4-6 6-4 8 4 0 7-2"/>',
  text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  eraser: '<path d="M20 20H9L4 15a2 2 0 0 1 0-2.8l9-9a2 2 0 0 1 2.8 0l4.2 4.2a2 2 0 0 1 0 2.8L11 19"/><path d="M8 9l7 7"/>',
};
const XD_TOOLS = [
  ['hand', 'Mano: mover el lienzo', 'H'],
  ['selection', 'Seleccionar', 'V · 1'],
  ['rectangle', 'Rectángulo', 'R · 2'],
  ['diamond', 'Rombo', 'D · 3'],
  ['ellipse', 'Elipse', 'O · 4'],
  ['arrow', 'Flecha', 'A · 5'],
  ['line', 'Línea', 'L · 6'],
  ['freedraw', 'Lápiz', 'P · 7'],
  ['text', 'Texto', 'T · 8'],
  ['image', 'Imagen', '9'],
  ['eraser', 'Goma', 'E · 0'],
];
const XD_KEYS = { h: 'hand', v: 'selection', 1: 'selection', r: 'rectangle', 2: 'rectangle', d: 'diamond', 3: 'diamond', o: 'ellipse', 4: 'ellipse', a: 'arrow', 5: 'arrow', l: 'line', 6: 'line', p: 'freedraw', x: 'freedraw', 7: 'freedraw', t: 'text', 8: 'text', 9: 'image', e: 'eraser', 0: 'eraser' };

const xd = {
  elements: [],
  selected: new Set(),
  tool: 'selection',
  locked: false,
  view: { x: 0, y: 0, zoom: 1 },
  item: { strokeColor: '#1e1e1e', backgroundColor: 'transparent', fillStyle: 'hachure', strokeWidth: 2, strokeStyle: 'solid', roughness: 1, opacity: 100, edges: 'round', fontSize: 20, fontFamily: 1, textAlign: 'left', startArrowhead: null, endArrowhead: 'arrow' },
  bg: '#ffffff',
  grid: false,
  history: [],
  redo: [],
  action: null,
  pointers: new Map(),
  multi: null,
  editingText: null,
  erasing: new Set(),
  hoverBind: null,
  penSeen: false,
  space: false,
  imgCache: new Map(),
  noteId: null,
  editing: null,
  caret: null,
  initial: '',
  clipboard: null,
};

// ---------- Utilidades ----------
function xdRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const xdRot = (x, y, cx, cy, a) => {
  if (!a) return [x, y];
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
};
const xdDist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const xdR = (v) => Math.round(v * 100) / 100;
const xdLive = () => xd.elements.filter((e) => !e.isDeleted);
const xdGet = (id) => xd.elements.find((e) => e.id === id && !e.isDeleted);
const xdBoundText = (el) => xd.elements.find((t) => t.containerId === el.id && !t.isDeleted);
const isLinearEl = (el) => XD_LINEAR.has(el.type) || el.type === 'freedraw';

function xdDistSeg(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

function newXdElement(type, x, y, extra = {}) {
  const it = xd.item;
  const base = {
    id: uid(),
    type,
    x,
    y,
    width: 0,
    height: 0,
    angle: 0,
    strokeColor: it.strokeColor,
    backgroundColor: XD_SHAPES.has(type) || type === 'freedraw' ? it.backgroundColor : 'transparent',
    fillStyle: it.fillStyle,
    strokeWidth: it.strokeWidth,
    strokeStyle: it.strokeStyle,
    roughness: it.roughness,
    opacity: it.opacity,
    roundness: (type === 'rectangle' || type === 'diamond' || XD_LINEAR.has(type)) && it.edges === 'round' ? { type: type === 'rectangle' ? 3 : 2 } : null,
    seed: Math.floor(Math.random() * 2 ** 31),
    groupIds: [],
    boundElements: [],
    locked: false,
  };
  if (XD_LINEAR.has(type)) Object.assign(base, { points: [[0, 0]], startArrowhead: type === 'arrow' ? it.startArrowhead : null, endArrowhead: type === 'arrow' ? it.endArrowhead : null, startBinding: null, endBinding: null });
  if (type === 'freedraw') Object.assign(base, { points: [[0, 0]], pressures: [], simulatePressure: true });
  if (type === 'text') Object.assign(base, { text: '', originalText: '', fontSize: it.fontSize, fontFamily: it.fontFamily, textAlign: it.textAlign, verticalAlign: 'top', containerId: null, lineHeight: XD_LINE_H });
  return Object.assign(base, extra);
}

// Límites sin girar [x1, y1, x2, y2] (las líneas y trazos, por sus puntos).
function xdBounds(el) {
  if (!el.points) return [el.x, el.y, el.x + el.width, el.y + el.height];
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const [px, py] of el.type === 'arrow' || el.type === 'line' ? xdLinearPath(el, true) : el.points) {
    x1 = Math.min(x1, px);
    y1 = Math.min(y1, py);
    x2 = Math.max(x2, px);
    y2 = Math.max(y2, py);
  }
  return [el.x + x1, el.y + y1, el.x + x2, el.y + y2];
}
const xdCenter = (el) => {
  const [x1, y1, x2, y2] = xdBounds(el);
  return [(x1 + x2) / 2, (y1 + y2) / 2];
};
// Límites alineados con los ejes, contando el giro.
function xdAabb(el) {
  const [x1, y1, x2, y2] = xdBounds(el);
  if (!el.angle) return [x1, y1, x2, y2];
  const [cx, cy] = [(x1 + x2) / 2, (y1 + y2) / 2];
  const pts = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]].map(([x, y]) => xdRot(x, y, cx, cy, el.angle));
  return [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
}
function xdSceneBounds(els) {
  if (!els.length) return null;
  const bs = els.map(xdAabb);
  return [Math.min(...bs.map((b) => b[0])), Math.min(...bs.map((b) => b[1])), Math.max(...bs.map((b) => b[2])), Math.max(...bs.map((b) => b[3]))];
}

// Puntos de una línea o flecha relativos a x, y (curvados si los bordes son redondeados).
function xdLinearPath(el, relative = false) {
  const pts = el.points;
  let out = pts;
  if (el.roundness && pts.length > 2) {
    out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      for (let s = 0; s < 12; s++) {
        const t = s / 12;
        const t2 = t * t;
        const t3 = t2 * t;
        out.push([0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
      }
    }
    out.push(pts[pts.length - 1]);
  }
  return relative ? out : out.map(([x, y]) => [el.x + x, el.y + y]);
}

// ---------- Texto ----------
const xdMeasureCtx = document.createElement('canvas').getContext('2d');
const xdFont = (el) => `${el.fontSize}px ${XD_FONTS[el.fontFamily] || XD_FONTS[1]}`;
function xdMeasure(text, el) {
  xdMeasureCtx.font = xdFont(el);
  const lines = String(text).split('\n');
  return { width: Math.max(1, ...lines.map((l) => xdMeasureCtx.measureText(l).width)), height: lines.length * el.fontSize * XD_LINE_H };
}
function xdWrap(text, el, maxW) {
  xdMeasureCtx.font = xdFont(el);
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/(\s+)/)) {
      const test = line + word;
      if (xdMeasureCtx.measureText(test).width <= maxW || !line.trim()) {
        // Una palabra más ancha que la figura se corta por letras.
        if (xdMeasureCtx.measureText(test).width > maxW && !line.trim()) {
          let chunk = '';
          for (const ch of test) {
            if (xdMeasureCtx.measureText(chunk + ch).width > maxW && chunk) {
              out.push(chunk);
              chunk = '';
            }
            chunk += ch;
          }
          line = chunk;
        } else line = test;
      } else {
        out.push(line.trimEnd());
        line = word.trimStart();
      }
    }
    out.push(line.trimEnd());
  }
  return out.join('\n');
}
// Ancho útil para el texto dentro de una figura.
function xdTextArea(c) {
  const k = c.type === 'ellipse' ? Math.SQRT1_2 : c.type === 'diamond' ? 0.5 : 1;
  return { w: Math.max(20, Math.abs(c.width) * k - XD_PAD * 2), h: Math.max(20, Math.abs(c.height) * k - XD_PAD * 2) };
}
function xdFitText(t) {
  const c = t.containerId && xdGet(t.containerId);
  if (!c || XD_LINEAR.has(c.type)) {
    const m = xdMeasure(t.originalText ?? t.text, t);
    t.text = t.originalText ?? t.text;
    t.width = m.width;
    t.height = m.height;
    if (c) {
      // Etiqueta de flecha: centrada en el punto medio del trazo, sin tocar la flecha.
      const pts = xdLinearPath(c);
      const i = (pts.length - 1) / 2;
      const a = pts[Math.floor(i)];
      const b = pts[Math.ceil(i)];
      t.x = (a[0] + b[0]) / 2 - m.width / 2;
      t.y = (a[1] + b[1]) / 2 - m.height / 2;
      t.angle = 0;
      t.textAlign = 'center';
      t.verticalAlign = 'middle';
    }
    return;
  }
  const area = xdTextArea(c);
  t.text = xdWrap(t.originalText ?? t.text, t, area.w);
  const m = xdMeasure(t.text, t);
  // La figura crece si el texto no cabe.
  if (m.height > area.h) {
    const k = c.type === 'ellipse' ? Math.SQRT1_2 : c.type === 'diamond' ? 0.5 : 1;
    const need = (m.height + XD_PAD * 2) / k;
    const [cx, cy] = xdCenter(c);
    c.y = cy - need / 2;
    c.height = need;
  }
  const [cx, cy] = xdCenter(c);
  t.width = area.w;
  t.height = m.height;
  t.x = cx - area.w / 2;
  t.y = cy - m.height / 2;
  t.angle = c.angle;
  t.textAlign = t.textAlign || 'center';
  t.verticalAlign = 'middle';
}

// ---------- Trazo «a mano» ----------
function xdRoughSeg(ctx, x1, y1, x2, y2, rough, R, passes = 2) {
  if (!rough) {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    return;
  }
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const k = rough * Math.min(2.4, 0.5 + len / 70);
  const nx = -(y2 - y1) / len;
  const ny = (x2 - x1) / len;
  for (let p = 0; p < passes; p++) {
    const j = () => (R() - 0.5) * 2 * k;
    const bow = (R() - 0.5) * rough * Math.min(len / 22, 5);
    const sx = x1 + j() * 0.4;
    const sy = y1 + j() * 0.4;
    const ex = x2 + j() * 0.4;
    const ey = y2 + j() * 0.4;
    ctx.moveTo(sx, sy);
    ctx.bezierCurveTo(sx + (ex - sx) * 0.33 + nx * bow + j(), sy + (ey - sy) * 0.33 + ny * bow + j(), sx + (ex - sx) * 0.67 + nx * bow + j(), sy + (ey - sy) * 0.67 + ny * bow + j(), ex, ey);
  }
}

// Curva suave que pasa por los puntos (Catmull-Rom); con «rough», cada pasada con un leve temblor.
function xdCurve(ctx, pts, rough, R, passes = 2) {
  for (let p = 0; p < (rough ? passes : 1); p++) {
    const amp = rough * 0.9;
    const q = rough ? pts.map(([x, y]) => [x + (R() - 0.5) * amp, y + (R() - 0.5) * amp]) : pts;
    ctx.moveTo(q[0][0], q[0][1]);
    for (let i = 0; i < q.length - 1; i++) {
      const p0 = q[i - 1] || q[i];
      const p1 = q[i];
      const p2 = q[i + 1];
      const p3 = q[i + 2] || p2;
      ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
    }
  }
}

// Polígono (rectángulo, rombo) con esquinas redondeadas opcionales.
function xdPolyGeometry(pts, radius) {
  const n = pts.length;
  const rs = pts.map((v, i) => Math.min(radius, xdDist(v, pts[(i + n - 1) % n]) / 2, xdDist(v, pts[(i + 1) % n]) / 2));
  const toward = (a, b, d) => {
    const l = xdDist(a, b) || 1;
    return [a[0] + ((b[0] - a[0]) * d) / l, a[1] + ((b[1] - a[1]) * d) / l];
  };
  return pts.map((v, i) => {
    const nx = pts[(i + 1) % n];
    return { start: toward(v, nx, rs[i]), end: toward(nx, v, rs[(i + 1) % n]), corner: nx, next: toward(nx, pts[(i + 2) % n], rs[(i + 1) % n]), r: rs[(i + 1) % n] };
  });
}
function xdShapePoints(el) {
  const { x, y, width: w, height: h } = el;
  if (el.type === 'diamond') return [[x + w / 2, y], [x + w, y + h / 2], [x + w / 2, y + h], [x, y + h / 2]];
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}
const xdRadius = (el) => (!el.roundness ? 0 : el.type === 'diamond' ? Math.min(Math.abs(el.width), Math.abs(el.height)) * 0.07 : Math.min(32, Math.min(Math.abs(el.width), Math.abs(el.height)) * 0.25));

// Contorno exacto (para rellenar y recortar).
function xdShapePath(ctx, el) {
  ctx.beginPath();
  if (el.type === 'ellipse') {
    ctx.ellipse(el.x + el.width / 2, el.y + el.height / 2, Math.abs(el.width / 2), Math.abs(el.height / 2), 0, 0, Math.PI * 2);
    return;
  }
  const g = xdPolyGeometry(xdShapePoints(el), xdRadius(el));
  ctx.moveTo(g[0].start[0], g[0].start[1]);
  for (const s of g) {
    ctx.lineTo(s.end[0], s.end[1]);
    ctx.quadraticCurveTo(s.corner[0], s.corner[1], s.next[0], s.next[1]);
  }
  ctx.closePath();
}

function xdStrokeShape(ctx, el, R) {
  const rough = el.strokeStyle === 'solid' ? el.roughness : Math.min(el.roughness, 0.6);
  const passes = el.strokeStyle === 'solid' ? 2 : 1;
  ctx.beginPath();
  if (el.type === 'ellipse') {
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    const rx = Math.abs(el.width / 2);
    const ry = Math.abs(el.height / 2);
    if (!rough) ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    else {
      for (let p = 0; p < passes; p++) {
        const a0 = R() * Math.PI * 2;
        const n = 18;
        const span = Math.PI * 2 + 0.25 + R() * 0.25 * rough;
        const pts = [];
        for (let i = 0; i <= n; i++) {
          const a = a0 + (span * i) / n;
          const k = 1 + (R() - 0.5) * 0.035 * rough;
          pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
        }
        xdCurve(ctx, pts, rough * 0.4, R, 1);
      }
    }
  } else {
    const g = xdPolyGeometry(xdShapePoints(el), xdRadius(el));
    if (!rough) {
      xdShapePath(ctx, el);
    } else {
      for (const s of g) {
        xdRoughSeg(ctx, s.start[0], s.start[1], s.end[0], s.end[1], rough, R, passes);
        if (s.r > 0.5)
          for (let p = 0; p < passes; p++) {
            const j = () => (R() - 0.5) * rough;
            ctx.moveTo(s.end[0] + j(), s.end[1] + j());
            ctx.quadraticCurveTo(s.corner[0] + j(), s.corner[1] + j(), s.next[0] + j(), s.next[1] + j());
          }
      }
    }
  }
  ctx.stroke();
}

function xdFill(ctx, el, R) {
  if (!el.backgroundColor || el.backgroundColor === 'transparent') return;
  ctx.save();
  if (el.fillStyle === 'solid') {
    ctx.fillStyle = el.backgroundColor;
    xdShapePath(ctx, el);
    ctx.fill();
    ctx.restore();
    return;
  }
  xdShapePath(ctx, el);
  ctx.clip();
  ctx.strokeStyle = el.backgroundColor;
  ctx.lineWidth = Math.max(1, el.strokeWidth / 2);
  ctx.setLineDash([]);
  const [x1, y1, x2, y2] = xdBounds(el);
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const diag = Math.hypot(x2 - x1, y2 - y1) / 2 + 4;
  const gap = Math.max(5, el.strokeWidth * 4);
  const angles = el.fillStyle === 'cross-hatch' ? [-41, 49] : [-41];
  ctx.beginPath();
  for (const deg of angles) {
    const a = (deg * Math.PI) / 180;
    const d = [Math.cos(a), Math.sin(a)];
    const n = [-d[1], d[0]];
    for (let s = -diag; s <= diag; s += gap) {
      const px = cx + n[0] * s;
      const py = cy + n[1] * s;
      xdRoughSeg(ctx, px - d[0] * diag, py - d[1] * diag, px + d[0] * diag, py + d[1] * diag, el.roughness * 0.6, R, 1);
    }
  }
  ctx.stroke();
  ctx.restore();
}

function xdArrowhead(ctx, el, tip, from, kind, R) {
  if (!kind) return;
  const ang = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
  const len = xdDist(tip, from);
  const size = Math.min(Math.max(10, 8 + el.strokeWidth * 5), Math.max(10, len * 0.6), 34);
  const at = (a, d) => [tip[0] + Math.cos(a) * d, tip[1] + Math.sin(a) * d];
  ctx.beginPath();
  if (kind === 'arrow') {
    const l = at(ang + Math.PI - 0.45, size);
    const r = at(ang + Math.PI + 0.45, size);
    xdRoughSeg(ctx, l[0], l[1], tip[0], tip[1], el.roughness * 0.5, R, 1);
    xdRoughSeg(ctx, r[0], r[1], tip[0], tip[1], el.roughness * 0.5, R, 1);
    ctx.stroke();
  } else if (kind === 'bar') {
    const l = at(ang + Math.PI / 2, size / 2);
    const r = at(ang - Math.PI / 2, size / 2);
    xdRoughSeg(ctx, l[0], l[1], r[0], r[1], el.roughness * 0.5, R, 1);
    ctx.stroke();
  } else if (kind === 'dot') {
    ctx.arc(tip[0], tip[1], Math.max(3, size / 4), 0, Math.PI * 2);
    ctx.fillStyle = el.strokeColor;
    ctx.fill();
  } else {
    const l = at(ang + Math.PI - 0.4, size);
    const r = at(ang + Math.PI + 0.4, size);
    ctx.moveTo(tip[0], tip[1]);
    ctx.lineTo(l[0], l[1]);
    ctx.lineTo(r[0], r[1]);
    ctx.closePath();
    ctx.fillStyle = el.strokeColor;
    ctx.fill();
    ctx.stroke();
  }
}

function xdFreedraw(ctx, el) {
  const pts = el.points;
  const base = 1 + el.strokeWidth * 1.4;
  const w = (i) => base * (el.simulatePressure || !el.pressures?.length ? 1 : 0.35 + (el.pressures[i] ?? 0.5) * 1.3);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash([]);
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(el.x + pts[0][0], el.y + pts[0][1], w(0) / 2, 0, Math.PI * 2);
    ctx.fillStyle = el.strokeColor;
    ctx.fill();
    return;
  }
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const prev = pts[i - 2];
    ctx.lineWidth = w(i);
    ctx.beginPath();
    if (prev) {
      ctx.moveTo(el.x + (prev[0] + a[0]) / 2, el.y + (prev[1] + a[1]) / 2);
      ctx.quadraticCurveTo(el.x + a[0], el.y + a[1], el.x + (a[0] + b[0]) / 2, el.y + (a[1] + b[1]) / 2);
    } else {
      ctx.moveTo(el.x + a[0], el.y + a[1]);
      ctx.lineTo(el.x + (a[0] + b[0]) / 2, el.y + (a[1] + b[1]) / 2);
    }
    ctx.stroke();
  }
  // Último tramo hasta el final.
  const a = pts[pts.length - 2];
  const b = pts[pts.length - 1];
  ctx.beginPath();
  ctx.moveTo(el.x + (a[0] + b[0]) / 2, el.y + (a[1] + b[1]) / 2);
  ctx.lineTo(el.x + b[0], el.y + b[1]);
  ctx.stroke();
}

function xdDrawText(ctx, el) {
  ctx.font = xdFont(el);
  ctx.fillStyle = el.strokeColor;
  ctx.textBaseline = 'middle';
  const lh = el.fontSize * XD_LINE_H;
  const align = el.textAlign || 'left';
  ctx.textAlign = align;
  const x = align === 'center' ? el.x + el.width / 2 : align === 'right' ? el.x + el.width : el.x;
  String(el.text).split('\n').forEach((line, i) => ctx.fillText(line, x, el.y + i * lh + lh / 2));
}

function xdImage(fileId) {
  if (xd.imgCache.has(fileId)) return xd.imgCache.get(fileId);
  const img = new Image();
  img.decoding = 'async';
  xd.imgCache.set(fileId, img);
  getFile(fileId).then((rec) => {
    if (rec?.data) {
      img.onload = () => xdScheduleRender();
      img.src = rec.data;
    }
  });
  return img;
}

function xdDrawElement(ctx, el) {
  ctx.save();
  ctx.globalAlpha = (el.opacity ?? 100) / 100 * (xd.erasing.has(el.id) ? 0.25 : 1);
  if (el.angle) {
    const [cx, cy] = xdCenter(el);
    ctx.translate(cx, cy);
    ctx.rotate(el.angle);
    ctx.translate(-cx, -cy);
  }
  const R = xdRng(el.seed || 1);
  ctx.strokeStyle = el.strokeColor;
  ctx.lineWidth = el.strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash(el.strokeStyle === 'dashed' ? [8, 8 + el.strokeWidth * 2] : el.strokeStyle === 'dotted' ? [1, 6 + el.strokeWidth * 2] : []);
  if (XD_SHAPES.has(el.type)) {
    xdFill(ctx, el, R);
    xdStrokeShape(ctx, el, R);
  } else if (XD_LINEAR.has(el.type)) {
    const pts = xdLinearPath(el);
    ctx.beginPath();
    if (el.roundness && pts.length > 2) xdCurve(ctx, pts.filter((_, i) => i % 3 === 0 || i === pts.length - 1), el.roughness * 0.5, R, el.strokeStyle === 'solid' ? 2 : 1);
    else for (let i = 0; i < pts.length - 1; i++) xdRoughSeg(ctx, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], el.roughness, R, el.strokeStyle === 'solid' ? 2 : 1);
    ctx.stroke();
    ctx.setLineDash([]);
    if (pts.length > 1) {
      const back = (from) => pts.slice().reverse().find((q, i) => i && xdDist(q, from) > 4) || pts[pts.length - 2];
      xdArrowhead(ctx, el, pts[pts.length - 1], back(pts[pts.length - 1]), el.endArrowhead, R);
      const fwd = pts.find((q, i) => i && xdDist(q, pts[0]) > 4) || pts[1];
      xdArrowhead(ctx, el, pts[0], fwd, el.startArrowhead, R);
    }
  } else if (el.type === 'freedraw') {
    xdFreedraw(ctx, el);
  } else if (el.type === 'text') {
    if (xd.editingText !== el.id) xdDrawText(ctx, el);
  } else if (el.type === 'image') {
    const img = el.fileId && xdImage(el.fileId);
    if (img?.complete && img.naturalWidth) ctx.drawImage(img, el.x, el.y, el.width, el.height);
    else {
      ctx.fillStyle = '#e9ecef';
      ctx.fillRect(el.x, el.y, el.width, el.height);
    }
  }
  ctx.restore();
}

function xdDrawScene(ctx, els) {
  for (const el of els) xdDrawElement(ctx, el);
}

// ---------- Lienzo en pantalla ----------
const xdCanvas = $('#draw-canvas');
let xdRaf = 0;
const xdScheduleRender = () => {
  if (!xdRaf) xdRaf = requestAnimationFrame(xdRender);
};
const xdToWorld = (sx, sy) => [sx / xd.view.zoom - xd.view.x, sy / xd.view.zoom - xd.view.y];
const xdToScreen = (wx, wy) => [(wx + xd.view.x) * xd.view.zoom, (wy + xd.view.y) * xd.view.zoom];

function xdResize() {
  const wrap = $('#draw-wrap');
  const dpr = window.devicePixelRatio || 1;
  xdCanvas.width = Math.round(wrap.clientWidth * dpr);
  xdCanvas.height = Math.round(wrap.clientHeight * dpr);
  xdCanvas.style.width = `${wrap.clientWidth}px`;
  xdCanvas.style.height = `${wrap.clientHeight}px`;
  xdRender();
}

function xdRender() {
  xdRaf = 0;
  if ($('#draw').hidden) return;
  const ctx = xdCanvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const { x, y, zoom } = xd.view;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, xdCanvas.width, xdCanvas.height);
  if (xd.bg !== 'transparent') {
    ctx.fillStyle = xd.bg;
    ctx.fillRect(0, 0, xdCanvas.width, xdCanvas.height);
  }
  ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * zoom * x, dpr * zoom * y);
  const [vx1, vy1] = xdToWorld(0, 0);
  const [vx2, vy2] = xdToWorld(xdCanvas.width / dpr, xdCanvas.height / dpr);
  if (xd.grid) {
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,.07)';
    ctx.lineWidth = 1 / zoom;
    ctx.beginPath();
    for (let gx = Math.floor(vx1 / 20) * 20; gx < vx2; gx += 20) {
      ctx.moveTo(gx, vy1);
      ctx.lineTo(gx, vy2);
    }
    for (let gy = Math.floor(vy1 / 20) * 20; gy < vy2; gy += 20) {
      ctx.moveTo(vx1, gy);
      ctx.lineTo(vx2, gy);
    }
    ctx.stroke();
    ctx.restore();
  }
  // Solo se dibuja lo que está a la vista.
  const visible = xdLive().filter((el) => {
    const b = xdAabb(el);
    return b[2] >= vx1 - 50 && b[0] <= vx2 + 50 && b[3] >= vy1 - 50 && b[1] <= vy2 + 50;
  });
  xdDrawScene(ctx, visible);
  xdDrawOverlay(ctx);
}

// Selección, tiradores, recuadro de selección y figura a la que se enganchará una flecha.
function xdDrawOverlay(ctx) {
  const z = xd.view.zoom;
  ctx.save();
  ctx.lineWidth = 1 / z;
  ctx.strokeStyle = XD_ACCENT;
  if (xd.hoverBind) {
    const el = xdGet(xd.hoverBind);
    if (el) {
      ctx.save();
      const [cx, cy] = xdCenter(el);
      ctx.translate(cx, cy);
      ctx.rotate(el.angle || 0);
      ctx.translate(-cx, -cy);
      ctx.lineWidth = 4 / z;
      ctx.strokeStyle = 'rgba(105,101,219,.35)';
      const [x1, y1, x2, y2] = xdBounds(el);
      ctx.strokeRect(x1 - 5 / z, y1 - 5 / z, x2 - x1 + 10 / z, y2 - y1 + 10 / z);
      ctx.restore();
    }
  }
  const sel = xdSelectedEls();
  if (sel.length && !xd.editingText && xd.action?.type !== 'create' && xd.action?.type !== 'freedraw') {
    const handles = xdHandles();
    if (sel.length === 1 && !(XD_LINEAR.has(sel[0].type) && sel[0].points.length === 2) && handles.frame) {
      const f = handles.frame;
      ctx.save();
      ctx.translate(f.cx, f.cy);
      ctx.rotate(f.angle);
      ctx.strokeRect(-f.w / 2 - 4 / z, -f.h / 2 - 4 / z, f.w + 8 / z, f.h + 8 / z);
      ctx.restore();
    } else if (sel.length > 1) {
      const b = xdSceneBounds(sel);
      ctx.setLineDash([4 / z, 3 / z]);
      sel.forEach((el) => {
        const a = xdAabb(el);
        ctx.strokeRect(a[0], a[1], a[2] - a[0], a[3] - a[1]);
      });
      ctx.setLineDash([]);
      ctx.strokeRect(b[0] - 4 / z, b[1] - 4 / z, b[2] - b[0] + 8 / z, b[3] - b[1] + 8 / z);
    }
    for (const h of handles.list) {
      ctx.beginPath();
      ctx.fillStyle = '#fff';
      if (h.kind === 'rotate' || h.kind === 'point' || h.kind === 'mid') ctx.arc(h.x, h.y, (h.kind === 'mid' ? 3.5 : 5) / z, 0, Math.PI * 2);
      else ctx.rect(h.x - 4 / z, h.y - 4 / z, 8 / z, 8 / z);
      if (h.kind === 'mid') ctx.fillStyle = 'rgba(105,101,219,.35)';
      ctx.fill();
      ctx.stroke();
    }
  }
  if (xd.action?.type === 'marquee') {
    const { x0, y0, x1, y1 } = xd.action;
    ctx.fillStyle = 'rgba(105,101,219,.08)';
    ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
  }
  if (xd.action?.type === 'erase' && xd.action.trail.length > 1) {
    ctx.strokeStyle = 'rgba(0,0,0,.25)';
    ctx.lineWidth = 6 / z;
    ctx.beginPath();
    xd.action.trail.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  }
  ctx.restore();
}

// ---------- Selección ----------
const xdSelectedEls = () => xdLive().filter((e) => xd.selected.has(e.id));
function xdSelect(ids, add = false) {
  if (!add) xd.selected.clear();
  ids.forEach((id) => xd.selected.add(id));
  xdRenderProps();
  xdScheduleRender();
}
// Al tocar un elemento se elige su grupo más externo (como en Excalidraw).
function xdGroupMembers(el) {
  const g = el.groupIds?.[el.groupIds.length - 1];
  return g ? xdLive().filter((e) => e.groupIds?.includes(g) && !e.containerId).map((e) => e.id) : [el.id];
}

function xdHandles() {
  const sel = xdSelectedEls();
  const z = xd.view.zoom;
  const list = [];
  if (!sel.length) return { list };
  if (sel.length === 1 && XD_LINEAR.has(sel[0].type)) {
    const el = sel[0];
    const [cx, cy] = xdCenter(el);
    el.points.forEach(([px, py], i) => {
      const [x, y] = xdRot(el.x + px, el.y + py, cx, cy, el.angle);
      list.push({ kind: 'point', index: i, x, y });
    });
    for (let i = 0; i < el.points.length - 1; i++) {
      const [x, y] = xdRot(el.x + (el.points[i][0] + el.points[i + 1][0]) / 2, el.y + (el.points[i][1] + el.points[i + 1][1]) / 2, cx, cy, el.angle);
      list.push({ kind: 'mid', index: i, x, y });
    }
    if (el.points.length === 2) return { list };
  }
  let frame;
  if (sel.length === 1) {
    const el = sel[0];
    const [x1, y1, x2, y2] = xdBounds(el);
    frame = { cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, w: x2 - x1, h: y2 - y1, angle: el.angle || 0 };
  } else {
    const [x1, y1, x2, y2] = xdSceneBounds(sel);
    frame = { cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, w: x2 - x1, h: y2 - y1, angle: 0 };
  }
  const hw = frame.w / 2 + 4 / z;
  const hh = frame.h / 2 + 4 / z;
  const at = (lx, ly) => xdRot(frame.cx + lx, frame.cy + ly, frame.cx, frame.cy, frame.angle);
  const small = frame.w * z < 30 || frame.h * z < 30;
  const dirs = { nw: [-hw, -hh], ne: [hw, -hh], sw: [-hw, hh], se: [hw, hh] };
  if (!small && !(sel.length === 1 && sel[0].type === 'text')) Object.assign(dirs, { n: [0, -hh], s: [0, hh], w: [-hw, 0], e: [hw, 0] });
  if (sel.length > 1 || sel[0].type === 'text') ['n', 's', 'w', 'e'].forEach((d) => delete dirs[d]);
  for (const [dir, [lx, ly]] of Object.entries(dirs)) {
    const [x, y] = at(lx, ly);
    list.push({ kind: 'resize', dir, x, y });
  }
  if (sel.length === 1 && !XD_LINEAR.has(sel[0].type)) {
    const [x, y] = at(0, -hh - 18 / z);
    list.push({ kind: 'rotate', x, y });
  }
  return { list, frame };
}

function xdHitHandle(p) {
  const tol = 8 / xd.view.zoom;
  return xdHandles().list.find((h) => Math.hypot(h.x - p[0], h.y - p[1]) <= tol) || null;
}

// ¿El punto toca el elemento? (en su marco sin girar)
function xdHit(el, p, tol) {
  const [cx, cy] = xdCenter(el);
  const [x, y] = xdRot(p[0], p[1], cx, cy, -(el.angle || 0));
  const sw = el.strokeWidth / 2 + tol;
  if (el.type === 'text' || el.type === 'image') return x >= el.x - tol && x <= el.x + el.width + tol && y >= el.y - tol && y <= el.y + el.height + tol;
  if (el.points) {
    const pts = el.type === 'freedraw' ? el.points.map(([px, py]) => [el.x + px, el.y + py]) : xdLinearPath(el);
    if (pts.length === 1) return xdDist(pts[0], [x, y]) <= sw + 4;
    for (let i = 0; i < pts.length - 1; i++) if (xdDistSeg([x, y], pts[i], pts[i + 1]) <= sw + (el.type === 'freedraw' ? el.strokeWidth : 0)) return true;
    return false;
  }
  const filled = el.backgroundColor && el.backgroundColor !== 'transparent';
  const inside = xdInside(el, x, y);
  if (inside && (filled || xd.selected.has(el.id) || xdBoundText(el))) return true;
  // Cerca del contorno.
  if (el.type === 'ellipse') {
    const rx = Math.abs(el.width / 2);
    const ry = Math.abs(el.height / 2);
    const k = Math.hypot((x - el.x - el.width / 2) / rx, (y - el.y - el.height / 2) / ry);
    return Math.abs(k - 1) * Math.min(rx, ry) <= sw + 2;
  }
  const pts = xdShapePoints(el);
  return pts.some((a, i) => xdDistSeg([x, y], a, pts[(i + 1) % pts.length]) <= sw + 2);
}
function xdInside(el, x, y) {
  if (el.type === 'ellipse') return Math.hypot((x - el.x - el.width / 2) / (el.width / 2 || 1), (y - el.y - el.height / 2) / (el.height / 2 || 1)) <= 1;
  if (el.type === 'diamond') return Math.abs(x - el.x - el.width / 2) / (el.width / 2 || 1) + Math.abs(y - el.y - el.height / 2) / (el.height / 2 || 1) <= 1;
  return x >= el.x && x <= el.x + el.width && y >= el.y && y <= el.y + el.height;
}
// Figura (rectángulo, rombo, elipse) que contiene el punto, aunque no tenga relleno: para escribir dentro.
function xdContainerAt(p) {
  const els = xdLive();
  for (let i = els.length - 1; i >= 0; i--) {
    const el = els[i];
    if (!XD_SHAPES.has(el.type)) continue;
    const [cx, cy] = xdCenter(el);
    const [x, y] = xdRot(p[0], p[1], cx, cy, -(el.angle || 0));
    if (xdInside(el, x, y)) return el;
  }
  return null;
}
function xdHitElement(p) {
  const tol = 6 / xd.view.zoom;
  const els = xdLive();
  for (let i = els.length - 1; i >= 0; i--) {
    const el = els[i];
    if (xdHit(el, p, tol)) return el.containerId ? xdGet(el.containerId) || el : el;
  }
  return null;
}

// ---------- Flechas enganchadas ----------
// Punto del contorno de la figura en la dirección de «from» (con un pequeño margen).
function xdOutlinePoint(el, from, gap = 6) {
  const [cx, cy] = xdCenter(el);
  const [lx, ly] = xdRot(from[0], from[1], cx, cy, -(el.angle || 0));
  let dx = lx - cx;
  let dy = ly - cy;
  if (!dx && !dy) dy = -1;
  const hw = Math.abs(el.width / 2) || 1;
  const hh = Math.abs(el.height / 2) || 1;
  const t = el.type === 'ellipse' ? 1 / Math.hypot(dx / hw, dy / hh) : el.type === 'diamond' ? 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh) : Math.min(hw / Math.abs(dx || 1e-9), hh / Math.abs(dy || 1e-9));
  const len = Math.hypot(dx, dy);
  const px = cx + dx * t + (dx / len) * gap;
  const py = cy + dy * t + (dy / len) * gap;
  return xdRot(px, py, cx, cy, el.angle || 0);
}

const xdBindable = (el) => el && (XD_SHAPES.has(el.type) || el.type === 'text' || el.type === 'image') && !el.containerId;
function xdBindTarget(p, exclude) {
  const els = xdLive();
  for (let i = els.length - 1; i >= 0; i--) {
    const el = els[i];
    if (el.id === exclude || !xdBindable(el)) continue;
    const [cx, cy] = xdCenter(el);
    const [x, y] = xdRot(p[0], p[1], cx, cy, -(el.angle || 0));
    const m = 12 / xd.view.zoom;
    const [x1, y1, x2, y2] = xdBounds(el);
    if (x >= x1 - m && x <= x2 + m && y >= y1 - m && y <= y2 + m) return el;
  }
  return null;
}

function xdSetBinding(arrow, end, target) {
  const key = end === 'start' ? 'startBinding' : 'endBinding';
  const old = arrow[key]?.elementId;
  if (old && old !== target?.id) {
    const o = xdGet(old);
    // Solo se quita la referencia si el otro extremo no apunta a la misma figura.
    const other = arrow[end === 'start' ? 'endBinding' : 'startBinding']?.elementId;
    if (o && other !== old) o.boundElements = (o.boundElements || []).filter((b) => b.id !== arrow.id);
  }
  arrow[key] = target ? { elementId: target.id, focus: 0, gap: 6 } : null;
  if (target && !(target.boundElements || []).some((b) => b.id === arrow.id)) target.boundElements = [...(target.boundElements || []), { id: arrow.id, type: 'arrow' }];
}

// Recoloca los extremos de las flechas enganchadas a estos elementos.
function xdUpdateArrows(ids) {
  const set = new Set(ids);
  for (const a of xdLive()) {
    if (!XD_LINEAR.has(a.type) || (!set.has(a.startBinding?.elementId) && !set.has(a.endBinding?.elementId))) continue;
    xdRouteArrow(a);
  }
}
function xdRouteArrow(a) {
  const abs = a.points.map(([px, py]) => [a.x + px, a.y + py]);
  const s = a.startBinding && xdGet(a.startBinding.elementId);
  const e = a.endBinding && xdGet(a.endBinding.elementId);
  const n = abs.length;
  if (s) abs[0] = xdOutlinePoint(s, n > 2 ? abs[1] : e ? xdCenter(e) : abs[n - 1]);
  if (e) abs[n - 1] = xdOutlinePoint(e, n > 2 ? abs[n - 2] : s ? xdCenter(s) : abs[0]);
  if (s && n === 2 && e) abs[0] = xdOutlinePoint(s, abs[1]);
  xdSetAbsPoints(a, abs);
}
function xdSetAbsPoints(el, abs) {
  el.x = abs[0][0];
  el.y = abs[0][1];
  el.points = abs.map(([x, y]) => [xdR(x - el.x), xdR(y - el.y)]);
  const [x1, y1, x2, y2] = xdBounds(el);
  el.width = x2 - x1;
  el.height = y2 - y1;
}

// ---------- Historial ----------
const xdSnap = () => JSON.stringify(xd.elements.filter((e) => !e.isDeleted));
function xdBegin() {
  xd.pending = xdSnap();
}
function xdCommit() {
  if (xd.pending === undefined) return;
  const now = xdSnap();
  if (now !== xd.pending) {
    xd.history.push(xd.pending);
    if (xd.history.length > 150) xd.history.shift();
    xd.redo = [];
  }
  xd.pending = undefined;
  xdRenderChrome();
}
function xdMutate(fn) {
  xdBegin();
  fn();
  xdCommit();
  xdRenderProps();
  xdScheduleRender();
}
// Una línea a medias (clic a clic) se cierra antes; si se descarta, eso ya cuenta como deshacer.
function xdCloseMulti() {
  const id = xd.multi;
  if (!id) return false;
  xdFinishMulti();
  xd.pending = undefined;
  return !xdGet(id);
}
function xdUndo() {
  xdEndText();
  if (xdCloseMulti()) return;
  const prev = xd.history.pop();
  if (prev === undefined) return;
  xd.redo.push(xdSnap());
  xd.elements = JSON.parse(prev);
  xd.selected = new Set([...xd.selected].filter((id) => xdGet(id)));
  xdAfterHistory();
}
function xdRedo() {
  if (xdCloseMulti()) return;
  const next = xd.redo.pop();
  if (next === undefined) return;
  xd.history.push(xdSnap());
  xd.elements = JSON.parse(next);
  xd.selected = new Set([...xd.selected].filter((id) => xdGet(id)));
  xdAfterHistory();
}
function xdAfterHistory() {
  xd.multi = null;
  xdRenderChrome();
  xdRenderProps();
  xdScheduleRender();
}

// ---------- Acciones sobre la selección ----------
function xdDelete(ids) {
  const all = new Set(ids);
  // Con una figura se va su texto; las flechas que la tocaban se sueltan.
  xdLive().forEach((e) => e.containerId && all.has(e.containerId) && all.add(e.id));
  xd.elements = xd.elements.filter((e) => !all.has(e.id));
  for (const e of xd.elements) {
    if (e.startBinding && all.has(e.startBinding.elementId)) e.startBinding = null;
    if (e.endBinding && all.has(e.endBinding.elementId)) e.endBinding = null;
    if (e.boundElements?.length) e.boundElements = e.boundElements.filter((b) => !all.has(b.id));
    if (e.containerId && all.has(e.containerId)) e.containerId = null;
  }
  ids.forEach((id) => xd.selected.delete(id));
}

// Copia elementos (con sus textos) con ids nuevos, desplazados.
function xdCloneEls(els, dx, dy) {
  const map = new Map();
  const src = [...els];
  els.forEach((e) => {
    const t = xdBoundText(e);
    if (t && !src.includes(t)) src.push(t);
  });
  src.forEach((e) => map.set(e.id, uid()));
  const groups = new Map();
  const out = src.map((e) => {
    const c = JSON.parse(JSON.stringify(e));
    c.id = map.get(e.id);
    c.x += dx;
    c.y += dy;
    c.seed = Math.floor(Math.random() * 2 ** 31);
    c.groupIds = (c.groupIds || []).map((g) => groups.get(g) || groups.set(g, uid()).get(g));
    if (c.containerId) c.containerId = map.get(c.containerId) || null;
    c.boundElements = (c.boundElements || []).filter((b) => map.has(b.id)).map((b) => ({ ...b, id: map.get(b.id) }));
    if (c.startBinding) c.startBinding = map.has(c.startBinding.elementId) ? { ...c.startBinding, elementId: map.get(c.startBinding.elementId) } : null;
    if (c.endBinding) c.endBinding = map.has(c.endBinding.elementId) ? { ...c.endBinding, elementId: map.get(c.endBinding.elementId) } : null;
    return c;
  });
  return out;
}

function xdDuplicate() {
  const sel = xdSelectedEls().filter((e) => !e.containerId);
  if (!sel.length) return;
  xdMutate(() => {
    const copies = xdCloneEls(sel, 12, 12);
    xd.elements.push(...copies);
    xd.selected = new Set(copies.filter((c) => !c.containerId).map((c) => c.id));
  });
}

function xdReorder(where) {
  const sel = new Set(xdSelectedEls().flatMap((e) => [e.id, xdBoundText(e)?.id].filter(Boolean)));
  if (!sel.size) return;
  xdMutate(() => {
    const els = xd.elements;
    const picked = els.filter((e) => sel.has(e.id));
    const rest = els.filter((e) => !sel.has(e.id));
    if (where === 'front') xd.elements = [...rest, ...picked];
    else if (where === 'back') xd.elements = [...picked, ...rest];
    else {
      // Un paso: delante o detrás del elemento vecino.
      const idx = els.findIndex((e) => sel.has(e.id));
      const last = els.length - 1 - [...els].reverse().findIndex((e) => sel.has(e.id));
      if (where === 'forward' && last < els.length - 1) {
        const nb = els[last + 1];
        xd.elements = [...rest.slice(0, rest.indexOf(nb) + 1), ...picked, ...rest.slice(rest.indexOf(nb) + 1)];
      } else if (where === 'backward' && idx > 0) {
        const nb = els[idx - 1];
        xd.elements = [...rest.slice(0, rest.indexOf(nb)), ...picked, ...rest.slice(rest.indexOf(nb))];
      }
    }
  });
}

function xdGroup(on) {
  const sel = xdSelectedEls();
  if (on && sel.length < 2) return;
  xdMutate(() => {
    const g = uid();
    for (const e of sel) {
      const t = xdBoundText(e);
      for (const x of [e, t].filter(Boolean)) {
        if (on) x.groupIds = [...(x.groupIds || []), g];
        else x.groupIds = (x.groupIds || []).slice(0, -1);
      }
    }
  });
}

// ---------- Herramientas e interfaz ----------
function xdSetTool(tool) {
  xdEndText();
  if (xd.multi) xdFinishMulti();
  xd.tool = tool;
  if (tool !== 'selection') xd.selected.clear();
  if (tool === 'image') xdPickImage();
  xdCanvas.style.cursor = tool === 'hand' ? 'grab' : tool === 'selection' ? 'default' : tool === 'text' ? 'text' : tool === 'eraser' ? 'cell' : 'crosshair';
  xdRenderChrome();
  xdRenderProps();
  xdScheduleRender();
}

const xdSvg = (name) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${XD_ICONS[name]}</svg>`;

function xdRenderChrome() {
  const tools = $('#xd-tools');
  if (!tools.childElementCount) {
    const lock = el('button', { className: 'xd-tool xd-lock', title: 'Mantener la herramienta (Q)', ariaLabel: 'Mantener la herramienta activa', ariaPressed: 'false' });
    lock.addEventListener('click', () => {
      xd.locked = !xd.locked;
      xdRenderChrome();
    });
    tools.append(lock, el('span', { className: 'xd-sep' }));
    for (const [tool, label, key] of XD_TOOLS) {
      const b = el('button', { className: 'xd-tool', title: `${label} — ${key}`, ariaLabel: label, ariaPressed: 'false' });
      b.dataset.tool = tool;
      b.innerHTML = xdSvg(tool);
      b.append(el('span', { className: 'xd-key', ariaHidden: 'true' }, key.split(' · ').pop()));
      b.addEventListener('click', () => xdSetTool(tool));
      tools.append(b);
      if (tool === 'selection') tools.append(el('span', { className: 'xd-sep' }));
    }
  }
  $$('#xd-tools [data-tool]').forEach((b) => {
    b.classList.toggle('active', b.dataset.tool === xd.tool);
    b.ariaPressed = String(b.dataset.tool === xd.tool);
  });
  const lock = $('#xd-tools .xd-lock');
  lock.innerHTML = xdSvg(xd.locked ? 'lock' : 'unlock');
  lock.classList.toggle('active', xd.locked);
  lock.ariaPressed = String(xd.locked);
  $('#draw-undo').disabled = !xd.history.length;
  $('#draw-redo').disabled = !xd.redo.length;
  $('#xd-zoom-reset').textContent = `${Math.round(xd.view.zoom * 100)} %`;
  $('#draw-save').disabled = !xdLive().length && !xd.editing;
  const hint = {
    arrow: xd.multi ? 'Haz clic para añadir puntos; doble clic, Enter o Esc para terminar.' : 'Arrastra para dibujar la flecha (desde o hasta una figura, queda enganchada). Clic a clic hace una línea con varios puntos.',
    line: xd.multi ? 'Haz clic para añadir puntos; doble clic, Enter o Esc para terminar.' : 'Arrastra para dibujar la línea. Clic a clic hace una línea con varios puntos.',
    text: 'Haz clic donde quieras escribir, o sobre una figura para escribir dentro.',
    freedraw: 'Dibuja a mano alzada. Con un lápiz, el grosor sigue la presión.',
    eraser: 'Pasa la goma por encima de lo que quieras borrar.',
    hand: 'Arrastra para moverte por el lienzo (también con la barra espaciadora o la rueda).',
    selection: xd.selected.size ? 'Arrastra para mover · tiradores para cambiar el tamaño o girar · Alt+arrastrar duplica · doble clic para escribir.' : 'Doble clic para escribir · arrastra para seleccionar varios · Ctrl+rueda o pellizca para hacer zoom.',
  }[xd.tool];
  $('#xd-hint').textContent = hint || 'Arrastra para dibujar (Mayús: proporciones fijas · Alt: desde el centro).';
}

// Panel de propiedades: lo que se elija se aplica a la selección y a lo próximo que se dibuje.
function xdTargets() {
  const sel = xdSelectedEls();
  if (sel.length) return sel.flatMap((e) => [e, xdBoundText(e)].filter(Boolean));
  return [];
}
function xdRenderProps() {
  const panel = $('#xd-props');
  const targets = xdTargets();
  const types = new Set(targets.length ? targets.map((e) => e.type) : [xd.tool]);
  const show = targets.length || !['selection', 'hand', 'eraser', 'image'].includes(xd.tool);
  panel.hidden = !show;
  if (!show) return panel.replaceChildren();
  const first = (k) => (targets.find((e) => e[k] !== undefined) || xd.item)[k] ?? xd.item[k];
  const has = (...ts) => ts.some((t) => types.has(t));
  const shapes = has('rectangle', 'diamond', 'ellipse');
  const texts = has('text') || targets.some((e) => xdBoundText(e));
  const sections = [];
  const sec = (title, body) => sections.push(el('div', { className: 'xd-sec' }, [el('div', { className: 'xd-sec-title' }, title), body]));
  const seg = (key, options, current, apply) =>
    el(
      'div',
      { className: 'xd-seg', role: 'group' },
      options.map(([value, label, title]) => {
        const b = el('button', { className: `xd-opt${String(current) === String(value) ? ' on' : ''}`, title: title || '', ariaLabel: title || String(label), ariaPressed: String(String(current) === String(value)) });
        b.innerHTML = label;
        b.addEventListener('click', () => apply(value));
        return b;
      })
    );
  const setProp = (key, value, filter = () => true) => {
    if (key in xd.item) xd.item[key] = value;
    if (!targets.length) return xdRenderProps();
    xdMutate(() => {
      for (const e of targets.filter(filter)) {
        e[key] = value;
        e.seed = e.seed || 1;
        if (e.type === 'text') xdFitText(e);
        if (XD_SHAPES.has(e.type)) xdBoundText(e) && xdFitText(xdBoundText(e));
      }
      xdUpdateArrows(targets.map((e) => e.id));
    });
  };
  const swatches = (key, colors, current) => {
    const row = el('div', { className: 'xd-swatches' });
    colors.forEach((c) => {
      const b = el('button', { className: `xd-sw${c === current ? ' on' : ''}${c === 'transparent' ? ' none' : ''}`, title: c === 'transparent' ? 'Sin relleno' : c, ariaLabel: c === 'transparent' ? 'Sin relleno' : c });
      if (c !== 'transparent') b.style.background = c;
      b.addEventListener('click', () => setProp(key, c));
      row.append(b);
    });
    const pick = el('input', { type: 'color', className: 'xd-pick', title: 'Otro color', ariaLabel: 'Otro color', value: current && current.startsWith('#') && current.length === 7 ? current : '#000000' });
    pick.addEventListener('change', () => setProp(key, pick.value));
    row.append(pick);
    return row;
  };
  if (!has('image')) sec('Trazo', swatches('strokeColor', XD_STROKES, first('strokeColor')));
  if (shapes || has('freedraw')) sec('Fondo', swatches('backgroundColor', XD_BGS, first('backgroundColor')));
  if (shapes && first('backgroundColor') !== 'transparent')
    sec('Relleno', seg('fillStyle', [['hachure', '▨', 'Rayado'], ['cross-hatch', '▦', 'Cuadriculado'], ['solid', '■', 'Sólido']], first('fillStyle'), (v) => setProp('fillStyle', v)));
  if (shapes || has('arrow', 'line', 'freedraw'))
    sec('Grosor', seg('strokeWidth', [[1, '<i class="xd-w w1"></i>', 'Fino'], [2, '<i class="xd-w w2"></i>', 'Grueso'], [4, '<i class="xd-w w4"></i>', 'Muy grueso']], first('strokeWidth'), (v) => setProp('strokeWidth', v, (e) => e.type !== 'text')));
  if (shapes || has('arrow', 'line')) {
    sec('Estilo del trazo', seg('strokeStyle', [['solid', '—', 'Continuo'], ['dashed', '- -', 'Discontinuo'], ['dotted', '···', 'Punteado']], first('strokeStyle'), (v) => setProp('strokeStyle', v)));
    sec('Trazado', seg('roughness', [[0, '〰', 'Arquitecto (limpio)'], [1, '✎', 'Artista (a mano)'], [2, '✐', 'Dibujante (muy a mano)']], first('roughness'), (v) => setProp('roughness', v)));
  }
  if (has('rectangle', 'diamond', 'arrow', 'line')) {
    const round = targets.length ? !!targets.find((e) => 'roundness' in e && e.type !== 'ellipse' && e.type !== 'text')?.roundness : xd.item.edges === 'round';
    sec(has('arrow', 'line') && !has('rectangle', 'diamond') ? 'Forma' : 'Bordes', seg('edges', [['sharp', has('arrow', 'line') && !has('rectangle', 'diamond') ? '⟋' : '▢', 'Recto'], ['round', has('arrow', 'line') && !has('rectangle', 'diamond') ? '∿' : '▢̃', 'Redondeado / curvo']], round ? 'round' : 'sharp', (v) => {
      xd.item.edges = v;
      if (!targets.length) return xdRenderProps();
      xdMutate(() => targets.forEach((e) => (e.type === 'rectangle' || e.type === 'diamond' || XD_LINEAR.has(e.type)) && (e.roundness = v === 'round' ? { type: e.type === 'rectangle' ? 3 : 2 } : null)));
    }));
  }
  if (has('arrow')) {
    const heads = [[null, '—', 'Sin punta'], ['arrow', '→', 'Flecha'], ['triangle', '▶', 'Triángulo'], ['bar', '⊢', 'Barra'], ['dot', '●', 'Punto']];
    sec('Punta inicial', seg('startArrowhead', heads, first('startArrowhead'), (v) => setProp('startArrowhead', v, (e) => e.type === 'arrow')));
    sec('Punta final', seg('endArrowhead', heads, first('endArrowhead'), (v) => setProp('endArrowhead', v, (e) => e.type === 'arrow')));
  }
  if (texts || xd.tool === 'text') {
    sec('Tamaño de letra', seg('fontSize', XD_FONT_SIZES.map(([v, l]) => [v, l, `${v} px`]), first('fontSize'), (v) => setProp('fontSize', v, (e) => e.type === 'text')));
    sec('Letra', seg('fontFamily', [[1, '<span style="font-family:Kalam,cursive">Aa</span>', 'A mano'], [2, '<span style="font-family:system-ui">Aa</span>', 'Normal'], [3, '<span style="font-family:monospace">Aa</span>', 'Código']], first('fontFamily'), (v) => setProp('fontFamily', v, (e) => e.type === 'text')));
    sec('Alineación', seg('textAlign', [['left', '⇤', 'Izquierda'], ['center', '↔', 'Centro'], ['right', '⇥', 'Derecha']], first('textAlign'), (v) => setProp('textAlign', v, (e) => e.type === 'text')));
  }
  const op = el('input', { type: 'range', min: '10', max: '100', step: '10', value: String(first('opacity')), ariaLabel: 'Opacidad' });
  op.addEventListener('input', () => {
    xd.item.opacity = Number(op.value);
    targets.forEach((e) => (e.opacity = Number(op.value)));
    xdScheduleRender();
  });
  op.addEventListener('pointerdown', xdBegin);
  op.addEventListener('change', xdCommit);
  sec('Opacidad', op);
  if (targets.length) {
    const btn = (label, title, fn) => {
      const b = el('button', { className: 'xd-opt', title, ariaLabel: title });
      b.innerHTML = label;
      b.addEventListener('click', fn);
      return b;
    };
    sec('Capas', el('div', { className: 'xd-seg' }, [btn('⤓', 'Al fondo (Ctrl+Mayús+[)', () => xdReorder('back')), btn('↓', 'Atrás (Ctrl+[)', () => xdReorder('backward')), btn('↑', 'Adelante (Ctrl+])', () => xdReorder('forward')), btn('⤒', 'Al frente (Ctrl+Mayús+])', () => xdReorder('front'))]));
    const sel = xdSelectedEls();
    const grouped = sel.some((e) => e.groupIds?.length);
    sec('Acciones', el('div', { className: 'xd-seg' }, [
      btn('⧉', 'Duplicar (Ctrl+D)', xdDuplicate),
      ...(sel.length > 1 ? [btn('▣', 'Agrupar (Ctrl+G)', () => xdGroup(true))] : []),
      ...(grouped ? [btn('▢', 'Desagrupar (Ctrl+Mayús+G)', () => xdGroup(false))] : []),
      btn('🗑', 'Borrar (Supr)', () => xdMutate(() => xdDelete([...xd.selected]))),
    ]));
  }
  panel.replaceChildren(...sections);
}

// ---------- Texto en el lienzo ----------
function xdStartText(t, { select = false } = {}) {
  xd.editingText = t.id;
  xd.selected.clear();
  const ta = $('#xd-text');
  ta.value = t.originalText ?? t.text;
  ta.hidden = false;
  xdPlaceTextEditor();
  ta.focus({ preventScroll: true });
  if (select) ta.select();
  else ta.setSelectionRange(ta.value.length, ta.value.length);
  xdScheduleRender();
}
function xdPlaceTextEditor() {
  const t = xd.editingText && xdGet(xd.editingText);
  const ta = $('#xd-text');
  if (!t) return;
  const z = xd.view.zoom;
  const c = t.containerId && xdGet(t.containerId);
  ta.style.font = `${t.fontSize * z}px ${XD_FONTS[t.fontFamily] || XD_FONTS[1]}`;
  ta.style.lineHeight = String(XD_LINE_H);
  ta.style.color = t.strokeColor;
  ta.style.textAlign = t.textAlign || 'left';
  ta.style.opacity = String((t.opacity ?? 100) / 100);
  const m = xdMeasure(ta.value || ' ', t);
  if (c) {
    const area = xdTextArea(c);
    const [cx, cy] = xdCenter(c);
    const [sx, sy] = xdToScreen(cx - area.w / 2, cy - m.height / 2);
    Object.assign(ta.style, { left: `${sx}px`, top: `${sy}px`, width: `${area.w * z}px`, height: `${m.height * z + 4}px`, whiteSpace: 'pre-wrap' });
  } else {
    const [sx, sy] = xdToScreen(t.x, t.y);
    Object.assign(ta.style, { left: `${sx}px`, top: `${sy}px`, width: `${(m.width + t.fontSize) * z}px`, height: `${m.height * z + 4}px`, whiteSpace: 'pre' });
  }
  ta.style.transform = t.angle ? `rotate(${t.angle}rad)` : '';
}
function xdEndText() {
  const id = xd.editingText;
  if (!id) return;
  xd.editingText = null;
  const ta = $('#xd-text');
  ta.hidden = true;
  const t = xdGet(id);
  if (!t) return;
  const value = ta.value.replace(/\s+$/, '');
  if (!value.trim()) {
    const c = t.containerId && xdGet(t.containerId);
    xd.elements = xd.elements.filter((e) => e.id !== id);
    if (c) c.boundElements = (c.boundElements || []).filter((b) => b.id !== id);
  } else {
    t.originalText = value;
    t.text = value;
    xdFitText(t);
    if (t.containerId) xdUpdateArrows([t.containerId]);
    xd.selected = new Set([t.containerId || t.id]);
  }
  xdCommit();
  if (xd.tool === 'text') xdBackToSelection();
  xdRenderChrome();
  xdRenderProps();
  xdScheduleRender();
}
// Texto nuevo suelto o dentro de una figura.
function xdNewText(p, container = null) {
  xdBegin();
  if (container) {
    const existing = xdBoundText(container);
    if (existing) return xdStartText(existing);
    const t = newXdElement('text', 0, 0, { containerId: container.id, textAlign: 'center', verticalAlign: 'middle', strokeColor: container.strokeColor === 'transparent' ? xd.item.strokeColor : container.strokeColor });
    container.boundElements = [...(container.boundElements || []), { id: t.id, type: 'text' }];
    xd.elements.push(t);
    xdFitText(t);
    return xdStartText(t);
  }
  const t = newXdElement('text', p[0], p[1] - (xd.item.fontSize * XD_LINE_H) / 2);
  xd.elements.push(t);
  xdFitText(t);
  xdStartText(t);
}
$('#xd-text').addEventListener('input', () => {
  const t = xd.editingText && xdGet(xd.editingText);
  if (!t) return;
  t.originalText = $('#xd-text').value;
  xdFitText(t);
  xdPlaceTextEditor();
  if (t.containerId) xdUpdateArrows([t.containerId]);
  xdScheduleRender();
});
$('#xd-text').addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
    e.preventDefault();
    xdEndText();
  }
});
$('#xd-text').addEventListener('blur', () => setTimeout(xdEndText));

// ---------- Ratón, dedo y lápiz ----------
function xdPoint(e) {
  const r = xdCanvas.getBoundingClientRect();
  return xdToWorld(e.clientX - r.left, e.clientY - r.top);
}
const xdSnapGrid = (v) => (xd.grid ? Math.round(v / 20) * 20 : v);
function xdPressure(e) {
  return e.pointerType === 'pen' ? e.pressure || 0.5 : e.pointerType === 'touch' && e.pressure ? Math.min(1, e.pressure * 1.2) : 0.5;
}

xdCanvas.addEventListener('pointerdown', (e) => {
  if (xd.editingText) {
    xdEndText();
    if (xd.tool !== 'text') return;
  }
  if (e.pointerType === 'pen') xd.penSeen = true;
  xd.pointers.set(e.pointerId, [e.clientX, e.clientY]);
  xdCanvas.focus({ preventScroll: true });
  try {
    xdCanvas.setPointerCapture(e.pointerId);
  } catch {
    // Puntero ya liberado.
  }
  e.preventDefault();
  // Dos dedos: zoom y desplazamiento (se anula lo que se estuviera haciendo).
  if (xd.pointers.size === 2) {
    const t = xd.action?.type;
    if (t === 'freedraw' || t === 'create' || t === 'linear') xd.elements = xd.elements.filter((x) => x.id !== xd.action.id);
    else if (['move', 'resize', 'rotate', 'point'].includes(t) && xd.pending !== undefined) {
      xd.elements = JSON.parse(xd.pending);
      xd.selected = new Set([...xd.selected].filter((id) => xdGet(id)));
    }
    if (t && t !== 'pan') xd.pending = undefined;
    xd.erasing = new Set();
    xd.hoverBind = null;
    const [a, b] = [...xd.pointers.values()];
    xd.action = { type: 'pinch', dist: Math.hypot(a[0] - b[0], a[1] - b[1]), mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], zoom: xd.view.zoom };
    return;
  }
  const p = xdPoint(e);
  // Con lápiz, el dedo mueve el lienzo (como en Excalidraw): la palma no dibuja.
  if (e.button === 1 || xd.space || xd.tool === 'hand' || (xd.penSeen && e.pointerType === 'touch')) {
    xd.action = { type: 'pan', last: [e.clientX, e.clientY] };
    xdCanvas.style.cursor = 'grabbing';
    return;
  }
  if (e.button === 2) return;
  const tool = xd.tool;
  if (tool === 'selection') return xdDownSelect(e, p);
  if (XD_SHAPES.has(tool)) {
    xdBegin();
    const sx = xdSnapGrid(p[0]);
    const sy = xdSnapGrid(p[1]);
    const el0 = newXdElement(tool, sx, sy);
    xd.elements.push(el0);
    xd.action = { type: 'create', id: el0.id, anchor: [sx, sy] };
    return;
  }
  if (XD_LINEAR.has(tool)) {
    if (xd.multi) {
      const m = xdGet(xd.multi);
      if (m) {
        // Clic en el primer punto: se cierra; si no, se fija el punto y se añade otro.
        m.points.push([xdR(p[0] - m.x), xdR(p[1] - m.y)]);
        xdScheduleRender();
        return;
      }
      xd.multi = null;
    }
    xdBegin();
    const sx = xdSnapGrid(p[0]);
    const sy = xdSnapGrid(p[1]);
    const ln = newXdElement(tool, sx, sy, { points: [[0, 0], [0, 0]] });
    xd.elements.push(ln);
    const start = tool === 'arrow' && xdBindTarget([sx, sy], ln.id);
    xd.action = { type: 'linear', id: ln.id, start: [sx, sy], startTarget: start?.id || null, moved: false };
    return;
  }
  if (tool === 'freedraw') {
    xdBegin();
    const fd = newXdElement('freedraw', p[0], p[1], { points: [[0, 0]], pressures: [xdPressure(e)], simulatePressure: e.pointerType !== 'pen' });
    xd.elements.push(fd);
    xd.action = { type: 'freedraw', id: fd.id };
    return;
  }
  if (tool === 'text') {
    const hit = xdHitElement(p);
    if (hit?.type === 'text') return xdBegin(), xdStartText(hit);
    const box = hit && XD_SHAPES.has(hit.type) ? hit : xdContainerAt(p);
    return box ? xdNewText(p, box) : xdNewText(p);
  }
  if (tool === 'eraser') {
    xdBegin();
    xd.erasing = new Set();
    xd.action = { type: 'erase', trail: [p] };
    xdEraseAt(p, p);
  }
});

function xdDownSelect(e, p) {
  const handle = xdHitHandle(p);
  const sel = xdSelectedEls();
  xdBegin();
  if (handle) {
    const orig = sel.map((x) => JSON.parse(JSON.stringify(x)));
    const frame = xdHandles().frame;
    if (handle.kind === 'point' || handle.kind === 'mid') {
      const ln = sel[0];
      let index = handle.index;
      if (handle.kind === 'mid') {
        // Arrastrar el punto medio añade un punto (para doblar la línea).
        const a = ln.points[index];
        const b = ln.points[index + 1];
        ln.points.splice(index + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
        index += 1;
      }
      xd.action = { type: 'point', id: ln.id, index };
    } else if (handle.kind === 'rotate') xd.action = { type: 'rotate', id: sel[0].id, center: [frame.cx, frame.cy], orig: orig[0] };
    else xd.action = { type: 'resize', dir: handle.dir, frame, orig, start: p };
    return;
  }
  // Dentro del recuadro de una selección múltiple: se mueve todo.
  let hit = xdHitElement(p);
  if (!hit && sel.length > 1) {
    const b = xdSceneBounds(sel);
    if (p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3]) hit = sel[0];
  }
  if (hit) {
    const members = xdGroupMembers(hit);
    if (e.shiftKey) {
      const on = xd.selected.has(hit.id);
      members.forEach((id) => (on ? xd.selected.delete(id) : xd.selected.add(id)));
      xdRenderProps();
      xdScheduleRender();
      if (on) return;
    } else if (!xd.selected.has(hit.id)) xdSelect(members);
    // Alt+arrastrar: se duplica y se mueve la copia.
    if (e.altKey) {
      const copies = xdCloneEls(xdSelectedEls().filter((x) => !x.containerId), 0, 0);
      xd.elements.push(...copies);
      xd.selected = new Set(copies.filter((c) => !c.containerId).map((c) => c.id));
    }
    const moving = xdSelectedEls();
    const ids = new Set(moving.flatMap((m) => [m.id, xdBoundText(m)?.id].filter(Boolean)));
    xd.action = { type: 'move', start: p, orig: new Map(xdLive().filter((x) => ids.has(x.id)).map((x) => [x.id, [x.x, x.y]])), moved: false };
    xdRenderProps();
    return;
  }
  if (!e.shiftKey) xd.selected.clear();
  xd.action = { type: 'marquee', x0: p[0], y0: p[1], x1: p[0], y1: p[1], base: new Set(xd.selected) };
  xdRenderProps();
}

xdCanvas.addEventListener('pointermove', (e) => {
  if (xd.pointers.has(e.pointerId)) xd.pointers.set(e.pointerId, [e.clientX, e.clientY]);
  const a = xd.action;
  const p = xdPoint(e);
  if (!a) {
    if (xd.multi) {
      const m = xdGet(xd.multi);
      if (m) {
        m.points[m.points.length - 1] = [xdR(p[0] - m.x), xdR(p[1] - m.y)];
        xdScheduleRender();
      }
    }
    if (xd.tool === 'selection' && !xd.space) {
      const h = xdHitHandle(p);
      xdCanvas.style.cursor = h ? (h.kind === 'rotate' ? 'grab' : h.kind === 'resize' ? (['n', 's'].includes(h.dir) ? 'ns-resize' : ['e', 'w'].includes(h.dir) ? 'ew-resize' : ['nw', 'se'].includes(h.dir) ? 'nwse-resize' : 'nesw-resize') : 'pointer') : xdHitElement(p) ? 'move' : 'default';
    }
    return;
  }
  if (a.type === 'pinch') {
    const [p1, p2] = [...xd.pointers.values()];
    if (!p2) return;
    const dist = Math.hypot(p1[0] - p2[0], p1[1] - p2[1]);
    const mid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
    const r = xdCanvas.getBoundingClientRect();
    xdZoomAt(Math.min(30, Math.max(0.1, (a.zoom * dist) / a.dist)), a.mid[0] - r.left, a.mid[1] - r.top);
    xd.view.x += (mid[0] - a.mid[0]) / xd.view.zoom;
    xd.view.y += (mid[1] - a.mid[1]) / xd.view.zoom;
    a.mid = mid;
    a.dist = dist;
    a.zoom = xd.view.zoom;
    return xdScheduleRender();
  }
  if (a.type === 'pan') {
    xd.view.x += (e.clientX - a.last[0]) / xd.view.zoom;
    xd.view.y += (e.clientY - a.last[1]) / xd.view.zoom;
    a.last = [e.clientX, e.clientY];
    xdPlaceTextEditor();
    return xdScheduleRender();
  }
  if (a.type === 'create') {
    const el0 = xdGet(a.id);
    let [x0, y0] = a.anchor;
    let w = xdSnapGrid(p[0]) - x0;
    let h = xdSnapGrid(p[1]) - y0;
    if (e.shiftKey) {
      const s = Math.max(Math.abs(w), Math.abs(h));
      w = Math.sign(w || 1) * s;
      h = Math.sign(h || 1) * s;
    }
    if (e.altKey) {
      x0 -= w;
      y0 -= h;
      w *= 2;
      h *= 2;
    }
    Object.assign(el0, { x: Math.min(x0, x0 + w), y: Math.min(y0, y0 + h), width: Math.abs(w), height: Math.abs(h) });
    return xdScheduleRender();
  }
  if (a.type === 'linear') {
    const ln = xdGet(a.id);
    let ex = xdSnapGrid(p[0]);
    let ey = xdSnapGrid(p[1]);
    if (e.shiftKey) {
      // Ángulos de 15° en 15°.
      const ang = Math.round(Math.atan2(ey - a.start[1], ex - a.start[0]) / (Math.PI / 12)) * (Math.PI / 12);
      const len = Math.hypot(ex - a.start[0], ey - a.start[1]);
      ex = a.start[0] + Math.cos(ang) * len;
      ey = a.start[1] + Math.sin(ang) * len;
    }
    if (Math.hypot(ex - a.start[0], ey - a.start[1]) > 4) a.moved = true;
    ln.points[1] = [xdR(ex - ln.x), xdR(ey - ln.y)];
    xd.hoverBind = ln.type === 'arrow' ? xdBindTarget([ex, ey], ln.id)?.id || null : null;
    return xdScheduleRender();
  }
  if (a.type === 'freedraw') {
    const fd = xdGet(a.id);
    const evs = e.getCoalescedEvents?.() || [];
    for (const ev of evs.length ? evs : [e]) {
      const q = xdPoint(ev);
      const last = fd.points[fd.points.length - 1];
      const rel = [xdR(q[0] - fd.x), xdR(q[1] - fd.y)];
      if (Math.hypot(rel[0] - last[0], rel[1] - last[1]) < 0.8 / xd.view.zoom) continue;
      fd.points.push(rel);
      fd.pressures.push(xdR(xdPressure(ev)));
    }
    return xdScheduleRender();
  }
  if (a.type === 'erase') {
    const last = a.trail[a.trail.length - 1];
    a.trail.push(p);
    if (a.trail.length > 12) a.trail.shift();
    xdEraseAt(last, p);
    return xdScheduleRender();
  }
  if (a.type === 'marquee') {
    a.x1 = p[0];
    a.y1 = p[1];
    const [x1, x2] = [Math.min(a.x0, a.x1), Math.max(a.x0, a.x1)];
    const [y1, y2] = [Math.min(a.y0, a.y1), Math.max(a.y0, a.y1)];
    const inside = xdLive().filter((x) => {
      if (x.containerId) return false;
      const b = xdAabb(x);
      return b[0] >= x1 && b[2] <= x2 && b[1] >= y1 && b[3] <= y2;
    });
    xd.selected = new Set([...a.base, ...inside.flatMap((x) => xdGroupMembers(x))]);
    xdScheduleRender();
    return;
  }
  if (a.type === 'move') {
    let dx = p[0] - a.start[0];
    let dy = p[1] - a.start[1];
    if (e.shiftKey) Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0);
    if (xd.grid) {
      const [fx, fy] = a.orig.values().next().value;
      dx = xdSnapGrid(fx + dx) - fx;
      dy = xdSnapGrid(fy + dy) - fy;
    }
    a.moved = a.moved || Math.hypot(dx, dy) > 1;
    for (const [id, [ox, oy]] of a.orig) {
      const x = xdGet(id);
      if (x) {
        x.x = ox + dx;
        x.y = oy + dy;
      }
    }
    xdUpdateArrows([...a.orig.keys()]);
    return xdScheduleRender();
  }
  if (a.type === 'point') {
    const ln = xdGet(a.id);
    const [cx, cy] = xdCenter(ln);
    const [lx, ly] = xdRot(xdSnapGrid(p[0]), xdSnapGrid(p[1]), cx, cy, -(ln.angle || 0));
    const abs = ln.points.map(([px, py]) => [ln.x + px, ln.y + py]);
    abs[a.index] = [lx, ly];
    xdSetAbsPoints(ln, abs);
    const isEnd = a.index === 0 || a.index === ln.points.length - 1;
    xd.hoverBind = ln.type === 'arrow' && isEnd ? xdBindTarget([lx, ly], ln.id)?.id || null : null;
    return xdScheduleRender();
  }
  if (a.type === 'rotate') {
    const x = xdGet(a.id);
    let ang = Math.atan2(p[1] - a.center[1], p[0] - a.center[0]) + Math.PI / 2;
    if (e.shiftKey) ang = Math.round(ang / (Math.PI / 12)) * (Math.PI / 12);
    x.angle = ((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const t = xdBoundText(x);
    if (t) t.angle = x.angle;
    xdUpdateArrows([x.id]);
    return xdScheduleRender();
  }
  if (a.type === 'resize') {
    xdResizeTo(a, p, e.shiftKey, e.altKey);
    return xdScheduleRender();
  }
});

function xdResizeTo(a, p, keepRatio, fromCenter) {
  const f = a.frame;
  const [lx, ly] = xdRot(p[0], p[1], f.cx, f.cy, -f.angle).map((v, i) => v - (i ? f.cy : f.cx));
  let L = -f.w / 2;
  let T = -f.h / 2;
  let Rr = f.w / 2;
  let B = f.h / 2;
  const d = a.dir;
  const single = a.orig.length === 1;
  const isText = single && a.orig[0].type === 'text';
  if (d.includes('e')) Rr = lx;
  if (d.includes('w')) L = lx;
  if (d.includes('s')) B = ly;
  if (d.includes('n')) T = ly;
  if (fromCenter) {
    if (d.includes('e')) L = -Rr;
    if (d.includes('w')) Rr = -L;
    if (d.includes('s')) T = -B;
    if (d.includes('n')) B = -T;
  }
  // Varios elementos, textos e imágenes (y Mayús) mantienen la proporción en las esquinas.
  if ((keepRatio || !single || isText || a.orig[0].type === 'image') && d.length === 2) {
    const s = Math.max(Math.abs(Rr - L) / (f.w || 1), Math.abs(B - T) / (f.h || 1));
    const w = f.w * s;
    const h = f.h * s;
    if (d.includes('e')) Rr = (fromCenter ? -w / 2 : L) + w;
    else L = (fromCenter ? w / 2 : Rr) - w;
    if (d.includes('s')) B = (fromCenter ? -h / 2 : T) + h;
    else T = (fromCenter ? h / 2 : B) - h;
  }
  const nw = Math.max(1, Math.abs(Rr - L));
  const nh = Math.max(1, Math.abs(B - T));
  const sx = (Rr - L) / (f.w || 1);
  const sy = (B - T) / (f.h || 1);
  const [ncx, ncy] = xdRot(f.cx + (L + Rr) / 2, f.cy + (T + B) / 2, f.cx, f.cy, f.angle);
  if (single) {
    const o = a.orig[0];
    const x = xdGet(o.id);
    if (x.points) {
      // Se escalan los puntos respecto al centro y se recoloca.
      const [ocx, ocy] = [f.cx, f.cy];
      const abs = o.points.map(([px, py]) => [ocx + (o.x + px - ocx) * sx, ocy + (o.y + py - ocy) * sy]);
      x.points = abs.map(([qx, qy]) => [xdR(qx - abs[0][0]), xdR(qy - abs[0][1])]);
      x.x = abs[0][0];
      x.y = abs[0][1];
      const [x1, y1, x2, y2] = xdBounds(x);
      x.x += ncx - (x1 + x2) / 2;
      x.y += ncy - (y1 + y2) / 2;
      x.width = x2 - x1;
      x.height = y2 - y1;
    } else {
      x.width = nw;
      x.height = nh;
      x.x = ncx - nw / 2;
      x.y = ncy - nh / 2;
      if (x.type === 'text') {
        x.fontSize = Math.max(6, xdR(o.fontSize * Math.abs(sy)));
        xdFitText(x);
        x.x = ncx - x.width / 2;
        x.y = ncy - x.height / 2;
      }
    }
    const t = xdBoundText(x);
    if (t) xdFitText(t);
    xdUpdateArrows([x.id]);
    return;
  }
  // Varios: escala uniforme desde la esquina opuesta.
  const ax = f.cx + (d.includes('w') ? f.w / 2 : -f.w / 2);
  const ay = f.cy + (d.includes('n') ? f.h / 2 : -f.h / 2);
  const s = Math.abs(sx);
  for (const o of a.orig) {
    const x = xdGet(o.id);
    if (!x) continue;
    x.x = ax + (o.x - ax) * s;
    x.y = ay + (o.y - ay) * s;
    if (o.points) {
      x.points = o.points.map(([px, py]) => [xdR(px * s), xdR(py * s)]);
      const [x1, y1, x2, y2] = xdBounds(x);
      x.width = x2 - x1;
      x.height = y2 - y1;
    } else {
      x.width = o.width * s;
      x.height = o.height * s;
    }
    if (x.type === 'text') x.fontSize = Math.max(6, xdR(o.fontSize * s));
    const t = xdBoundText(x);
    if (t) xdFitText(t);
  }
  xdUpdateArrows(a.orig.map((o) => o.id));
}

function xdEraseAt(a, b) {
  const steps = Math.max(1, Math.ceil(xdDist(a, b) / 4));
  const tol = 8 / xd.view.zoom;
  for (let i = 0; i <= steps; i++) {
    const q = [a[0] + ((b[0] - a[0]) * i) / steps, a[1] + ((b[1] - a[1]) * i) / steps];
    for (const el0 of xdLive()) if (!xd.erasing.has(el0.id) && xdHit(el0, q, tol)) xdGroupMembers(el0.containerId ? xdGet(el0.containerId) || el0 : el0).forEach((id) => xd.erasing.add(id));
  }
}

function xdPointerUp(e) {
  xd.pointers.delete(e.pointerId);
  const a = xd.action;
  if (!a) return;
  if (a.type === 'pinch') {
    if (xd.pointers.size < 2) xd.action = null;
    return xdRenderChrome();
  }
  xd.action = null;
  xd.hoverBind = null;
  if (a.type === 'pan') {
    xdCanvas.style.cursor = xd.tool === 'hand' ? 'grab' : 'default';
    return;
  }
  if (a.type === 'create') {
    const el0 = xdGet(a.id);
    if (el0.width < 3 && el0.height < 3) {
      xd.elements = xd.elements.filter((x) => x.id !== a.id);
      xd.pending = undefined;
    } else {
      xd.selected = new Set([a.id]);
      xdCommit();
      xdBackToSelection();
    }
  } else if (a.type === 'linear') {
    const ln = xdGet(a.id);
    if (!a.moved) {
      // Clic sin arrastrar: modo de varios puntos.
      xd.multi = ln.id;
      ln.points = [[0, 0], [0, 0]];
      if (a.startTarget) xdSetBinding(ln, 'start', xdGet(a.startTarget));
      xdRenderChrome();
      return xdScheduleRender();
    }
    xdFinishLinear(ln, a.startTarget);
  } else if (a.type === 'freedraw') {
    const fd = xdGet(a.id);
    const [x1, y1, x2, y2] = xdBounds(fd);
    fd.width = x2 - x1;
    fd.height = y2 - y1;
    xdCommit();
  } else if (a.type === 'erase') {
    const ids = [...xd.erasing];
    xd.erasing = new Set();
    if (ids.length) xdDelete(ids);
    xdCommit();
  } else if (a.type === 'marquee') {
    xd.pending = undefined;
  } else if (a.type === 'move') {
    // Una flecha movida sin ninguna de sus figuras se suelta de ellas.
    for (const id of a.orig.keys()) {
      const ln = xdGet(id);
      if (!ln || !XD_LINEAR.has(ln.type)) continue;
      if (a.orig.has(ln.startBinding?.elementId) || a.orig.has(ln.endBinding?.elementId)) continue;
      if (ln.startBinding) xdSetBinding(ln, 'start', null);
      if (ln.endBinding) xdSetBinding(ln, 'end', null);
    }
    xdCommit();
  } else if (a.type === 'point') {
    const ln = xdGet(a.id);
    if (ln.type === 'arrow' && (a.index === 0 || a.index === ln.points.length - 1)) {
      const end = a.index === 0 ? 'start' : 'end';
      const abs = ln.points[a.index];
      xdSetBinding(ln, end, xdBindTarget([ln.x + abs[0], ln.y + abs[1]], ln.id));
      xdRouteArrow(ln);
    }
    xdCommit();
  } else xdCommit();
  xdRenderChrome();
  xdRenderProps();
  xdScheduleRender();
}
xdCanvas.addEventListener('pointerup', xdPointerUp);
xdCanvas.addEventListener('pointercancel', xdPointerUp);

function xdFinishLinear(ln, startTarget) {
  if (ln.type === 'arrow') {
    const end = ln.points[ln.points.length - 1];
    const s = startTarget && xdGet(startTarget);
    const t = xdBindTarget([ln.x + end[0], ln.y + end[1]], ln.id);
    if (s && s.id !== t?.id) xdSetBinding(ln, 'start', s);
    if (t && t.id !== s?.id) xdSetBinding(ln, 'end', t);
    xdRouteArrow(ln);
  }
  const [x1, y1, x2, y2] = xdBounds(ln);
  ln.width = x2 - x1;
  ln.height = y2 - y1;
  xd.selected = new Set([ln.id]);
  xdCommit();
  xdBackToSelection();
}
// Tras dibujar una figura se vuelve a «Seleccionar» (salvo con la herramienta fijada, Q).
function xdBackToSelection() {
  if (xd.locked) return;
  xd.tool = 'selection';
  xdCanvas.style.cursor = 'default';
}
function xdFinishMulti() {
  const ln = xd.multi && xdGet(xd.multi);
  xd.multi = null;
  if (!ln) return;
  ln.points.pop(); // el punto que seguía al ratón
  // El doble clic deja puntos repetidos.
  ln.points = ln.points.filter((q, i, all) => !i || xdDist(q, all[i - 1]) > 1);
  if (ln.points.length < 2) {
    xd.elements = xd.elements.filter((x) => x.id !== ln.id);
    xd.pending = undefined;
  } else xdFinishLinear(ln, ln.startBinding?.elementId);
  xdRenderChrome();
  xdRenderProps();
  xdScheduleRender();
}

xdCanvas.addEventListener('dblclick', (e) => {
  const p = xdPoint(e);
  if (xd.multi) return xdFinishMulti();
  if (xd.tool !== 'selection') return;
  const hit = xdHitElement(p);
  if (hit?.type === 'text') return xdBegin(), xdStartText(hit);
  if (hit && XD_SHAPES.has(hit.type)) return xdNewText(p, hit);
  if (!hit || hit.type === 'freedraw') {
    const box = xdContainerAt(p);
    if (box) return xdNewText(p, box);
  }
  if (hit && XD_LINEAR.has(hit.type)) {
    // Doble clic en una línea: añade un punto ahí.
    xdMutate(() => {
      const pts = hit.points;
      let best = 0;
      let bd = Infinity;
      for (let i = 0; i < pts.length - 1; i++) {
        const d = xdDistSeg([p[0] - hit.x, p[1] - hit.y], pts[i], pts[i + 1]);
        if (d < bd) [bd, best] = [d, i];
      }
      pts.splice(best + 1, 0, [xdR(p[0] - hit.x), xdR(p[1] - hit.y)]);
      xd.selected = new Set([hit.id]);
    });
    return;
  }
  if (!hit) xdNewText(p);
});

xdCanvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const r = xdCanvas.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) xdZoomAt(xd.view.zoom * Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
    else {
      xd.view.x -= (e.shiftKey ? e.deltaY : e.deltaX) / xd.view.zoom;
      xd.view.y -= (e.shiftKey ? 0 : e.deltaY) / xd.view.zoom;
    }
    xdPlaceTextEditor();
    xdScheduleRender();
  },
  { passive: false }
);
xdCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

function xdZoomAt(zoom, sx, sy) {
  zoom = Math.min(30, Math.max(0.1, zoom));
  const [wx, wy] = xdToWorld(sx, sy);
  xd.view.zoom = zoom;
  xd.view.x = sx / zoom - wx;
  xd.view.y = sy / zoom - wy;
  xdPlaceTextEditor();
  xdRenderChrome();
  xdScheduleRender();
}
function xdZoomBy(k) {
  xdZoomAt(xd.view.zoom * k, xdCanvas.clientWidth / 2, xdCanvas.clientHeight / 2);
}
// Encaja todo lo dibujado en la pantalla.
function xdFit() {
  const b = xdSceneBounds(xdLive());
  const W = xdCanvas.clientWidth || 800;
  const H = xdCanvas.clientHeight || 600;
  if (!b) {
    xd.view = { x: 0, y: 0, zoom: 1 };
  } else {
    const zoom = Math.min(1, Math.max(0.1, Math.min((W - 120) / (b[2] - b[0] || 1), (H - 160) / (b[3] - b[1] || 1))));
    xd.view = { zoom, x: W / 2 / zoom - (b[0] + b[2]) / 2, y: H / 2 / zoom - (b[1] + b[3]) / 2 };
  }
  xdRenderChrome();
  xdScheduleRender();
}

// ---------- Teclado y portapapeles ----------
document.addEventListener('keydown', (e) => {
  if ($('#draw').hidden || xd.editingText) return;
  if (e.target.closest?.('#draw input, #draw textarea, #draw select')) return;
  const k = e.key.toLowerCase();
  const mod = e.ctrlKey || e.metaKey;
  const sel = xdSelectedEls();
  if (k === ' ' && !xd.space) {
    xd.space = true;
    xdCanvas.style.cursor = 'grab';
    e.preventDefault();
    return;
  }
  if (mod && k === 'z') {
    e.preventDefault();
    return e.shiftKey ? xdRedo() : xdUndo();
  }
  if (mod && k === 'y') return e.preventDefault(), xdRedo();
  if (mod && k === 'a') {
    e.preventDefault();
    return xdSelect(xdLive().filter((x) => !x.containerId).map((x) => x.id));
  }
  if (mod && k === 'd') return e.preventDefault(), xdDuplicate();
  if (mod && k === 'g') return e.preventDefault(), xdGroup(!e.shiftKey);
  if (mod && (e.code === 'BracketRight' || e.code === 'BracketLeft')) {
    e.preventDefault();
    return xdReorder(e.code === 'BracketRight' ? (e.shiftKey ? 'front' : 'forward') : e.shiftKey ? 'back' : 'backward');
  }
  if (mod && (e.key === "'" || e.code === 'Quote')) {
    e.preventDefault();
    xd.grid = !xd.grid;
    return xdScheduleRender();
  }
  if (mod && (k === '=' || k === '+')) return e.preventDefault(), xdZoomBy(1.2);
  if (mod && k === '-') return e.preventDefault(), xdZoomBy(1 / 1.2);
  if (mod && k === '0') return e.preventDefault(), xdZoomAt(1, xdCanvas.clientWidth / 2, xdCanvas.clientHeight / 2);
  if (e.shiftKey && e.code === 'Digit1') return e.preventDefault(), xdFit();
  if (mod) return;
  if (k === 'escape') {
    e.preventDefault();
    if (xd.multi) return xdFinishMulti();
    if (xd.selected.size) return xdSelect([]);
    if (xd.tool !== 'selection') return xdSetTool('selection');
    return;
  }
  if (k === 'enter') {
    if (xd.multi) return e.preventDefault(), xdFinishMulti();
    if (sel.length === 1) {
      e.preventDefault();
      if (sel[0].type === 'text') return xdBegin(), xdStartText(sel[0]);
      if (XD_SHAPES.has(sel[0].type)) return xdNewText(xdCenter(sel[0]), sel[0]);
    }
    return;
  }
  if ((k === 'delete' || k === 'backspace') && sel.length) {
    e.preventDefault();
    return xdMutate(() => xdDelete(sel.map((x) => x.id)));
  }
  if (k.startsWith('arrow') && sel.length) {
    e.preventDefault();
    const step = e.shiftKey ? 5 : 1;
    const [dx, dy] = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step] }[k];
    return xdMutate(() => {
      for (const x of sel) {
        x.x += dx;
        x.y += dy;
        const t = xdBoundText(x);
        if (t) {
          t.x += dx;
          t.y += dy;
        }
      }
      xdUpdateArrows(sel.map((x) => x.id));
    });
  }
  if (k === 'q') return xd.locked = !xd.locked, xdRenderChrome();
  if (!e.shiftKey && !e.altKey && XD_KEYS[k]) {
    e.preventDefault();
    xdSetTool(XD_KEYS[k]);
  }
});
document.addEventListener('keyup', (e) => {
  if (e.key === ' ' && xd.space) {
    xd.space = false;
    xdCanvas.style.cursor = xd.tool === 'hand' ? 'grab' : 'default';
  }
});

// Copia lo seleccionado (con sus textos) al portapapeles interno y devuelve el texto para el del sistema.
function xdCopySelection() {
  const els = xdSelectedEls().flatMap((x) => [x, xdBoundText(x)].filter(Boolean));
  xd.clipboard = JSON.parse(JSON.stringify(els));
  return JSON.stringify({ type: 'excalidraw/clipboard', elements: els });
}
// Pega elementos en el centro de la vista, con ids nuevos, y los deja seleccionados.
function xdPasteElements(els) {
  if (!els?.length) return;
  const b = xdSceneBounds(els.map(xdNormalize));
  const [cx, cy] = xdToWorld(xdCanvas.clientWidth / 2, xdCanvas.clientHeight / 2);
  xdMutate(() => {
    const copies = xdCloneEls(els.map(xdNormalize), cx - (b[0] + b[2]) / 2, cy - (b[1] + b[3]) / 2);
    xd.elements.push(...copies);
    xd.selected = new Set(copies.filter((c) => !c.containerId).map((c) => c.id));
  });
}
document.addEventListener('copy', (e) => {
  if ($('#draw').hidden || xd.editingText || !xd.selected.size) return;
  e.clipboardData?.setData('text/plain', xdCopySelection());
  e.preventDefault();
});
document.addEventListener('cut', (e) => {
  if ($('#draw').hidden || xd.editingText || !xd.selected.size) return;
  e.clipboardData?.setData('text/plain', xdCopySelection());
  e.preventDefault();
  xdMutate(() => xdDelete([...xd.selected]));
});
document.addEventListener('paste', async (e) => {
  if ($('#draw').hidden || xd.editingText) return;
  const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'));
  if (file) {
    e.preventDefault();
    return xdAddImage(file);
  }
  const text = e.clipboardData?.getData('text/plain') || '';
  let els = null;
  try {
    const data = JSON.parse(text);
    if (data?.type === 'excalidraw/clipboard' || data?.type === 'excalidraw') els = data.elements;
  } catch {
    // No es un dibujo.
  }
  if (!els && !text && xd.clipboard) els = xd.clipboard;
  e.preventDefault();
  if (els?.length) xdPasteElements(els);
  else if (text.trim()) {
    // Texto pegado: un texto nuevo en el centro.
    const [cx, cy] = xdToWorld(xdCanvas.clientWidth / 2, xdCanvas.clientHeight / 2);
    xdMutate(() => {
      const t = newXdElement('text', cx, cy, { text: text.trim(), originalText: text.trim() });
      xdFitText(t);
      t.x -= t.width / 2;
      t.y -= t.height / 2;
      xd.elements.push(t);
      xd.selected = new Set([t.id]);
    });
  }
});

// ---------- Imágenes ----------
function xdPickImage() {
  const input = $('#xd-image-input');
  input.value = '';
  input.click();
}
async function xdAddImage(file) {
  try {
    const { data, type, width, height } = await compressImage(file);
    const rec = { id: uid(), name: imageName(file), type, data, width, height, createdAt: Date.now() };
    await putFile(rec);
    const max = 400;
    const k = Math.min(1, max / Math.max(width, height));
    const [cx, cy] = xdToWorld(xdCanvas.clientWidth / 2, xdCanvas.clientHeight / 2);
    xdMutate(() => {
      const im = newXdElement('image', cx - (width * k) / 2, cy - (height * k) / 2, { width: width * k, height: height * k, fileId: rec.id, status: 'saved', scale: [1, 1], backgroundColor: 'transparent', strokeColor: 'transparent' });
      xd.elements.push(im);
      xd.selected = new Set([im.id]);
    });
    scheduleFilesSync();
  } catch {
    showToastMessage('No se pudo añadir la imagen.');
  }
  xdSetTool('selection');
}
$('#xd-image-input').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (f) xdAddImage(f);
  else xdSetTool('selection');
});
xdCanvas.addEventListener('dragover', (e) => e.preventDefault());
xdCanvas.addEventListener('drop', (e) => {
  e.preventDefault();
  const f = [...(e.dataTransfer?.files || [])][0];
  if (!f) return;
  if (f.type.startsWith('image/')) xdAddImage(f);
  else if (/\.(excalidraw|json|md)$/i.test(f.name)) f.text().then(xdImportText);
});

// ---------- Formato de Excalidraw ----------
// Completa un elemento de Excalidraw (o de una versión anterior) con lo que falte.
function xdNormalize(raw) {
  const e = { ...raw };
  const fam = Number(e.fontFamily);
  if (e.type === 'text') e.fontFamily = [3].includes(fam) ? 3 : [2, 6].includes(fam) ? 2 : 1;
  if (e.type === 'frame' || e.type === 'magicframe' || e.type === 'embeddable' || e.type === 'iframe') e.type = 'rectangle';
  return {
    angle: 0,
    strokeColor: '#1e1e1e',
    backgroundColor: 'transparent',
    fillStyle: 'hachure',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 1,
    opacity: 100,
    roundness: null,
    seed: Math.floor(Math.random() * 2 ** 31),
    groupIds: [],
    boundElements: [],
    width: 0,
    height: 0,
    ...e,
    ...(e.type === 'text' ? { originalText: e.originalText ?? e.text ?? '', text: e.text ?? '', fontSize: e.fontSize || 20, textAlign: e.textAlign || 'left' } : {}),
    ...(e.points ? { points: e.points.map(([x, y]) => [xdR(x), xdR(y)]) } : {}),
  };
}

// Escena de un archivo .excalidraw o de una nota .excalidraw.md de Obsidian.
async function xdParseScene(text) {
  let json = null;
  const t = String(text).trim();
  if (t.startsWith('{')) json = JSON.parse(t);
  else {
    const comp = t.match(/```compressed-json\s*\n([\s\S]*?)```/);
    const plain = t.match(/```json\s*\n([\s\S]*?)```/);
    if (comp) {
      await loadLib('lzstring');
      json = JSON.parse(window.LZString.decompressFromBase64(comp[1].replace(/\s+/g, '')));
    } else if (plain) json = JSON.parse(plain[1]);
  }
  if (!json || !Array.isArray(json.elements)) throw new Error('no es un dibujo de Excalidraw');
  return json;
}

// Convierte una escena de Excalidraw en elementos de la app (las imágenes pasan a ser archivos de la app).
async function xdSceneToElements(json, resolveImage = null) {
  const fileMap = new Map();
  for (const [fid, f] of Object.entries(json.files || {})) {
    if (!f?.dataURL || !/^data:image\//.test(f.dataURL)) continue;
    try {
      const blob = await (await fetch(f.dataURL)).blob();
      const { data, type, width, height } = await compressImage(new File([blob], 'imagen', { type: blob.type }));
      const rec = { id: uid(), name: 'Imagen del dibujo', type, data, width, height, createdAt: Date.now() };
      await putFile(rec);
      fileMap.set(fid, rec.id);
    } catch {
      // Imagen que no se pudo leer: queda un recuadro gris.
    }
  }
  const out = [];
  for (const raw of json.elements) {
    if (raw.isDeleted) continue;
    const e = xdNormalize(raw);
    if (e.type === 'image') e.fileId = fileMap.get(e.fileId) || (resolveImage && (await resolveImage(e.fileId))) || e.fileId;
    out.push(e);
  }
  return out;
}

// Trabaja con otra escena como si fuera la del editor (para colocar textos y dibujarla fuera).
async function xdWithScene(els, fn) {
  const saved = xd.elements;
  xd.elements = els;
  try {
    return await fn();
  } finally {
    xd.elements = saved;
  }
}
const xdRefitTexts = () => xdLive().filter((e) => e.type === 'text').forEach(xdFitText);

async function xdImportText(text) {
  try {
    const json = await xdParseScene(text);
    const els = await xdSceneToElements(json);
    xdMutate(() => {
      if (xdLive().length) {
        // Se añade junto a lo que ya hay.
        const b = xdSceneBounds(xdLive());
        const nb = xdSceneBounds(els) || [0, 0, 0, 0];
        const copies = xdCloneEls(els, b[2] + 60 - nb[0], b[1] - nb[1]);
        xd.elements.push(...copies);
      } else xd.elements = els;
      if (json.appState?.viewBackgroundColor) xd.bg = json.appState.viewBackgroundColor;
      xdRefitTexts();
    });
    xdFit();
    showToastMessage(`Dibujo abierto: ${plural(els.length, 'elemento', 'elementos')}`);
  } catch {
    showToastMessage('Ese archivo no es un dibujo de Excalidraw que se pueda abrir.');
  }
}

async function xdSceneJson(els = xdLive()) {
  const files = {};
  for (const e of els) {
    if (e.type !== 'image' || !e.fileId || files[e.fileId]) continue;
    const rec = await getFile(e.fileId);
    if (rec?.data) files[e.fileId] = { mimeType: rec.type, id: e.fileId, dataURL: rec.data, created: rec.createdAt || Date.now() };
  }
  return { type: 'excalidraw', version: 2, source: 'https://claude.ai (Enfoque)', elements: els, appState: { viewBackgroundColor: xd.bg, gridSize: xd.grid ? 20 : null }, files };
}

// Imagen PNG de una escena (para la nota, para exportar o al importar desde Obsidian).
async function xdRenderBlob(els, bg = '#ffffff', { scale = 2, pad = 24 } = {}) {
  const b = xdSceneBounds(els);
  if (!b) return null;
  // Las imágenes tienen que estar cargadas antes de dibujar.
  await Promise.all(
    els
      .filter((e) => e.type === 'image' && e.fileId)
      .map((e) => {
        const img = xdImage(e.fileId);
        return img.complete && img.naturalWidth ? null : new Promise((r) => {
          img.addEventListener('load', r, { once: true });
          img.addEventListener('error', r, { once: true });
          setTimeout(r, 1500);
        });
      })
  );
  const x0 = b[0] - pad;
  const y0 = b[1] - pad;
  const w = b[2] - b[0] + pad * 2;
  const h = b[3] - b[1] + pad * 2;
  const k = Math.min(scale, 4096 / w, 4096 / h);
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(w * k));
  out.height = Math.max(1, Math.round(h * k));
  const ctx = out.getContext('2d');
  if (bg && bg !== 'transparent') {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, out.width, out.height);
  }
  ctx.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
  const saved = xd.erasing;
  xd.erasing = new Set();
  const editing = xd.editingText;
  xd.editingText = null;
  xdDrawScene(ctx, els);
  xd.erasing = saved;
  xd.editingText = editing;
  return new Promise((resolve) => out.toBlob(resolve, 'image/png'));
}

// Fuente «a mano» (se carga una vez, de Google Fonts).
let xdFontReady = null;
function xdLoadFont() {
  if (!xdFontReady) {
    let link = document.querySelector('link[data-xd-font]');
    const sheet = new Promise((resolve) => {
      if (link) return resolve();
      link = el('link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Kalam:wght@400&display=swap' });
      link.dataset.xdFont = '1';
      link.onload = link.onerror = () => resolve();
      setTimeout(resolve, 2500);
      document.head.append(link);
    });
    xdFontReady = sheet
      .then(() => Promise.race([document.fonts?.load('20px Kalam'), new Promise((r) => setTimeout(r, 2500))]))
      .catch(() => null)
      .then(() => {
        // Con la fuente ya cargada, los textos se vuelven a medir.
        xdLive().filter((e) => e.type === 'text').forEach(xdFitText);
        xdScheduleRender();
      });
  }
  return xdFontReady;
}

// ---------- Abrir, guardar y cerrar ----------
// Dibujos de la versión anterior (solo trazos) -> trazos a mano de Excalidraw.
function xdFromStrokes(edit) {
  return (edit.strokes || []).map((s) => {
    const [x0, y0] = s.points[0];
    const fd = newXdElement('freedraw', x0, y0, {
      points: s.points.map(([x, y]) => [xdR(x - x0), xdR(y - y0)]),
      pressures: s.points.map((q) => q[2] ?? 0.5),
      simulatePressure: false,
      strokeColor: s.color,
      strokeWidth: s.size >= 6 ? 4 : s.size >= 3 ? 2 : 1,
      opacity: s.tool === 'marker' ? 35 : 100,
      roughness: 0,
    });
    const [x1, y1, x2, y2] = xdBounds(fd);
    fd.width = x2 - x1;
    fd.height = y2 - y1;
    return fd;
  });
}

function openDrawing(edit = null) {
  const note = activeNote();
  if (!note) return showToastMessage('Abre una nota para añadir un dibujo.');
  if (typeof endBlockEdit === 'function') endBlockEdit();
  flushNoteSave();
  const ta = $('#note-editor');
  xd.caret = document.activeElement === ta ? ta.selectionStart : ta.dataset.caret ? Number(ta.dataset.caret) : null;
  xd.noteId = note.id;
  xd.editing = edit; // { id, elements | strokes } al editar un dibujo de la nota
  xd.elements = edit ? (edit.elements ? edit.elements.map(xdNormalize) : xdFromStrokes(edit)) : [];
  xd.bg = edit?.appState?.viewBackgroundColor || '#ffffff';
  xd.grid = !!edit?.appState?.gridSize;
  xd.history = [];
  xd.redo = [];
  xd.selected = new Set();
  xd.multi = null;
  xd.action = null;
  xd.pointers.clear();
  xd.penSeen = false;
  xd.tool = edit ? 'selection' : 'freedraw';
  xd.initial = xdSnap();
  $('#xd-menu').hidden = true;
  $('#xd-help').hidden = true;
  $('#draw-cancel').textContent = 'Cancelar';
  delete $('#draw-cancel').dataset.confirm;
  $('#draw').hidden = false;
  xdRefitTexts();
  xdLoadFont().then(() => {
    xdRefitTexts();
    xdScheduleRender();
  });
  requestAnimationFrame(() => {
    xdResize();
    if (edit) xdFit();
    else xd.view = { x: 0, y: 0, zoom: 1 };
    xdSetTool(xd.tool);
    xdCanvas.focus({ preventScroll: true });
  });
}

const closeDrawing = () => {
  xdEndText();
  $('#draw').hidden = true;
  xd.history = [];
  xd.redo = [];
};

$('#draw-cancel').addEventListener('click', () => {
  const btn = $('#draw-cancel');
  // Si hay cambios, se pide un segundo toque para descartarlos.
  if (xdSnap() !== xd.initial && btn.dataset.confirm !== '1') {
    btn.dataset.confirm = '1';
    btn.textContent = '¿Descartar cambios?';
    setTimeout(() => {
      delete btn.dataset.confirm;
      btn.textContent = 'Cancelar';
    }, 4000);
    return;
  }
  closeDrawing();
});

async function saveDrawing() {
  xdEndText();
  if (xd.multi) xdFinishMulti();
  const note = noteById(xd.noteId);
  const els = xdLive();
  if (note && !els.length && xd.editing?.id) {
    // Dibujo vaciado: se quita de la nota (con confirmación).
    if (!confirm('El dibujo está vacío. ¿Quitarlo de la nota?')) return;
    const id = xd.editing.id;
    closeDrawing();
    note.body = note.body.replace(new RegExp(`!\\[[^\\]]*\\]\\(img:${id}\\)\\n?`, 'g'), '');
    note.updatedAt = Date.now();
    save();
    renderAll();
    return showToastMessage('Dibujo quitado de la nota');
  }
  if (!note || !els.length) return closeDrawing();
  const btn = $('#draw-save');
  btn.disabled = true;
  try {
    await xdLoadFont();
    const blob = await xdRenderBlob(els, xd.bg);
    const { data, type, width, height } = await compressImage(new File([blob], 'dibujo.png', { type: 'image/png' }));
    const scene = { type: 'excalidraw', version: 2, elements: JSON.parse(JSON.stringify(els)), appState: { viewBackgroundColor: xd.bg, gridSize: xd.grid ? 20 : null } };
    const big = JSON.stringify(scene).length > 600 * 1024;
    const rec = { id: uid(), name: 'Dibujo', type, data, width, height, createdAt: Date.now(), drawing: big ? null : scene };
    await putFile(rec);
    if (!big) xdDrawingIds.add(rec.id);
    const editingId = xd.editing?.id;
    closeDrawing();
    if (editingId && note.body.includes(`(img:${editingId})`)) {
      // Al editar, la nota pasa a apuntar al dibujo nuevo (así se sincroniza como imagen nueva).
      note.body = note.body.split(`(img:${editingId})`).join(`(img:${rec.id})`);
      note.updatedAt = Date.now();
      save();
      renderAll();
    } else {
      const text = `![Dibujo](img:${rec.id})`;
      if (isEditing(note.id)) {
        const ta = $('#note-editor');
        const pos = xd.caret ?? ta.value.length;
        const before = ta.value.slice(0, pos);
        ta.setRangeText(`${before && !before.endsWith('\n') ? '\n' : ''}${text}\n`, pos, pos, 'end');
        ta.dispatchEvent(new Event('input'));
      } else {
        // En la vista de lectura, el dibujo va al final de la nota.
        note.body = `${note.body.replace(/\s+$/, '')}${note.body.trim() ? '\n\n' : ''}${text}\n`;
        note.updatedAt = Date.now();
        save();
        renderAll();
      }
    }
    scheduleFilesSync();
    showToastMessage(big ? 'Dibujo guardado como imagen (es tan grande que no se podrá volver a editar)' : 'Dibujo guardado en la nota');
  } catch {
    showToastMessage('No se pudo guardar el dibujo: es demasiado grande. Prueba a simplificarlo.');
  } finally {
    btn.disabled = false;
  }
}
$('#draw-save').addEventListener('click', saveDrawing);
$('#draw-undo').addEventListener('click', xdUndo);
$('#draw-redo').addEventListener('click', xdRedo);
$('#xd-zoom-in').addEventListener('click', () => xdZoomBy(1.2));
$('#xd-zoom-out').addEventListener('click', () => xdZoomBy(1 / 1.2));
$('#xd-zoom-reset').addEventListener('click', () => xdZoomAt(1, xdCanvas.clientWidth / 2, xdCanvas.clientHeight / 2));
$('#xd-fit').addEventListener('click', xdFit);
$('#xd-help-btn').addEventListener('click', () => ($('#xd-help').hidden = !$('#xd-help').hidden));
$('#xd-help-close').addEventListener('click', () => ($('#xd-help').hidden = true));
$('#xd-props-toggle').addEventListener('click', () => $('#draw').classList.toggle('props-open'));
new ResizeObserver(() => !$('#draw').hidden && xdResize()).observe($('#draw-wrap'));

// Menú: fondo, cuadrícula, exportar e importar.
function xdRenderMenu() {
  const menu = $('#xd-menu');
  const item = (label, fn) => {
    const b = el('button', { className: 'menu-item', role: 'menuitem' }, label);
    b.addEventListener('click', () => {
      menu.hidden = true;
      fn();
    });
    return b;
  };
  const bgs = el(
    'div',
    { className: 'xd-bgs' },
    XD_CANVAS_BGS.map(([c, name]) => {
      const b = el('button', { className: `xd-sw${xd.bg === c ? ' on' : ''}${c === 'transparent' ? ' none' : ''}`, title: name, ariaLabel: `Fondo ${name}` });
      if (c !== 'transparent') b.style.background = c;
      b.addEventListener('click', () => {
        xd.bg = c;
        xdRenderMenu();
        xdScheduleRender();
      });
      return b;
    })
  );
  menu.replaceChildren(
    el('div', { className: 'xd-menu-label' }, 'Fondo del lienzo'),
    bgs,
    item(`${xd.grid ? '✓ ' : ''}Cuadrícula (Ctrl+')`, () => {
      xd.grid = !xd.grid;
      xdScheduleRender();
    }),
    item('Encajar todo (Mayús+1)', xdFit),
    item('Abrir un archivo de Excalidraw…', () => {
      $('#xd-open-input').value = '';
      $('#xd-open-input').click();
    }),
    item('Exportar como .excalidraw', async () => {
      const json = JSON.stringify(await xdSceneJson(), null, 2);
      offerDownload(`dibujo-${dateKey()}.excalidraw`, new Blob([json], { type: 'application/json' }), 'application/json');
    }),
    item('Exportar como imagen PNG', async () => {
      const blob = await xdRenderBlob(xdLive(), xd.bg);
      if (blob) offerDownload(`dibujo-${dateKey()}.png`, blob, 'image/png');
    }),
    item('Borrar todo el lienzo', () => xdMutate(() => {
      xd.elements = [];
      xd.selected.clear();
    }))
  );
}
$('#xd-menu-btn').addEventListener('click', () => {
  const menu = $('#xd-menu');
  menu.hidden = !menu.hidden;
  if (!menu.hidden) xdRenderMenu();
});
document.addEventListener('pointerdown', (e) => {
  if (!$('#xd-menu').hidden && !e.target.closest('#xd-menu, #xd-menu-btn')) $('#xd-menu').hidden = true;
});
$('#xd-open-input').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (f) xdImportText(await f.text());
});

// ---------- Dibujos en la nota ----------
// Al tocar un dibujo de la nota se abre para editarlo (como en Excalidraw de Obsidian).
const xdDrawingIds = new Set();
async function xdIsDrawing(id) {
  if (xdDrawingIds.has(id)) return true;
  const rec = await getFile(id);
  if (rec?.drawing) xdDrawingIds.add(id);
  return !!rec?.drawing;
}
async function openDrawingFile(id) {
  const rec = await getFile(id);
  const note = activeNote();
  if (!rec?.drawing || !note || note.enc || !note.body.includes(`(img:${id})`)) return false;
  $('#image-viewer').hidden = true;
  openDrawing({ id, ...rec.drawing });
  return true;
}
document.addEventListener(
  'click',
  (e) => {
    const img = e.target.closest?.('#note-reading img.note-img[data-img]');
    if (!img || !xdDrawingIds.has(img.dataset.img) || e.ctrlKey || e.metaKey) return;
    // Solo se intercepta si openDrawingFile lo va a abrir.
    const note = activeNote();
    if (!note || note.enc || !note.body.includes(`(img:${img.dataset.img})`)) return;
    e.preventDefault();
    e.stopPropagation();
    openDrawingFile(img.dataset.img);
  },
  true
);
document.addEventListener('mouseover', (e) => {
  const img = e.target.closest?.('img.note-img[data-img]');
  if (!img || img.dataset.drawChecked) return;
  img.dataset.drawChecked = '1';
  xdIsDrawing(img.dataset.img).then((yes) => {
    if (!yes) return;
    img.classList.add('is-drawing');
    img.title = 'Dibujo · clic para editarlo (Ctrl+clic para verlo en grande)';
  });
});
// Al empezar se apuntan los dibujos que hay, para que el primer toque ya los abra.
setTimeout(() => allFiles().then((list) => list.forEach((f) => f.drawing && xdDrawingIds.add(f.id))), 1500);

// En el visor de imágenes, un dibujo de la nota abierta se puede volver a editar.
async function updateViewerEdit(img) {
  const btn = $('#image-viewer-edit');
  btn.hidden = true;
  const id = img?.dataset.img;
  if (!id) return;
  const rec = await getFile(id);
  const note = activeNote();
  if (rec?.drawing && note && !note.enc && note.body.includes(`(img:${id})`)) {
    btn.hidden = false;
    btn.onclick = () => openDrawingFile(id);
  }
}
document.addEventListener('click', (e) => {
  const img = e.target.closest?.('img.note-img');
  if (img && !img.closest('#image-viewer')) updateViewerEdit(img);
});

NOTE_MENU_EXTRA.push((note) => (note.enc ? null : { label: '✏️ Nuevo dibujo…', action: () => openDrawing() }));
SLASH_ITEMS.splice(SLASH_ITEMS.findIndex((it) => it.label === 'Imagen…') + 1, 0, { icon: '✏️', label: 'Dibujo…', detail: 'Pizarra al estilo Excalidraw: figuras, flechas, texto y lápiz', keys: 'dibujo dibujar boceto lapiz mano sketch excalidraw pizarra diagrama', run: () => openDrawing() });
