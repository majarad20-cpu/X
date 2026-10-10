const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const now = new Date('2026-10-09T10:00:00').getTime();
(async () => {
  const b = await chromium.launch(launchOptions);
  const c = await b.newContext({ viewport: { width: 1300, height: 900 } });
  const N = (id, path, body) => ({ id, path, body, createdAt: now, updatedAt: now });
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, {
    tasks: [], habits: [], settings: { notesWelcome: true }, folders: ['Libros', 'Agenda', 'Galería', 'Dibujos'],
    notes: [
      N('l1', 'Libros/Dune', '---\nautor: Herbert\nestado: leído\nprecio: 10\npuntuación: 9\nportada: img:abc1\n---\nTexto'),
      N('l2', 'Libros/Rayuela', '---\nestado: pendiente\nprecio: 5,5\npuntuación: 7\n---\nIntro\n\n![foto](https://example.com/r.png)\n'),
      N('l3', 'Libros/Ficciones', 'autor:: Borges\nestado:: leído\nprecio:: 4\nTexto [puntuación:: 10] más.\n`codigo:: no`\n```\nbloque:: no\n```'),
      N('l4', 'Libros/Vacío', 'Nada'),
      N('g1', 'Galería/Cien años', '---\nportada: "[[Dibujo]]"\n---\n'),
      N('d1', 'Dibujos/Dibujo', '![Dibujo](img:zz9)\n'),
      N('a1', 'Agenda/Reunión A', '---\nfecha: 2026-10-05\n---\n'),
      N('a2', 'Agenda/Reunión B', '---\ninicio: 2026-10-20T10:00\n---\n'),
      N('a3', 'Agenda/Fuera', '---\nfecha: 2026-11-03\n---\n'),
      N('q', 'Consultas', ''),
    ],
    updatedAt: 1,
  });
  await c.route(/fonts\.g|example\.com/, (r) => r.abort());
  const p = await c.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.clock.install({ time: new Date(now) });
  await p.goto(url); await p.clock.runFor(800);
  const check = (label, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    console.log(`${label}:`, JSON.stringify(got), ok ? 'ok' : `ESPERADO ${JSON.stringify(want)}`);
    if (!ok) errs.push(`${label}: ${JSON.stringify(got)}`);
  };
  const show = async (block) => {
    await p.evaluate((bl) => { const n = noteById('q'); n.body = bl; noteMode.set('q', 'read'); openNote(n); renderAll(); }, block);
    await p.clock.runFor(100);
  };
  const body = (id) => p.evaluate((i) => noteById(i).body, id);
  const R = '#note-reading';

  // ---------- Campos en línea ----------
  check('noteFields', await p.evaluate(() => [...noteFields(noteById('l3')).values()].map((f) => `${f.key}=${f.value}`)), ['autor=Borges', 'estado=leído', 'precio=4', 'puntuación=10']);
  check('propiedad antes que campo', await p.evaluate(() => { const n = { body: '---\nautor: A\n---\nautor:: B' }; return propOf(n, 'autor'); }), 'A');
  check('caché por texto', await p.evaluate(() => { const n = noteById('l4'); const a = noteFields(n); const same = noteFields(n) === a; n.body = 'x:: 1'; const v = propOf(n, 'x'); n.body = 'Nada'; return [same, v]; }), [true, '1']);
  await show('```notas\ncarpeta: Libros\nestado: leído\norden: nombre\n```');
  check('filtro ```notas', await p.$$eval(`${R} .query-notes li a.wikilink`, (a) => a.map((x) => x.textContent)), ['Dune', 'Ficciones']);
  check('búsqueda [prop:valor]', await p.evaluate(() => state.notes.filter((n) => noteMatchesSearch(n, parseSearch('[autor:borges]'))).map((n) => baseName(n.path))), ['Ficciones']);
  check('búsqueda [prop]', await p.evaluate(() => state.notes.filter((n) => noteMatchesSearch(n, parseSearch('[puntuación]'))).map((n) => baseName(n.path)).sort()), ['Dune', 'Ficciones', 'Rayuela']);
  await show('```tablero\ncarpeta: Libros\nagrupar: estado\n```');
  const cols = () => p.$$eval(`${R} .nb-col`, (c) => c.map((x) => `${x.querySelector('.nb-col-title').textContent}:${[...x.querySelectorAll('.nb-title')].map((t) => t.textContent).join(',')}`));
  check('tablero con campos', await cols(), ['leído:Dune,Ficciones', 'pendiente:Rayuela', 'Sin estado:Vacío']);
  await p.evaluate(() => moveBoardNote(noteById('l3'), 'estado', 'pendiente'));
  check('tablero cambia el campo', (await body('l3')).split('\n')[1], 'estado:: pendiente');
  await p.evaluate(() => moveBoardNote(noteById('l3'), 'estado', 'leído'));
  // Lectura: «clave:: valor» y [clave:: valor] como chips; en código, no.
  await show('autor:: Frank Herbert\nVer [estado:: **leído**] y `a:: b`\n\n```\nx:: y\n```\n\nstd::vector no');
  check('chips', await p.$$eval(`${R} .inline-field`, (s) => s.map((x) => x.textContent)), ['autor: Frank Herbert', 'estado: **leído**']);
  check('código intacto', await p.$$eval(`${R} code`, (s) => s.map((x) => x.textContent)), ['a:: b', 'x:: y']);
  check('std::vector', await p.$eval(`${R} p:last-of-type`, (x) => x.textContent), 'std::vector no');
  // setProp sobre un campo en línea lo cambia ahí mismo
  await p.evaluate(() => { setProp(noteById('l3'), 'puntuación', '8'); setProp(noteById('l3'), 'precio', '6'); });
  check('setProp en línea', await body('l3'), 'autor:: Borges\nestado:: leído\nprecio:: 6\nTexto [puntuación:: 8] más.\n`codigo:: no`\n```\nbloque:: no\n```');
  check('código no cuenta', await p.evaluate(() => [propOf(noteById('l3'), 'codigo'), propOf(noteById('l3'), 'bloque')]), ['', '']);
  await p.evaluate(() => { setProp(noteById('l3'), 'precio', '4'); setProp(noteById('l3'), 'puntuación', '10'); });

  // ---------- Tablas: totales y grupos ----------
  const tot = () => p.$$eval(`${R} .note-table tfoot td`, (t) => t.map((x) => x.querySelector('.nt-total-val')?.textContent ?? ''));
  const tabla = 'carpeta: Libros\ncolumnas: autor, estado, precio, puntuación\ntotales: precio=suma, puntuación=promedio, autor=recuento';
  await show('```tabla\n' + tabla + '\n```');
  check('tabla con campo en línea', await p.$$eval(`${R} .note-table tbody tr:has-text("Ficciones") td`, (t) => t.map((x) => x.textContent)), ['Ficciones', 'Borges', 'leído', '4', '10', '2026-10-09']);
  check('totales', await tot(), ['', '4', '', '19,5', '8,67', '']);
  check('funciones', await p.evaluate(() => {
    const v = ['10', '5,5', '4', ''];
    return ['suma', 'promedio', 'mín', 'máx', 'recuento', 'vacíos', 'rellenos'].map((f) => tableTotal(f, v)).concat(tableTotal('máx', ['2026-01-02', '', '2025-12-01']), tableTotal('mín', ['b', 'a']), totalFn('min'), totalFn('Vacios'));
  }), ['19,5', '6,5', '4', '10', '4', '1', '3', '2026-01-02', 'a', 'mín', 'vacíos']);
  // Desplegable del pie: escribe «totales:»
  await p.selectOption(`${R} .note-table tfoot td:nth-child(3) select`, 'rellenos'); await p.clock.runFor(100);
  check('pie escribe totales', (await body('q')).includes('totales: precio=suma, puntuación=promedio, autor=recuento, estado=rellenos'), true);
  check('pie recalcula', (await tot())[2], '3');
  await p.selectOption(`${R} .note-table tfoot td:nth-child(2) select`, ''); await p.clock.runFor(100);
  check('pie quita', (await body('q')).match(/totales:.*/)[0], 'totales: precio=suma, puntuación=promedio, estado=rellenos');
  await p.selectOption(`${R} .note-table tfoot td:nth-child(5) select`, 'máx'); await p.clock.runFor(100);
  check('pie máx', (await tot())[4], '10');
  // Editar una celda de un campo en línea
  await p.click(`${R} .note-table tbody tr:has-text("Ficciones") td:nth-child(2)`);
  await p.fill(`${R} .note-table td input`, 'Jorge Luis Borges'); await p.keyboard.press('Enter'); await p.clock.runFor(100);
  check('celda cambia el campo', (await body('l3')).split('\n')[0], 'autor:: Jorge Luis Borges');
  // Agrupar
  await show('```tabla\ncarpeta: Libros\ncolumnas: precio\nagrupar: estado\ntotales: precio=suma\n```');
  const groups = () => p.$$eval(`${R} .note-table tbody.nt-group`, (g) => g.map((x) => `${x.querySelector('.nt-group-name').textContent}(${x.querySelector('.nt-group-count').textContent}):${[...x.querySelectorAll('tr:not(.nt-group-head):not(.nt-group-total) .nt-name')].map((t) => t.textContent).join(',')}|${x.querySelector('.nt-group-total td:nth-child(2)')?.textContent ?? '-'}`));
  check('grupos', await groups(), ['leído(2):Dune,Ficciones|14', 'pendiente(1):Rayuela|5,5', 'Sin estado(1):Vacío|']);
  check('total general', (await tot())[1], '19,5');
  await p.click(`${R} tbody.nt-group:first-of-type .nt-group-toggle`); await p.clock.runFor(100);
  check('plegar grupo', await groups(), ['leído(2):|-', 'pendiente(1):Rayuela|5,5', 'Sin estado(1):Vacío|']);
  check('aria plegado', await p.$eval(`${R} tbody.nt-group .nt-group-toggle`, (x) => x.getAttribute('aria-expanded')), 'false');
  await p.click(`${R} tbody.nt-group:first-of-type .nt-group-toggle`); await p.clock.runFor(100);
  check('desplegar', (await groups())[0], 'leído(2):Dune,Ficciones|14');

  // ---------- Galería ----------
  await show('```galeria\ncarpeta: Libros\nmostrar: autor\ntamaño: grande\n```');
  const cards = () => p.$$eval(`${R} .vg-card`, (cs) => cs.map((x) => [x.querySelector('.vg-name').textContent, x.querySelector('img')?.dataset.img || x.querySelector('img')?.getAttribute('src') || 'sin', x.querySelector('.vg-props')?.textContent || '']));
  check('galería', await cards(), [['Dune', 'abc1', 'autor: Herbert'], ['Ficciones', 'sin', 'autor: Jorge Luis Borges'], ['Rayuela', 'https://example.com/r.png', ''], ['Vacío', 'sin', '']]);
  check('tamaño', await p.$eval(`${R} .vg-grid`, (g) => g.className), 'vg-grid vg-l');
  await show('```galeria\ncarpeta: Galería\n```');
  check('portada [[imagen]]', (await cards())[0], ['Cien años', 'zz9', '']);
  check('portadas', await p.evaluate(() => [noteCover({ body: '---\ncover: https://x.org/a.jpg\n---' }), noteCover({ body: '![[Dibujo]]' }), noteCover({ body: '```\n![a](img:no)\n```\n![v](https://youtu.be/dQw4w9WgXcQ)\n![b](img:yes)' })]), [{ url: 'https://x.org/a.jpg' }, { img: 'zz9' }, { img: 'yes' }]);
  await show('```galeria\ncarpeta: Libros\n#nada\n```');
  check('galería vacía', await p.$eval(`${R} .query p.muted`, (x) => x.textContent), 'Ninguna nota cumple esta galería.');
  await show('```galeria\ncarpeta: Libros\nestado: pendiente\n```');
  await p.click(`${R} .vg-card`); await p.clock.runFor(100);
  check('clic abre', await p.evaluate(() => activeNote()?.id), 'l2');

  // ---------- Calendario ----------
  await show('```calendario\ncarpeta: Agenda\n```');
  const title = () => p.$eval(`${R} .vc-title`, (x) => x.textContent);
  const placed = () => p.$$eval(`${R} .vc-day`, (d) => d.filter((x) => x.querySelector('.vc-chip')).map((x) => `${x.dataset.date}:${[...x.querySelectorAll('.vc-chip')].map((c) => c.textContent).join(',')}`));
  check('mes', await title(), 'Octubre de 2026');
  check('semanas', await p.$$eval(`${R} .vc-day`, (d) => [d.length, d[0].dataset.date, d.at(-1).dataset.date]), [35, '2026-09-28', '2026-11-01']);
  check('colocadas', await placed(), ['2026-10-05:Reunión A']);
  check('hoy', await p.$eval(`${R} .vc-day.today`, (x) => x.dataset.date), '2026-10-09');
  await p.click(`${R} .vc-nav[title="Mes siguiente"]`); await p.clock.runFor(50);
  check('siguiente', [await title(), await placed()], ['Noviembre de 2026', ['2026-11-03:Fuera']]);
  await p.click(`${R} .vc-nav[title="Mes anterior"]`); await p.click(`${R} .vc-nav[title="Mes anterior"]`); await p.clock.runFor(50);
  check('anterior', [await title(), await placed()], ['Septiembre de 2026', []]);
  await p.click(`${R} .vc-nav[title="Este mes"]`); await p.clock.runFor(50);
  check('hoy vuelve', await title(), 'Octubre de 2026');
  // Día vacío: crea una nota con esa fecha en la carpeta del bloque
  await p.click(`${R} .vc-day[data-date="2026-10-14"]`); await p.keyboard.type('Nueva'); await p.keyboard.press('Enter'); await p.clock.runFor(100);
  check('crear en día vacío', await p.evaluate(() => state.notes.find((n) => n.path === 'Agenda/Nueva')?.body), '---\nfecha: 2026-10-14\n---\n');
  check('aparece', await placed(), ['2026-10-05:Reunión A', '2026-10-14:Nueva']);
  // Arrastrar a otro día cambia la fecha
  const drag = async (chip, day) => {
    const s = await (await p.$(`${R} .vc-chip[data-id="${chip}"]`)).boundingBox();
    const d = await (await p.$(`${R} .vc-day[data-date="${day}"]`)).boundingBox();
    await p.mouse.move(s.x + 10, s.y + 5); await p.mouse.down();
    for (let i = 1; i <= 8; i++) await p.mouse.move(s.x + 10 + (d.x + 30 - s.x - 10) * i / 8, s.y + 5 + (d.y + 40 - s.y - 5) * i / 8);
    await p.mouse.up(); await p.clock.runFor(100);
  };
  await drag('a1', '2026-10-21');
  check('arrastrar cambia la fecha', await p.evaluate(() => propOf(noteById('a1'), 'fecha')), '2026-10-21');
  check('tras arrastrar', (await placed())[1], '2026-10-21:Reunión A');
  // «fecha: inicio» y la hora se conserva
  await show('```calendario\ncarpeta: Agenda\nfecha: inicio\n```');
  check('fecha: inicio', await placed(), ['2026-10-20:Reunión B']);
  await drag('a2', '2026-10-22');
  check('conserva la hora', await p.evaluate(() => propOf(noteById('a2'), 'inicio')), '2026-10-22T10:00');
  // Teclado: Alt + flecha
  await p.focus(`${R} .vc-chip[data-id="a2"]`); await p.keyboard.press('Alt+ArrowDown'); await p.clock.runFor(100);
  check('Alt+↓ una semana', await p.evaluate(() => propOf(noteById('a2'), 'inicio')), '2026-10-29T10:00');
  // Campo en línea como fecha
  await p.evaluate(() => createNote({ folder: 'Agenda', title: 'En línea', body: 'Charla\nfecha:: 2026-10-02', open: false }));
  await show('```calendario\ncarpeta: Agenda\n```');
  check('fecha en línea', (await placed())[0], '2026-10-02:En línea');
  await p.click(`${R} .vc-chip:has-text("En línea")`); await p.clock.runFor(100);
  check('clic abre nota', await p.evaluate(() => baseName(activeNote()?.path || '')), 'En línea');

  // Registro y comando «/»
  check('QUERY_KINDS', await p.evaluate(() => Object.entries(QUERY_KINDS).map(([k, v]) => `${k}:${v.label}:${typeof v.render}`)), ['galeria:Galería de notas:function', 'calendario:Calendario de notas:function']);
  check('slash', await p.evaluate(() => ['Galería de notas', 'Calendario de notas'].map((l) => SLASH_ITEMS.some((x) => x.label === l && x.group === 'Consultas'))), [true, true]);
  check('pdf no falla', await p.evaluate(() => !!renderMd('```galeria\n```\n```calendario\n```')), true);

  console.log('errors:', errs); await b.close();
})();
