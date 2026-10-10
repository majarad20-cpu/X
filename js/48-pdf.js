'use strict';

// ---------- Exportar a PDF ----------
// PDF de texto de verdad (se puede seleccionar y buscar) hecho con pdfmake, que solo se carga al
// exportar. La nota se dibuja con renderMd en un contenedor fuera de pantalla (con fórmulas y
// diagramas ya en SVG) y se recorre su DOM para montar el documento de pdfmake.
OBS_LIBS.pdfmake = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/pdfmake.min.js';
OBS_LIBS.pdffonts = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/vfs_fonts.js';
// Las pruebas quitan la compresión para buscar el texto en el PDF.
const PDF_OPTS = { compress: true, header: true, footer: true };
let pdfLastDoc = null; // el último documento generado (para las pruebas)
const PDF_W = 515; // ancho útil de A4 (595 pt) con márgenes de 40
const PDF_PX = 0.75; // 1 px de pantalla = 0,75 pt

const loadPdfMake = () => loadLib('pdfmake').then(() => loadLib('pdffonts'));

// Roboto no trae emojis ni algunos símbolos: se cambian por texto o se quitan.
const PDF_SUBS = { '★': '*', '✕': 'x', '➜': '>', '◐': '', '↩': '', '→': '->', '←': '<-', '☐': '[ ]', '☑': '[x]', '✓': 'v', '✔': 'v', '©': '©', '®': '®', '™': '™' };
const PDF_STRIP = /[★✕➜◐↩→←☐☑✓✔©®™]|[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}‍︎️⃣]/gu;
const pdfText = (s) => String(s).replace(PDF_STRIP, (c) => PDF_SUBS[c] ?? '');

const PDF_CALLOUT = { note: '#2563eb', info: '#0284c7', todo: '#4f46e5', abstract: '#0891b2', important: '#059669', tip: '#059669', hint: '#059669', success: '#16a34a', check: '#16a34a', done: '#16a34a', question: '#ca8a04', warning: '#d97706', caution: '#d97706', danger: '#dc2626', failure: '#dc2626', bug: '#dc2626', example: '#7c3aed', quote: '#6b7280' };
// Color mezclado con blanco (fondo suave de los avisos).
const pdfTint = (hex, k = 0.9) => `#${[1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - k) + 255 * k).toString(16).padStart(2, '0')).join('')}`;

const PDF_BLOCK = /^(h[1-6]|p|ul|ol|pre|div|blockquote|table|hr|dl|section|details|summary|figure)$/;
const isPdfBlock = (n) => n.nodeType === 1 && PDF_BLOCK.test(n.localName);

