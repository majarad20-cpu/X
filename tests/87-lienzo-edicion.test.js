const { chromium, launchOptions } = require('./helpers');
const fs = require('fs');
const path = require('path');
const url = process.argv[2], S = process.argv[3];
(async () => {
  const b = await chromium.launch(launchOptions);
  const c = await b.newContext({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
  const cards = [
    { id: 'a', type: 'text', text: '# Uno\nTexto **uno**', x: 0, y: 0, w: 200, h: 100 },
    { id: 'b', type: 'text', text: 'Dos con Séneca', x: 300, y: 40, w: 200, h: 120, color: 'green' },
    { id: 'c', type: 'text', text: 'Tres', x: 700, y: 10, w: 200, h: 100 },
    { id: 'n', type: 'note', noteId: 'n1', x: 0, y: 300, w: 260, h: 160 },
  ];
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, { tasks: [], habits: [], settings: { notesWelcome: true }, notes: [{ id: 'n1', path: 'Estoicismo/Virtud', body: '# Virtud\nLa excelencia del carácter', createdAt: 1, updatedAt: 1 }, { id: 'n2', path: 'Otra nota', body: 'Hola', createdAt: 1, updatedAt: 1 }], canvases: [{ id: 'c1', title: 'Prueba', cards, edges: [{ id: 'e1', from: 'a', fromSide: 'right', to: 'b', toSide: 'left', label: 'lleva a' }], createdAt: 1, updatedAt: 1 }], updatedAt: 1 });
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage(); const errs = [];
  const check = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${label}: ${JSON.stringify(got)}${ok ? ' ok' : ` ESPERADO ${JSON.stringify(want)}`}`); if (!ok) errs.push(label); };
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.goto(url); await p.waitForFunction(() => document.documentElement.dataset.ready);
  await p.evaluate(() => openCanvas('c1')); await p.waitForTimeout(400);
  await p.evaluate(() => { cv.z = 1; cv.x = -300; cv.y = -150; applyView(); }); await p.waitForTimeout(100);
  const box = async (id) => (await p.$(`#cv-world .cv-card[data-id="${id}"]`)).boundingBox();
  const pos = () => p.evaluate(() => Object.fromEntries(currentCanvas().cards.map((k) => [k.id, [k.x, k.y]])));
  // 1) Mayús+clic: varias
  let r = await box('a'); await p.mouse.click(r.x + 20, r.y + 60);
  r = await box('b'); await p.keyboard.down('Shift'); await p.mouse.click(r.x + 20, r.y + 80); await p.keyboard.up('Shift');
  check('mayús+clic', await p.evaluate(() => [...cv.multi].sort()), ['a', 'b']);
  check('barra', await p.evaluate(() => [document.getElementById('cv-multi-count').textContent, !document.getElementById('cv-align').hidden]), ['2 elegidas', true]);
  // Mover juntas
  r = await box('a');
  await p.mouse.move(r.x + 30, r.y + 70); await p.mouse.down(); await p.mouse.move(r.x + 80, r.y + 120, { steps: 5 }); await p.mouse.up();
  const moved = await pos();
  check('se mueven juntas', [moved.a[0] - 0 === moved.b[0] - 300, moved.a[1] - 0 === moved.b[1] - 40, moved.c[0]], [true, true, 700]);
  // 2) Deshacer y rehacer
  await p.focus('#cv-viewport'); await p.keyboard.press('Control+z'); await p.waitForTimeout(100);
  check('deshacer', (await pos()).a, [0, 0]);
  await p.keyboard.press('Control+Shift+z'); await p.waitForTimeout(100);
  check('rehacer', (await pos()).a, moved.a);
  await p.click('#cv-undo'); await p.waitForTimeout(100);
  check('botón deshacer', (await pos()).a, [0, 0]);
  // 3) Recuadro con Mayús+arrastrar en el fondo: a, b y c
  const vp = await (await p.$('#cv-viewport')).boundingBox();
  const ra = await box('a'); const rc = await box('c');
  await p.keyboard.down('Shift');
  await p.mouse.move(ra.x - 20, ra.y - 20); await p.mouse.down(); await p.mouse.move(rc.x + rc.width + 10, rc.y + rc.height + 30, { steps: 6 }); await p.mouse.up();
  await p.keyboard.up('Shift');
  check('recuadro', await p.evaluate(() => [...cv.multi].sort()), ['a', 'b', 'c']);
  // Alinear arriba y repartir
  await p.click('#cv-align'); await p.click('#note-menu .menu-item:has-text("Alinear arriba")'); await p.waitForTimeout(100);
  check('alineadas arriba', await p.evaluate(() => ['a', 'b', 'c'].map((id) => currentCanvas().cards.find((k) => k.id === id).y)), [0, 0, 0]);
  await p.click('#cv-align'); await p.click('#note-menu .menu-item:has-text("Repartir en horizontal")'); await p.waitForTimeout(100);
  check('repartidas', await p.evaluate(() => { const [a, b, c] = ['a', 'b', 'c'].map((id) => currentCanvas().cards.find((k) => k.id === id)); return [b.x - (a.x + a.w), c.x - (b.x + b.w)]; }), [150, 150]);
  // Color a todas
  await p.evaluate(() => setCanvasColor(currentCanvas(), currentCanvas().cards.find((k) => k.id === 'a'), 'purple'));
  check('color a todas', await p.evaluate(() => ['a', 'b', 'c'].map((id) => currentCanvas().cards.find((k) => k.id === id).color)), ['purple', 'purple', 'purple']);
  // Ctrl+A y Esc
  await p.focus('#cv-viewport'); await p.keyboard.press('Control+a');
  check('ctrl+a', await p.evaluate(() => cv.multi.size), 4);
  await p.keyboard.press('Escape');
  check('esc', await p.evaluate(() => [cv.multi.size, cv.selected]), [0, null]);
  // 4) Guía al mover: «c» se pega a la altura de «a»
  await p.evaluate(() => { const k = currentCanvas().cards.find((x) => x.id === 'c'); k.y = 300; cv.x = -500; renderCanvasBoard(); });
  r = await box('c');
  await p.mouse.move(r.x + 50, r.y + 50); await p.mouse.down();
  await p.mouse.move(r.x + 50, r.y + 50 - 296, { steps: 8 });
  check('guía visible', await p.evaluate(() => document.querySelectorAll('#cv-world > .cv-guide').length > 0), true);
  await p.mouse.up();
  check('pegada', await p.evaluate(() => currentCanvas().cards.find((x) => x.id === 'c').y), 0);
  check('guía quitada', await p.evaluate(() => document.querySelectorAll('#cv-world > .cv-guide').length), 0);
  // 5) Buscar (sin tildes)
  await p.focus('#cv-viewport'); await p.keyboard.press('Control+f');
  check('buscador', await p.isVisible('#cv-search-input'), true);
  await p.fill('#cv-search-input', 'seneca'); await p.waitForTimeout(150);
  check('encontrado', await p.evaluate(() => [document.getElementById('cv-search-count').textContent, cv.selected, document.querySelector('.cv-card.found.current')?.dataset.id]), ['1/1', 'b', 'b']);
  await p.fill('#cv-search-input', 'excelencia'); await p.waitForTimeout(150);
  check('busca en notas', await p.evaluate(() => cv.selected), 'n');
  await p.fill('#cv-search-input', 'xyz'); await p.waitForTimeout(100);
  check('sin resultados', await p.textContent('#cv-search-count'), 'Sin resultados');
  await p.press('#cv-search-input', 'Escape');
  check('cerrado', await p.isHidden('#cv-search'), true);
  // 6) Soltar una nota desde el panel
  await p.evaluate(() => {
    const dt = new DataTransfer(); dt.setData('text/x-note', 'n2');
    const vp = document.getElementById('cv-viewport'); const r = vp.getBoundingClientRect();
    const opts = { dataTransfer: dt, clientX: r.left + r.width - 150, clientY: r.top + r.height - 150, bubbles: true, cancelable: true };
    vp.dispatchEvent(new DragEvent('dragover', opts)); vp.dispatchEvent(new DragEvent('drop', opts));
  });
  await p.waitForTimeout(150);
  check('nota soltada', await p.evaluate(() => currentCanvas().cards.filter((k) => k.type === 'note').map((k) => k.noteId)), ['n1', 'n2']);
  // 7) Modo «elegir varias» (táctil)
  await p.click('#cv-select-mode');
  await p.evaluate(() => { cv.z = 1; cv.x = -300; cv.y = -150; applyView(); });
  r = await box('a'); await p.mouse.click(r.x + 20, r.y + 60);
  r = await box('n'); await p.mouse.click(r.x + r.width - 30, r.y + 20);
  check('modo elegir', await p.evaluate(() => [...cv.multi].sort()), ['a', 'n']);
  await p.focus('#cv-viewport'); await p.keyboard.press('Delete'); await p.waitForTimeout(150);
  check('borra varias', await p.evaluate(() => currentCanvas().cards.map((k) => k.id === 'b' || k.id === 'c' ? k.id : k.noteId).sort()), ['b', 'c', 'n2']);
  check('flecha de la borrada fuera', await p.evaluate(() => currentCanvas().edges.length), 0);
  await p.click('#cv-select-mode');
  // 8) Exportar PNG
  await p.click('#cv-more'); await p.waitForTimeout(50);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#note-menu .menu-item:has-text("Exportar como imagen")')]);
  const file = path.join(S, 'lienzo.png'); await dl.saveAs(file);
  const buf = fs.readFileSync(file);
  check('png', [dl.suggestedFilename(), buf.slice(1, 4).toString(), buf.length > 5000], ['Prueba.png', 'PNG', true]);
  console.log('errors:', JSON.stringify(errs)); await b.close();
  process.exit(errs.length ? 1 : 0);
})();
