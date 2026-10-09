const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const now = new Date('2026-10-09T10:00:00').getTime();
(async () => {
  const b = await chromium.launch(launchOptions);
  const c = await b.newContext({ viewport: { width: 1300, height: 860 } });
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, {
    tasks: [], habits: [], settings: { notesWelcome: true },
    notes: [
      { id: 'a', path: 'Libros/Dune', body: '---\nautor: Frank Herbert\nestado: leído\ntags: [libro, ficcion]\n---\nUna novela sobre el desierto.\n- [ ] Escribir reseña\n- [x] Comprar el libro', createdAt: now, updatedAt: now - 3 },
      { id: 'b', path: 'Libros/Fundación', body: '---\nautor: Asimov\nestado: pendiente\n---\nImperio galáctico. #libro\n- [ ] Leer capítulo 1', createdAt: now, updatedAt: now - 2 },
      { id: 't', path: 'Tabla', body: '```tabla\ncarpeta: Libros\ncolumnas: autor\n```', createdAt: now, updatedAt: now - 9 },
      { id: 'c', path: 'Trabajo/Reunión lunes', body: 'Hablar del presupuesto y del desierto de datos.\n- [x] Enviar acta', createdAt: now, updatedAt: now - 1 },
    ],
    updatedAt: 1,
  });
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.clock.install({ time: new Date(now) });
  await p.goto(url); await p.clock.runFor(800);
  const q = (s) => p.evaluate((s) => state.notes.filter((n) => noteMatchesSearch(n, parseSearch(s))).map((n) => n.id).sort().join(','), s);
  for (const s of ['desierto', '"desierto de datos"', 'desierto -presupuesto', 'path:Libros', 'file:dune', 'tag:#libro', '#libro', 'task-todo:reseña', 'task-done:', 'task-todo:', '[autor]', '[estado:leído]', '[autor:asimov] OR path:Trabajo', 'line:(novela desierto)', '/imperio\\s+gal/', 'content:acta', 'hora:10'])
    console.log(`${s} =>`, await q(s));
  // En la interfaz
  await p.evaluate(() => { showLeftPane('search'); });
  await p.fill('#note-search', 'task-todo: path:Libros');
  await p.clock.runFor(300);
  console.log('ui:', await p.$$eval('#search-results .sh-title', (n) => n.map((x) => x.textContent)), await p.$$eval('#search-results .sh-line', (n) => n.map((x) => x.textContent)));
  await p.fill('#note-search', '');
  await p.clock.runFor(300);
  console.log('help:', await p.$$eval('.search-help code', (n) => n.length));
  // Las opciones de un bloque de consulta llegan en la vista de lectura
  await p.evaluate(() => { openNote(noteById('t')); setNoteMode(noteById('t'), 'read'); });
  await p.clock.runFor(300);
  console.log('table cols:', await p.$$eval('#note-reading table th', (n) => n.map((x) => x.textContent.trim())));
  console.log('errors:', errs); await b.close();
})();