// ---------- Texto en línea ----------
function pdfRuns(nodes, st, ctx, out = []) {
  for (const n of nodes) {
    if (n.nodeType === 3) {
      const t = st.code ? pdfText(n.nodeValue) : pdfText(n.nodeValue.replace(/\s+/g, ' ')).replace(/ {2,}/g, ' ');
      if (t) out.push({ text: t, ...st, code: undefined });
      continue;
    }
    if (n.nodeType !== 1) continue;
    const tag = n.localName;
    const c = n.classList;
    if (tag === 'br') {
      out.push({ text: '\n' });
      continue;
    }
    if (/^(img|input|audio|video|iframe|button|script|style)$/.test(tag) || c.contains('fn-back') || c.contains('block-anchor') || c.contains('fold-toggle')) continue;
    // Vídeo, audio o tarjeta de enlace: va como texto con el enlace. Archivo de la app: su nombre.
    if (c.contains('media-embed')) {
      const url = n.dataset.url || '';
      const label = { video: 'Vídeo', audio: 'Audio', pdf: 'PDF' }[n.dataset.kind] || 'Enlace';
      if (/^https?:/i.test(url)) out.push({ text: `\n${label}: ${url}\n`, ...st, code: undefined, link: url, color: '#2563eb' });
      continue;
    }
    if (c.contains('note-file')) {
      out.push({ text: pdfText(n.dataset.name || 'archivo'), ...st, code: undefined, italics: true, color: '#374151' });
      continue;
    }
    // Fórmula en línea: pdfmake no mete SVG dentro del texto, así que va el TeX.
    if (c.contains('math')) {
      out.push({ text: pdfText(n.dataset.tex || n.textContent), ...st, code: undefined, italics: true, color: '#374151' });
      continue;
    }
    const s = { ...st };
    if (tag === 'strong' || tag === 'b') s.bold = true;
    else if (tag === 'em' || tag === 'i') s.italics = true;
    else if (tag === 'del' || tag === 's') s.decoration = 'lineThrough';
    else if (tag === 'u' || tag === 'ins') s.decoration = 'underline';
    else if (tag === 'code' || tag === 'kbd') Object.assign(s, { code: true, background: '#eef0f3', color: '#be185d' });
    else if (tag === 'mark') s.background = '#fef08a';
    else if (tag === 'sup') s.sup = true;
    else if (tag === 'sub') s.sub = true;
    else if (tag === 'small') s.fontSize = 8.5;
    else if (tag === 'a') {
      const href = n.getAttribute('href') || '';
      if (/^(https?:|mailto:)/i.test(href)) Object.assign(s, { link: href, color: '#2563eb', decoration: 'underline' });
      else if (c.contains('wikilink')) {
        s.color = '#7c3aed';
        const target = n.dataset.target && findNoteByName(n.dataset.target);
        if (target && ctx.dests?.has(target.id)) s.linkToDestination = ctx.dests.get(target.id);
      } else if (c.contains('tag-link')) s.color = '#7c3aed';
    }
    if ((tag === 'span' || tag === 'mark') && n.getAttribute('style')) Object.assign(s, pdfInlineStyle(n));
    pdfRuns(n.childNodes, s, ctx, out);
  }
  return out;
}

// Estilo permitido en <span>/<mark> (ya validado por renderMd): color, fondo, tamaño, grosor, cursiva.
const pdfHex = (v) => {
  const m = String(v).match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
  if (!m || m[4] === '0') return null;
  return `#${m.slice(1, 4).map((x) => (+x).toString(16).padStart(2, '0')).join('')}`;
};
function pdfInlineStyle(n) {
  const out = {};
  const st = n.style;
  const cs = n.isConnected ? getComputedStyle(n) : null;
  if (st.color && cs) out.color = pdfHex(cs.color) || undefined;
  if (st.backgroundColor && cs) out.background = pdfHex(cs.backgroundColor) || undefined;
  const fs = st.fontSize.match(/^([\d.]+)(%|em)$/);
  if (fs) out.fontSize = Math.max(5, Math.min(40, 10.5 * (fs[2] === '%' ? fs[1] / 100 : +fs[1])));
  if (/^(bold|bolder|[6-9]00)$/.test(st.fontWeight)) out.bold = true;
  if (/^(italic|oblique)$/.test(st.fontStyle)) out.italics = true;
  Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);
  return out;
}

// Quita los espacios del principio y del final de un párrafo (el icono quitado deja uno).
function pdfTrim(frags) {
  while (frags.length && !frags[0].text.trim() && frags[0].text !== '\n') frags.shift();
  while (frags.length && !frags[frags.length - 1].text.trim()) frags.pop();
  if (!frags.length) return '';
  frags[0] = { ...frags[0], text: frags[0].text.replace(/^ +/, '') };
  const k = frags.length - 1;
  frags[k] = { ...frags[k], text: frags[k].text.replace(/ +$/, '') };
  return frags;
}

function pdfImage(img, ctx) {
  const r = ctx.imgs.get(img);
  if (r) return { image: r.data, width: r.w, margin: [0, 4, 0, 8] };
  const src = img.getAttribute('src') || '';
  const alt = pdfText(img.alt || 'Imagen');
  return { text: /^https?:/i.test(src) ? { text: `[${alt}]`, link: src, color: '#2563eb' } : `[${alt}]`, italics: true, color: '#6b7280', margin: [0, 2, 0, 6] };
}

// Párrafo: texto y, debajo, las imágenes que lleve.
function pdfPara(nodes, ctx, extra = {}) {
  const frags = pdfTrim(pdfRuns(nodes, {}, ctx));
  const imgs = [];
  for (const n of nodes) if (n.nodeType === 1) imgs.push(...(n.localName === 'img' ? [n] : n.querySelectorAll('img')));
  const out = [];
  if (frags.length) out.push({ text: frags, margin: [0, 0, 0, 6], ...extra });
  imgs.forEach((im) => out.push(pdfImage(im, ctx)));
  return out;
}

