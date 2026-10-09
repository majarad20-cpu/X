const { chromium, launchOptions } = require('./helpers');
const path = require('path');
const fs = require('fs');
const url = process.argv[2], S = process.argv[3];
// Copias locales de las bibliotecas (la red está cerrada en las pruebas): LIBS=/carpeta o la de siempre.
const LIBS = process.env.LIBS || '/tmp/claude-0/-home-user-X/05a21626-f42f-525e-85b9-33b6b2494403/scratchpad/libs';
const LOCAL = [
  [/cdnjs\.cloudflare\.com\/ajax\/libs\/pdfmake\/0\.2\.10\/(.+)$/, 'pdfmake-0.2.10/package/build/'],
  [/cdn\.jsdelivr\.net\/npm\/mathjax@3\.2\.2\/(.+)$/, 'mathjax-3.2.2/package/'],
  [/cdn\.jsdelivr\.net\/npm\/mermaid@10\.9\.1\/(.+)$/, 'mermaid-10.9.1/package/'],
];
const body = [
  '---',
  'estado: en curso',
  'tags: [pdf]',
  '---',
  '# Título uno',
  'Texto con **negrita**, *cursiva*, ~~tachado~~, `código` y [un enlace](https://example.com/pdf) 🚀 con acentos: ñandú.',
  '',
  '## Lista',
  '- uno',
  '  - anidado',
  '1. primero',
  '- [ ] pendiente',
  '- [x] hecha',
  '',
  '| Col A | Col B |',
  '| --- | --- |',
  '| a1 | b1 |',
  '',
  '```js',
  'const x = 1;',
  '```',
  '',
  '> [!tip] Consejo útil',
  '> Dentro del aviso',
  '',
  '> Una cita',
  '',
  '$$',
  'E = mc^2',
  '$$',
  '',
  '```mermaid',
  'graph LR',
  '  A --> B',
  '```',
  '',
  '---',
  'Imagen: ![foto](img:img1) y nota[^n].',
  '',
  '![[Otra]]',
  '',
  '[^n]: Texto de la nota al pie.',
].join('\n');
(async () => {
  const b = await chromium.launch(launchOptions);
  const c = await b.newContext({ viewport: { width: 1300, height: 860 } });
  await c.route(/cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|unpkg\.com/, (r) => {
    for (const [re, dir] of LOCAL) {
      const m = r.request().url().match(re);
      const file = m && path.join(LIBS, dir, m[1].split('?')[0]);
      if (file && fs.existsSync(file)) return r.fulfill({ path: file, contentType: 'application/javascript' });
    }
    return r.abort();
  });
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, {
    tasks: [], habits: [], settings: { notesWelcome: true }, updatedAt: 1, folders: ['Proy'],
    notes: [
      { id: 'a', path: 'Proy/Informe', body, createdAt: 1, updatedAt: 1 },
      { id: 'b', path: 'Proy/Otra', body: '# Incrustada\nContenido de la otra nota con [[Informe]].', createdAt: 1, updatedAt: 1 },
      { id: 'c', path: 'Secreta', body: '🔒 Nota protegida con contraseña.', enc: { v: 1, salt: 'x', iv: 'x', ct: 'x' }, createdAt: 1, updatedAt: 1 },
    ],
  });
  const p = await c.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => m.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(m.text()) && errs.push(m.text()));
  await p.goto(url); await p.waitForFunction(() => document.documentElement.dataset.ready);
  // Imagen guardada (webp, que pdfmake no lee: tiene que pasar a PNG) y captura de la descarga.
  await p.evaluate(async () => {
    const cv = Object.assign(document.createElement('canvas'), { width: 40, height: 20 });
    cv.getContext('2d').fillStyle = '#c00'; cv.getContext('2d').fillRect(0, 0, 40, 20);
    await putFile({ id: 'img1', data: cv.toDataURL('image/webp'), type: 'image/webp', name: 'foto' });
    PDF_OPTS.compress = false;
    window.__pdfs = [];
    window.offerDownload = async (name, blob) => {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = ''; for (const x of bytes) s += String.fromCharCode(x);
      window.__pdfs.push({ name, size: bytes.length, raw: s });
      return true;
    };
  });
  await p.evaluate(() => { noteMode.set('a', 'read'); openNoteByLink('Informe'); }); await p.waitForTimeout(300);
  console.log('dbg', await p.evaluate(async () => { await loadPdfMake(); const box = el('div'); box.innerHTML = renderMd(noteText(noteById('a'))); box.querySelectorAll('.mermaid-box').forEach(n => n.dataset.done = '1'); document.body.append(box); const n = box.querySelector('.mermaid-box'); await pdfMermaid([n]); const svg = n.querySelector('svg'); if (!svg) return 'no svg ' + n.outerHTML.slice(0,200); const copy = svg.cloneNode(true); pdfInlineSvgStyles(svg, copy); copy.querySelectorAll('style').forEach((x) => x.remove()); const s = new XMLSerializer().serializeToString(copy); try { window.pdfMake.createPdf({ content: [{ svg: s, width: 100, height: 40 }] })._createDoc({}); return 'ok'; } catch (e) { return String(e.stack).slice(0, 400) + '\n' + s.slice(0, 3000); } }));
  await p.evaluate(() => NOTE_MENU_EXTRA.map((f) => f(activeNote())).find((x) => x?.label === '📄 Exportar a PDF').action());
  await p.waitForFunction(() => window.__pdfs.length === 1, null, { timeout: 60000 });
  const r = await p.evaluate(() => {
    const f = window.__pdfs[0];
    const doc = JSON.stringify(pdfLastDoc);
    const find = (o, k, acc = []) => { if (o && typeof o === 'object') { if (k in o) acc.push(o); Object.values(o).forEach((v) => find(v, k, acc)); } return acc; };
    return {
      name: f.name, head: f.raw.slice(0, 5), size: f.size, eof: f.raw.trimEnd().endsWith('%%EOF'),
      uri: f.raw.includes('/URI (https://example.com/pdf)'),
      texts: ['Informe', 'Título uno', 'negrita', 'cursiva', 'tachado', 'código', 'un enlace', 'ñandú', 'anidado', 'primero', 'pendiente', 'hecha', 'Col A', 'b1', 'const x = 1;', 'Consejo útil', 'Dentro del aviso', 'Una cita', 'Texto de la nota al pie.', 'Contenido de la otra nota', 'estado', 'en curso', 'Página 1 de'].filter((t) => !doc.includes(t) && !(t === 'Página 1 de' && pdfLastDoc.footer(1, 2).columns[1].text === 'Página 1 de 2')),
      emoji: /🚀/u.test(doc),
      bold: find(pdfLastDoc, 'bold').some((x) => x.text === 'negrita'),
      italics: find(pdfLastDoc, 'italics').some((x) => x.text === 'cursiva'),
      strike: find(pdfLastDoc, 'decoration').some((x) => x.text === 'tachado' && x.decoration === 'lineThrough'),
      link: find(pdfLastDoc, 'link').some((x) => x.link === 'https://example.com/pdf'),
      lists: [find(pdfLastDoc, 'ul').length, find(pdfLastDoc, 'ol').length],
      checks: find(pdfLastDoc, 'canvas').filter((x) => x.canvas[0]?.type === 'rect').map((x) => x.canvas.length),
      table: find(pdfLastDoc, 'table').some((x) => JSON.stringify(x.table.body).includes('a1')),
      svgs: find(pdfLastDoc, 'svg').length,
      image: find(pdfLastDoc, 'image').map((x) => x.image.slice(0, 22)),
      size: pdfLastDoc.pageSize,
      tex: doc.includes('E = mc^2'),
      header: pdfLastDoc.header(2).text,
    };
  });
  console.log('nota:', JSON.stringify(r));

  // Carpeta: índice y cada nota en su página; la línea de comandos tiene las dos órdenes.
  console.log('comandos:', await p.evaluate(() => COMMANDS_EXTRA.flatMap((f) => f(activeNote()) || []).map((x) => x.label).filter((l) => /PDF/.test(l))));
  await p.evaluate(() => exportFolderPdf('Proy'));
  await p.waitForFunction(() => window.__pdfs.length === 2, null, { timeout: 60000 });
  console.log('carpeta:', await p.evaluate(() => ({
    name: window.__pdfs[1].name, head: window.__pdfs[1].raw.slice(0, 5),
    toc: !!pdfLastDoc.content.find((x) => x.toc), titles: pdfLastDoc.content.filter((x) => x.tocItem).map((x) => `${x.text}:${x.pageBreak}`),
    internal: JSON.stringify(pdfLastDoc).includes('"linkToDestination":"nota-a"'),
  })));

  // Clic derecho en el explorador.
  const ctxLabels = await p.evaluate(() => [...CTX_MENU_EXTRA.flatMap((f) => f('note', noteById('a')) || []), ...CTX_MENU_EXTRA.flatMap((f) => f('folder', 'Proy') || [])].map((x) => x.label).filter((l) => /PDF/.test(l)));
  console.log('menú contextual:', ctxLabels);

  // Nota protegida sin desbloquear: no se ofrece y no se exporta.
  console.log('protegida:', await p.evaluate(async () => {
    const n = noteById('c');
    const menu = NOTE_MENU_EXTRA.map((f) => f(n)).filter(Boolean).some((x) => /PDF/.test(x.label));
    await exportNotesPdf([n]);
    return [menu, $('#toast').textContent, window.__pdfs.length];
  }));
  await p.screenshot({ path: path.join(S, '37-pdf.png') });

  // Sin conexión: aviso y nada más.
  const c2 = await b.newContext();
  await c2.route(/cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|unpkg\.com/, (r) => r.abort());
  await c2.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, {
    tasks: [], habits: [], settings: { notesWelcome: true }, updatedAt: 1, notes: [{ id: 'z', path: 'Nota', body: 'hola', createdAt: 1, updatedAt: 1 }],
  });
  const p2 = await c2.newPage();
  p2.on('pageerror', e => errs.push(e.message));
  await p2.goto(url); await p2.waitForFunction(() => document.documentElement.dataset.ready);
  console.log('sin red:', await p2.evaluate(async () => { await exportNotesPdf([noteById('z')]); return $('#toast').textContent; }));

  console.log('errors:', JSON.stringify(errs));
  await b.close();
})();
