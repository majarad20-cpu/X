'use strict';

// ---------- Lienzos: alinear, deshacer, buscar, soltar notas y exportar imagen ----------

// --- Alinear y repartir varias tarjetas elegidas ---
function alignCards(c, how) {
  const list = multiCards(c);
  if (list.length < 2) return;
  const b = cardsBox(list);
  const set = {
    left: (k) => (k.x = b.x),
    centerX: (k) => (k.x = Math.round(b.x + b.w / 2 - k.w / 2)),
    right: (k) => (k.x = b.x + b.w - k.w),
    top: (k) => (k.y = b.y),
    middle: (k) => (k.y = Math.round(b.y + b.h / 2 - k.h / 2)),
    bottom: (k) => (k.y = b.y + b.h - k.h),
  };
  if (set[how]) list.forEach(set[how]);
  // Repartir: los extremos se quedan y los huecos entre tarjetas quedan iguales.
  if (how === 'distH' || how === 'distV') {
    const [pos, size] = how === 'distH' ? ['x', 'w'] : ['y', 'h'];
    const sorted = list.slice().sort((a, z) => a[pos] - z[pos]);
    const total = sorted.reduce((n, k) => n + k[size], 0);
    const span = b[size];
    const gap = (span - total) / (sorted.length - 1);
    let at = b[pos];
    for (const k of sorted) {
      k[pos] = Math.round(at);
      at += k[size] + gap;
    }
  }
  touchCanvas(c);
  renderCanvasBoard();
}
$('#cv-align').addEventListener('click', () => {
  const c = currentCanvas();
  if (!c) return;
  showMenu($('#cv-align'), [
    { label: '⇤ Alinear a la izquierda', action: () => alignCards(c, 'left') },
    { label: '↔ Centrar en horizontal', action: () => alignCards(c, 'centerX') },
    { label: '⇥ Alinear a la derecha', action: () => alignCards(c, 'right') },
    { sep: true },
    { label: '⤒ Alinear arriba', action: () => alignCards(c, 'top') },
    { label: '↕ Centrar en vertical', action: () => alignCards(c, 'middle') },
    { label: '⤓ Alinear abajo', action: () => alignCards(c, 'bottom') },
    { sep: true },
    { label: '⋯ Repartir en horizontal', action: () => alignCards(c, 'distH') },
    { label: '⋮ Repartir en vertical', action: () => alignCards(c, 'distV') },
  ]);
});

// Modo «elegir varias»: en pantallas táctiles, tocar suma tarjetas y arrastrar dibuja un recuadro.
function setSelectMode(on) {
  cv.multiMode = on;
  selectCard(null);
  $('#cv-select-mode').setAttribute('aria-pressed', String(on));
  $('#cv-viewport').classList.toggle('select-mode', on);
}
$('#cv-select-mode').addEventListener('click', () => setSelectMode(!cv.multiMode));