// ---------- Bloques ----------
const pdfBar = (stack, color, bg) => ({
  table: { widths: ['*'], body: [[{ stack: stack.length ? stack : [' '] }]] },
  layout: { hLineWidth: () => 0, vLineWidth: (i) => (i === 0 ? 3 : 0), vLineColor: () => color, fillColor: () => bg || null, paddingLeft: () => 10, paddingRight: () => 8, paddingTop: () => 6, paddingBottom: () => 2 },
  margin: [0, 2, 0, 8],
});

const pdfBox = (done) => [
  { type: 'rect', x: 0, y: 2.5, w: 8, h: 8, r: 1.5, lineWidth: 0.8, lineColor: '#6b7280' },
  ...(done ? [{ type: 'polyline', points: [{ x: 1.6, y: 6.6 }, { x: 3.4, y: 8.6 }, { x: 6.8, y: 4.2 }], lineWidth: 1.2, lineColor: '#16a34a' }] : []),
];

function pdfList(n, ctx) {
  const items = [...n.children].filter((li) => li.localName === 'li').map((li) => {
    const nested = [...li.children].filter((x) => x.localName === 'ul' || x.localName === 'ol');
    const frags = pdfTrim(pdfRuns([...li.childNodes].filter((x) => !nested.includes(x)), {}, ctx));
    const box = li.querySelector(':scope > input[type=checkbox]');
    const done = !!box?.checked;
    let head = { text: frags || ' ', ...(done ? { color: '#6b7280', decoration: 'lineThrough' } : {}) };
    if (box) head = { columns: [{ width: 12, canvas: pdfBox(done) }, { width: '*', ...head }], columnGap: 2 };
    const imgs = [...li.querySelectorAll(':scope > img, :scope > span img')].map((im) => pdfImage(im, ctx));
    const sub = nested.map((x) => pdfList(x, ctx));
    const item = sub.length || imgs.length ? { stack: [head, ...imgs, ...sub] } : head;
    if (li.classList.contains('task-item')) item.listType = 'none';
    return item;
  });
  return { [n.localName]: items.length ? items : [' '], margin: [0, 0, 0, 6] };
}

function pdfTable(t, ctx) {
  const rows = [...t.querySelectorAll('tr')].map((tr) => [...tr.children].map((c) => ({ text: pdfTrim(pdfRuns(c.childNodes, {}, ctx)), ...(c.localName === 'th' ? { bold: true, fillColor: '#f3f4f6' } : {}) })));
  const cols = Math.max(0, ...rows.map((r) => r.length));
  if (!cols) return null;
  rows.forEach((r) => {
    while (r.length < cols) r.push({ text: '' });
  });
  return {
    table: { headerRows: t.querySelector('thead') ? 1 : 0, widths: Array(cols).fill('*'), body: rows },
    layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => '#d1d5db', vLineColor: () => '#d1d5db', paddingLeft: () => 5, paddingRight: () => 5, paddingTop: () => 3, paddingBottom: () => 3 },
    fontSize: 9.5,
    margin: [0, 2, 0, 8],
  };
}

const pdfCode = (text) => ({
  table: { widths: ['*'], body: [[{ text: pdfText(text.replace(/\t/g, '    ')) || ' ', fontSize: 8.5, lineHeight: 1.15, preserveLeadingSpaces: true, color: '#1f2937' }]] },
  layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => '#f3f4f6', paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 6, paddingBottom: () => 6 },
  margin: [0, 2, 0, 8],
});

// SVG ya medido (fórmula o diagrama) o, si no hay o falla, su texto.
function pdfSvg(n, ctx, fallback) {
  const s = !ctx.noSvg && ctx.svgs.get(n);
  return s ? { svg: s.svg, width: s.w, height: s.h, alignment: 'center', margin: [0, 2, 0, 8] } : fallback();
}

