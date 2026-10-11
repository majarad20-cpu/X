const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const now = new Date('2026-10-11T10:00:00').getTime();
const seed = { tasks: [], habits: [], settings: { notesWelcome: true }, notes: [], updatedAt: 1 };
(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const check = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${label}: ${JSON.stringify(got)}${ok ? ' ok' : ` ESPERADO ${JSON.stringify(want)}`}`); if (!ok) errs.push(label); };
  const c = await b.newContext({ viewport: { width: 1300, height: 860 } });
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, seed);
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.clock.install({ time: new Date(now) });
  await p.goto(url); await p.clock.runFor(800);
  check('sin brújula, Hoy sin tarjeta', await p.evaluate(() => document.getElementById('today-compass').hidden), true);
  // Botón del menú lateral: crea la nota con la plantilla y la abre
  await p.click('[data-group=plan] .tb-head'); await p.click('#rib-compass'); await p.clock.runFor(100);
  const info = await p.evaluate(() => { const n = compassNote(); return [n.path, activeTab().id === n.id, state.settings.compassId === n.id, /## 💎 Valores/.test(n.body)]; });
  check('nota creada y abierta', info, ['Mi brújula', true, true, true]);
  check('plantilla vacía: sin frases', await p.evaluate(() => compassItems().length), 0);
  // Segunda vez: no crea otra
  await p.evaluate(() => { showView('today'); openCompass(); }); await p.clock.runFor(50);
  check('una sola nota', await p.evaluate(() => state.notes.filter((n) => n.path === 'Mi brújula').length), 1);
  // Rellenarla
  await p.evaluate(() => {
    const n = compassNote();
    n.body = n.body
      .replace('## 💎 Valores\n-', '## 💎 Valores\n- Honestidad\n- **Familia** primero')
      .replace('## 🙋 Quién soy\n-', '## 🙋 Quién soy\n- Alguien curioso')
      .replace('### A 10 años\n-', '### A 10 años\n- Casa propia')
      .replace('### Este año\n-', '### Este año\n- Correr una media maratón');
    save(); renderAll();
  });
  const items = await p.evaluate(() => compassItems().map((i) => `${i.label}|${i.text}`));
  check('frases', items, ['💎 Valor|Honestidad', '💎 Valor|Familia primero', '🗺️ Objetivo del año|Correr una media maratón']);
  await p.evaluate(() => showView('today')); await p.clock.runFor(50);
  const card = await p.evaluate(() => { const b = document.getElementById('today-compass'); return [b.hidden, b.querySelector('.compass-text')?.textContent]; });
  check('tarjeta en Hoy', card[0] === false && ['Honestidad', 'Familia primero', 'Correr una media maratón'].includes(card[1]), true);
  check('misma frase todo el día', await p.evaluate(() => compassOfDay('2026-10-11').text === compassOfDay('2026-10-11').text), true);
  // Ocultar y volver a mostrar
  await p.click('#today-compass .compass-actions .link:nth-child(2)'); await p.clock.runFor(50);
  check('oculta', await p.evaluate(() => [document.getElementById('today-compass').hidden, state.settings.compassToday]), [true, false]);
  await p.evaluate(() => { state.settings.compassToday = true; renderAll(); }); await p.clock.runFor(50);
  check('visible otra vez', await p.evaluate(() => document.getElementById('today-compass').hidden), false);
  // Revisión semanal: la pregunta y su sección en la nota
  await p.evaluate(() => { showView('review'); review.step = REVIEW_STEPS.length - 1; renderReviewStep(); }); await p.clock.runFor(50);
  const q = await p.evaluate(() => [!!document.querySelector('#view-review textarea[aria-label^="🧭"]'), [...document.querySelectorAll('.compass-goals li')].map((x) => x.textContent)]);
  check('pregunta en la revisión', q, [true, ['Correr una media maratón']]);
  await p.fill('#view-review textarea[aria-label^="🧭"]', 'Sí, entrené 3 días');
  await p.evaluate(() => finishReview()); await p.clock.runFor(50);
  check('sección en la nota', await p.evaluate(() => state.notes.some((n) => n.path.startsWith('Revisiones/') && n.body.includes('## 🧭 ¿Fue en la dirección de mi brújula?\nSí, entrené 3 días'))), true);
  // Nota protegida bloqueada: sin tarjeta y sin errores
  await p.evaluate(() => { const n = compassNote(); n.enc = { x: 1 }; showView('today'); renderAll(); }); await p.clock.runFor(50);
  check('protegida: sin tarjeta', await p.evaluate(() => document.getElementById('today-compass').hidden), true);
  console.log('errors:', errs); await b.close();
})();
