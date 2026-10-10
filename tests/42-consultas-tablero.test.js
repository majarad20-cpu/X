const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const now = new Date('2026-10-09T10:00:00').getTime();
const day = 864e5;
(async () => {
  const b = await chromium.launch(launchOptions);
  const c = await b.newContext({ viewport: { width: 1300, height: 860 } });
  const L = (n, props, extra = '') => `---\n${props}\n---\n${extra}`;
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, {
    tasks: [], habits: [], settings: { notesWelcome: true }, folders: ['Libros', 'Proyectos'],
    notes: [
      { id: 'l1', path: 'Libros/Dune', body: L(0, 'autor: Herbert\nestado: pendiente\npuntuación: 9\nleido: 2026-09-01\ntags: [ficcion, clasico]'), createdAt: now - 30 * day, updatedAt: now - 1 * day },
      { id: 'l2', path: 'Libros/Rayuela', body: L(0, 'autor: Cortázar\nestado: Leído\npuntuación: 7\nleido: 2026-10-05\ntags:\n  - novela'), createdAt: now - 20 * day, updatedAt: now - 2 * day },
      { id: 'l3', path: 'Libros/Ficciones', body: L(0, 'estado: leído\npuntuación: 10\ntags: [cuentos, clasico]'), createdAt: now - 10 * day, updatedAt: now - 3 * day },
      { id: 'l4', path: 'Libros/Sin datos', body: 'Nada', createdAt: now - 5 * day, updatedAt: now - 4 * day },
      { id: 'p1', path: 'Proyectos/Web', body: L(0, 'estado: en curso\nautor: Ana', '#web'), createdAt: now, updatedAt: now },
      { id: 'p2', path: 'Proyectos/App', body: L(0, 'estado: pendiente'), createdAt: now, updatedAt: now },
      { id: 'p3', path: 'Proyectos/Blog', body: L(0, 'estado: pausado'), createdAt: now, updatedAt: now },
      { id: 'p4', path: 'Proyectos/Idea suelta', body: 'Sin propiedades #idea', createdAt: now, updatedAt: now },
      { id: 'q', path: 'Consultas', body: '', createdAt: now, updatedAt: now },
    ],
    updatedAt: 1,
  });
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.clock.install({ time: new Date(now) });
  await p.goto(url); await p.clock.runFor(800);
  const check = (label, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    console.log(`${label}:`, JSON.stringify(got), ok ? 'ok' : `ESPERADO ${JSON.stringify(want)}`);
    if (!ok) errs.push(`${label}: ${JSON.stringify(got)}`);
  };
  // Pinta un bloque en la nota «Consultas» (lectura) y devuelve el contenedor.
  const show = async (block) => {
    await p.evaluate((b) => { const n = noteById('q'); n.body = b; noteMode.set('q', 'read'); openNote(n); renderAll(); }, block);
    await p.clock.runFor(100);
  };
  const names = () => p.$$eval('#note-reading .query-notes li a.wikilink', (a) => a.map((x) => x.textContent));
  const notas = async (lines) => { await show('```notas\ncarpeta: Libros\n' + lines + '\n```'); return names(); };

  // ```notas: cada operador
  check('igual (sin mayúsculas)', (await notas('estado: leído\norden: nombre')), ['Ficciones', 'Rayuela']);
  check('lista contiene', (await notas('tags: clasico\norden: nombre')), ['Dune', 'Ficciones']);
  check('distinto', (await notas('estado: !leído\norden: nombre')), ['Dune', 'Sin datos']);
  check('mayor', (await notas('puntuación: >7\norden: nombre')), ['Dune', 'Ficciones']);
  check('mayor o igual', (await notas('puntuación: >=7\norden: nombre')), ['Dune', 'Ficciones', 'Rayuela']);
  check('menor', (await notas('puntuación: <9\norden: nombre')), ['Rayuela']);
  check('menor o igual', (await notas('puntuación: <=9\norden: nombre')), ['Dune', 'Rayuela']);
  check('fecha', (await notas('leido: >2026-09-15')), ['Rayuela']);
  check('tiene', (await notas('autor: *\norden: nombre')), ['Dune', 'Rayuela']);
  check('no tiene', (await notas('autor: -\norden: nombre')), ['Ficciones', 'Sin datos']);
  check('sin orden: modificada', (await notas('')), ['Dune', 'Rayuela', 'Ficciones', 'Sin datos']);
  check('orden por propiedad desc', (await notas('orden: puntuación desc')), ['Ficciones', 'Dune', 'Rayuela', 'Sin datos']);
  check('orden por propiedad asc', (await notas('orden: puntuación')), ['Rayuela', 'Dune', 'Ficciones', 'Sin datos']);
  check('orden creada', (await notas('orden: creada desc')), ['Sin datos', 'Ficciones', 'Rayuela', 'Dune']);
  check('compatibilidad', (await show('```notas\ncarpeta: Proyectos\n#web\nlímite: 5\n```'), await names()), ['Web']);
  await notas('autor: *\nmostrar: autor, estado\norden: nombre');
  check('mostrar', await p.$$eval('#note-reading .query-notes li .query-props', (s) => s.map((x) => x.textContent)), ['autor: Herbertestado: pendiente', 'autor: Cortázarestado: Leído']);
  // ```tareas sigue igual
  await show('```tareas\ntodas\n```');
  check('tareas', await p.$$eval('#note-reading .query[data-kind="tareas"] .query-head', (h) => h.length), 1);

  // ```tabla: filtros y columnas propias
  const rows = () => p.$$eval('#note-reading .note-table tbody tr', (r) => r.map((x) => [...x.children].map((td) => td.textContent).join('|')));
  const heads = () => p.$$eval('#note-reading .note-table th', (t) => t.map((x) => x.textContent.replace(/ [↑↓]$/, '')));
  await show('```tabla\ncarpeta: Libros\nestado: leído\ncolumnas: estado\n```');
  check('tabla igual', await rows(), ['Ficciones|leído|2026-10-06', 'Rayuela|Leído|2026-10-07']);
  await show('```tabla\ncarpeta: Libros\nestado: !leído\ncolumnas: estado\n```');
  check('tabla distinto', (await rows()).map((r) => r.split('|')[0]), ['Dune', 'Sin datos']);
  await show('```tabla\ncarpeta: Libros\npuntuación: >=9\ncolumnas: puntuación\n```');
  check('tabla mayor o igual', (await rows()).map((r) => r.split('|')[0]), ['Dune', 'Ficciones']);
  await show('```tabla\ncarpeta: Libros\npuntuación: <9\ncolumnas: puntuación\n```');
  check('tabla menor', (await rows()).map((r) => r.split('|')[0]), ['Rayuela']);
  await show('```tabla\ncarpeta: Libros\nautor: *\ncolumnas: autor\n```');
  check('tabla tiene', (await rows()).map((r) => r.split('|')[0]), ['Dune', 'Rayuela']);
  await show('```tabla\ncarpeta: Libros\nautor: -\ncolumnas: autor\n```');
  check('tabla no tiene', (await rows()).map((r) => r.split('|')[0]), ['Ficciones', 'Sin datos']);
  await show('```tabla\ncarpeta: Libros\ncolumnas: autor, Carpeta, Creada\norden: Creada desc\n```');
  check('columnas propias', await heads(), ['Nota', 'autor', 'Carpeta', 'Creada']);
  check('orden por creada', await rows(), ['Sin datos||Libros|2026-10-04', 'Ficciones||Libros|2026-09-29', 'Rayuela|Cortázar|Libros|2026-09-19', 'Dune|Herbert|Libros|2026-09-09']);
  await p.click('#note-reading .note-table th button:text-is("Carpeta")');
  check('cabecera ordena', (await heads())[2], 'Carpeta');
  await p.click('#note-reading .note-table tbody tr:first-child td:nth-child(3)');
  check('propias de solo lectura', await p.$$eval('#note-reading .note-table input:not(.nt-check)', (i) => i.length), 0);
  // Ocultar Modificada y mostrar Creada desde «+ Columna»
  await show('```tabla\ncarpeta: Libros\ncolumnas: autor\n```');
  check('por defecto Modificada al final', await heads(), ['Nota', 'autor', 'Modificada']);
  await p.click('#note-reading .nt-actions button:has-text("Columna")'); await p.keyboard.type('Creada'); await p.keyboard.press('Enter'); await p.clock.runFor(100);
  check('mostrar Creada', await heads(), ['Nota', 'autor', 'Modificada', 'Creada']);
  await p.click('#note-reading .nt-actions button:has-text("Columna")'); await p.keyboard.type('Modificada'); await p.keyboard.press('Enter'); await p.clock.runFor(100);
  check('ocultar Modificada', await heads(), ['Nota', 'autor', 'Creada']);
  check('bloque', (await p.evaluate(() => noteById('q').body)).includes('columnas: autor, Creada'), true);

  // ```tablero
  const board = '```tablero\ncarpeta: Proyectos\nagrupar: estado\ncolumnas: pendiente, en curso, hecho\nmostrar: autor\n```';
  await show(board);
  const cols = () => p.$$eval('#note-reading .nb-col', (c) => c.map((x) => `${x.querySelector('.nb-col-title').textContent}:${[...x.querySelectorAll('.nb-title')].map((t) => t.textContent).join(',')}`));
  check('columnas del tablero', await cols(), ['pendiente:App', 'en curso:Web', 'hecho:', 'pausado:Blog', 'Sin estado:Idea suelta']);
  check('tarjeta', await p.$eval('#note-reading .nb-card[data-id="p1"]', (c) => [c.querySelector('.nb-props').textContent, c.querySelector('.nb-tags').textContent]), ['autor: Ana', '#web']);
  // Arrastrar «App» a «hecho» con el ratón
  const src = await (await p.$('#note-reading .nb-card[data-id="p2"]')).boundingBox();
  const dst = await (await p.$('#note-reading .nb-col:nth-child(3)')).boundingBox();
  await p.mouse.move(src.x + 40, src.y + 10); await p.mouse.down();
  for (let i = 1; i <= 8; i++) await p.mouse.move(src.x + 40 + (dst.x + 40 - src.x - 40) * i / 8, src.y + 10 + (dst.y + 60 - src.y - 10) * i / 8);
  await p.mouse.up(); await p.clock.runFor(100);
  check('arrastrar cambia la propiedad', await p.evaluate(() => propOf(noteById('p2'), 'estado')), 'hecho');
  check('tras arrastrar', await cols(), ['pendiente:', 'en curso:Web', 'hecho:App', 'pausado:Blog', 'Sin estado:Idea suelta']);
  // A «Sin estado» se quita la propiedad (y el bloque vacío)
  await p.evaluate(() => moveBoardNote(noteById('p3'), 'estado', null));
  check('sin estado quita', await p.evaluate(() => noteById('p3').body), '');
  check('tras quitar', await cols(), ['pendiente:', 'en curso:Web', 'hecho:App', 'Sin estado:Blog,Idea suelta']);
  // A una columna desde «Sin estado»: añade la propiedad
  await p.evaluate(() => moveBoardNote(noteById('p4'), 'estado', 'en curso'));
  check('añade propiedad', await p.evaluate(() => noteById('p4').body), '---\nestado: en curso\n---\nSin propiedades #idea');
  // «+» en una columna
  await p.click('#note-reading .nb-col:nth-child(1) .nb-add'); await p.keyboard.type('Nueva'); await p.keyboard.press('Enter'); await p.clock.runFor(100);
  check('+ crea nota', await p.evaluate(() => { const n = state.notes.find((x) => x.path === 'Proyectos/Nueva'); return n && n.body; }), '---\nestado: pendiente\n---\n');
  check('aparece', (await cols())[0], 'pendiente:Nueva');
  // Teclado: → en el asa
  await p.focus('#note-reading .nb-card[data-id="p1"] .nb-handle'); await p.keyboard.press('ArrowRight'); await p.clock.runFor(100);
  check('flecha mueve', await p.evaluate(() => propOf(noteById('p1'), 'estado')), 'hecho');
  // Clic abre la nota
  await p.click('#note-reading .nb-card[data-id="p1"] .nb-title'); await p.clock.runFor(100);
  check('clic abre', await p.evaluate(() => activeNote()?.id), 'p1');
  // Menú de carpeta
  check('menú carpeta', await p.evaluate(() => folderMenuItems('Proyectos').map((x) => x.label).slice(0, 3)), ['Nueva nota aquí', 'Ver como tabla', 'Ver como tablero…']);
  await p.evaluate(() => folderMenuItems('Proyectos')[2].action()); await p.keyboard.press('Enter'); await p.clock.runFor(200);
  check('ver como tablero', await p.evaluate(() => [activeNote()?.path, document.querySelectorAll('#note-reading .nb-col').length > 0]), ['Tableros/Proyectos por estado', true]);
  // Comando «/»
  check('slash', await p.evaluate(() => SLASH_ITEMS.some((x) => x.label === 'Tablero de notas' && x.group === 'Consultas')), true);

  // Con el dedo, desde el asa
  const tc = await b.newContext({ viewport: { width: 900, height: 860 }, hasTouch: true, isMobile: true });
  const tp = await tc.newPage();
  tp.on('pageerror', (e) => errs.push(e.message));
  await tp.goto(url); await tp.waitForTimeout(500);
  await tp.evaluate((bl) => { const n = createNote({ title: 'Tablero táctil', body: bl, open: false }); createNote({ folder: 'Proyectos', title: 'Toque', body: '---\nestado: pendiente\n---\n', open: false }); noteMode.set(n.id, 'read'); openNote(n); renderAll(); }, board);
  await tp.waitForSelector('#note-reading .nb-card .nb-handle');
  const h = await (await tp.$('#note-reading .nb-col:nth-child(1) .nb-card .nb-handle')).boundingBox();
  const to = await (await tp.$('#note-reading .nb-col:nth-child(2)')).boundingBox();
  const cdp = await tc.newCDPSession(tp);
  const at = (x, y) => [{ x, y }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(h.x + 4, h.y + 4) });
  for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(h.x + 4 + (to.x + 30 - h.x) * i / 10, h.y + 4 + (to.y + 50 - h.y) * i / 10) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await tp.waitForTimeout(200);
  check('arrastre táctil', await tp.evaluate(() => propOf(state.notes.find((n) => n.path === 'Proyectos/Toque'), 'estado')), 'en curso');
  await tc.close();

  console.log('errors:', errs); await b.close();
})();