function pdfBlock(n, ctx) {
  const tag = n.localName;
  const c = n.classList;
  const h = tag.match(/^h([1-6])$/);
  if (h) return { text: pdfTrim(pdfRuns(n.childNodes, {}, ctx)), style: `h${h[1]}` };
  if (tag === 'p') return pdfPara([...n.childNodes], ctx);
  if (tag === 'ul' || tag === 'ol') return pdfList(n, ctx);
  if (tag === 'hr') return { canvas: [{ type: 'line', x1: 0, y1: 0, x2: PDF_W, y2: 0, lineWidth: 0.6, lineColor: '#d1d5db' }], margin: [0, 6, 0, 10] };
  if (tag === 'pre') return pdfCode(n.textContent);
  if (tag === 'table') return pdfTable(n, ctx);
  if (c.contains('block-anchor') || c.contains('note-empty')) return null;
  if (c.contains('math-block')) {
    const m = n.querySelector('.math') || n;
    return pdfSvg(m, ctx, () => ({ text: pdfText(m.dataset.tex || m.textContent), italics: true, alignment: 'center', color: '#374151', margin: [0, 2, 0, 8] }));
  }
  if (c.contains('mermaid-box')) return pdfSvg(n, ctx, () => pdfCode(decodeURIComponent(n.dataset.code || '')));
  if (tag === 'dl' && c.contains('props')) {
    const body = [...n.querySelectorAll(':scope > dt')].map((dt) => [{ text: pdfText(dt.textContent), color: '#6b7280' }, { text: pdfTrim(pdfRuns(dt.nextElementSibling?.childNodes || [], {}, ctx)) }]);
    return body.length ? { table: { widths: ['auto', '*'], body }, layout: { hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0 : 0.4), vLineWidth: () => 0, hLineColor: () => '#e5e7eb' }, fontSize: 9, margin: [0, 0, 0, 10] } : null;
  }
  if (c.contains('callout')) {
    const type = Object.keys(PDF_CALLOUT).find((k) => c.contains(`callout-${k}`)) || 'note';
    const color = PDF_CALLOUT[type];
    const title = n.querySelector(':scope > .callout-title');
    const body = n.querySelector(':scope > .callout-body');
    return pdfBar([...(title ? [{ text: pdfTrim(pdfRuns(title.childNodes, {}, ctx)), bold: true, color, margin: [0, 0, 0, 4] }] : []), ...(body ? pdfBlocks(body, ctx) : [])], color, pdfTint(color));
  }
  if (tag === 'blockquote') return pdfBar(pdfBlocks(n, ctx), '#d1d5db', null);
  // <details>: siempre abierto, con el resumen en negrita. Alineación: la de pdfmake.
  if (tag === 'details') {
    const sum = n.querySelector(':scope > summary');
    const rest = [...n.childNodes].filter((x) => x !== sum);
    return { stack: [...(sum ? [{ text: pdfTrim(pdfRuns(sum.childNodes, {}, ctx)) || ' ', bold: true, margin: [0, 0, 0, 4] }] : []), ...pdfBlocks(rest, ctx)] };
  }
  if (c.contains('md-align')) {
    const a = n.dataset.align;
    return { stack: pdfBlocks(n, ctx), alignment: ['left', 'center', 'right', 'justify'].includes(a) ? a : 'left' };
  }
  if (c.contains('embed')) {
    const title = n.querySelector(':scope > .embed-title');
    const rest = [...n.childNodes].filter((x) => x !== title);
    return pdfBar([...(title ? [{ text: pdfTrim(pdfRuns(title.childNodes, {}, ctx)), bold: true, fontSize: 9, color: '#7c3aed', margin: [0, 0, 0, 4] }] : []), ...pdfBlocks(rest, ctx)], '#c4b5fd', null);
  }
  if (c.contains('footnotes')) {
    const ol = n.querySelector('ol');
    return ol ? { stack: [{ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 120, y2: 0, lineWidth: 0.6, lineColor: '#d1d5db' }], margin: [0, 8, 0, 4] }, pdfList(ol, ctx)], fontSize: 8.5 } : null;
  }
  return pdfBlocks(n, ctx);
}

