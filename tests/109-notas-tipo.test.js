const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const out = process.argv[3];
const N = (id, path, body) => ({ id, path, body, createdAt: 1, updatedAt: 1 });
const notes = [
  N('m1', '00.- ATLAS/MOCS/1.- MOC - CONTABILIDAD', '---\ntipo: MOC\n---\n# MOC\n\n### Contabilidad Básica\n- [[Partida Doble]]\n- ✍️ Mis ensayos: [[ENSAYO CONTABILIDAD]]\n\n## Otra\n- x\n'),
  N('m2', '00.- ATLAS/MOCS/2.- MOC - ADMINISTRACIÓN', '# MOC Administración\n\n## Planificación\n- [[Planificación Estratégica]]\n'),
  N('pd', '00.- ATLAS/MATRIZ DE NOTAS/Partida Doble', '# Partida Doble\n'),
];
(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const check = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${label}: ${JSON.stringify(got)}${ok ? ' ok' : ` ESPERADO ${JSON.stringify(want)}`}`); if (!ok) errs.push(label); };
  const c = await b.newContext({ viewport: { width: 1400, height: 900 } });
  await c.addInitScript((notes) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify({ tasks: [], habits: [], settings: { notesWelcome: true }, notes, updatedAt: 1 })); }, notes);
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.goto(url); await p.waitForTimeout(1000);

  check('botón ✍️ junto a ＋', await p.evaluate(() => document.querySelector('#new-note + #new-essay')?.title), 'Nuevo ensayo (Alt+Mayús+E)');

  // Ensayo: MATRIZ, propiedades, prefijo y enlace en la línea «✍️ Mis ensayos».
  const essay = await p.evaluate(() => {
    const n = ntCreate('ensayo', 'La contabilidad: lenguaje de los negocios', noteById('m1'), { open: false });
    return [n.path, propOf(n, 'tipo'), propOf(n, 'estado'), /moc: "\[\[1\.- MOC - CONTABILIDAD\]\]"/.test(n.body), /^area:/m.test(n.body), /## Desarrollo/.test(n.body), noteById('m1').body.match(/^- ✍️ Mis ensayos:.*$/m)[0]];
  });
  check('ensayo', essay, ['00.- ATLAS/MATRIZ DE NOTAS/ENSAYO.- La contabilidad - lenguaje de los negocios', 'ensayo', 'borrador', true, false, true, '- ✍️ Mis ensayos: [[ENSAYO CONTABILIDAD]] · [[ENSAYO.- La contabilidad - lenguaje de los negocios]]']);

  // Ensayo en un MOC sin la línea: crea la sección.
  check('sección nueva', await p.evaluate(() => { ntCreate('ensayo', 'Planificar en una pyme', noteById('m2'), { open: false }); return /## ✍️ Mis ensayos\n- \[\[ENSAYO\.- Planificar en una pyme\]\]\n$/.test(noteById('m2').body); }), true);

  // Normativa: área desde el MOC, vigencia y enlace bajo «📥 Por ordenar».
  const norm = await p.evaluate(() => {
    const n = ntCreate('normativa', 'Ley 21.608', noteById('m2'), { open: false });
    return [propOf(n, 'tipo'), propOf(n, 'area'), /^vigencia: "Revisado [a-z]{3}-\d{4}"$/m.test(n.body), /> \[!info\] Historial y vigencia/.test(n.body), /## 📥 Por ordenar\n- \[\[Ley 21\.608\]\]\n$/.test(noteById('m2').body)];
  });
  check('normativa', norm, ['normativa', 'administración', true, true, true]);
  check('sin MOC', await p.evaluate(() => { const n = ntCreate('concepto', 'Devengo', null, { open: false }); return [propOf(n, 'tipo'), /^moc:/m.test(n.body), propOf(n, 'vigencia')]; }), ['concepto', false, 'Permanente']);

  // Deshacer quita la nota y el enlace del MOC.
  check('deshacer', await p.evaluate(() => { const before = noteById('m1').body; const n = ntCreate('caso', 'Cierre anual', noteById('m1'), { open: false }); const linked = noteById('m1').body.includes('[[Cierre anual]]'); document.querySelector('#toast .toast-action').click(); return [linked, !noteById(n.id), noteById('m1').body === before]; }), [true, true, true]);

  // Selector paso a paso: tipo → título → MOC.
  await p.keyboard.press('Alt+Shift+N'); await p.waitForTimeout(150);
  check('selector de tipos', await p.evaluate(() => [...document.querySelectorAll('#picker-list .pk-label')].map((x) => x.textContent).slice(0, 8)), ['✍️ Ensayo (de mi autoría)', '💡 Concepto', '⚖️ Normativa', '🛠️ Procedimiento', '🧰 Herramienta', '🧮 Caso práctico', '✅ Checklist', '📄 Nota en blanco']);
  await p.keyboard.press('Escape');
  await p.keyboard.press('Alt+Shift+E'); await p.waitForTimeout(150);
  await p.keyboard.type('Ética del contador'); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
  check('MOC sugerido primero', await p.evaluate(() => document.querySelector('#picker-list .pk-label')?.textContent), '🧭 1.- MOC - CONTABILIDAD');
  await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  check('abierto para escribir', await p.evaluate(() => { const n = findNoteByName('ENSAYO.- Ética del contador'); return [!!n, activeNote()?.id === n?.id, !document.querySelector('#note-editor').hidden, noteById('m1').body.includes('[[ENSAYO.- Ética del contador]]')]; }), [true, true, true, true]);
  if (out) await p.screenshot({ path: `${out}/109-notas-tipo.png` });

  // Predeterminado: el botón ＋ pregunta el tipo.
  const blank = await p.evaluate(() => { const n = state.notes.length; document.querySelector('#new-note').click(); return state.notes.length - n; });
  await p.waitForTimeout(150);
  check('＋ normal crea en blanco', blank, 1);
  await p.evaluate(() => ntToggleDefault());
  await p.evaluate(() => document.querySelector('#new-note').click()); await p.waitForTimeout(150);
  check('＋ predeterminado abre el selector', await p.evaluate(() => [!document.querySelector('#picker').hidden, document.querySelector('#picker-input').placeholder, document.querySelector('#new-note').title]), [true, 'Tipo de nota…', 'Nueva nota por tipo (Ctrl+N) · clic derecho: nota en blanco']);
  await p.keyboard.press('Escape');
  check('comandos en la paleta', await p.evaluate(() => COMMANDS_EXTRA.flatMap((f) => f(null) || []).map((c) => c.label).filter((l) => /^(✍️|📝|⭐)/.test(l))), ['✍️ Nuevo ensayo (de mi autoría)', '📝 Nueva nota por tipo…', '⭐ Botón ＋ y Ctrl+N: volver a nota en blanco']);

  // Menú «＋ Nuevo» de la barra superior.
  await p.evaluate(() => ntToggleDefault());
  await p.locator('.tb-dd[data-group=new] .tb-head').click(); await p.waitForTimeout(150);
  check('menú Nuevo', await p.evaluate(() => [...document.querySelectorAll('.tb-dd[data-group=new] .tb-menu button')].slice(0, 4).map((b) => b.textContent)), ['📄 Nota en blanco', '✍️ Ensayo…', '🗂️ Nota por tipo…', '✅ Tarea…']);
  await p.locator('.tb-dd[data-group=new] .tb-menu button', { hasText: 'Ensayo' }).click(); await p.waitForTimeout(150);
  check('Nuevo › Ensayo pide el título', await p.evaluate(() => [!document.querySelector('#picker').hidden, document.querySelector('#picker-input').placeholder]), [true, 'Título del ensayo…']);
  await p.keyboard.press('Escape');

  console.log('errors:', JSON.stringify(errs));
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
