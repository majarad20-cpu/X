const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const now = new Date('2026-10-11T10:00:00').getTime();
const seed = {
  tasks: [
    { id: 't1', title: 'Para hoy', priority: 2, due: '2026-10-11', done: false, createdAt: now, tags: [] },
    { id: 't2', title: 'Vencida', priority: 2, due: '2026-10-09', done: false, createdAt: now, tags: [] },
  ],
  habits: [{ id: 'h1', name: 'Leer', log: { '2026-10-11': true }, createdAt: now }, { id: 'h2', name: 'Correr', log: {}, createdAt: now }],
  settings: { notesWelcome: true }, notes: [], updatedAt: 1,
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
  await p.clock.install({ time: new Date(now) });
  await p.goto(url); await p.clock.runFor(800);
  const views = (sel) => p.$$eval(sel, (n) => n.map((x) => x.dataset.view || x.id));
  check('izquierda: solo notas', await views('.ribbon .rib'), ['rib-files', 'rib-daily', 'rib-weekly', 'rib-monthly', 'rib-random', 'rib-bookmarks', 'rib-switcher', 'rib-graph', 'canvas', 'bases']);
  check('escribir y pensar', await views('[data-group=write] .tb-menu .rib'), ['journal', 'ideas', 'ask', 'rib-think']);
  check('planificar', await views('[data-group=plan] .tb-menu .rib'), ['rib-compass', 'tasks', 'projects', 'inbox', 'review', 'plan']);
  check('seguimiento', await views('[data-group=focus] .tb-menu .rib'), ['timer', 'habits', 'progress', 'finanzas']);
  check('más', await views('[data-group=more] .tb-menu .rib'), ['rib-revision', 'shared', 'rib-palette', 'trash']);
  // Contadores
  check('Hoy: 2 con vencidas', await p.evaluate(() => { const x = document.querySelector('.tb-today .tb-badge'); return [x.hidden, x.textContent, x.classList.contains('alert')]; }), [false, '2', true]);
  check('hábitos 1/2', await p.textContent('.rib[data-view=habits] .tb-count'), '1/2');
  check('punto en Planificar', await p.isHidden('[data-group=plan] .tb-dot'), false);
  // Abrir, elegir, cerrar
  await p.click('[data-group=focus] .tb-head');
  check('menú abierto', await p.evaluate(() => [!document.querySelector('[data-group=focus] .tb-menu').hidden, document.querySelector('[data-group=focus] .tb-head').ariaExpanded]), [true, 'true']);
  await p.click('.rib[data-view=habits]'); await p.clock.runFor(50);
  check('abre Hábitos y cierra', await p.evaluate(() => [activeTab().view, document.querySelector('[data-group=focus] .tb-menu').hidden]), ['habits', true]);
  check('Seguimiento marcado', await p.evaluate(() => document.querySelector('[data-group=focus] .tb-head').classList.contains('has-active')), true);
  // Solo uno abierto; clic fuera y Escape cierran
  await p.click('[data-group=plan] .tb-head'); await p.click('[data-group=more] .tb-head');
  check('solo uno abierto', await p.$$eval('.tb-menu', (n) => n.filter((x) => !x.hidden).length), 1);
  await p.mouse.click(700, 500);
  check('clic fuera cierra', await p.$$eval('.tb-menu', (n) => n.filter((x) => !x.hidden).length), 0);
  await p.focus('[data-group=plan] .tb-head'); await p.keyboard.press('ArrowDown');
  check('teclado: foco en el primero', await p.evaluate(() => document.activeElement.id), 'rib-compass');
  await p.keyboard.press('ArrowDown');
  check('flecha abajo', await p.evaluate(() => document.activeElement.dataset.view), 'tasks');
  await p.keyboard.press('Escape');
  check('Escape cierra', await p.evaluate(() => [document.querySelector('[data-group=plan] .tb-menu').hidden, document.activeElement.classList.contains('tb-head')]), [true, true]);
  // ＋ Nuevo
  await p.click('[data-group=new] .tb-head');
  const items = await p.$$eval('[data-group=new] .tb-item', (n) => n.map((x) => x.textContent));
  check('nuevo: opciones', ['📝 Nota', '✅ Tarea…', '💡 Idea…', '💰 Gasto…', '🔥 Hábito…', '📁 Proyecto…', '📓 Nota diaria'].every((x) => items.includes(x)), true);
  await p.click('[data-group=new] .tb-item:has-text("Nota")'); await p.clock.runFor(50);
  check('nueva nota', await p.evaluate(() => activeTab().type === 'note' && state.notes.length), 1);
  await p.click('[data-group=new] .tb-head'); await p.click('.tb-item:has-text("Proyecto")'); await p.clock.runFor(80);
  check('nuevo proyecto: foco', await p.evaluate(() => [activeTab().view, document.activeElement.id]), ['projects', 'project-name']);
  // Pomodoro en marcha
  check('sin pomodoro', await p.isHidden('#tb-pomo'), true);
  await p.evaluate(() => { showView('timer'); startTimer(); }); await p.clock.runFor(2100);
  check('pomodoro visible', await p.evaluate(() => [document.getElementById('tb-pomo').hidden, /^🍅 \d+:\d\d$/.test(document.getElementById('tb-pomo').textContent)]), [false, true]);
  // Pantalla de móvil: barra sin desbordar la página
  await p.setViewportSize({ width: 390, height: 800 }); await p.clock.runFor(100);
  check('móvil: sin scroll horizontal', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await p.click('[data-group=plan] .tb-head');
  check('móvil: menú dentro de pantalla', await p.evaluate(() => { const r = document.querySelector('[data-group=plan] .tb-menu').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }), true);
  console.log('errors:', errs); await b.close();
})();