// Recorre los hijos: los bloques van por su lado y lo que queda suelto forma párrafos.
function pdfBlocks(parent, ctx) {
  const out = [];
  let run = [];
  const flush = () => {
    if (run.some((x) => x.nodeType === 1 || x.nodeValue.trim())) out.push(...pdfPara(run, ctx));
    run = [];
  };
  for (const n of parent.childNodes || parent) {
    if (!isPdfBlock(n)) {
      run.push(n);
      continue;
    }
    flush();
    const b = pdfBlock(n, ctx);
    if (Array.isArray(b)) out.push(...b);
    else if (b) out.push(b);
  }
  flush();
  return out;
}

// ---------- Preparar la nota (fórmulas, diagramas e imágenes) ----------
// Diagramas en tema claro y con etiquetas SVG (pdfmake no entiende foreignObject).
async function pdfMermaid(nodes) {
  if (!nodes.length) return;
  try {
    await loadLib('mermaid');
  } catch {
    return;
  }
  const cfg = (html) => ({ startOnLoad: false, securityLevel: 'strict', theme: 'default', htmlLabels: html, flowchart: { htmlLabels: html } });
  window.mermaid.initialize(cfg(false));
  for (const n of nodes) {
    try {
      n.innerHTML = (await window.mermaid.render(`pdf-mmd-${++mermaidSeq}`, decodeURIComponent(n.dataset.code))).svg;
      n.classList.add('rendered');
    } catch {
      // Queda el código del diagrama.
    }
  }
  window.mermaid.initialize(cfg(true));
}

// Los estilos calculados pasan a atributos, por si el lector de SVG de pdfmake no entiende el CSS.
const PDF_SVG_PROPS = ['fill', 'stroke', 'stroke-width', 'opacity', 'fill-opacity', 'stroke-opacity', 'font-size', 'font-weight', 'text-anchor'];
function pdfInlineSvgStyles(svg, copy) {
  const src = [svg, ...svg.querySelectorAll('*')];
  const dst = [copy, ...copy.querySelectorAll('*')];
  src.forEach((x, k) => {
    if (!/^(rect|path|circle|ellipse|polygon|polyline|line|text|tspan|g)$/.test(x.localName)) return;
    const cs = getComputedStyle(x);
    for (const p of PDF_SVG_PROPS) {
      const v = cs.getPropertyValue(p);
      if (v && v !== 'normal') dst[k].setAttribute(p, v);
    }
    // Un trazo «0» rompe pdfkit: solo pasan los discontinuos de verdad.
    const dash = cs.getPropertyValue('stroke-dasharray');
    dst[k].setAttribute('stroke-dasharray', dash !== 'none' && dash.split(/[\s,]+/).every((d) => parseFloat(d) > 0) ? dash : 'none');
    dst[k].removeAttribute('style'); // ya va todo en atributos
  });
}

// Cada SVG se prueba solo: si pdfmake no puede con él, ese va como texto y el resto sigue.
function pdfSvgOk(s) {
  try {
    window.pdfMake.createPdf({ content: [{ svg: s.svg, width: s.w, height: s.h }] })._createDoc({});
    return true;
  } catch {
    return false;
  }
}

function pdfImageData(src) {
  return new Promise((resolve) => {
    const im = new Image();
    if (/^https?:/i.test(src)) im.crossOrigin = 'anonymous';
    im.onload = () => {
      try {
        const w = im.naturalWidth;
        const h = im.naturalHeight;
        if (!w || !h) return resolve(null);
        // pdfmake solo lee PNG y JPEG: lo demás (webp, gif) pasa por un lienzo.
        if (/^data:image\/(png|jpeg);base64,/.test(src)) return resolve({ data: src, w, h });
        const k = Math.min(1, 1600 / Math.max(w, h));
        const cv = el('canvas', { width: Math.round(w * k), height: Math.round(h * k) });
        cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
        resolve({ data: cv.toDataURL('image/png'), w, h });
      } catch {
        resolve(null); // imagen de otro sitio sin permiso (CORS)
      }
    };
    im.onerror = () => resolve(null);
    im.src = src;
  });
}

