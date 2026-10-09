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
  const c = await b.newContext({ viewport: { width: 1200, height: 800 } });
  await c.addInitScript(() => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify({ tasks: [], habits: [], settings: { notesWelcome: true }, notes: [{ id: 'a', path: 'Bocetos', body: 'Idea de logo:\n', createdAt: 1, updatedAt: 1 }], updatedAt: 1 })); });
  await c.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
  const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url); await p.waitForFunction(() => document.documentElement.dataset.ready);
  await p.keyboard.press('Control+o'); await p.keyboard.type('Bocetos'); await p.keyboard.press('Enter');
  if (!(await p.isVisible('#note-editor'))) await p.keyboard.press('Control+e');
  await p.click('#note-editor'); await p.keyboard.press('Control+End'); await p.keyboard.type('/dib');
  console.log('slash:', await p.$$eval('#link-suggest .sg-label', n => n.map(x => x.textContent)));
  await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  console.log('pad open:', await p.isVisible('#draw'), '| tool:', await p.evaluate(() => xd.tool));
  const drag = async (x1, y1, x2, y2) => { await p.mouse.move(x1, y1); await p.mouse.down(); await p.mouse.move(x2, y2, { steps: 8 }); await p.mouse.up(); };
  // trazo con ratón: un círculo
  await p.mouse.move(400, 300); await p.mouse.down();
  for (let i = 0; i <= 40; i++) { const a = i / 40 * Math.PI * 2; await p.mouse.move(400 + Math.cos(a) * 80, 300 + Math.sin(a) * 80); }
  await p.mouse.up();
  // trazo con lápiz y presión variable; la palma (toque) no dibuja
  await p.evaluate(() => {
    const cv = document.getElementById('draw-canvas');
    const ev = (type, i, pressure) => cv.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'pen', pressure, clientX: 600 + i * 6, clientY: 250 + Math.sin(i / 3) * 30, bubbles: true }));
    ev('pointerdown', 0, 0.2); for (let i = 1; i < 30; i++) ev('pointermove', i, i / 30); ev('pointerup', 30, 0);
    cv.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 8, pointerType: 'touch', clientX: 200, clientY: 200, bubbles: true }));
    cv.dispatchEvent(new PointerEvent('pointerup', { pointerId: 8, pointerType: 'touch', bubbles: true }));
  });
  console.log('strokes:', await p.evaluate(() => xd.elements.map(e => `${e.type}:${e.points.length}:${e.simulatePressure ? 'sim' : Math.min(...e.pressures) + '-' + Math.max(...e.pressures)}`)));
  // figuras, flecha enganchada y texto dentro
  await p.keyboard.press('r'); await drag(300, 500, 460, 600);
  await p.keyboard.press('o'); await drag(750, 480, 900, 600);
  await p.keyboard.press('a'); await drag(380, 550, 820, 540);
  console.log('arrow bound:', await p.evaluate(() => { const a = xd.elements.find(e => e.type === 'arrow'); return [!!a.startBinding, !!a.endBinding]; }));
  await p.mouse.dblclick(380, 570); await p.keyboard.type('Logo'); await p.keyboard.press('Escape');
  console.log('label:', await p.evaluate(() => { const t = xd.elements.find(e => e.type === 'text'); return [t.text, !!t.containerId]; }));
  const ax = () => p.evaluate(() => { const a = xd.elements.find(e => e.type === 'arrow'); return Math.round(a.y); });
  const before = await ax(); await drag(310, 505, 310, 405); console.log('arrow follows shape:', before - (await ax()) > 50);
  await p.click('#draw-undo'); console.log('undo move:', (await ax()) === before); await p.click('#draw-redo');
  // goma: borra el círculo; deshacer lo devuelve
  const n = await p.evaluate(() => xd.elements.length);
  await p.keyboard.press('e'); await drag(475, 295, 485, 305);
  console.log('after erase:', n - (await p.evaluate(() => xd.elements.length))); await p.keyboard.press('Control+z'); console.log('erase undone:', (await p.evaluate(() => xd.elements.length)) === n);
  // estilo: elegir la elipse y ponerle fondo
  await p.keyboard.press('v'); await p.mouse.click(752, 540);
  await p.click('#xd-props .xd-sw[title="#a5d8ff"]');
  console.log('ellipse bg:', await p.evaluate(() => xd.elements.find(e => e.type === 'ellipse').backgroundColor));
  await p.screenshot({ path: S + '/draw.png' });
  await p.click('#draw-save'); await p.waitForTimeout(1000);
  const body = await p.inputValue('#note-editor');
  console.log('note:', JSON.stringify(body.replace(/img:[a-z0-9]+/, 'img:ID')));
  const rec = await p.evaluate(() => allFiles().then(l => l.map(f => [f.name, f.width > 100, !!f.drawing, f.drawing?.elements.length])));
  console.log('file:', JSON.stringify(rec));
  // En lectura, tocar el dibujo lo abre para editarlo
  await p.keyboard.press('Control+e'); await p.waitForTimeout(1700);
  await p.click('#note-reading img.note-img'); await p.waitForTimeout(400);
  console.log('re-edit open:', await p.isVisible('#draw'), await p.evaluate(() => xd.elements.length));
  await p.keyboard.press('p'); await drag(300, 700, 600, 720);
  await p.click('#draw-save'); await p.waitForTimeout(1000);
  console.log('note after edit:', await p.evaluate(() => activeNote().body.match(/img:[a-z0-9]+/g).length), await p.evaluate(() => allFiles().then(l => l.length)));
  // Un dibujo antiguo (solo trazos) se abre convertido
  await p.evaluate(() => openDrawing({ id: 'viejo', strokes: [{ tool: 'pen', color: '#2563eb', size: 3, points: [[10, 10, 0.5], [50, 40, 0.6], [90, 20, 0.4]] }], w: 800, h: 600 }));
  await p.waitForTimeout(300);
  console.log('old drawing:', await p.evaluate(() => xd.elements.map(e => `${e.type}:${e.strokeColor}:${e.points.length}`)));
  await p.click('#draw-cancel');
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
