const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const out = process.argv[3];
(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const check = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${label}: ${JSON.stringify(got)}${ok ? ' ok' : ` ESPERADO ${JSON.stringify(want)}`}`); if (!ok) errs.push(label); };
  const c = await b.newContext({ viewport: { width: 1300, height: 900 } });
  const A = 'Cerebro Digital X/00.- ATLAS';
  const now = Date.now();
  const day = 86400000;
  const N = (id, path, body, age) => ({ id, path, body, createdAt: now - age * day, updatedAt: now - age * day });
  const notes = [
    N('m1', `${A}/MOCS/7.- MOC - CONTABILIDAD`, '# Contabilidad\n- [[Índice IVA]]\n\n## Otros\n- [[PPM]]', 100),
    N('m2', `${A}/MOCS/5.- MOC - FINANZAS`, '- [[WACC]]', 100),
    N('ix', `${A}/MATRIZ DE NOTAS/Índice IVA`, '- [[IVA Débito]]', 100),
    N('iv', `${A}/MATRIZ DE NOTAS/IVA Débito`, 'texto', 2),
    N('pp', `${A}/MATRIZ DE NOTAS/PPM`, 'texto', 40),
    N('w', `${A}/MATRIZ DE NOTAS/WACC`, 'texto', 100),
    N('nu', `${A}/MATRIZ DE NOTAS/Nueva suelta`, 'enlaza a [[WACC]]', 1),
    N('vi', `${A}/MATRIZ DE NOTAS/Vieja suelta`, 'sola', 200),
    N('dia', 'Diario/2026-11-18', 'hoy', 0),
  ];
  await c.addInitScript((notes) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify({ tasks: [], habits: [], settings: { notesWelcome: true }, notes, updatedAt: 1 })); }, notes);
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.goto(url); await p.waitForTimeout(800);
  await p.evaluate(() => showView('revision')); await p.waitForTimeout(300);
  const r = await p.evaluate(() => { const r = computeVaultReview(''); return { recent: r.recent.map((x) => [x.n.id, x.inMoc]), noMoc: r.noMoc.map((n) => n.id), mocs: r.mocList.map((n) => n.id) }; });
  check('nuevas (14 días, recientes primero, sin diario ni MOCs)', r.recent, [['nu', false], ['iv', true]]);
  check('fuera de los MOCs (a través de índices cuenta como dentro)', r.noMoc, ['nu', 'vi']);
  check('lista de MOCs', r.mocs, ['m2', 'm1']);
  check('por carpeta usa los MOCs de toda la bóveda', await p.evaluate((A) => computeVaultReview(`${A}/MATRIZ DE NOTAS`).noMoc.map((n) => n.id), A), ['nu', 'vi']);
  check('contadores', await p.evaluate(() => [...document.querySelectorAll('#view-revision .rv-stat')].slice(-2).map((s) => s.textContent)), ['2Nuevas', '2Fuera de MOCs']);
  // 30 días: entra PPM (40 días no); 90 días sí
  await p.evaluate(() => { [...document.querySelectorAll('#view-revision details')].forEach((d) => (d.open = true)); });
  await p.selectOption('#view-revision details.rv-card:has-text("Notas nuevas") label select', '90'); await p.waitForTimeout(200);
  check('90 días', await p.evaluate(() => computeVaultReview('').recent.length), 3);
  await p.evaluate(() => { [...document.querySelectorAll('#view-revision details')].forEach((d) => (d.open = true)); });
  if (out) await p.screenshot({ path: `${out}/97-nuevas.png` });
  // Enlazar la nueva en el MOC de finanzas
  await p.selectOption('#view-revision details.rv-card:has-text("Notas nuevas") li:has-text("Nueva suelta") select', 'm2'); await p.waitForTimeout(200);
  check('enlace añadido en «Por ordenar»', await p.evaluate(() => noteById('m2').body), '- [[WACC]]\n\n## 📥 Por ordenar\n- [[Nueva suelta]]\n');
  check('ya está en un MOC', await p.evaluate(() => computeVaultReview('').noMoc.map((n) => n.id)), ['vi']);
  // Segunda en el mismo MOC: se añade debajo de la anterior
  await p.evaluate(() => rvLinkToMoc(noteById('vi'), noteById('m2')));
  check('segunda bajo la primera', await p.evaluate(() => noteById('m2').body), '- [[WACC]]\n\n## 📥 Por ordenar\n- [[Nueva suelta]]\n- [[Vieja suelta]]\n');
  // En un MOC con otra sección después de «Por ordenar»
  await p.evaluate(() => { noteById('m1').body = '- [[PPM]]\n\n## 📥 Por ordenar\n- [[X]]\n\n## Final\ntexto\n'; rvLinkToMoc(noteById('vi'), noteById('m1')); });
  check('respeta la sección siguiente', await p.evaluate(() => noteById('m1').body), '- [[PPM]]\n\n## 📥 Por ordenar\n- [[X]]\n- [[Vieja suelta]]\n\n## Final\ntexto\n');
  await p.click('.toast-action:has-text("Deshacer")'); await p.waitForTimeout(150);
  check('deshacer', await p.evaluate(() => noteById('m1').body.includes('Vieja suelta')), false);
  check('informe', await p.evaluate(() => { const md = rvMarkdown(computeVaultReview('')); return [md.includes('## Notas nuevas'), md.includes('## Fuera de los MOCs')]; }), [true, true]);
  console.log('errors:', JSON.stringify(errs));
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