async function pdfPrepare(box, ctx) {
  await Promise.all([hydrateMath([...box.querySelectorAll('.math')]), pdfMermaid([...box.querySelectorAll('.mermaid-box')])]);
  // SVG con medidas en puntos (pdfmake no entiende «ex» ni «100%»).
  for (const n of box.querySelectorAll('.math-block .math.rendered, .mermaid-box.rendered')) {
    const svg = n.querySelector('svg');
    const r = svg?.getBoundingClientRect();
    if (!r?.width || !r.height) continue;
    const copy = svg.cloneNode(true);
    if (n.classList.contains('mermaid-box')) {
      pdfInlineSvgStyles(svg, copy);
      copy.querySelectorAll('style').forEach((x) => x.remove());
    }
    copy.querySelectorAll('foreignObject').forEach((x) => x.remove());
    const k = Math.min(1, PDF_W / (r.width * PDF_PX), 650 / (r.height * PDF_PX));
    const s = { svg: new XMLSerializer().serializeToString(copy).replace(/currentColor/g, '#111827'), w: r.width * PDF_PX * k, h: r.height * PDF_PX * k };
    if (pdfSvgOk(s)) ctx.svgs.set(n, s);
  }
  for (const img of box.querySelectorAll('img')) {
    let src = img.getAttribute('src') || '';
    if (img.dataset.img) src = files.cache.get(img.dataset.img) || (await getFile(img.dataset.img))?.data || '';
    if (!src || !(isImageData(src) || /^https?:/i.test(src))) continue;
    const r = await pdfImageData(src);
    if (!r) continue;
    const css = parseFloat(img.style.width) || r.w;
    ctx.imgs.set(img, { data: r.data, w: Math.min(PDF_W, css * PDF_PX) });
  }
}

// Contenido de una nota: con SVG y sin él (por si pdfmake no puede con alguno).
async function pdfNoteContent(note, ctx) {
  const box = el('div', { className: 'md pdf-render', ariaHidden: 'true' });
  box.style.cssText = 'position:fixed;left:-10000px;top:0;width:690px;font-size:14px;color:#111827;background:#fff';
  box.innerHTML = renderMd(noteText(note), { noteId: note.id, noTasks: true });
  box.querySelectorAll('.math, .mermaid-box').forEach((n) => (n.dataset.done = '1')); // el lector no los toca
  box.querySelectorAll('img').forEach((n) => (n.dataset.loaded = n.dataset.img || '')); // ni las imágenes
  document.body.append(box);
  try {
    await pdfPrepare(box, ctx);
    return { body: pdfBlocks(box, ctx), plain: pdfBlocks(box, { ...ctx, noSvg: true }) };
  } finally {
    box.remove();
  }
}

// ---------- Documento ----------
function pdfDoc(sections, title, toc) {
  const date = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  const content = toc ? [{ text: pdfText(title), style: 'title' }, { toc: { title: { text: 'Índice', style: 'h2' } } }] : [];
  sections.forEach((s, k) => content.push({ text: pdfText(s.name), style: 'title', id: s.dest, ...(toc ? { tocItem: true } : {}), ...(toc || k ? { pageBreak: 'before' } : {}) }, ...s.body));
  return {
    pageSize: 'A4',
    pageMargins: [40, 50, 40, 50],
    compress: PDF_OPTS.compress,
    info: { title: pdfText(title), creator: 'Enfoque' },
    ...(PDF_OPTS.header ? { header: (page) => (page > 1 ? { text: pdfText(title), fontSize: 8, color: '#9ca3af', margin: [40, 24, 40, 0] } : '') } : {}),
    ...(PDF_OPTS.footer ? { footer: (page, pages) => ({ columns: [{ text: date }, { text: `Página ${page} de ${pages}`, alignment: 'right' }], fontSize: 8, color: '#9ca3af', margin: [40, 18, 40, 0] }) } : {}),
    content,
    defaultStyle: { font: 'Roboto', fontSize: 10.5, lineHeight: 1.25, color: '#111827' },
    styles: {
      title: { fontSize: 22, bold: true, margin: [0, 0, 0, 12] },
      h1: { fontSize: 19, bold: true, margin: [0, 10, 0, 6] },
      h2: { fontSize: 16, bold: true, margin: [0, 10, 0, 5] },
      h3: { fontSize: 13.5, bold: true, margin: [0, 8, 0, 4] },
      h4: { fontSize: 12, bold: true, margin: [0, 6, 0, 3] },
      h5: { fontSize: 11, bold: true, margin: [0, 6, 0, 3] },
      h6: { fontSize: 10.5, bold: true, color: '#4b5563', margin: [0, 6, 0, 3] },
    },
  };
}

