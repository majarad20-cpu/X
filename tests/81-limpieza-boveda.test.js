const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const out = process.argv[3];
(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const check = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${label}: ${JSON.stringify(got)}${ok ? ' ok' : ` ESPERADO ${JSON.stringify(want)}`}`); if (!ok) errs.push(label); };
  const c = await b.newContext({ viewport: { width: 1300, height: 1000 } });
  const M = 'Cerebro Digital X/00.- ATLAS/MATRIZ DE NOTAS';
  const N = (id, path, body) => ({ id, path, body, createdAt: 1, updatedAt: 1 });
  const notes = [
    N('st1', `${M}/Sin título 2`, ''), N('uk', `${M}/Untitled Kanban 1`, ''), N('d5', '2026-10-05 2', ''), N('png', 'BALANCE 8 COLUMNAS.png', ''),
    N('tor', 'Recetas/Tortilla de patatas', '---\nraciones: 4\n---\n'), N('f29', `${M}/FORMULARIO 29`, '---\nestado: pendiente\n---\n'),
    N('bv', 'Bienvenida', 'Hola, bienvenido'), N('bv2', 'Bienvenida 2', 'Hola, bienvenido'),
    N('ma1', 'MATRIZ DE NOTAS/MARCO AURELIO', 'Emperador [[Bienvenida]]'), N('ma2', `${M}/MARCO AURELIO`, 'Emperador [[Bienvenida]]'),
    N('cf1', 'El Café', 'mi café'), N('cf2', `${M}/EL CAFÉ`, 'otro texto del café'),
    N('c1', 'Ensayos/Capítulo 1', 'uno'), N('c2', 'Ensayos/Capítulo 2', 'dos'),
    N('e1', `${M}/IVA`, '---\nestado: completo\ntipo: concepto\n---\nIVA'), N('e2', `${M}/PPM`, '---\nestado: en proceso\n---\nPPM'), N('e3', `${M}/Idea X`, '---\nestado: idea\n---\nx'), N('e4', `${M}/Fus`, '---\nestado: fusionada\n---\nf'),
    N('lib', 'Biblioteca/Rayuela', '---\nestado: Leído\n---\n'),
    N('cp', 'Cerebro Digital X/30.- RECURSOS TECNICOS/ADJUNTOS/copilot/copilot-conversation/hola@20260611', 'hola'),
  ];
  await c.addInitScript((notes) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify({ tasks: [], habits: [], settings: { notesWelcome: true }, notes, updatedAt: 1 })); }, notes);
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.goto(url); await p.waitForTimeout(800);
  await p.evaluate(() => showView('revision')); await p.waitForTimeout(300);
  const plan = await p.evaluate(() => { const pl = lzPlan(rv.report); const ids = (l) => l.map((n) => n.id).sort(); return { junk: ids(pl.junk), samples: ids(pl.samples), skeletons: ids(pl.skeletons), same: pl.dupSame.map((x) => `${x.n.id}>${x.keep.id}`).sort(), diff: pl.dupDiff.map((x) => `${x.n.id}>${x.keep.id}`).sort(), states: [...pl.states].map(([k, l]) => [k, l.length]).sort(), system: ids(pl.system) }; });
  check('basura', plan.junk, ['d5', 'png', 'st1', 'uk']);
  check('ejemplos', plan.samples, ['tor']);
  check('esqueletos y entradas con datos se quedan', plan.skeletons, ['f29', 'lib']);
  check('duplicados iguales', plan.same, ['bv2>bv', 'ma1>ma2']);
  check('duplicados distintos', plan.diff, ['cf1>cf2']);
  check('estados (sin los de Bases)', plan.states, [['completo', 1], ['en proceso', 1], ['fusionada', 1], ['idea', 1]]);
  check('sistema', plan.system, ['cp']);
  if (out) await p.screenshot({ path: `${out}/81-limpieza.png` });
  // 1. Vacías a la papelera
  await p.click('.lz-card .lz-step:nth-of-type(1) button:has-text("Mover a la papelera")'); await p.click('#pomo-alert button:has-text("Sí, a la papelera")'); await p.waitForTimeout(200);
  check('vacías borradas', await p.evaluate(() => ['st1', 'uk', 'd5', 'png', 'tor', 'f29'].map((id) => !!noteById(id))), [false, false, false, false, false, true]);
  check('en la papelera', await p.evaluate(() => trashList().filter((t) => ['st1', 'tor'].includes(t.id)).length), 2);
  // 2. Duplicados: solo los iguales vienen marcados
  await p.evaluate(() => { document.querySelectorAll('.lz-step').forEach((d) => (d.open = true)); });
  await p.click('.lz-step:has-text("Duplicados") button:has-text("Mover a la papelera las copias")'); await p.click('#pomo-alert button:has-text("Sí, a la papelera")'); await p.waitForTimeout(200);
  check('copias iguales borradas, distintas no', await p.evaluate(() => ['bv', 'bv2', 'ma1', 'ma2', 'cf1', 'cf2', 'c1', 'c2'].map((id) => !!noteById(id))), [true, false, false, true, true, true, true, true]);
  // 3. Estados
  await p.evaluate(() => { document.querySelectorAll('.lz-step').forEach((d) => (d.open = true)); });
  await p.click('.lz-step:has-text("Unificar estados") button:has-text("Aplicar")'); await p.click('#pomo-alert button:has-text("Sí, aplicar")'); await p.waitForTimeout(200);
  check('estados unificados', await p.evaluate(() => ['e1', 'e2', 'e3', 'e4', 'lib'].map((id) => propOf(noteById(id), 'estado'))), ['revisada', 'borrador', 'pendiente', 'fusionada', 'Leído']);
  check('resto del texto intacto', await p.evaluate(() => noteById('e1').body), '---\nestado: revisada\ntipo: concepto\n---\nIVA');
  await p.click('.toast-action:has-text("Deshacer")'); await p.waitForTimeout(150);
  check('deshacer estados', await p.evaluate(() => propOf(noteById('e1'), 'estado')), 'completo');
  // 4. Copilot fuera
  await p.evaluate(() => { document.querySelectorAll('.lz-step').forEach((d) => (d.open = true)); });
  await p.click('.lz-step:has-text("Copilot") button:has-text("Sacar de Enfoque")'); await p.click('#pomo-alert button:has-text("Sí, sacarlas")'); await p.waitForTimeout(200);
  check('copilot sacado', await p.evaluate(() => [!!noteById('cp'), state.settings.vaultExcluded.some((x) => x.id === 'cp')]), [false, true]);
  console.log('errors:', JSON.stringify(errs));
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
