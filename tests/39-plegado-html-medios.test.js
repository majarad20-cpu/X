const { chromium, launchOptions } = require('./helpers');
const path = require('path');
const url = process.argv[2], S = process.argv[3];
const body = [
  '# Principal',
  'Intro visible.',
  '',
  '## Uno',
  'Texto de uno.',
  '',
  '### Sub',
  'Texto de sub.',
  '',
  '## Dos',
  'Texto de dos.',
].join('\n');
(async () => {
  const b = await chromium.launch(launchOptions);
  const c = await b.newContext({ viewport: { width: 1300, height: 860 } });
  await c.route(/fonts\.g|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|unpkg\.com|youtube|vimeo|example\.(com|org)/, (r) => r.abort());
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, {
    tasks: [], habits: [], settings: { notesWelcome: true }, updatedAt: 1,
    notes: [
      { id: 'f', path: 'Plegado', body, createdAt: 1, updatedAt: 1 },
      { id: 'm', path: 'Medios', body: 'Audio: ![voz.m4a](file:aud1)\n\nPDF: ![informe.pdf](file:pdf1)\n\nOtro: ![datos.csv](file:csv1)\n\nFalta: ![nada.zip](file:nohay1)', createdAt: 1, updatedAt: 1 },
      { id: 'l', path: 'Enlaza', body: 'Ver [[Plegado#Sub]].', createdAt: 1, updatedAt: 1 },
    ],
  });
  const p = await c.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => m.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(m.text()) && errs.push(m.text()));
  await p.goto(url); await p.waitForFunction(() => document.documentElement.dataset.ready);

  // ---------- Títulos plegables ----------
  await p.evaluate(() => { localStorage.removeItem('enfoque:folds'); noteMode.set('f', 'read'); openNote(noteById('f')); });
  await p.waitForTimeout(200);
  const vis = () => p.evaluate(() => [...$('#note-reading').children].filter((n) => getComputedStyle(n).display !== 'none').map((n) => n.textContent.trim()).join(' | '));
  console.log('toggles:', await p.evaluate(() => $$('#note-reading > :is(h1,h2,h3) > .fold-toggle').length));
  // Tocar el texto del título no pliega.
  await p.click('#note-reading #h-uno', { position: { x: 80, y: 10 } });
  console.log('clic en texto:', !(await vis()).includes('Texto de uno') ? 'PLEGÓ (mal)' : 'no pliega');
  await p.hover('#h-uno'); await p.click('#h-uno > .fold-toggle');
  console.log('plegado:', await vis());
  console.log('guardado:', await p.evaluate(() => localStorage.getItem('enfoque:folds')));
  await p.evaluate(() => renderNotePane(noteById('f')));
  console.log('tras redibujar:', await vis());
  // La edición por bloques sigue funcionando con secciones plegadas.
  await p.dblclick('#note-reading p:has-text("Texto de dos")');
  console.log('bloque:', await p.evaluate(() => [!!$('#note-reading > textarea.block-editing'), $('#note-editor').value]));
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  console.log('tras bloque:', await vis());
  // Paleta: plegar y desplegar todos.
  const cmd = (label) => p.evaluate((l) => commands().find((x) => x.label === l).action({}), label);
  await cmd('Plegar todos los títulos');
  console.log('todos plegados:', await vis());
  // Un enlace [[Plegado#Sub]] abre la sección que lo esconde.
  await p.evaluate(() => { noteMode.set('l', 'read'); openNote(noteById('l')); });
  await p.waitForTimeout(150);
  await p.click('#note-reading a.wikilink');
  await p.waitForTimeout(300);
  console.log('enlace a título:', await vis());
  await cmd('Desplegar todos los títulos');
  console.log('desplegado:', await vis(), await p.evaluate(() => localStorage.getItem('enfoque:folds')));
  // El panel de esquema sigue llevando al título.
  await cmd('Plegar todos los títulos');
  await p.evaluate(() => scrollToHeading(noteById('f'), 'Dos'));
  await p.waitForTimeout(150);
  console.log('esquema:', await vis());
  // Con localStorage roto no falla.
  console.log('sin almacenamiento:', await p.evaluate(() => {
    const orig = Storage.prototype.getItem; Storage.prototype.getItem = () => { throw new Error('x'); };
    try { renderNotePane(noteById('f')); return $$('#note-reading .fold-toggle').length; } finally { Storage.prototype.getItem = orig; }
  }));

  // ---------- HTML permitido ----------
  const dom = (src, o) => p.evaluate(([s, o]) => {
    const d = document.createElement('div'); d.innerHTML = renderMd(s, o || {});
    const all = [...d.querySelectorAll('*')];
    return {
      html: d.innerHTML,
      tags: [...new Set(all.map((n) => n.localName))].join(','),
      handlers: all.flatMap((n) => [...n.attributes].map((a) => a.name)).filter((a) => /^on/i.test(a)).length,
      styles: all.filter((n) => n.getAttribute('style')).map((n) => `${n.localName}:${n.getAttribute('style')}`),
      text: d.textContent,
      jsHref: d.querySelectorAll('[href^="javascript" i], [src^="javascript" i]').length,
    };
  }, [src, o]);
  let r = await dom('<u>sub</u> <s>t</s> H<sub>2</sub>O x<sup>2</sup> <kbd>Ctrl</kbd> <small>p</small> <mark>m</mark> a<br>b');
  console.log('inline:', r.tags);
  r = await dom('<span style="color: red; font-size: 120%; font-weight: bold; font-style: italic; background: #ff0">a</span> <mark style="background-color: rgb(1, 2, 3)">b</mark> <span style="color:hsl(120, 50%, 40%)">c</span> <span style="font-size:1.5em">d</span>');
  console.log('styles:', JSON.stringify(r.styles));
  const evil = [
    '<script>alert(1)</script>',
    '<img src=x onerror="alert(1)">',
    '<span onclick="alert(1)" style="color:red" onmouseover=alert(1)>h</span>',
    '<a href="javascript:alert(1)">x</a>',
    '<span style="color: javascript:alert(1)">j</span>',
    '<span style="background: url(https://evil.example/x.png)">u</span>',
    '<span style="background-image: url(javascript:alert(1))">u2</span>',
    '<span style="color: expression(alert(1))">e</span>',
    '<span style="position: fixed; top: 0; color: blue; width: 9999px">p</span>',
    '<span style="color: red; x: y" class="evil" id="evil">c</span>',
    '<mark style="color:#12345">m</mark>',
    '<span style="font-size: 9999%">f</span>',
    '<span style=\'color:red\'">q</span>',
    '<iframe src="https://evil.example"></iframe>',
    '<svg onload=alert(1)>',
    '<details ontoggle=alert(1) open>',
    '</span></p><p>cierre suelto</u></span>',
  ].join('\n\n');
  r = await dom(evil);
  console.log('ataques:', JSON.stringify({ tags: r.tags, handlers: r.handlers, styles: r.styles, js: /javascript:|url\(|expression\(/i.test(r.styles.join()), jsHref: r.jsHref, ids: /id="evil"|class="evil"/.test(r.html), script: /<script/i.test(r.html) }));
  console.log('escapado:', r.text.includes('<script>alert(1)</script>'), r.text.includes('<iframe'));
  console.log('sin cerrar:', (await dom('Hola <u>abierto y **negrita**')).html);
  console.log('en código:', (await dom('`<u>x</u>` y \\<u>y\\</u>')).html);

  // ---------- details y alineación ----------
  r = await dom('<details>\n<summary>Ver **más**</summary>\n\n- uno\n- [x] dos\n\n> [!tip] Dentro\n> texto\n</details>\n\nDespués');
  console.log('details:', r.tags, JSON.stringify(r.text.replace(/\s+/g, ' ')));
  r = await dom('<details open><summary>Abierto</summary>\nTexto *fuera*\n<details>\n<summary>Hija</summary>\nAnidado\n</details>\n</details>');
  console.log('details open/anidado:', await p.evaluate((h) => { const d = document.createElement('div'); d.innerHTML = h; return [d.querySelector('details').open, d.querySelectorAll('details details').length, d.querySelector('details details summary').textContent, d.querySelectorAll('em').length]; }, r.html));
  console.log('details sin cierre:', (await dom('<details>\nTexto')).html);
  r = await dom('<p align="center">Centrado **ya**</p>\n\n<div align="right">\n# Derecha\n- a\n</div>\n\n<center>Viejo</center>\n\n<p align="justify">\nJustificado\n</p>\n\n<div align="javascript:x">no</div>\n\n<p align=left>izq</p>');
  console.log('align:', await p.evaluate((h) => { const d = document.createElement('div'); d.innerHTML = h; return [...d.querySelectorAll('.md-align')].map((x) => `${x.dataset.align}:${x.textContent.trim().replace(/\s+/g, ' ')}`); }, r.html), r.text.includes('<div align="javascript:x">no</div>'));
  // Los bloques llevan data-src para la edición por bloques.
  console.log('data-src:', await p.evaluate(() => { const d = document.createElement('div'); d.innerHTML = renderMd('a\n\n<details>\n<summary>S</summary>\nx\n</details>\n\n<center>c</center>', { blocks: true }); return [...d.children].map((n) => `${n.localName}:${n.dataset.src}`).join(' '); }));

  // ---------- Medios ----------
  const media = (s, o) => p.evaluate(([s, o]) => {
    const d = document.createElement('div'); d.innerHTML = renderMd(s, o || {});
    return [...d.querySelectorAll('iframe, video, audio, img, .link-card, a')].map((n) => n.localName === 'iframe' ? `iframe ${n.src} allow=${n.getAttribute('allow')} ref=${n.getAttribute('referrerpolicy')}` : n.localName === 'a' ? `a ${n.href} ${n.target} ${n.rel} «${n.textContent.trim()}»` : `${n.localName}${n.className ? '.' + n.className.replace(/ /g, '.') : ''} ${n.getAttribute('src') || ''}${n.getAttribute('controls') !== null ? ' controls' : ''}${n.getAttribute('preload') ? ' ' + n.getAttribute('preload') : ''}${n.getAttribute('style') ? ' ' + n.getAttribute('style') : ''}`);
  }, [s, o]);
  console.log('youtube:', JSON.stringify(await media('![Charla](https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10)')));
  console.log('youtu.be:', JSON.stringify(await media('![](https://youtu.be/dQw4w9WgXcQ?si=abc)')));
  console.log('shorts:', JSON.stringify(await media('![|400](https://youtube.com/shorts/abcdefghijk)')));
  console.log('vimeo:', JSON.stringify(await media('![v](https://vimeo.com/76979871)')));
  console.log('yt malo:', JSON.stringify(await media('![x](https://www.youtube.com/watch?v=short"onload=1)')));
  console.log('mp4:', JSON.stringify(await media('![clip|320](https://example.com/v/clip.mp4?x=1)')));
  console.log('mp3:', JSON.stringify(await media('![canción](https://example.com/a.mp3)')));
  console.log('pdf url:', JSON.stringify(await media('![](https://example.com/docs/informe%20anual.pdf)')));
  console.log('web:', JSON.stringify(await media('![Wikipedia](https://es.wikipedia.org/wiki/Obsidian)')));
  console.log('imagen:', JSON.stringify(await media('![foto|300](https://example.com/f.png)')));
  console.log('otro iframe:', JSON.stringify(await media('![x](https://evil.example/embed/dQw4w9WgXcQ)')));
  console.log('IA:', JSON.stringify(await media('![a](https://youtu.be/dQw4w9WgXcQ) ![b](https://example.com/a.mp4) ![c](https://example.com/x.pdf) ![d](https://example.com/f.png)', { noExternalImages: true })));
  console.log('no http:', JSON.stringify(await media('![x](javascript:alert(1)) ![y](data:video/mp4;base64,AAAA) ![z](file:../../x)')));

  // ---------- Archivos de la app ----------
  await p.evaluate(async () => {
    const put = (rec) => new Promise((res) => { if (!idb.ok) { files.memory.set(rec.id, rec); return res(); } const tx = idb.db.transaction('files', 'readwrite'); tx.objectStore('files').put(rec); tx.oncomplete = res; });
    await put({ id: 'aud1', name: 'voz.m4a', type: 'audio/mp4', data: 'data:audio/mp4;base64,AAAAGGZ0eXBNNEEg' });
    await put({ id: 'pdf1', name: 'informe.pdf', type: 'application/pdf', data: `data:application/pdf;base64,${btoa('%PDF-1.4\n%%EOF')}` });
    await put({ id: 'csv1', name: 'datos.csv', data: `data:text/csv;base64,${btoa('a,b\n1,2')}` });
    window.__dl = [];
    window.offerDownload = async (name, blob, type) => { window.__dl.push(`${name}|${blob.type}|${blob.size}|${type}`); return true; };
    noteMode.set('m', 'read'); openNote(noteById('m'));
  });
  await p.waitForTimeout(400);
  console.log('archivos:', JSON.stringify(await p.evaluate(() => [...$$('#note-reading .note-file')].map((n) => `${n.className} ${n.dataset.mime || ''} ${n.querySelector('audio, video')?.src.slice(0, 5) || ''} ${[...n.querySelectorAll('a, button')].map((x) => x.textContent).join('/')}`))));
  await p.click('#note-reading .nf-pdf .nf-dl');
  await p.click('#note-reading .nf-chip-btn');
  console.log('descargas:', JSON.stringify(await p.evaluate(() => window.__dl)), await p.evaluate(() => $('#note-reading .nf-pdf .nf-open').target));
  console.log('id malo:', JSON.stringify(await media('![x](file:a"b) ![y](file:)')));
  await p.screenshot({ path: path.join(S, '39-medios.png') });

  // ---------- Avisos ----------
  const types = ['note', 'abstract', 'summary', 'tldr', 'info', 'todo', 'tip', 'hint', 'important', 'success', 'check', 'done', 'question', 'help', 'faq', 'warning', 'caution', 'attention', 'failure', 'fail', 'missing', 'danger', 'error', 'bug', 'example', 'quote', 'cite', 'raro'];
  await p.evaluate((ts) => { noteById('f').body = ts.map((t) => `> [!${t}]\n> x`).join('\n\n') + '\n\n> [!warning] Fuera\n> > [!tip] Dentro\n> > texto\n> > > [!bug]- Más dentro\n> > > y'; noteMode.set('f', 'read'); openNote(noteById('f')); }, types);
  await p.waitForTimeout(150);
  const co = await p.evaluate(() => [...$$('#note-reading > .callout')].map((n) => [n.className.split(' ')[1].slice(8), getComputedStyle(n).getPropertyValue('--co').trim(), n.querySelector('.callout-title span').textContent]));
  const groups = {};
  co.forEach(([t, color, icon]) => { (groups[`${color} ${icon}`] ||= []).push(t); });
  console.log('avisos:', Object.values(groups).map((g) => g.join('/')).join('  '));
  console.log('anidados:', await p.evaluate(() => { const n = [...$$('#note-reading > .callout')].at(-1); return [n.querySelectorAll('.callout').length, !!n.querySelector('.callout-tip .callout-bug details, .callout-tip details.callout-bug'), n.textContent.includes('Más dentro')]; }));

  // ---------- PDF ----------
  const pdf = await p.evaluate(async () => {
    const n = { id: 'pdfx', path: 'X', body: [
      '# Título', 'Texto bajo el título.',
      '<details>', '<summary>Resumen</summary>', 'Oculto **dentro**', '</details>',
      '<p align="center">Centro</p>',
      'H<sub>2</sub>O <u>sub</u> x<sup>2</sup> <span style="color:red">rojo</span> <mark>m</mark>',
      '![v](https://youtu.be/dQw4w9WgXcQ)', '![a](https://example.com/a.mp3)', '![w](https://example.com/p)',
      '![informe.pdf](file:pdf1)',
    ].join('\n\n'), createdAt: 1, updatedAt: 1 };
    localStorage.setItem('enfoque:folds', JSON.stringify({ pdfx: ['h-titulo'] }));
    const ctx = { dests: new Map(), svgs: new Map(), imgs: new Map() };
    const out = await pdfNoteContent(n, ctx);
    const doc = JSON.stringify(out.body);
    const find = (o, f, acc = []) => { if (o && typeof o === 'object') { if (f(o)) acc.push(o); Object.values(o).forEach((v) => find(v, f, acc)); } return acc; };
    return {
      texts: ['Texto bajo el título', 'Resumen', 'Oculto', 'Centro', 'Vídeo: https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'Audio: https://example.com/a.mp3', 'Enlace: https://example.com/p', 'informe.pdf'].filter((t) => !doc.includes(t)),
      boldSummary: find(out.body, (o) => o.bold && JSON.stringify(o).includes('Resumen')).length > 0,
      center: find(out.body, (o) => o.alignment === 'center' && JSON.stringify(o).includes('Centro')).length > 0,
      sub: find(out.body, (o) => o.sub && o.text === '2').length, sup: find(out.body, (o) => o.sup && o.text === '2').length,
      u: find(out.body, (o) => o.decoration === 'underline' && o.text === 'sub').length,
      red: find(out.body, (o) => o.text === 'rojo' && o.color).map((o) => o.color).join(),
      mark: find(out.body, (o) => o.text === 'm' && o.background).length,
      emoji: /[\u{1F300}-\u{1FAFF}☀-➿]/u.test(doc),
    };
  });
  console.log('pdf:', JSON.stringify(pdf));
  console.log('errors:', errs); await b.close();
})();
