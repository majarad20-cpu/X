const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const now = new Date('2026-10-09T10:00:00').getTime();
const M = 'Cerebro Digital X/00.- ATLAS';
const seed = {
  tasks: [], habits: [], settings: { notesWelcome: true },
  notes: [
    { id: 'moc', path: `${M}/MOCS/1.- MOC - CONTABILIDAD`, body: '[[IVA]] · [[PPM]] · [[2.- MOC - ADMINISTRACIÓN]] · [[NIIF 15]] · [[Carpeta/Con ruta]]', createdAt: now, updatedAt: now },
    { id: 'moc2', path: `${M}/MOCS/2.- MOC - ADMINISTRACIÓN`, body: '', createdAt: now, updatedAt: now },
    { id: 'iva', path: `${M}/MATRIZ DE NOTAS/IVA`, body: 'IVA', createdAt: now, updatedAt: now },
    { id: 'ppm', path: `${M}/MATRIZ DE NOTAS/PPM`, body: 'PPM', createdAt: now, updatedAt: now },
    { id: 'sola', path: 'Proyectos/Web/Plan', body: 'Ver [[Diseño]]', createdAt: now, updatedAt: now },
  ],
  updatedAt: 1,
};
(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const check = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${label}: ${JSON.stringify(got)}${ok ? ' ok' : ` ESPERADO ${JSON.stringify(want)}`}`); if (!ok) errs.push(label); };
  const c = await b.newContext({ viewport: { width: 1300, height: 860 } });
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, seed);
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.goto(url); await p.waitForTimeout(800);
  // Desde un MOC: la nota nueva va donde están las notas que ya enlaza (MATRIZ DE NOTAS), no a MOCS ni a la raíz
  check('desde un MOC', await p.evaluate(() => openNoteByLink('NIIF 15', { fromNote: noteById('moc') }).path), `${M}/MATRIZ DE NOTAS/NIIF 15`);
  check('el enlace del MOC no cambia', await p.evaluate(() => noteById('moc').body.includes('[[NIIF 15]]')), true);
  // Un enlace con ruta respeta esa ruta
  check('con ruta', await p.evaluate(() => openNoteByLink('Carpeta/Con ruta', { fromNote: noteById('moc') }).path), 'Carpeta/Con ruta');
  // Sin otras notas enlazadas: la carpeta de la nota de origen
  check('junto a la de origen', await p.evaluate(() => openNoteByLink('Diseño', { fromNote: noteById('sola') }).path), 'Proyectos/Web/Diseño');
  // Sin nota de origen (p. ej. desde el grafo): en la raíz, como antes
  check('sin origen', await p.evaluate(() => openNoteByLink('Suelta').path), 'Suelta');
  console.log('errors:', JSON.stringify(errs));
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
