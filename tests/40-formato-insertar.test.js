const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2], S = process.argv[3];
const fuente = '# Intro\n\nPrimer párrafo de la fuente.\n\n## Detalles\n\nSegundo párrafo ^ya-tiene\n\n- item uno';
(async () => {
  const b = await chromium.launch(launchOptions);
  const c = await b.newContext({ viewport: { width: 1280, height: 860 } });
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, {
    tasks: [], habits: [], settings: { notesWelcome: true }, updatedAt: 1,
    notes: [{ id: 'a', path: 'Escritura', body: '', createdAt: 1, updatedAt: 1 }, { id: 'b', path: 'Fuente', body: fuente, createdAt: 1, updatedAt: 1 }, { id: 'p', path: 'Secreta', body: 'nada', createdAt: 1, updatedAt: 1 }],
  });
  const p = await c.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(url); await p.waitForFunction(() => document.documentElement.dataset.ready);
  await p.evaluate(() => { noteMode.set('a', 'edit'); openNoteByLink('Escritura'); }); await p.waitForTimeout(200);
  const val = () => p.inputValue('#note-editor');
  const caret = () => p.$eval('#note-editor', (t) => t.selectionStart);
  const reset = async (v = '', s = null, e = null) => { await p.evaluate(([v, s, e]) => { const t = document.getElementById('note-editor'); t.focus(); t.value = v; t.setSelectionRange(s ?? v.length, e ?? s ?? v.length); t.dispatchEvent(new Event('input')); }, [v, s, e]); await p.waitForTimeout(50); };
  const slash = async (q) => { await reset(); await p.keyboard.type(`/${q}`); await p.waitForTimeout(80); await p.keyboard.press('Enter'); await p.waitForTimeout(80); };

  // --- Menú «/»: grupos, bloques y cursor
  await reset(); await p.keyboard.type('/'); await p.waitForTimeout(100);
  console.log('groups:', await p.$$eval('#link-suggest .sg-group', (n) => n.map((x) => x.textContent).join(' | ')));
  await p.keyboard.press('ArrowDown'); console.log('arrow skips groups:', await p.$eval('#link-suggest .sg-item.active .sg-label', (x) => x.textContent));
  await p.keyboard.press('Escape');
  await slash('h5'); console.log('h5:', JSON.stringify(await val()), await caret());
  await slash('seccion'); console.log('details:', JSON.stringify(await val()), await caret());
  await p.keyboard.type('Más'); console.log('summary typed:', JSON.stringify(await val()));
  await slash('centrar'); console.log('center:', JSON.stringify(await val()), await caret());
  await slash('superindice'); console.log('sup:', JSON.stringify(await val()), await caret());
  await slash('grande'); console.log('big:', JSON.stringify(await val()), await caret());
  await slash('formula'); console.log('math:', JSON.stringify(await val()), await caret());
  await slash('mermaid'); console.log('mermaid:', JSON.stringify(await val()));
  await reset('Texto '); await p.keyboard.type('/pie'); await p.waitForTimeout(80); await p.keyboard.press('Enter'); await p.waitForTimeout(80);
  console.log('footnote:', JSON.stringify(await val()), await caret());
  // Bloque en mitad de una línea: va a una línea propia
  await reset('Algo '); await p.keyboard.type('/cita'); await p.keyboard.press('Enter'); console.log('own line:', JSON.stringify(await val()));

  // --- Recuadro…: tipo (con su color) y después plegado
  await slash('recuadro');
  console.log('callout picker:', await p.isVisible('#picker'), await p.$$eval('#picker-list .pk-item.pk-colored', (n) => n.length));
  await p.keyboard.type('peligro'); await p.keyboard.press('Enter'); await p.waitForTimeout(80);
  console.log('fold step:', await p.$$eval('#picker-list .pk-label', (n) => n.map((x) => x.textContent).join(',')));
  await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter'); await p.waitForTimeout(80);
  console.log('callout:', JSON.stringify(await val()), await caret(), '| focused:', await p.evaluate(() => document.activeElement.id));
  await slash('colordetexto'); // sin coincidencias: no pasa nada
  await reset(); await p.keyboard.type('/color'); await p.keyboard.press('Enter'); await p.waitForTimeout(80);
  await p.keyboard.type('azul'); await p.keyboard.press('Enter'); await p.waitForTimeout(80);
  console.log('color slash:', JSON.stringify(await val()), await caret());

  // --- Barra de formato: Aa, colores, subrayado, quitar formato
  await reset('Hola mundo', 5, 10); await p.waitForTimeout(250);
  console.log('bar:', await p.isVisible('#fmt-bar'), await p.isVisible('#fmt-bar .fb-more'), await p.isVisible('#fmt-bar .fb-para'));
  await p.click('#fmt-bar .fb-more'); console.log('more open:', await p.isVisible('#fmt-bar .fmt-more'));
  await p.click('#fmt-bar .fm-sw >> nth=0'); console.log('red:', JSON.stringify(await val()), JSON.stringify(await p.evaluate(() => { const t = document.getElementById('note-editor'); return t.value.slice(t.selectionStart, t.selectionEnd); })));
  await p.click('#fmt-bar .fm-sw >> nth=1'); console.log('orange (replace):', JSON.stringify(await val()));
  await p.click('#fmt-bar .fm-sw >> nth=1'); console.log('orange again (remove):', JSON.stringify(await val()));
  await p.click('#fmt-bar .fm-sw.mark >> nth=0'); console.log('mark:', JSON.stringify(await val()));
  await p.click('#fmt-bar .fm-clear'); console.log('clear:', JSON.stringify(await val()));
  await p.keyboard.press('Control+u'); console.log('ctrl+u:', JSON.stringify(await val()));
  await p.keyboard.press('Control+u'); console.log('ctrl+u again:', JSON.stringify(await val()));
  await p.keyboard.press('Control+Shift+H'); console.log('ctrl+shift+h:', JSON.stringify(await val()));
  await p.click('#fmt-bar .fmt-more button[title="Superíndice"]'); console.log('sup bar:', JSON.stringify(await val()));
  await p.click('#fmt-bar .fmt-more button[title="Superíndice"]'); console.log('sup bar again:', JSON.stringify(await val()));
  await reset('**<u>Hola</u>** y ==más==', 5, 9); await p.evaluate(() => clearFormat(document.getElementById('note-editor'))); console.log('clear outer:', JSON.stringify(await val()));

  // --- Estilo del párrafo
  const conv = async (v, at, kind, arg) => { await reset(v, at); await p.evaluate(([k, a]) => restyleParagraph(document.getElementById('note-editor'), k, a), [kind, arg]); return `${JSON.stringify(await val())}@${await caret()}`; };
  console.log('h2:', await conv('Hola mundo', 3, 'h', 2));
  console.log('h2->p:', await conv('## Hola mundo', 5, 'p'));
  console.log('p->quote:', await conv('Hola\nmundo', 2, 'quote'));
  console.log('quote->callout:', await conv('> Hola\n> mundo', 3, 'callout', { type: 'tip', fold: '-' }));
  console.log('callout->p:', await conv('> [!tip]- Hola\n> mundo', 3, 'p'));
  console.log('one line callout:', await conv('Aviso', 2, 'callout', { type: 'info', fold: '' }));
  console.log('callout->h1:', await conv('> [!info] Aviso\n> ', 5, 'h', 1));
  console.log('p->ul:', await conv('uno\ndos', 1, 'ul'));
  console.log('ul->ol:', await conv('- uno\n- dos', 9, 'ol'));
  console.log('ol->task:', await conv('1. uno\n2. dos', 2, 'task'));
  console.log('p->details:', await conv('Hola', 2, 'details'));
  console.log('details->p:', await conv('<details>\n<summary>Hola</summary>\n\n</details>', 22, 'p'));
  console.log('details multi->quote:', await conv('<details>\n<summary>Hola</summary>\n\nuno\n</details>', 30, 'quote'));
  console.log('center:', await conv('A\n\nHola', 5, 'align', 'center'));
  console.log('center->right:', await conv('<p align="center">Hola</p>', 20, 'align', 'right'));
  console.log('right->left:', await conv('<p align="right">Hola</p>', 20, 'align', 'left'));
  console.log('h1 one line of many:', await conv('uno\ndos', 5, 'h', 1));
  console.log('center->h3:', await conv('<p align="center">Hola</p>', 20, 'h', 3));
  // Clic derecho en el editor
  await reset('Hola mundo', 3);
  const box = await p.$eval('#note-editor', (t) => { const r = t.getBoundingClientRect(); return { x: r.left + 20, y: r.top + 10 }; });
  await p.mouse.click(box.x, box.y, { button: 'right' }); await p.waitForTimeout(100);
  console.log('ctx menu:', await p.isVisible('#note-menu'), await p.$$eval('#note-menu .menu-item span:first-child', (n) => n.slice(0, 5).map((x) => x.textContent).join(',')));
  await p.click('#note-menu .menu-item:has-text("Título 2")'); console.log('ctx h2:', JSON.stringify(await val()));

  // --- Archivos: audio pegado o elegido → ![x.mp3](file:ID)
  await reset('Antes');
  const ids = await p.evaluate(() => insertMediaFiles([new File([new Uint8Array([73, 68, 51, 1, 2, 3])], 'x.mp3', { type: 'audio/mpeg' })]));
  const rec = await p.evaluate((id) => getFile(id).then((r) => r && { name: r.name, type: r.type, data: r.data.slice(0, 23) }), ids[0]);
  console.log('file:', JSON.stringify(await val()) === JSON.stringify(`Antes\n![x.mp3](file:${ids[0]})\n`), JSON.stringify(rec), await p.textContent('#toast'));
  await p.evaluate(() => { const dt = new DataTransfer(); dt.items.add(new File(['%PDF-1.4'], 'doc.pdf', { type: 'application/pdf' })); document.getElementById('note-editor').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); });
  await p.waitForTimeout(300); console.log('pasted pdf:', /!\[doc\.pdf\]\(file:[a-z0-9]+\)\n$/.test(await val()));
  await p.evaluate(() => insertMediaFiles([new File([new Uint8Array(16 * 1024 * 1024)], 'grande.mp4', { type: 'video/mp4' })]));
  console.log('too big:', !(await val()).includes('grande'), await p.textContent('#toast'));
  await p.evaluate(() => insertMediaFiles([new File([new Uint8Array(300 * 1024)], 'medio.mp3', { type: 'audio/mpeg' })]));
  console.log('local only:', (await val()).includes('medio.mp3'), await p.textContent('#toast'));
  console.log('backup includes file:', await p.evaluate((id) => backupFiles().then((l) => l.some((f) => f.id === id)), ids[0]));

  // --- Incrustar sección y bloque
  await reset('Ver: ');
  await p.evaluate(() => pickEmbedSection()); await p.keyboard.type('Fuente'); await p.keyboard.press('Enter'); await p.waitForTimeout(80);
  console.log('headings:', await p.$$eval('#picker-list .pk-label', (n) => n.map((x) => x.textContent.trim()).join(',')));
  await p.keyboard.type('Detalles'); await p.keyboard.press('Enter'); await p.waitForTimeout(80);
  console.log('section:', JSON.stringify(await val()));
  await reset('');
  await p.evaluate(() => pickEmbedBlock()); await p.keyboard.type('Fuente'); await p.keyboard.press('Enter'); await p.waitForTimeout(80);
  console.log('blocks:', await p.$$eval('#picker-list .pk-label', (n) => n.map((x) => x.textContent).join(' | ')));
  await p.keyboard.type('Primer'); await p.keyboard.press('Enter'); await p.waitForTimeout(80);
  const src = await p.evaluate(() => state.notes.find((n) => n.id === 'b').body);
  const bid = src.match(/fuente\. \^([a-z0-9]+)$/m)?.[1];
  console.log('block id added:', !!bid, '| embed:', (await val()) === `![[Fuente#^${bid}]]`);
  await reset('');
  await p.evaluate(() => pickEmbedBlock()); await p.keyboard.type('Fuente'); await p.keyboard.press('Enter'); await p.waitForTimeout(80);
  await p.keyboard.type('Segundo'); await p.keyboard.press('Enter'); await p.waitForTimeout(80);
  console.log('existing id:', JSON.stringify(await val()), (await p.evaluate(() => state.notes.find((n) => n.id === 'b').body)).match(/\^/g).length);
  await p.screenshot({ path: S + '/formato.png' });

  // --- Editando un solo bloque (lectura): el selector y el menú no cierran el bloque
  await p.evaluate(() => { const n = state.notes.find((x) => x.id === 'a'); n.body = 'Uno\n\nDos'; noteMode.set('a', 'read'); renderAll(); openNoteByLink('Escritura'); }); await p.waitForTimeout(200);
  await p.dblclick('#note-reading p:has-text("Dos")'); await p.waitForTimeout(150);
  await p.keyboard.press('End'); await p.keyboard.type(' /recuadro'); await p.waitForTimeout(80); await p.keyboard.press('Enter'); await p.waitForTimeout(80);
  await p.click('#picker-list .pk-item:has-text("Consejo")'); await p.waitForTimeout(80); await p.click('#picker-list .pk-item:has-text("Fijo")'); await p.waitForTimeout(150);
  console.log('block callout:', JSON.stringify(await p.evaluate(() => state.notes.find((x) => x.id === 'a').body)), '| still block:', await p.evaluate(() => !!blockEdit));
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  await p.dblclick('#note-reading p:has-text("Uno")'); await p.waitForTimeout(150);
  const bx = await p.$eval('#note-editor', (t) => { const r = t.getBoundingClientRect(); return { x: r.left + 10, y: r.top + 8 }; });
  await p.mouse.click(bx.x, bx.y, { button: 'right' }); await p.waitForTimeout(100);
  await p.click('#note-menu .menu-item:has-text("Título 2")'); await p.waitForTimeout(150);
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  console.log('block h2:', JSON.stringify(await p.evaluate(() => state.notes.find((x) => x.id === 'a').body)), await p.$eval('#note-reading h2', (h) => h.textContent).catch(() => null));

  // --- Nota protegida: no admite archivos
  await p.evaluate(async () => { const n = state.notes.find((x) => x.id === 'p'); await protectNote(n, 'clave123'); noteMode.set('p', 'edit'); openNoteByLink('Secreta'); });
  await p.waitForTimeout(200);
  const before = await val();
  const r = await p.evaluate(() => insertMediaFiles([new File([new Uint8Array([1, 2])], 'y.mp3', { type: 'audio/mpeg' })]));
  console.log('protected:', r.length === 0, (await val()) === before, await p.textContent('#toast'));
  console.log('errors:', errs); await b.close();
})();
