const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2], S = process.argv[3];
const n = (id, path, body) => ({ id, path, body, createdAt: 1, updatedAt: 1 });
const allErrs = [];
async function fbMain(b) {
  
  const c = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, { tasks: [], habits: [], settings: { notesWelcome: true }, folders: ['Libros'], updatedAt: 1, notes: [
    n('a', 'Diario secreto', 'Hoy me sentí muy bien.\n- [ ] Llamar a mamá 📅 2026-10-08'),
    n('b', 'Libros/Dune', '---\nautor: Frank Herbert\nnota: 9\nestado: leído\n---\nGran libro.'),
    n('c', 'Libros/Rayuela', '---\nautor: Julio Cortázar\nnota: 8\n---\n'),
    n('d', 'Libros/Ficciones', '---\nautor: Borges\nnota: 10\nestado: leyendo\n---\n'),
    n('e', 'Borrador', 'Primera versión del texto.'),
  ] });
  const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(url); await p.waitForFunction(() => document.documentElement.dataset.ready);
  const open = async (name) => { await p.keyboard.press('Control+o'); await p.keyboard.type(name); await p.keyboard.press('Enter'); await p.waitForTimeout(200); };
  // --- Contraseña
  await open('Diario secreto');
  await p.click('#note-more'); await p.click('.menu-item:has-text("Proteger con contraseña")');
  console.log('setup visible:', await p.isVisible('#note-lock .lock-form'));
  await p.fill('#note-lock input >> nth=0', 'clave123'); await p.fill('#note-lock input >> nth=1', 'clave123'); await p.click('#note-lock button[type=submit]');
  await p.waitForTimeout(800);
  const st = await p.evaluate(() => { flushLocal(); const s = JSON.parse(localStorage.getItem('enfoque:v1')); const nn = s.notes.find(x => x.id === 'a'); return { body: nn.body, hasEnc: !!nn.enc, plain: JSON.stringify(s).includes('me sentí'), tasks: noteTasks().map(t => t.title) }; });
  console.log('stored:', JSON.stringify(st));
  console.log('still open (unlocked):', await p.isVisible('#note-reading'), await p.textContent('#note-reading'));
  await p.click('#note-more'); await p.click('.menu-item:has-text("Bloquear ahora")');
  console.log('locked panel:', await p.isVisible('#note-lock .lock-form'), '| reading hidden:', !(await p.isVisible('#note-reading')));
  await p.fill('#note-lock input', 'mala'); await p.click('#note-lock button[type=submit]'); await p.waitForTimeout(800);
  console.log('wrong:', await p.textContent('#note-lock .lock-error'));
  await p.fill('#note-lock input', 'clave123'); await p.click('#note-lock button[type=submit]'); await p.waitForTimeout(800);
  console.log('unlocked text:', await p.textContent('#note-reading'));
  await p.keyboard.press('Control+e'); await p.click('#note-editor'); await p.keyboard.press('Control+End'); await p.keyboard.type('\nSecreto nuevo');
  await p.waitForTimeout(1200);
  const st2 = await p.evaluate(() => { flushLocal(); const s = localStorage.getItem('enfoque:v1'); return { plain: s.includes('Secreto nuevo') }; });
  console.log('edit stays encrypted:', !st2.plain);
  await p.reload(); await p.waitForFunction(() => document.documentElement.dataset.ready); await open('Diario secreto');
  console.log('after reload locked:', await p.isVisible('#note-lock .lock-form'));
  await p.fill('#note-lock input', 'clave123'); await p.click('#note-lock button[type=submit]'); await p.waitForTimeout(800);
  console.log('decrypted after reload:', (await p.textContent('#note-reading')).includes('Secreto nuevo'));
  await p.screenshot({ path: S + '/locked.png' });
  // --- Historial
  await open('Borrador');
  await p.keyboard.press('Control+e'); await p.click('#note-editor'); await p.keyboard.press('Control+a'); await p.keyboard.type('Segunda versión, mucho mejor.\nCon una línea nueva.');
  await p.waitForTimeout(800);
  await p.evaluate(() => snapshotNote(activeNote(), { force: true }));
  await p.click('#note-more'); await p.click('.menu-item:has-text("Historial")'); await p.waitForTimeout(400);
  console.log('versions:', await p.$$eval('.hv-item', n => n.map(x => x.innerText.replace(/\n/g, ' | '))));
  console.log('diff:', await p.$$eval('.hd-line', n => n.map(x => x.className.replace('hd-line', '').trim() + ':' + x.textContent)));
  await p.screenshot({ path: S + '/history.png' });
  await p.click('#history-restore'); await p.waitForTimeout(400);
  console.log('restored:', await p.evaluate(() => activeNote().body));
  // --- Tabla
  await p.evaluate(() => openFolderTable('Libros')); await p.waitForTimeout(300);
  console.log('table head:', await p.$$eval('.note-table th', n => n.map(x => x.textContent)));
  console.log('rows:', await p.$$eval('.note-table tbody tr', n => n.map(x => [...x.children].map(c => c.textContent).slice(0, 4).join(' / '))));
  await p.click('.note-table th button:text-is("nota")'); await p.click('.note-table th button:text-is("nota ↑")');
  console.log('sorted desc by nota:', await p.$$eval('.note-table tbody tr td:first-child', n => n.map(x => x.textContent)));
  await p.click('.note-table tbody tr:has-text("Rayuela") td:nth-child(4)');
  await p.keyboard.type('pendiente'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  console.log('Rayuela body:', JSON.stringify(await p.evaluate(() => state.notes.find(n => n.id === 'c').body)));
  await p.click('.nt-actions button:has-text("Columna")'); await p.keyboard.type('año'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  console.log('cols now:', await p.$$eval('.note-table th', n => n.map(x => x.textContent)));
  await p.click('.nt-actions button:has-text("Fila")'); await p.keyboard.type('El Aleph'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  console.log('new row body:', JSON.stringify(await p.evaluate(() => state.notes.find(n => n.path === 'Libros/El Aleph')?.body)));
  await p.screenshot({ path: S + '/table.png' });
  allErrs.push(...errs); await c.close();
}
async function drawMain(b) {
  
  const c = await b.newContext({ viewport: { width: 1100, height: 800 } });
  await c.addInitScript(() => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify({ tasks: [], habits: [], settings: { notesWelcome: true }, notes: [{ id: 'a', path: 'Bocetos', body: 'Idea de logo:\n', createdAt: 1, updatedAt: 1 }], updatedAt: 1 })); });
  const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url); await p.waitForFunction(() => document.documentElement.dataset.ready);
  await p.keyboard.press('Control+o'); await p.keyboard.type('Bocetos'); await p.keyboard.press('Enter');
  if (!(await p.isVisible('#note-editor'))) await p.keyboard.press('Control+e');
  await p.click('#note-editor'); await p.keyboard.press('Control+End'); await p.keyboard.type('/dib');
  console.log('slash:', await p.$$eval('#link-suggest .sg-label', n => n.map(x => x.textContent)));
  await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  console.log('pad open:', await p.isVisible('#draw'));
  const box = await (await p.$('#draw-canvas')).boundingBox();
  // trazo con ratón: un círculo
  await p.mouse.move(box.x + 300, box.y + 200); await p.mouse.down();
  for (let i = 0; i <= 40; i++) { const a = i / 40 * Math.PI * 2; await p.mouse.move(box.x + 300 + Math.cos(a) * 80, box.y + 200 + Math.sin(a) * 80); }
  await p.mouse.up();
  // trazo con lápiz y presión variable (eventos sintéticos)
  await p.evaluate(({ x, y }) => {
    const cv = document.getElementById('draw-canvas');
    const ev = (type, i, pressure) => cv.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'pen', pressure, clientX: x + 450 + i * 6, clientY: y + 150 + Math.sin(i / 3) * 30, bubbles: true }));
    ev('pointerdown', 0, 0.2); for (let i = 1; i < 30; i++) ev('pointermove', i, i / 30); ev('pointerup', 30, 0);
    // toque de la palma mientras hay lápiz: se ignora
    cv.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 8, pointerType: 'touch', clientX: x + 100, clientY: y + 100, bubbles: true }));
    cv.dispatchEvent(new PointerEvent('pointerup', { pointerId: 8, pointerType: 'touch', bubbles: true }));
  }, box);
  console.log('strokes:', await p.evaluate(() => draw.strokes.map(s => `${s.tool}:${s.points.length}:${Math.min(...s.points.map(q => q[2]))}-${Math.max(...s.points.map(q => q[2]))}`)));
  await p.click('#draw-undo'); console.log('after undo:', await p.evaluate(() => draw.strokes.length)); await p.click('#draw-redo');
  await p.click('[data-tool=eraser]'); await p.mouse.move(box.x + 380, box.y + 200); await p.mouse.down(); await p.mouse.move(box.x + 382, box.y + 202); await p.mouse.up();
  console.log('after erase:', await p.evaluate(() => draw.strokes.length)); await p.click('#draw-undo'); console.log('erase undone:', await p.evaluate(() => draw.strokes.length));
  await p.screenshot({ path: S + '/draw.png' });
  await p.click('#draw-save'); await p.waitForTimeout(800);
  const body = await p.inputValue('#note-editor');
  console.log('note:', JSON.stringify(body.replace(/img:[a-z0-9]+/, 'img:ID')));
  const rec = await p.evaluate(() => allFiles().then(l => l.map(f => [f.name, f.width, f.height, !!f.drawing, f.drawing?.strokes.length])));
  console.log('file:', JSON.stringify(rec));
  await p.keyboard.press('Control+e'); await p.waitForTimeout(300);
  await p.click('#note-reading img.note-img'); await p.waitForTimeout(300);
  console.log('edit button:', await p.isVisible('#image-viewer-edit'));
  await p.click('#image-viewer-edit'); await p.waitForTimeout(300);
  console.log('re-edit strokes:', await p.evaluate(() => draw.strokes.length));
  await p.mouse.move(box.x + 200, box.y + 400); await p.mouse.down(); await p.mouse.move(box.x + 500, box.y + 420, { steps: 10 }); await p.mouse.up();
  await p.click('#draw-save'); await p.waitForTimeout(800);
  console.log('note after edit:', await p.evaluate(() => activeNote().body.match(/img:[a-z0-9]+/g).length), await p.evaluate(() => allFiles().then(l => l.length)));
  await p.screenshot({ path: S + '/draw-note.png' });
  allErrs.push(...errs); await c.close();
}
async function canvasMain(b) {
  
  const c = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await c.addInitScript(() => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify({ tasks: [], habits: [], settings: { notesWelcome: true }, notes: [{ id: 'a', path: 'Proyectos/Web nueva', body: '# Web nueva\n- Diseño\n- Textos\n![[Otra]]', createdAt: 1, updatedAt: 1 }], updatedAt: 1 })); });
  const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(url); await p.waitForFunction(() => document.documentElement.dataset.ready);
  await p.click('.rib[data-view=canvas]');
  await p.fill('#canvas-title', 'Plan del lanzamiento'); await p.press('#canvas-title', 'Enter'); await p.waitForTimeout(300);
  console.log('cards:', await p.$$eval('.cv-card', n => n.length));
  const vp = await (await p.$('#cv-viewport')).boundingBox();
  // doble clic en el fondo: tarjeta nueva y escribir
  await p.mouse.dblclick(vp.x + 200, vp.y + 120); await p.waitForTimeout(150);
  await p.keyboard.type('## Objetivos\n- Vender **100**'); await p.mouse.click(vp.x + vp.width - 30, vp.y + vp.height - 60); await p.waitForTimeout(150);
  // añadir nota
  await p.click('#cv-add-note'); await p.keyboard.type('Web'); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  const st = await p.evaluate(() => state.canvases[0].cards.map(k => `${k.type}:${k.type === 'text' ? k.text.split('\n')[0] : k.noteId}`));
  console.log('state cards:', st);
  // unir: arrastrar desde el punto derecho de la primera tarjeta a la tarjeta de nota
  const first = await p.$('.cv-card >> nth=0'); await first.hover();
  const dot = await (await p.$('.cv-card >> nth=0 >> .cv-dot-right')).boundingBox();
  const note = await (await p.$('.cv-card.is-note')).boundingBox();
  await p.mouse.move(dot.x + 5, dot.y + 5); await p.mouse.down(); await p.mouse.move(dot.x + 60, dot.y + 40, { steps: 5 }); await p.mouse.move(note.x + note.width / 2, note.y + note.height / 2, { steps: 8 }); await p.mouse.up();
  // soltar en el vacío: tarjeta nueva unida
  const t2 = await p.$('.cv-card >> nth=1'); await t2.hover();
  const dot2 = await (await p.$('.cv-card >> nth=1 >> .cv-dot-bottom')).boundingBox();
  await p.mouse.move(dot2.x + 5, dot2.y + 5); await p.mouse.down(); await p.mouse.move(dot2.x + 20, dot2.y + 120, { steps: 6 }); await p.mouse.move(dot2.x + 30, dot2.y + 200, { steps: 4 }); await p.mouse.up();
  await p.waitForTimeout(150); await p.keyboard.type('Siguiente paso'); await p.mouse.click(vp.x + vp.width - 30, vp.y + 40);
  console.log('edges:', await p.evaluate(() => state.canvases[0].edges.length), '| cards:', await p.evaluate(() => state.canvases[0].cards.length), '| svg paths:', await p.$$eval('#cv-edges .cv-edge-line', n => n.length));
  // mover tarjeta
  const before = await p.evaluate(() => [state.canvases[0].cards[0].x, state.canvases[0].cards[0].y]);
  const cb = await (await p.$('.cv-card >> nth=0')).boundingBox();
  await p.mouse.move(cb.x + 30, cb.y + 30); await p.mouse.down(); await p.mouse.move(cb.x + 80, cb.y + 90, { steps: 6 }); await p.mouse.up();
  const after = await p.evaluate(() => [state.canvases[0].cards[0].x, state.canvases[0].cards[0].y]);
  console.log('moved by:', after[0] - before[0], after[1] - before[1]);
  // zoom con ctrl+rueda y ajustar
  await p.mouse.move(vp.x + 300, vp.y + 300); await p.keyboard.down('Control'); await p.mouse.wheel(0, -300); await p.keyboard.up('Control');
  console.log('zoom:', await p.textContent('#cv-zoom'));
  await p.click('#cv-fit'); console.log('fit zoom:', await p.textContent('#cv-zoom'));
  // teclado: seleccionar y borrar flecha/tarjeta
  await p.focus('.cv-card.is-note'); await p.keyboard.press('Delete'); await p.waitForTimeout(100);
  console.log('after delete:', await p.evaluate(() => [state.canvases[0].cards.length, state.canvases[0].edges.length]));
  await p.click('.toast-action'); console.log('undo:', await p.evaluate(() => [state.canvases[0].cards.length, state.canvases[0].edges.length]));
  await p.click('#cv-fit');
  await p.screenshot({ path: S + '/canvas.png' });
  // reload persists
  await p.reload(); await p.waitForFunction(() => document.documentElement.dataset.ready); await p.waitForTimeout(300);
  console.log('after reload:', await p.$$eval('.cv-card', n => n.length), await p.$$eval('.canvas-tile', n => n.map(x => x.textContent)));
  await p.setViewportSize({ width: 390, height: 800 }); await p.waitForTimeout(200); await p.click('#cv-fit').catch(() => {});
  await p.screenshot({ path: S + '/canvas-m.png' });
  allErrs.push(...errs); await c.close();
}
(async () => {
  const b = await chromium.launch(launchOptions);
  console.log('--- contraseña, historial y tablas'); await fbMain(b);
  console.log('--- dibujo'); await drawMain(b);
  console.log('--- lienzo'); await canvasMain(b);
  console.log('errors:', allErrs); await b.close();
})();