// --- Deshacer y rehacer dentro del lienzo ---
// Cada estado distinto del lienzo (tarjetas y flechas) se guarda al cambiar; hasta 100 pasos.
const cvHist = { id: null, stack: [], pos: -1 };
const cvSnap = (c) => JSON.stringify({ cards: c.cards, edges: c.edges });
function cvRecord(c) {
  if (cvHist.id !== c.id) {
    cvHist.id = c.id;
    cvHist.stack = [cvSnap(c)];
    cvHist.pos = 0;
  } else {
    const s = cvSnap(c);
    if (s === cvHist.stack[cvHist.pos]) return renderUndoButtons();
    cvHist.stack = cvHist.stack.slice(0, cvHist.pos + 1);
    cvHist.stack.push(s);
    if (cvHist.stack.length > 100) cvHist.stack.shift();
    cvHist.pos = cvHist.stack.length - 1;
  }
  renderUndoButtons();
}
function renderUndoButtons() {
  $('#cv-undo').disabled = cvHist.pos <= 0;
  $('#cv-redo').disabled = cvHist.pos >= cvHist.stack.length - 1;
}
function canvasUndo(step) {
  const c = currentCanvas();
  if (!c || cvHist.id !== c.id) return;
  const p = cvHist.pos + step;
  if (p < 0 || p >= cvHist.stack.length) return;
  cvHist.pos = p;
  const d = JSON.parse(cvHist.stack[p]);
  c.cards = d.cards;
  c.edges = d.edges;
  cv.selected = null;
  cv.multi.clear();
  cv.editing = null;
  c.updatedAt = Date.now();
  save();
  renderCanvasBoard();
  showToastMessage(step < 0 ? 'Deshecho' : 'Rehecho');
}
$('#cv-undo').addEventListener('click', () => canvasUndo(-1));
$('#cv-redo').addEventListener('click', () => canvasUndo(1));
const cvRenderBase = renderCanvasBoard;
renderCanvasBoard = function renderCanvasBoardTracked() {
  cvRenderBase();
  const c = currentCanvas();
  if (c) {
    cvRecord(c);
    cvMarkFound();
  }
};
const cvTouchBase = touchCanvas;
touchCanvas = function touchCanvasTracked(c) {
  cvTouchBase(c);
  if (c?.id === cv.id) cvRecord(c);
};

// --- Buscar dentro del lienzo ---
const cvFind = { hits: [], at: -1 };
const cvFold = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function cardSearchText(k) {
  if (k.type === 'note') {
    const n = noteById(k.noteId);
    return n ? `${baseName(n.path)} ${noteText(n) || ''}` : '';
  }
  if (k.type === 'link') return `${k.title || ''} ${k.url || ''}`;
  if (k.type === 'group') return k.label || '';
  if (k.type === 'image') return k.name || k.file || '';
  return k.text || '';
}
function runCanvasSearch(q) {
  const c = currentCanvas();
  const words = cvFold(q).split(/\s+/).filter(Boolean);
  cvFind.hits = !c || !words.length ? [] : c.cards.filter((k) => {
    const t = cvFold(cardSearchText(k));
    return words.every((w) => t.includes(w));
  }).sort((a, b) => a.y - b.y || a.x - b.x).map((k) => k.id);
  cvFind.at = cvFind.hits.length ? 0 : -1;
  showCanvasHit();
}
function showCanvasHit() {
  const n = cvFind.hits.length;
  $('#cv-search-count').textContent = $('#cv-search-input').value.trim() ? (n ? `${cvFind.at + 1}/${n}` : 'Sin resultados') : '';
  cvMarkFound();
  const k = currentCanvas()?.cards.find((x) => x.id === cvFind.hits[cvFind.at]);
  if (k) {
    selectCard(k.id);
    zoomToCard(k);
  }
}
function cvMarkFound() {
  const open = !$('#cv-search').hidden;
  const hits = new Set(open ? cvFind.hits : []);
  $$('#cv-world .cv-card').forEach((node) => {
    node.classList.toggle('found', hits.has(node.dataset.id));
    node.classList.toggle('current', open && node.dataset.id === cvFind.hits[cvFind.at]);
  });
}
function openCanvasSearch() {
  $('#cv-search').hidden = false;
  $('#cv-search-input').focus();
  $('#cv-search-input').select();
}
function closeCanvasSearch() {
  $('#cv-search').hidden = true;
  cvFind.hits = [];
  cvFind.at = -1;
  cvMarkFound();
  $('#cv-viewport').focus({ preventScroll: true });
}
const stepCanvasHit = (d) => {
  if (!cvFind.hits.length) return;
  cvFind.at = (cvFind.at + d + cvFind.hits.length) % cvFind.hits.length;
  showCanvasHit();
};
$('#cv-search-btn').addEventListener('click', () => ($('#cv-search').hidden ? openCanvasSearch() : closeCanvasSearch()));
$('#cv-search-input').addEventListener('input', (e) => runCanvasSearch(e.target.value));
$('#cv-search').addEventListener('submit', (e) => {
  e.preventDefault();
  stepCanvasHit(1);
});
$('#cv-search-prev').addEventListener('click', () => stepCanvasHit(-1));
$('#cv-search-close').addEventListener('click', closeCanvasSearch);
$('#cv-search-input').addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Escape') {
    e.preventDefault();
    closeCanvasSearch();
  } else if (e.key === 'Enter' && e.shiftKey) {
    e.preventDefault();
    stepCanvasHit(-1);
  }
});
['pointerdown', 'dblclick', 'contextmenu'].forEach((t) => $('#cv-search').addEventListener(t, (e) => e.stopPropagation()));