// Se crea el PDF por el camino síncrono de pdfmake, para que los errores (un SVG raro) se puedan capturar.
function pdfBlob(doc) {
  pdfLastDoc = { ...doc, content: JSON.parse(JSON.stringify(doc.content)) }; // pdfmake cambia el original
  return new Promise((resolve, reject) => {
    try {
      const pdf = window.pdfMake.createPdf(doc);
      if (typeof pdf._createDoc !== 'function') return pdf.getBlob(resolve);
      const kit = pdf._createDoc({});
      const chunks = [];
      kit.on('data', (c) => chunks.push(c));
      kit.on('end', () => resolve(new Blob(chunks, { type: 'application/pdf' })));
      kit.on('error', reject);
      kit.end();
    } catch (e) {
      reject(e);
    }
  });
}

const pdfFileName = (s) => pdfText(s).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'nota';

async function exportNotesPdf(notes, { title, toc = false } = {}) {
  const open = notes.filter((n) => noteText(n) !== null);
  const locked = notes.length - open.length;
  if (!open.length) return showToastMessage(notes.length === 1 ? 'Desbloquea la nota para exportarla a PDF.' : 'No hay notas que exportar (las protegidas tienen que estar desbloqueadas).');
  title = title || baseName(open[0].path);
  showToastMessage('Preparando el PDF…');
  try {
    await loadPdfMake();
  } catch {
    return showToastMessage('No se pudo cargar el generador de PDF: hace falta conexión a internet.');
  }
  const ctx = { dests: new Map(open.map((n) => [n.id, `nota-${n.id}`])), svgs: new Map(), imgs: new Map() };
  const sections = [];
  for (const n of open) sections.push({ name: baseName(n.path), dest: ctx.dests.get(n.id), ...(await pdfNoteContent(n, ctx)) });
  let blob;
  try {
    blob = await pdfBlob(pdfDoc(sections, title, toc));
  } catch {
    try {
      blob = await pdfBlob(pdfDoc(sections.map((s) => ({ ...s, body: s.plain })), title, toc));
    } catch {
      return showToastMessage('No se pudo crear el PDF.');
    }
  }
  const ok = await offerDownload(`${pdfFileName(title)}.pdf`, blob, 'application/pdf');
  if (ok) showToastMessage(`PDF listo${open.length > 1 ? `: ${plural(open.length, 'nota', 'notas')}` : ''}${locked ? ` (${plural(locked, 'protegida no se incluye', 'protegidas no se incluyen')})` : ''}.`);
}

// Una carpeta (con sus subcarpetas) en un solo PDF, con índice y cada nota en su página.
function exportFolderPdf(folder) {
  const notes = state.notes.filter((n) => folderOf(n.path) === folder || n.path.startsWith(`${folder}/`)).sort((a, b) => a.path.localeCompare(b.path, 'es'));
  if (!notes.length) return showToastMessage('La carpeta no tiene notas.');
  exportNotesPdf(notes, { title: baseName(folder), toc: true });
}

NOTE_MENU_EXTRA.push((note) => (note.enc && !unlockedNotes.has(note.id) ? null : { label: '📄 Exportar a PDF', action: () => exportNotesPdf([note]) }));
COMMANDS_EXTRA.push((note) => [
  ...(note && (!note.enc || unlockedNotes.has(note.id)) ? [{ label: 'Exportar la nota a PDF', action: () => exportNotesPdf([note]) }] : []),
  ...(note && folderOf(note.path) ? [{ label: 'Exportar la carpeta a PDF', action: () => exportFolderPdf(folderOf(note.path)) }] : []),
]);
// Clic derecho en el explorador (43-menu-contextual.js).
CTX_MENU_EXTRA.push((kind, x) => {
  if (kind === 'note') return x.enc && !unlockedNotes.has(x.id) ? [] : [{ label: '📄 Exportar a PDF', action: () => exportNotesPdf([x]) }];
  if (kind === 'folder') return [{ label: '📄 Exportar la carpeta a PDF', action: () => exportFolderPdf(x) }];
  return [];
});
