const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const out = process.argv[3];
(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const check = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${label}: ${JSON.stringify(got)}${ok ? ' ok' : ` ESPERADO ${JSON.stringify(want)}`}`); if (!ok) errs.push(label); };
  const c = await b.newContext({ viewport: { width: 1300, height: 900 } });
  const A = 'Cerebro Digital X/00.- ATLAS';
  const N = (id, path, body) => ({ id, path, body, createdAt: 1, updatedAt: 1 });
  const notes = [
    N('m1', `${A}/MOCS/7.- MOC - CONTABILIDAD Y AUDITORÍA`, '# Contabilidad\n- [[IVA]]\n- [[PPM]]\n- [[Régimen 14 D3]]\n- [[Balance general|Balance]]\n- ![[logo.png]]'),
    N('m2', `${A}/MOCS/5.- MOC - FINANZAS`, '- [[WACC]]\n- [[CAPM]]'),
    N('i', `${A}/MATRIZ DE NOTAS/IVA`, '---\ntipo: concepto\nestado: revisada\n---\nEl IVA… [[PPM]]'),
    N('p', `${A}/MATRIZ DE NOTAS/PPM`, '---\nestado: borrador\n---\nPagos provisionales [[IVA]]'),
    N('w', `${A}/MATRIZ DE NOTAS/WACC`, 'Costo de capital sin propiedades'),
    N('v', `${A}/MATRIZ DE NOTAS/Vacía`, '# Vacía\n'),
    N('d1', `${A}/MATRIZ DE NOTAS/Ataraxia`, 'uno'),
    N('d2', 'ESTOICISMO/Ataraxia', 'dos [[Séneca]]'),
    N('c', `${A}/MATRIZ DE NOTAS/IVA (desde Drive)`, 'copia'),
    N('h', 'KNOWLEDGE/Libro enorme', 'x '.repeat(130000)),
    N('dia', 'Diario/2026-10-21', 'hoy'),
  ];
  await c.addInitScript((notes) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify({ tasks: [], habits: [], settings: { notesWelcome: true }, notes, updatedAt: 1 })); }, notes);
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.goto(url); await p.waitForTimeout(800);
  // Desde el menú «Más»
  await p.click('.prodbar [data-group="more"] .tb-head'); await p.click('.prodbar [data-group="more"] .tb-menu .rib:has-text("Revisar la bóveda")'); await p.waitForTimeout(300);
  check('vista abierta', await p.evaluate(() => [activeTab().view, !!document.querySelector('#view-revision.active .rv-stats')]), ['revision', true]);
  const r = await p.evaluate(() => { const r = computeVaultReview(''); return { total: r.total, mocs: r.mocs.map((m) => [m.done, m.total, m.pending]), empty: r.empty.map((n) => n.id), huge: r.huge.map((n) => n.id), dupes: r.dupes.map((l) => l.map((n) => n.id)), conflicts: r.conflicts.map((n) => n.id), ghosts: r.ghostList.map((g) => g.name).sort(), estados: [...r.estados], sinEstado: [...r.sinEstado.keys()].sort() }; });
  check('MOCs', r.mocs, [[1, 2, ['CAPM']], [2, 4, ['Régimen 14 D3', 'Balance general']]]);
  check('vacías / enormes / repetidos / conflicto', [r.empty, r.huge, r.dupes, r.conflicts], [['v'], ['h'], [['d1', 'd2']], ['c']]);
  check('enlaces rotos (sin adjuntos)', r.ghosts, ['Balance general', 'CAPM', 'Régimen 14 D3', 'Séneca']);
  check('estados', r.estados, [['revisada', 1], ['borrador', 1]]);
  check('carpetas sin estado (sin las de la app)', r.sinEstado, ['Cerebro Digital X/00.- ATLAS/MATRIZ DE NOTAS', 'ESTOICISMO', 'KNOWLEDGE']);
  // Marcar como borrador las de la MATRIZ, con confirmación y deshacer
  await p.click('#view-revision details.rv-card:has-text("Estado de las notas") > summary').catch(() => {});
  await p.evaluate(() => { [...document.querySelectorAll('#view-revision details')].forEach((d) => (d.open = true)); });
  await p.click('#view-revision li:has-text("MATRIZ DE NOTAS ·") button'); await p.waitForTimeout(100);
  await p.click('#pomo-alert button:has-text("Sí, marcar")'); await p.waitForTimeout(200);
  check('borrador añadido', await p.evaluate(() => ['w', 'v', 'd1', 'c', 'i'].map((id) => String(propOf(noteById(id), 'estado')))), ['borrador', 'borrador', 'borrador', 'borrador', 'revisada']);
  check('texto intacto', await p.evaluate(() => noteById('w').body), '---\nestado: borrador\n---\nCosto de capital sin propiedades');
  await p.click('.toast-action:has-text("Deshacer")'); await p.waitForTimeout(150);
  check('deshacer', await p.evaluate(() => noteById('w').body), 'Costo de capital sin propiedades');
  // Crear una nota pendiente desde un MOC
  await p.evaluate(() => { [...document.querySelectorAll('#view-revision details')].forEach((d) => (d.open = true)); });
  if (out) await p.screenshot({ path: `${out}/80-revision.png`, fullPage: false });
  await p.click('#view-revision .rv-moc a.rv-ghost:has-text("CAPM")'); await p.waitForTimeout(200);
  check('nota pendiente creada', await p.evaluate(() => !!findNoteByName('CAPM')), true);
  // Informe como nota
  await p.evaluate(() => showView('revision')); await p.waitForTimeout(200);
  await p.click('#view-revision button:has-text("Guardar el informe")'); await p.waitForTimeout(200);
  check('informe guardado', await p.evaluate(() => { const n = state.notes.find((x) => x.path.startsWith('🩺 Revisión de la bóveda')); return n && [/\| \[\[.*CONTABILIDAD.*\]\] \| 4 \| 2 \| 2 \| 50 % \|/.test(n.body), n.body.includes('- [ ] [[Régimen 14 D3]]'), n.body.includes('Libro enorme')]; }), [true, true, true]);
  // Sacar las enormes de Enfoque (sin bóveda en Drive: van a la papelera)
  await p.evaluate(() => { showView('revision'); [...document.querySelectorAll('#view-revision details')].forEach((d) => (d.open = true)); }); await p.waitForTimeout(200);
  await p.click('#view-revision button:has-text("Sacar de Enfoque estas 1 notas")'); await p.waitForTimeout(100);
  await p.click('#pomo-alert button:has-text("Sí, sacarlas")'); await p.waitForTimeout(200);
  check('libro sacado', await p.evaluate(() => [!!noteById('h'), trashList().some((t) => t.id === 'h'), state.settings.vaultExcluded.map((x) => x.path)]), [false, true, ['KNOWLEDGE/Libro enorme']]);
  check('lista de excluidas', await p.evaluate(() => { [...document.querySelectorAll('#view-revision details')].forEach((d) => (d.open = true)); return [...document.querySelectorAll('#view-revision details.rv-card')].find((d) => /Solo en Drive/.test(d.textContent)).querySelector('select').value; }), '200');
  // Ámbito: una carpeta
  check('por carpeta', await p.evaluate(() => computeVaultReview('ESTOICISMO').total), 1);
  console.log('errors:', JSON.stringify(errs));
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