// Atajos del lienzo: Ctrl+Z / Ctrl+Mayús+Z (o Ctrl+Y) y Ctrl+F.
$('#cv-viewport').addEventListener('keydown', (e) => {
  if (!currentCanvas() || cv.editing || e.target.closest('textarea, input')) return;
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return;
  const key = e.key.toLowerCase();
  if (key === 'z' || key === 'y') {
    e.preventDefault();
    e.stopPropagation();
    canvasUndo(key === 'y' || e.shiftKey ? 1 : -1);
  } else if (key === 'f') {
    e.preventDefault();
    e.stopPropagation();
    openCanvasSearch();
  }
}, true);

// --- Soltar una nota arrastrada desde el panel de archivos ---
const isNoteDrag = (e) => [...(e.dataTransfer?.types || [])].includes('text/x-note');
$('#cv-viewport').addEventListener('dragover', (e) => {
  if (!isNoteDrag(e) || !currentCanvas()) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  $('#cv-viewport').classList.add('note-drop');
});
$('#cv-viewport').addEventListener('dragleave', (e) => {
  if (!e.relatedTarget || !$('#cv-viewport').contains(e.relatedTarget)) $('#cv-viewport').classList.remove('note-drop');
});
$('#cv-viewport').addEventListener('drop', (e) => {
  $('#cv-viewport').classList.remove('note-drop');
  const c = currentCanvas();
  if (!c || !isNoteDrag(e)) return;
  e.preventDefault();
  const note = noteById(e.dataTransfer.getData('text/x-note'));
  if (!note) return;
  const p = toWorldPoint(e.clientX, e.clientY);
  addCanvasCard(c, { type: 'note', noteId: note.id, x: p.x - 160, y: p.y - 30 });
  showToastMessage(`«${baseName(note.path)}» añadida al lienzo`);
});

