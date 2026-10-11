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
  check('parseFields', await p.evaluate(() => parseFields('autor, estado:opción[A|B], n:número')), [{ key: 'autor', type: 'texto', options: [] }, { key: 'estado', type: 'opción', options: ['A', 'B'] }, { key: 'n', type: 'número', options: [] }]);
  check('fieldsStr ida y vuelta', await p.evaluate(() => fieldsStr(parseFields('autor, estado:opción[A|B], hecho:casilla'))), 'autor, estado:opción[A|B], hecho:casilla');
  // Plantilla Biblioteca: campos con tipo
  await p.click('.ribbon .rib[data-view="bases"]'); await p.clock.runFor(50);
  await p.click('#view-bases .bases-head button'); await p.clock.runFor(50);
  await p.click('#picker-list .pk-item:has-text("Biblioteca")'); await p.clock.runFor(100);
  check('campos de la plantilla', await p.evaluate(() => baseFields(noteById(bases.open)).map((f) => `${f.key}:${f.type}`)), ['autor:texto', 'estado:opción', 'puntuacion:número', 'genero:texto']);
  // Nueva entrada: ficha con controles según el tipo
  await p.click('.base-top button:has-text("Nueva entrada")'); await p.clock.runFor(50);
  check('ficha nueva', await p.evaluate(() => [document.querySelector('#entry-modal button.primary').textContent, [...document.querySelectorAll('#entry-modal .entry-field input')].map((i) => i.type), document.querySelectorAll('#entry-modal datalist option').length]), ['Crear', ['text', 'text', 'number', 'text'], 3]);
  await p.keyboard.type('Pedro Páramo');
  await p.fill('.entry-field:has-text("autor") input', 'Juan Rulfo');
  await p.fill('.entry-field:has-text("estado") input', 'Leído');
  await p.fill('.entry-field:has-text("puntuacion") input', '5');
  await p.click('#entry-modal button.primary'); await p.clock.runFor(100);
  check('entrada creada con propiedades', await p.evaluate(() => { const n = state.notes.find((x) => x.path === 'Biblioteca/Pedro Páramo'); return n && [propOf(n, 'autor'), propOf(n, 'estado'), String(propOf(n, 'puntuacion'))]; }), ['Juan Rulfo', 'Leído', '5']);
  // Sin nombre no se crea
  await p.click('.base-top button:has-text("Nueva entrada")'); await p.clock.runFor(50);
  await p.click('#entry-modal button.primary'); await p.clock.runFor(50);
  check('sin nombre sigue abierta', await p.evaluate(() => !document.getElementById('entry-modal').hidden), true);
  await p.click('#entry-modal button:text-is("Cancelar")'); await p.clock.runFor(50);
  // Gestor de campos: añadir, renombrar y quitar
  await p.click('.base-top button:has-text("Campos")'); await p.clock.runFor(50);
  check('gestor', await p.$$eval('#entry-modal .fm-row .fm-name', (n) => n.map((x) => x.value)), ['autor', 'estado', 'puntuacion', 'genero']);
  await p.fill('#entry-modal .fm-row:nth-child(1) .fm-name', 'escritor');
  await p.click('#entry-modal .fm-row:nth-child(4) .danger-link');
  await p.click('#entry-modal .link:has-text("Añadir campo")');
  await p.fill('#entry-modal .fm-row:last-child .fm-name', 'leido_el');
  await p.selectOption('#entry-modal .fm-row:last-child select', 'fecha');
  await p.check('#entry-modal .fm-check:has-text("Quitar de las entradas") input');
  await p.click('#entry-modal button.primary'); await p.clock.runFor(150);
  check('campos guardados', await p.evaluate(() => propOf(noteById(bases.open), 'campos')), 'escritor, estado:opción[Por leer|Leyendo|Leído], puntuacion:número, leido_el:fecha');
  check('entradas actualizadas', await p.evaluate(() => { const n = state.notes.find((x) => x.path === 'Biblioteca/Pedro Páramo'); return [propOf(n, 'escritor'), /^autor:/m.test(n.body), /^genero:/m.test(n.body), /leido_el:/.test(n.body)]; }), ['Juan Rulfo', false, false, true]);
  check('columnas de la tabla', await p.evaluate(() => { const base = noteById(bases.open); const v = baseViews(base).find((x) => x.kind === 'tabla'); return qbParse('tabla', v.code).columns; }).then((c) => c.includes('escritor') && c.includes('leido_el') && !c.includes('autor')), true);
  // La ficha nueva usa el control de fecha
  await p.click('.base-top button:has-text("Nueva entrada")'); await p.clock.runFor(50);
  check('fecha en la ficha', await p.evaluate(() => document.querySelector('.entry-field.ft-fecha input')?.type), 'date');
  console.log('errors:', JSON.stringify(errs));
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
