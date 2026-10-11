const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const now = new Date('2026-10-11T10:00:00').getTime();
const daily = (date, text, mood) => ({ id: `d${date}`, path: `Diario/${date}`, body: `${mood ? `---\nanimo: ${mood}\n---\n` : ''}# ${date}\n\n## ✍️ Diario\n### Libre · 21:00\n${text}`, createdAt: now, updatedAt: now });
const seed = {
  tasks: [], habits: [], settings: { notesWelcome: true },
  notes: [
    daily('2025-10-11', 'Empecé a aprender guitarra hoy.', '😄'),
    daily('2024-10-11', 'Mudanza al piso nuevo.', null),
    daily('2026-10-10', 'Ayer tranquilo.', '🙂'),
    daily('2026-10-09', 'Día duro.', '😕'),
    daily('2026-10-08', 'Bien.', '🙂'),
  ],
  journal: [], updatedAt: 1,
};
(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const check = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${label}: ${JSON.stringify(got)}${ok ? ' ok' : ` ESPERADO ${JSON.stringify(want)}`}`); if (!ok) errs.push(label); };
  const c = await b.newContext({ viewport: { width: 1300, height: 900 } });
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, seed);
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.clock.install({ time: new Date(now) });
  await p.goto(url); await p.clock.runFor(800);
  // 3. Tal día como hoy (en Hoy y en el Diario)
  const otd = await p.evaluate(() => onThisDay().map((x) => [x.years, x.text, x.mood?.e || null]));
  check('tal día como hoy', otd, [[1, 'Empecé a aprender guitarra hoy.', '😄'], [2, 'Mudanza al piso nuevo.', null]]);
  check('tarjeta en Hoy', await p.evaluate(() => [document.getElementById('today-onthisday').hidden, document.querySelectorAll('#today-onthisday .otd-item').length]), [false, 2]);
  await p.click('#today-onthisday .otd-item .link'); await p.clock.runFor(50);
  check('abrir la nota de hace un año', await p.evaluate(() => noteById(activeTab().id)?.path), 'Diario/2025-10-11');
  // 2. Ánimo y constancia
  await p.evaluate(() => showView('journal')); await p.clock.runFor(100);
  const stats = await p.$$eval('#journal-insights .ji-stat strong', (n) => n.map((x) => x.textContent));
  check('racha, mejor racha, días del último año', stats, ['3', '3', '3']);
  check('gráfico de ánimo: una semana, un punto', await p.evaluate(() => [!!document.querySelector('#journal-insights .mood-chart'), document.querySelectorAll('#journal-insights .mc-dot').length]), [true, 1]);
  check('mapa del año', await p.evaluate(() => [document.querySelectorAll('.year-heatmap rect').length >= 365, document.querySelectorAll('.year-heatmap rect.has-mood').length]), [true, 4]);
  // 1. Pregunta del día
  await p.click('[data-jkind=question]'); await p.clock.runFor(50);
  const q1 = await p.textContent('#journal-fields .prompt span');
  check('pregunta del día', DAY_Q(q1), true);
  await p.click('#journal-hint .link'); await p.clock.runFor(50);
  const q2 = await p.textContent('#journal-fields .prompt span');
  check('otra pregunta', q1 !== q2 && DAY_Q(q2), true);
  await p.fill('#journal-fields textarea', 'Aprendí a decir que no.');
  await p.click('#journal-form button[type=submit]'); await p.clock.runFor(100);
  check('guardada en la nota diaria', await p.evaluate((q) => { const n = state.notes.find((x) => x.path === 'Diario/2026-10-11'); return !!n && n.body.includes('### Pregunta del día') && n.body.includes(`**${q}** Aprendí a decir que no.`); }, q2), true);
  check('racha sube', await p.$eval('#journal-insights .ji-stat strong', (x) => x.textContent), '4');
  // 9. Plantillas para pensar: en «/» e «Insertar…» y como nota nueva desde el menú Pensar
  check('plantillas en el menú /', await p.evaluate(() => SLASH_ITEMS.filter((it) => it.group === '🧠 Plantillas para pensar').length >= 20), true);
  await p.click('[data-group=write] .tb-head'); await p.click('#rib-think'); await p.clock.runFor(50);
  await p.keyboard.type('5 porq'); await p.keyboard.press('Enter'); await p.clock.runFor(100);
  const made = await p.evaluate(() => { const n = noteById(activeTab().id); const ta = document.getElementById('note-editor'); return [n.path.startsWith('Pensar/5 porqués'), n.body.includes('**Causa raíz:**'), n.body.includes('‸'), ta.value.slice(0, ta.selectionStart).endsWith('**Problema:** ')]; });
  check('nota con la plantilla', made, [true, true, false, true]);
  console.log('errors:', errs); await b.close();
  function DAY_Q(q) { return typeof q === 'string' && q.startsWith('¿') && q.endsWith('?'); }
})();
