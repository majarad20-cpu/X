const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const out = process.argv[3];
const N = (id, path, body) => ({ id, path, body, createdAt: 1, updatedAt: Date.now() - 86400000 * 5 });
const fm = (o) => `---\n${Object.entries(o).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n`;
const notes = [
  N('moc', 'MOCS/1.- MOC - CONTABILIDAD', `${fm({ tipo: 'MOC', area: 'contabilidad' })}# MOC Contabilidad\n## A. Normas\n- [[Ley 18.045 - Mercado de Valores]]\n- [[Ley 20.712]]\n- [[Nota por escribir]]\n## B. Tributaria\n### IVA\n- [[IVA en Servicios]]\n## C. Vacía\nSin enlaces.\n`),
  N('a', 'MATRIZ/Ley 18.045 - Mercado de Valores', `${fm({ tipo: 'concepto', area: 'finanzas', estado: 'completa', moc: '"[[1.- MOC - CONTABILIDAD]]"', actualizada: '2026-11-24' })}# Ley 18.045\n**Idea central:** regula el mercado de valores y sus delitos.\n\n## Delitos\nLos arts. 59 a 62 fueron modificados por la Ley 21.595 del 17-08-2023. Sanciones de presidio y multas por información falsa.\n\n## Trazabilidad\n| Fecha | Cambio |\n|---|---|\n| 13-04-2021 | Ley 21.314 |\n`),
  N('b', 'MATRIZ/Ley 20.712', `${fm({ tipo: 'concepto', area: 'finanzas', estado: 'borrador', moc: '"[[1.- MOC - CONTABILIDAD]]"' })}# Ley 20.712\nEl art. 107 LIR cambia el 01-01-2027: el mayor valor pasa a ser ingreso no renta.\n\n## Fondos\nFondos mutuos rescatables en 10 días y fondos de inversión no rescatables con plazo de 180 días.\n`),
  N('c', 'MATRIZ/IVA en Servicios', `${fm({ tipo: 'concepto', area: 'tributaria', estado: 'revisada' })}# IVA en Servicios\nDesde el 1 de enero de 2023 los servicios se gravan con IVA (Ley 21.420). La nueva Ley 19.628 rige el 15 de octubre de 2027.\n`),
  N('d', 'MATRIZ/Datos personales', `${fm({ tipo: 'concepto', area: 'tributaria', estado: 'borrador', moc: '"[[1.- MOC - CONTABILIDAD]]"' })}# Datos\nRige desde el 15/10/2027 la Ley 21.719.\n`),
];
(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const check = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${label}: ${JSON.stringify(got)}${ok ? ' ok' : ` ESPERADO ${JSON.stringify(want)}`}`); if (!ok) errs.push(label); };
  const c = await b.newContext({ viewport: { width: 1400, height: 900 } });
  await c.addInitScript((notes) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify({ tasks: [], habits: [], settings: { notesWelcome: true, look: { ribbonLabels: 'on', ribAutoV1: true } }, notes, updatedAt: 1 })); }, notes);
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.goto(url); await p.waitForTimeout(800);
  const shot = async (name) => out && p.screenshot({ path: `${out}/100-${name}.png` });
  check('iconos tras Bases', await p.$$eval('.ribbon .rib[data-view]', (n) => n.map((x) => x.dataset.view)), ['canvas', 'bases', 'tableros', 'matriz', 'mapas', 'mosaico', 'linea', 'estudio']);

  // Tableros
  await p.click('.ribbon [data-view="tableros"]'); await p.waitForTimeout(150);
  await p.click('.gv-preset >> text=Notas por estado'); await p.waitForTimeout(150);
  check('columnas del tablero', await p.$$eval('#view-tableros .nb-col-title', (n) => n.map((x) => x.textContent)), ['borrador', 'en desarrollo', 'completa', 'revisada', 'Sin estado']);
  check('tarjetas en borrador', await p.$$eval('#view-tableros .nb-col:first-child .nb-title', (n) => n.map((x) => x.textContent)), ['Datos personales', 'Ley 20.712']);
  await p.evaluate(() => { moveBoardNote(noteById('b'), 'estado', 'completa'); });
  await p.waitForTimeout(150);
  check('mover cambia la nota', await p.evaluate(() => propOf(noteById('b'), 'estado')), 'completa');
  check('tablero guardado', await p.evaluate(() => state.settings.gv.boards.map((x) => [x.name, x.group])), [['Notas por estado', 'estado']]);
  await shot('tableros');

  // Matriz
  await p.click('.ribbon [data-view="matriz"]'); await p.waitForTimeout(150);
  check('ejes de la matriz', await p.evaluate(() => [[...document.querySelectorAll('#view-matriz thead th')].map((x) => x.firstChild.textContent), [...document.querySelectorAll('#view-matriz tbody th')].map((x) => x.firstChild.textContent)]), [['estado \\ area', 'contabilidad', 'finanzas', 'tributaria'], ['borrador', 'completa', 'revisada', 'Sin estado']]);
  await p.evaluate(() => gvSetProps(noteById('d'), [['area', 'finanzas'], ['estado', 'completa']]));
  await p.waitForTimeout(150);
  check('casilla finanzas × completa', await p.$$eval('#view-matriz td[data-x="finanzas"][data-y="completa"] .gvm-card', (n) => n.map((x) => x.textContent).sort()), ['Datos personales', 'Ley 18.045 - Mercado de Valores', 'Ley 20.712']);
  // Arrastrar con el ratón a otra casilla
  const card = await p.$('#view-matriz td[data-x="finanzas"][data-y="completa"] .gvm-card');
  const target = await p.$('#view-matriz td[data-x="tributaria"][data-y="revisada"]');
  const a = await card.boundingBox(); const t = await target.boundingBox();
  await p.mouse.move(a.x + 10, a.y + 8); await p.mouse.down(); await p.mouse.move(a.x + 40, a.y + 30, { steps: 4 }); await p.mouse.move(t.x + 20, t.y + 20, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(200);
  check('arrastrar en la matriz', await p.evaluate(() => [propOf(noteById('d'), 'area'), propOf(noteById('d'), 'estado')]), ['tributaria', 'revisada']);
  await shot('matriz');

  // Mapas
  await p.click('.ribbon [data-view="mapas"]'); await p.waitForTimeout(150);
  await p.click('#view-mapas .gv-preset'); await p.waitForTimeout(300);
  check('nodos del mapa', await p.$$eval('#view-mapas .gvmap-node', (n) => n.map((x) => `${x.className.match(/k-\w+/)[0]}:${x.firstChild.textContent}`)), ['k-root:1.- MOC - CONTABILIDAD', 'k-head:A. Normas', 'k-note:Ley 18.045 - Mercado de Valores', 'k-note:Ley 20.712', 'k-missing:Nota por escribir', 'k-head:B. Tributaria', 'k-head:IVA', 'k-note:IVA en Servicios', 'k-head:Otras notas con moc: 1.- MOC - CONTABILIDAD', 'k-note:Datos personales']);
  check('líneas dibujadas', await p.$$eval('#view-mapas .dg-path', (n) => n.length), 9);
  await shot('mapa-mental');
  for (const k of ['org', 'outline', 'radial']) {
    await p.click(`#view-mapas .gv-seg .seg:nth-child(${['mindmap', 'org', 'outline', 'radial'].indexOf(k) + 1})`); await p.waitForTimeout(250);
    check(`mapa ${k}`, await p.evaluate(() => [document.querySelectorAll('#view-mapas .gvmap-node').length, document.querySelectorAll('#view-mapas .dg-path').length > 0]), [10, true]);
  }
  await shot('mapa-radial');
  await p.$$eval('#view-mapas .gvmap-node.k-head', (n) => n.find((x) => x.textContent === 'A. Normas').click()); await p.waitForTimeout(200);
  check('plegar rama', await p.$$eval('#view-mapas .gvmap-node', (n) => n.length), 7);
  check('rama plegada con su número', await p.$$eval('#view-mapas .gvmap-fold', (n) => n.map((x) => x.textContent)), ['+3']);
  await p.$$eval('#view-mapas .gvmap-node.k-note', (n) => n.find((x) => x.textContent === 'IVA en Servicios').click()); await p.waitForTimeout(200);
  check('abrir nota del mapa', await p.evaluate(() => activeNote()?.id), 'c');

  // Mosaico
  await p.click('.ribbon [data-view="mosaico"]'); await p.waitForTimeout(200);
  check('bloques por moc', await p.$$eval('#view-mosaico .gvt-name', (n) => n.map((x) => x.textContent).sort()), ['1.- MOC - CONTABILIDAD', 'Sin moc']);
  await p.click('#view-mosaico .gvt-tile >> text=1.- MOC - CONTABILIDAD'); await p.waitForTimeout(150);
  check('entrar al bloque', await p.$$eval('#view-mosaico .gvt-name', (n) => n.length), 3);
  await shot('mosaico');

  // Línea de tiempo
  await p.click('.ribbon [data-view="linea"]'); await p.waitForTimeout(150);
  await p.click('#view-linea .seg >> text="Todo"'); await p.waitForTimeout(200);
  check('fechas del texto', await p.evaluate(() => gvTimeItems({ t: 'all' }, 'texto').map((x) => `${x.date} ${x.note.id}`)), ['2021-04-13 a', '2023-01-01 c', '2023-08-17 a', '2027-01-01 b', '2027-10-15 c', '2027-10-15 d']);
  check('columna de hoy marcada', await p.evaluate(() => !!document.querySelector('#view-linea .gvl-col.now')), true);
  check('opciones elegidas', await p.evaluate(() => [gvOpt('linea', 'range'), gvOpt('linea', 'zoom', 'mes')]), ['todo', 'mes']);
  await p.click('#view-linea .seg >> text="Años"'); await p.waitForTimeout(200);
  check('años', await p.$$eval('#view-linea .gvl-head > span:first-child', (n) => n.map((x) => x.textContent)), ['2021', '2022', '2023', '2024', '2025', '2026', '2027']);
  await shot('linea');
  await p.click('#view-linea .gvl-item >> text=Datos personales'); await p.waitForTimeout(200);
  check('abre en la línea', await p.evaluate(() => activeNote()?.id), 'd');

  // Tarjetas de estudio
  await p.click('.ribbon [data-view="estudio"]'); await p.waitForTimeout(150);
  await p.click('#view-estudio .gv-preset'); await p.waitForTimeout(150);
  check('cola', await p.evaluate(() => gvStudy.queue.length), 4);
  await p.keyboard.press('Space'); await p.waitForTimeout(100);
  check('respuesta visible', await p.evaluate(() => !!document.querySelector('#view-estudio .gvs-back')), true);
  await shot('estudio');
  await p.keyboard.press('3'); await p.waitForTimeout(100);
  check('calificada', await p.evaluate(() => [gvStudy.queue.length, Object.values(state.settings.gv.srs).map((r) => r.box)]), [3, [1]]);
  await p.click('#view-estudio .seg >> text=Una por sección'); await p.waitForTimeout(150);
  check('tarjetas por sección', await p.evaluate(() => gvStudyCards(gvOpt('estudio', 'src'), 'seccion').map((x) => x.heading)), ['Delitos', 'Trazabilidad', 'Fondos']);

  console.log('errors:', JSON.stringify(errs));
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