// --- Exportar como imagen (PNG) ---
// Se dibuja aparte (tarjetas, grupos, flechas y etiquetas) para que salga nítido y con el texto entero.
function cvPlain(md) {
  return String(md || '')
    .replace(/^---\n[\s\S]*?\n---\n?/, '')
    .replace(/!?\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (m, a, b) => b || a)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s*/gm, '☐ ')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/[*_`~]+/g, '')
    .replace(/^>\s?/gm, '');
}
function cvWrap(g, text, maxW) {
  const out = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/(\s+)/)) {
      const next = line + word;
      if (g.measureText(next).width > maxW && line.trim()) {
        out.push(line.trimEnd());
        line = word.trimStart();
      } else line = next;
    }
    out.push(line);
  }
  return out;
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
async function exportCanvasPng(c) {
  if (!c.cards.length) return showToastMessage('El lienzo está vacío.');
  const css = getComputedStyle(document.documentElement);
  const v = (name, alt) => css.getPropertyValue(name).trim() || alt;
  const bg = v('--bg', '#f6f7f9');
  const surface = v('--surface', '#ffffff');
  const border = v('--border', '#e3e5ea');
  const text = v('--text', '#1c1f24');
  const muted = v('--muted', '#6b7280');
  const accent = v('--accent', '#5b5bd6');
  const font = getComputedStyle(document.body).fontFamily || 'sans-serif';
  const pad = 40;
  const b = cardsBox(c.cards.map((k) => (k.type === 'group' ? { ...k, y: k.y - 30, h: k.h + 30 } : k)));
  const scale = Math.max(0.5, Math.min(2, 8000 / Math.max(b.w + 2 * pad, b.h + 2 * pad)));
  const cnv = document.createElement('canvas');
  cnv.width = Math.round((b.w + 2 * pad) * scale);
  cnv.height = Math.round((b.h + 2 * pad) * scale);
  const g = cnv.getContext('2d');
  g.scale(scale, scale);
  g.translate(pad - b.x, pad - b.y);
  g.fillStyle = bg;
  g.fillRect(b.x - pad, b.y - pad, b.w + 2 * pad, b.h + 2 * pad);
  const tint = (hex, a) => {
    const h = hex.replace('#', '');
    const f = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
    const n = parseInt(f, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  };
  const colorOf = (k) => cvHex(k.color);
  // Grupos detrás
  for (const k of c.cards.filter((x) => x.type === 'group')) {
    const hex = colorOf(k);
    roundRect(g, k.x, k.y, k.w, k.h, 12);
    g.fillStyle = hex ? tint(hex, 0.08) : tint(accent.startsWith('#') ? accent : '#5b5bd6', 0.05);
    g.fill();
    g.setLineDash([8, 6]);
    g.strokeStyle = hex || border;
    g.lineWidth = 2;
    g.stroke();
    g.setLineDash([]);
    g.font = `600 15px ${font}`;
    const label = k.label || 'Grupo';
    const lw = g.measureText(label).width + 20;
    roundRect(g, k.x, k.y - 30, lw, 24, 6);
    g.fillStyle = surface;
    g.fill();
    g.strokeStyle = border;
    g.lineWidth = 1;
    g.stroke();
    g.fillStyle = text;
    g.fillText(label, k.x + 10, k.y - 13);
  }
  // Flechas
  const byId = new Map(c.cards.map((k) => [k.id, k]));
  const labels = [];
  for (const ed of c.edges) {
    const a = byId.get(ed.from);
    const z = byId.get(ed.to);
    if (!a || !z) continue;
    const [fs, ts] = edgeSides(ed, a, z);
    const p = anchor(a, fs);
    const q = anchor(z, ts);
    const [k1, k2] = edgeControls(p, fs, q, ts);
    const col = cvHex(ed.color) || tint(text.startsWith('#') ? text : '#1c1f24', 0.55);
    g.strokeStyle = col;
    g.fillStyle = col;
    g.lineWidth = 2.4;
    g.beginPath();
    g.moveTo(p.x, p.y);
    g.bezierCurveTo(k1.x, k1.y, k2.x, k2.y, q.x, q.y);
    g.stroke();
    const head = (tip, from) => {
      const ang = Math.atan2(tip.y - from.y, tip.x - from.x);
      g.beginPath();
      g.moveTo(tip.x, tip.y);
      g.lineTo(tip.x - 12 * Math.cos(ang - 0.4), tip.y - 12 * Math.sin(ang - 0.4));
      g.lineTo(tip.x - 12 * Math.cos(ang + 0.4), tip.y - 12 * Math.sin(ang + 0.4));
      g.closePath();
      g.fill();
    };
    const [fe, te] = cvEnds(ed);
    if (te === 'arrow') head(q, k2);
    if (fe === 'arrow') head(p, k1);
    if (ed.label) labels.push({ text: ed.label, x: (p.x + 3 * k1.x + 3 * k2.x + q.x) / 8, y: (p.y + 3 * k1.y + 3 * k2.y + q.y) / 8, col });
  }
  // Tarjetas
  for (const k of c.cards.filter((x) => x.type !== 'group')) {
    const hex = colorOf(k);
    g.save();
    g.shadowColor = 'rgba(0,0,0,.08)';
    g.shadowBlur = 8;
    g.shadowOffsetY = 2;
    roundRect(g, k.x, k.y, k.w, k.h, 10);
    g.fillStyle = surface;
    g.fill();
    g.restore();
    if (hex) {
      roundRect(g, k.x, k.y, k.w, k.h, 10);
      g.fillStyle = tint(hex, 0.12);
      g.fill();
    }
    roundRect(g, k.x, k.y, k.w, k.h, 10);
    g.strokeStyle = hex || border;
    g.lineWidth = 1;
    g.stroke();
    g.save();
    roundRect(g, k.x, k.y, k.w, k.h, 10);
    g.clip();
    let y = k.y + 12;
    const x = k.x + 12;
    const w = k.w - 24;
    const head = (label) => {
      g.font = `600 13px ${font}`;
      g.fillStyle = text;
      g.fillText(label, x, y + 12);
      y += 22;
      g.fillStyle = border;
      g.fillRect(k.x, y, k.w, 1);
      y += 10;
    };
    let body = '';
    if (k.type === 'note') {
      const n = noteById(k.noteId);
      head(`📝 ${n ? baseName(n.path) : 'Nota borrada'}`);
      body = n ? cvPlain(noteText(n) ?? '🔒 Nota protegida') : '';
    } else if (k.type === 'link') {
      let host = k.url || '';
      try {
        host = new URL(cvSafeUrl(k.url)).hostname.replace(/^www\./, '');
      } catch {
        // tal cual
      }
      head(`🔗 ${host || 'Enlace'}`);
      body = `${k.title || ''}\n${k.url || ''}`.trim();
    } else if (k.type === 'image') {
      const img = $(`#cv-world .cv-card[data-id="${CSS.escape(k.id)}"] img`);
      if (img?.complete && img.naturalWidth) {
        const r = Math.min(k.w / img.naturalWidth, k.h / img.naturalHeight);
        const iw = img.naturalWidth * r;
        const ih = img.naturalHeight * r;
        try {
          g.drawImage(img, k.x + (k.w - iw) / 2, k.y + (k.h - ih) / 2, iw, ih);
        } catch {
          // Imagen que el navegador no deja copiar: se deja el hueco.
        }
      } else body = `🖼 ${k.name || 'Imagen'}`;
    } else body = cvPlain(k.text);
    if (body) {
      const lines = body.split('\n');
      for (const raw of lines) {
        const h = raw.match(/^(#{1,6})\s+(.*)$/);
        const size = h ? Math.max(14, 22 - h[1].length * 2) : 13;
        g.font = `${h ? '700' : '400'} ${size}px ${font}`;
        g.fillStyle = text;
        for (const ln of cvWrap(g, h ? h[2] : raw, w)) {
          if (y + size > k.y + k.h - 8) break;
          g.fillText(ln, x, y + size);
          y += size * 1.45;
        }
        if (y + 13 > k.y + k.h - 8) break;
      }
    }
    g.restore();
  }
  // Etiquetas de las flechas, encima de todo
  g.font = `12px ${font}`;
  for (const l of labels) {
    const lw = g.measureText(l.text).width + 16;
    roundRect(g, l.x - lw / 2, l.y - 11, lw, 22, 11);
    g.fillStyle = surface;
    g.fill();
    g.strokeStyle = border;
    g.lineWidth = 1;
    g.stroke();
    g.fillStyle = text;
    g.textAlign = 'center';
    g.fillText(l.text, l.x, l.y + 4);
    g.textAlign = 'left';
  }
  const blob = await new Promise((res) => cnv.toBlob(res, 'image/png'));
  if (!blob) return showToastMessage('No se pudo crear la imagen.');
  return offerDownload(`${cleanName(c.title) || 'Lienzo'}.png`, blob, 'image/png');
}
