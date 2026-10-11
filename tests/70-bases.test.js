const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const now = new Date('2026-10-11T10:00:00').getTime();
(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const check = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${label}: ${JSON.stringify(got)}${ok ? ' ok' : ` ESPERADO ${JSON.stringify(want)}`}`); if (!ok) errs.push(label); };
  const c = await b.newContext({ viewport: { width: 1300, height: 900 } });
  await c.addInitScript(() => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify({ tasks: [], habits: [], settings: { notesWelcome: true }, notes: [], updatedAt: 1 })); });
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.clock.install({ time: new Date(now) });
  await p.goto(url); await p.clock.runFor(800);
  // Botón en la barra izquierda y pantalla vacía
  await p.click('.ribbon .rib[data-view="bases"]'); await p.clock.runFor(50);
  check('sección sin bases', await p.evaluate(() => [activeTab().view, !!document.querySelector('#view-bases .empty')]), ['bases', true]);
  // Plantilla Biblioteca
  await p.click('#view-bases .bases-head button'); await p.clock.runFor(50);
  await p.click('#picker-list .pk-item:has-text("Biblioteca")'); await p.clock.runFor(100);
  check('base abierta', await p.evaluate(() => [baseName(noteById(bases.open).path), [...document.querySelectorAll('.base-tabs .seg')].map((x) => x.textContent)]), ['Biblioteca', ['▤ Todos', '▥ Por estado', '▦ Portadas', '＋ Vista']]);
  check('tabla con la entrada de ejemplo', await p.$$eval('.base-content table tbody tr', (r) => r.length), 1);
  // Nueva entrada: ficha vacía con los campos; se crea al pulsar «Crear»
  await p.click('.base-top button:has-text("Nueva entrada")'); await p.clock.runFor(50);
  await p.keyboard.type('Rayuela'); await p.click('#entry-modal button.primary:has-text("Crear")'); await p.clock.runFor(100);
  check('entrada creada', await p.evaluate(() => { const n = state.notes.find((x) => x.path === 'Biblioteca/Rayuela'); return [!!n, ['autor', 'estado', 'puntuacion', 'genero'].every((k) => n.body.includes(`${k}:`)), document.getElementById('entry-modal').hidden]; }), [true, true, true]);
  await p.keyboard.press('Escape'); await p.clock.runFor(50);
  check('tabla con 2 filas', await p.$$eval('.base-content table tbody tr', (r) => r.length), 2);
  // Tablero (Kanban) sin abrir ninguna nota
  await p.click('.base-tabs .seg:has-text("Por estado")'); await p.clock.runFor(50);
  check('kanban', await p.$$eval('.base-content .nb-col-title', (n) => n.map((x) => x.textContent).slice(0, 3)), ['Por leer', 'Leyendo', 'Leído']);
  check('sigue en Bases (no abre nota)', await p.evaluate(() => activeTab().view), 'bases');
  // Renombrar la vista y moverla
  await p.click('.base-tabs .seg:has-text("Por estado")', { button: 'right' }); await p.clock.runFor(50);
  await p.click('#note-menu .menu-item:has-text("Renombrar vista")'); await p.keyboard.press('Control+A'); await p.keyboard.type('Kanban'); await p.keyboard.press('Enter'); await p.clock.runFor(80);
  check('vista renombrada', await p.$$eval('.base-tabs .seg', (n) => n.map((x) => x.textContent)), ['▤ Todos', '▥ Kanban', '▦ Portadas', '＋ Vista']);
  await p.click('.base-tabs .seg:has-text("Kanban")', { button: 'right' }); await p.click('#note-menu .menu-item:has-text("Mover a la izquierda")'); await p.clock.runFor(80);
  check('vista movida', await p.$$eval('.base-tabs .seg', (n) => n.map((x) => x.textContent).slice(0, 2)), ['▥ Kanban', '▤ Todos']);
  // Añadir una vista (calendario) con el formulario
  await p.click('.base-tabs .seg:has-text("Vista")'); await p.clock.runFor(50);
  await p.click('#qb-form [data-qbf="kind:calendario"]'); await p.clock.runFor(50);
  await p.click('#qb-ok'); await p.clock.runFor(100);
  check('vista añadida y elegida', await p.evaluate(() => { const t = [...document.querySelectorAll('.base-tabs .seg')]; return [t.length, t.at(-2).classList.contains('active')]; }), [5, true]);
  // Quitar la vista
  await p.click('.base-tabs .seg.active', { button: 'right' }); await p.click('#note-menu .menu-item:has-text("Quitar esta vista")'); await p.clock.runFor(80);
  check('vista quitada', await p.$$eval('.base-tabs .seg', (n) => n.length), 4);
  // Base en blanco desde una carpeta existente
  await p.click('.base-top .back-link'); await p.clock.runFor(50);
  await p.evaluate(() => { if (!state.folders.includes('Clientes')) state.folders.push('Clientes'); createNote({ folder: 'Clientes', title: 'ACME', body: '---\nestado: Activo\n---\n', open: false }); });
  await p.click('#view-bases .bases-head button'); await p.click('#picker-list .pk-item:has-text("Base en blanco")'); await p.clock.runFor(50);
  await p.click('#picker-list .pk-item:has-text("Clientes")'); await p.clock.runFor(100);
  check('base de carpeta', await p.evaluate(() => [baseName(noteById(bases.open).path), document.querySelectorAll('.base-content table tbody tr').length]), ['Clientes', 1]);
  await p.click('.base-top .back-link'); await p.clock.runFor(50);
  check('lista de bases', await p.$$eval('.base-card strong', (n) => n.map((x) => x.textContent).sort()), ['Biblioteca', 'Clientes']);
  console.log('errors:', errs); await b.close();
})();
