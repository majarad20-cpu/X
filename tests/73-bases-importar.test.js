const { chromium, launchOptions } = require('./helpers');
const fs = require('fs');
const url = process.argv[2];
const now = new Date('2026-10-11T10:00:00').getTime();
(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const check = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${label}: ${JSON.stringify(got)}${ok ? ' ok' : ` ESPERADO ${JSON.stringify(want)}`}`); if (!ok) errs.push(label); };
  const c = await b.newContext({ viewport: { width: 1300, height: 900 }, acceptDownloads: true });
  await c.addInitScript(() => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify({ tasks: [], habits: [], settings: { notesWelcome: true }, notes: [], updatedAt: 1 })); });
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.clock.install({ time: new Date(now) });
  await p.goto(url); await p.clock.runFor(800);
  check('valores', await p.evaluate(() => [impNum('1.234,5'), impNum('12,5'), impNum('3.5'), impDate('7/3/2024'), impGuessType('x', ['sí', 'no', 'sí']).type]), [1234.5, 12.5, 3.5, '2024-03-07', 'casilla']);
  // Importar un CSV como base nueva
  await p.click('.ribbon .rib[data-view="bases"]'); await p.clock.runFor(50);
  await p.click('#view-bases .bases-head button'); await p.clock.runFor(50);
  const csv = 'Páginas;Título;Autor;Estado;Leído el\n600;Rayuela;Cortázar;Leído;12/03/2024\n400;Ficciones;Borges;Por leer;\n300;El túnel;Sabato;Leído;01/02/2023\n250;Aura;Fuentes;Leyendo;\n';
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#picker-list .pk-item:has-text("Importar desde un CSV")')]);
  await fc.setFiles({ name: 'Mis libros.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await p.clock.runFor(100);
  check('diálogo', await p.evaluate(() => [document.querySelector('#entry-modal .entry-title').value, document.querySelector('.imp-pick select').value, [...document.querySelectorAll('.imp-col')].map((r) => `${r.querySelector('.fm-name').value}:${r.querySelector('select').value}`), document.querySelector('#entry-modal button.primary').textContent]), ['Mis libros', '1', ['páginas:número', 'autor:texto', 'estado:opción', 'leído_el:fecha'], 'Importar 4 entradas']);
  await p.click('#entry-modal button.primary'); await p.clock.runFor(150);
  check('base creada', await p.evaluate(() => { const bb = noteById(bases.open); return [baseName(bb.path), propOf(bb, 'campos'), baseViews(bb).map((v) => v.kind), baseEntries(bb).length]; }), ['Mis libros', 'páginas:número, autor, estado:opción[Leído|Por leer|Leyendo], leído_el:fecha', ['tabla', 'tablero'], 4]);
  check('entrada con propiedades', await p.evaluate(() => { const n = state.notes.find((x) => x.path === 'Mis libros/Rayuela'); return [String(propOf(n, 'páginas')), propOf(n, 'autor'), propOf(n, 'estado'), String(propOf(n, 'leído_el'))]; }), ['600', 'Cortázar', 'Leído', '2024-03-12']);
  check('tabla con 4 filas', await p.$$eval('.base-content table tbody tr', (r) => r.length), 4);
  // Pegar filas en la base: actualiza Rayuela y añade una
  await p.click('.base-top .side-btn'); await p.clock.runFor(50);
  await p.click('#note-menu .menu-item:has-text("Pegar filas")'); await p.clock.runFor(50);
  await p.fill('.imp-paste', 'Título\tPáginas\tEditorial\nRayuela\t700\tAlfaguara\nPedro Páramo\t150\tFCE');
  await p.click('#entry-modal button.primary'); await p.clock.runFor(50);
  check('aviso de existentes', await p.evaluate(() => /Actualizar las 1 entradas/.test(document.querySelector('#entry-modal').textContent)), true);
  await p.click('#entry-modal button.primary'); await p.clock.runFor(150);
  check('actualizada y nueva', await p.evaluate(() => { const r = state.notes.find((x) => x.path === 'Mis libros/Rayuela'); const pp = state.notes.find((x) => x.path === 'Mis libros/Pedro Páramo'); return [String(propOf(r, 'páginas')), propOf(r, 'autor'), propOf(r, 'editorial'), !!pp, state.notes.filter((x) => x.path.startsWith('Mis libros/')).length, /editorial/.test(propOf(noteById(bases.open), 'campos'))]; }), ['700', 'Cortázar', 'Alfaguara', true, 5, true]);
  // Exportar a CSV
  await p.click('.base-top .side-btn'); await p.click('#note-menu .menu-item:has-text("Exportar la base")'); await p.clock.runFor(50);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#picker-list .pk-item:has-text("CSV para Excel")')]);
  const out = fs.readFileSync(await dl.path(), 'utf8').replace(/^﻿/, '').split(/\r\n/);
  check('csv exportado', [dl.suggestedFilename(), out[0], out.find((l) => l.startsWith('Rayuela'))], ['Mis libros.csv', 'nombre,páginas,autor,estado,leído_el,editorial', 'Rayuela,700,Cortázar,Leído,2024-03-12,Alfaguara']);
  // Exportar como nota con la tabla
  await p.click('.base-top .side-btn'); await p.click('#note-menu .menu-item:has-text("Exportar la base")'); await p.clock.runFor(50);
  await p.click('#picker-list .pk-item:has-text("Nota con la tabla")'); await p.clock.runFor(100);
  check('nota con la tabla', await p.evaluate(() => { const n = state.notes.find((x) => x.path.startsWith('Mis libros (tabla')); return n && [n.body.includes('| [[Rayuela]] | 700 | Cortázar |'), n.body.split('\n').filter((l) => l.startsWith('| [[')).length]; }), [true, 5]);
  // Pegar una lista como base nueva, y deshacer
  await p.evaluate(() => showView('bases'));
  await p.evaluate(() => importBasePaste()); await p.clock.runFor(50);
  await p.fill('.imp-paste', '- Leche\n- Pan\n- [ ] Huevos\n');
  await p.click('#entry-modal button.primary'); await p.clock.runFor(50);
  await p.fill('#entry-modal .entry-title', 'Súper');
  await p.click('#entry-modal button.primary'); await p.clock.runFor(150);
  check('lista importada', await p.evaluate(() => state.notes.filter((x) => x.path.startsWith('Súper/')).map((x) => baseName(x.path))), ['Leche', 'Pan', 'Huevos']);
  await p.click('.toast-action:has-text("Deshacer")'); await p.clock.runFor(100);
  check('deshecha', await p.evaluate(() => [state.notes.filter((x) => x.path.startsWith('Súper/')).length, allBases().some((x) => baseName(x.path) === 'Súper')]), [0, false]);
  console.log('errors:', JSON.stringify(errs));
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
