const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
// Lunes 12 de octubre de 2026 (semana 42)
const now = new Date('2026-10-12T10:00:00').getTime();
const seed = {
  tasks: [
    { id: 'a', title: 'Informe', priority: 3, due: '2026-10-13', time: '09:00', duration: 120, done: false, createdAt: now - 9e6, tags: [] },
    { id: 'b', title: 'Correo', priority: 2, due: null, done: false, createdAt: now - 8e6, tags: [] },
    { id: 'c', title: 'Vencida', priority: 2, due: '2026-10-05', done: false, createdAt: now - 7e6, tags: [] },
    { id: 'd', title: 'Baja', priority: 1, due: null, projectId: 'pr1', done: false, createdAt: now - 6e6, tags: [] },
    { id: 'e', title: 'Llenar', priority: 2, due: '2026-10-14', duration: 330, done: false, createdAt: now - 5e6, tags: [] },
    { id: 'f', title: 'Enorme', priority: 2, due: '2026-10-15', duration: 400, done: false, createdAt: now - 4e6, tags: [] },
  ],
  projects: [{ id: 'pr1', name: 'Web', color: 'blue', status: 'active', createdAt: now }],
  habits: [], settings: { notesWelcome: true },
  notes: [{ id: 'nt', path: 'Pendientes', body: '- [ ] Tarea de nota', createdAt: now, updatedAt: now }],
  updatedAt: 1,
};
(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const check = (label, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    console.log(`${label}:`, JSON.stringify(got), ok ? 'ok' : `ESPERADO ${JSON.stringify(want)}`);
    if (!ok) errs.push(`${label}: ${JSON.stringify(got)}`);
  };
  const open = async (opts) => {
    const c = await b.newContext(opts);
    await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, seed);
    await c.route(/fonts\.g/, (r) => r.abort());
    const p = await c.newPage();
    p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
    await p.clock.install({ time: new Date(now) });
    await p.goto(url); await p.clock.runFor(800);
    return { c, p };
  };
  const { p } = await open({ viewport: { width: 1900, height: 900 } });
  const tick = () => p.clock.runFor(100);
  const due = (id) => p.evaluate((i) => state.tasks.find((t) => t.id === i).due, id);
  const dayCards = (k) => p.$$eval(`#pw-days .pw-day[data-key="${k}"] .pw-card .pw-ctitle`, (n) => n.map((x) => x.textContent));
  const sideCards = () => p.$$eval('#pw-side-list .pw-card .pw-ctitle', (n) => n.map((x) => x.textContent));
  const drag = async (from, to, dx = 70) => {
    const s = await (await p.$(from)).boundingBox();
    const d = await (await p.$(to)).boundingBox();
    await p.mouse.move(s.x + dx, s.y + 8); await p.mouse.down();
    for (let i = 1; i <= 8; i++) await p.mouse.move(s.x + dx + (d.x + 30 - s.x - dx) * i / 8, s.y + 8 + (d.y + 40 - s.y - 8) * i / 8);
    await p.mouse.up(); await tick();
  };
  const menu = async (label) => { await p.click(`#note-menu .menu-item:has-text("${label}")`); await tick(); };

  // Abrir desde la barra y desde la paleta
  await p.click('.rib[data-view="plan"]'); await tick();
  check('barra abre la vista', await p.evaluate(() => [activeTab().view, $('#view-plan').classList.contains('active'), $('#pw-title').textContent]), ['plan', true, 'Semana 42 · 12–18 oct']);
  await p.evaluate(() => showView('today')); await tick();
  await p.evaluate(() => openPalette()); await p.keyboard.type('planificar la semana'); await p.keyboard.press('Enter'); await tick();
  check('paleta abre la vista', await p.evaluate(() => activeTab().view), 'plan');

  // Columnas, tareas y panel
  check('siete días', await p.$$eval('#pw-days .pw-day', (n) => n.map((x) => x.dataset.key)), ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']);
  check('martes', await dayCards('2026-10-13'), ['Informe']);
  check('tarjeta con hora y prioridad', await p.$eval('.pw-card[data-id="a"]', (c) => [c.classList.contains('p3'), c.querySelector('.pw-meta').textContent]), [true, '⏰ 09:00 · 2 h']);
  check('sin planificar', await sideCards(), ['Baja', 'Vencida', 'Correo', 'Tarea de nota']);
  check('vencida marcada', await p.$eval('#pw-side-list .pw-card[data-id="c"]', (c) => c.classList.contains('overdue')), true);
  check('agrupadas por proyecto', await p.$$eval('#pw-side-list .pw-group', (n) => n.map((x) => x.textContent)), ['📁 Web 1', 'Sin proyecto 3']);
  await p.fill('#pw-filter', 'corr'); await tick();
  check('filtro', await sideCards(), ['Correo']);
  await p.fill('#pw-filter', ''); await tick();
  await p.selectOption('#pw-sort', 'title'); await tick();
  check('orden por título', await sideCards(), ['Baja', 'Correo', 'Tarea de nota', 'Vencida']);
  await p.selectOption('#pw-sort', 'priority'); await tick();

  // Eventos de Google Calendar
  await p.evaluate(() => {
    cal.mcp = { callTool: async () => ({ payload: { events: [{ id: 'e1', summary: 'Dentista', start: { dateTime: '2026-10-13T16:00:00' }, end: { dateTime: '2026-10-13T17:00:00' } }] } }) };
    state.settings.calendar = true;
    renderPlanWeek();
  });
  await p.clock.runFor(300);
  check('evento en su día', await p.$$eval('.pw-day[data-key="2026-10-13"] .pw-ev', (n) => n.map((x) => x.textContent)), ['16:00 Dentista']);

  // Capacidad
  const loads = () => p.$$eval('#pw-days .pw-day', (n) => n.slice(0, 4).map((x) => `${x.querySelector('.pw-load-text').textContent}${x.classList.contains('warn') ? ' ámbar' : ''}${x.classList.contains('over') ? ' rojo' : ''}`));
  check('carga', await loads(), ['0 min / 6 h', '2 h / 6 h', '5 h 30 / 6 h ámbar', '6 h 40 / 6 h rojo']);
  await p.fill('#pw-cap', '8'); await p.press('#pw-cap', 'Enter'); await tick();
  check('capacidad 8 h', [await loads(), await p.evaluate(() => state.settings.planWeek.cap)], [['0 min / 8 h', '2 h / 8 h', '5 h 30 / 8 h', '6 h 40 / 8 h'], 480]);
  await p.fill('#pw-cap', '6'); await p.press('#pw-cap', 'Enter'); await tick();

  // Objetivos en la nota semanal
  await p.fill('#pw-goals [data-goal="new"]', 'Terminar informe'); await p.press('#pw-goals [data-goal="new"]', 'Enter'); await tick();
  await p.fill('#pw-goals [data-goal="new"]', 'Ir al gimnasio'); await p.press('#pw-goals [data-goal="new"]', 'Enter'); await tick();
  const weekly = () => p.evaluate(() => findNoteByName('Semanal/2026-W42')?.body.split('\n').filter((l) => /^- \[[ x]\]/.test(l)));
  check('objetivos en la nota', await weekly(), ['- [ ] Terminar informe', '- [ ] Ir al gimnasio']);
  check('sin abrir la nota', await p.evaluate(() => activeTab().view), 'plan');
  await p.fill('#pw-goals [data-goal="0"]', 'Terminar el informe'); await p.press('#pw-goals [data-goal="0"]', 'Enter'); await tick();
  check('editar objetivo', (await weekly())[0], '- [ ] Terminar el informe');
  await p.click('#pw-goals .pw-goal:nth-child(2) .pw-goal-due'); await tick();
  check('fecha del domingo', (await weekly())[1], '- [ ] Ir al gimnasio 📅 2026-10-18');
  check('en Tareas y en el domingo', [await p.evaluate(() => noteTasks().some((t) => t.title === 'Ir al gimnasio' && t.due === '2026-10-18')), await dayCards('2026-10-18')], [true, ['Ir al gimnasio']]);
  check('no van a «Sin planificar»', (await sideCards()).includes('Terminar el informe'), false);
  await p.click('#pw-goals .pw-goal:nth-child(1) input[type=checkbox]'); await tick();
  check('marcar objetivo', (await weekly())[0], '- [x] Terminar el informe ✅ 2026-10-12');
  await p.fill('#pw-goals [data-goal="0"]', 'Terminar todo el informe'); await p.press('#pw-goals [data-goal="0"]', 'Enter'); await tick();
  check('editar conserva ✅', (await weekly())[0], '- [x] Terminar todo el informe ✅ 2026-10-12');

  // «+» en un día
  await p.click('.pw-day[data-key="2026-10-12"] .pw-add'); await p.keyboard.type('Llamar a Ana'); await p.keyboard.press('Enter'); await tick();
  check('+ añade al día', [await p.evaluate(() => state.tasks.find((t) => t.title === 'Llamar a Ana')?.due), await dayCards('2026-10-12')], ['2026-10-12', ['Llamar a Ana']]);

  // Arrastrar con el ratón: del panel a un día, deshacer y de vuelta al panel
  await drag('#pw-side-list .pw-card[data-id="b"]', '.pw-day[data-key="2026-10-16"]');
  check('ratón: panel → viernes', [await due('b'), await dayCards('2026-10-16')], ['2026-10-16', ['Correo']]);
  await p.click('#toast .toast-action'); await tick();
  check('deshacer arrastre', await due('b'), null);
  await drag('#pw-side-list .pw-card[data-id="b"]', '.pw-day[data-key="2026-10-16"]');
  await drag('.pw-day[data-key="2026-10-16"] .pw-card[data-id="b"]', '.pw-day[data-key="2026-10-12"]');
  check('ratón: viernes → lunes', await due('b'), '2026-10-12');
  await drag('.pw-day[data-key="2026-10-12"] .pw-card[data-id="b"]', '#pw-side');
  check('ratón: día → panel', [await due('b'), (await sideCards()).includes('Correo')], [null, true]);

  // Tarea de una nota: arrastrar cambia su línea
  await drag('#pw-side-list .pw-card[data-id="n:nt:0"]', '.pw-day[data-key="2026-10-15"]');
  check('nota: línea con fecha', await p.evaluate(() => noteById('nt').body), '- [ ] Tarea de nota 📅 2026-10-15');
  await drag('.pw-day[data-key="2026-10-15"] .pw-card[data-id="n:nt:0"]', '#pw-side');
  check('nota: sin fecha', await p.evaluate(() => noteById('nt').body), '- [ ] Tarea de nota');

  // Menú «Mover a…»: clic derecho y ⋯
  await p.click('#pw-side-list .pw-card[data-id="d"] .pw-ctitle', { button: 'right' }); await tick();
  check('menú de la tarjeta', await p.$$eval('#note-menu .menu-item', (n) => n.map((x) => x.textContent)), ['✏️ Abrir', '✓ Marcar hecha', 'Mover a ▸', 'Prioridad ▸', 'Duración ▸', '🕒 Abrir agenda del día']);
  await menu('Mover a');
  check('submenú de días', await p.$$eval('#note-menu .menu-item', (n) => n.map((x) => x.textContent)), ['Lunes 12', 'Martes 13', 'Miércoles 14', 'Jueves 15', 'Viernes 16', 'Sábado 17', 'Domingo 18', '✓ Sin fecha']);
  await menu('Viernes 16');
  check('mover a viernes', await due('d'), '2026-10-16');
  await p.click('.pw-day[data-key="2026-10-16"] .pw-card[data-id="d"] .pw-more'); await tick();
  await menu('Prioridad'); await menu('Alta');
  check('prioridad', await p.evaluate(() => state.tasks.find((t) => t.id === 'd').priority), 3);
  await p.click('.pw-day[data-key="2026-10-16"] .pw-card[data-id="d"] .pw-more'); await tick();
  await menu('Mover a'); await menu('Sin fecha');
  check('mover a sin fecha', await due('d'), null);
  await p.click('#pw-side-list .pw-card[data-id="n:nt:0"] .pw-ctitle', { button: 'right' }); await tick();
  await menu('Mover a'); await menu('Martes 13');
  check('nota por menú', await p.evaluate(() => noteById('nt').body), '- [ ] Tarea de nota 📅 2026-10-13');
  await p.focus('.pw-day[data-key="2026-10-13"] .pw-card[data-id="n:nt:0"] .pw-handle'); await p.keyboard.press('ArrowRight'); await tick();
  check('flecha → día siguiente', await p.evaluate(() => noteById('nt').body), '- [ ] Tarea de nota 📅 2026-10-14');
  await p.evaluate(() => { const t = noteTasks().find((x) => x.noteId === 'nt'); pwSetDue(t, null); save(); renderAll(); });

  // Reparto automático: propuesta, aplicar y deshacer
  await p.evaluate(() => (state.tasks.find((t) => t.id === 'd').priority = 1));
  await p.click('#pw-auto'); await tick();
  const plan = await p.evaluate(() => pw.preview.plan.map((x) => `${x.t.title}>${x.key}`));
  check('propuesta', plan, ['Vencida>2026-10-16', 'Correo>2026-10-12', 'Tarea de nota>2026-10-16', 'Baja>2026-10-12']);
  check('vista previa', [await p.isVisible('#pw-preview'), await p.$$eval('#pw-days .pw-card.preview', (n) => n.length)], [true, 4]);
  await p.click('#pw-preview button:has-text("Aplicar")'); await tick();
  check('aplicado', [await due('b'), await due('c'), await due('d'), await p.evaluate(() => noteById('nt').body), await sideCards()], ['2026-10-12', '2026-10-16', '2026-10-12', '- [ ] Tarea de nota 📅 2026-10-16', []]);
  await p.click('#toast .toast-action'); await tick();
  check('deshacer reparto', [await due('b'), await due('c'), await due('d'), await p.evaluate(() => noteById('nt').body)], [null, '2026-10-05', null, '- [ ] Tarea de nota']);
  // Sin pasar de la capacidad y saltando los días libres
  await p.evaluate(() => { for (let i = 0; i < 30; i++) state.tasks.push({ id: `x${i}`, title: `Extra ${i}`, priority: 2, due: null, duration: 60, done: false, createdAt: Date.now() + i, tags: [] }); save(); renderAll(); });
  await p.click('#pw-auto'); await tick();
  const sums = await p.evaluate(() => {
    const keys = pwKeys();
    const items = pwDayItems(keys);
    return keys.map((k) => items.get(k).filter((x) => !x.t.done).reduce((n, x) => n + pwDur(x.t), 0) + pw.preview.plan.filter((x) => x.key === k).reduce((n, x) => n + pwDur(x.t), 0));
  });
  check('capacidad respetada', sums.slice(0, 5).map((s, i) => s <= 360 || i === 3), [true, true, true, true, true]);
  check('salta los días libres', await p.evaluate(() => pw.preview.plan.some((x) => x.key >= '2026-10-17')), false);
  check('jueves lleno sin nada nuevo', await p.evaluate(() => pw.preview.plan.some((x) => x.key === '2026-10-15')), false);
  check('las que no caben', await p.evaluate(() => pw.preview.left > 0), true);
  await p.click('#pw-preview button:has-text("Cancelar")'); await tick();
  await p.click('.pw-day[data-key="2026-10-17"] .pw-off'); await tick();
  check('sábado deja de ser libre', await p.evaluate(() => pwSet().off), [6]);
  await p.click('.pw-day[data-key="2026-10-17"] .pw-off'); await tick();
  await p.evaluate(() => { state.tasks = state.tasks.filter((t) => !t.id.startsWith('x')); save(); renderAll(); });

  // Navegar entre semanas
  await p.click('#pw-next'); await tick();
  check('siguiente', [await p.textContent('#pw-title'), await p.isVisible('#pw-now')], ['Semana 43 · 19–25 oct', true]);
  await p.click('#pw-prev'); await p.click('#pw-prev'); await tick();
  check('anterior', await p.textContent('#pw-title'), 'Semana 41 · 5–11 oct');
  check('vencida en su día', await dayCards('2026-10-05'), ['Vencida']);
  await p.click('#pw-now'); await tick();
  check('esta semana', [await p.textContent('#pw-title'), await p.isVisible('#pw-now')], ['Semana 42 · 12–18 oct', false]);

  // Cabecera del día y ✨
  await p.click('.pw-day[data-key="2026-10-13"] .pw-dname'); await tick();
  check('agenda del día', await p.evaluate(() => [!$('#dayview').hidden, dv.key]), [true, '2026-10-13']);
  await p.evaluate(() => closeDayView());
  await p.click('.pw-day[data-key="2026-10-14"] .pw-plan'); await tick();
  check('planificar mi día', await p.evaluate(() => [!$('#pld').hidden, $('#pld-date').value]), [true, '2026-10-14']);
  await p.evaluate(() => closePlanDay());

  // Revisión semanal: botón al final
  await p.evaluate(() => { showView('review'); review.step = REVIEW_STEPS.length - 1; renderReviewStep(); }); await tick();
  check('botón en la revisión', await p.isVisible('#review-plan'), true);
  await p.click('#review-plan'); await tick();
  check('revisión → semana siguiente', [await p.evaluate(() => activeTab().view), await p.textContent('#pw-title')], ['plan', 'Semana 43 · 19–25 oct']);

  // Hoy, el lunes
  await p.evaluate(() => showView('today')); await tick();
  check('chip del lunes', await p.isVisible('#today-planweek'), true);
  await p.click('#today-planweek'); await tick();
  check('chip abre esta semana', [await p.evaluate(() => activeTab().view), await p.textContent('#pw-title')], ['plan', 'Semana 42 · 12–18 oct']);
  await p.clock.setSystemTime(new Date('2026-10-14T10:00:00'));
  await p.evaluate(() => { showView('today'); renderToday(); }); await tick();
  check('miércoles sin chip', await p.isVisible('#today-planweek'), false);

  // Con el dedo (pantalla estrecha): panel → día y vuelta
  const { c: tc, p: tp } = await open({ viewport: { width: 820, height: 900 }, hasTouch: true, isMobile: true });
  await tp.evaluate(() => openPlanWeek(0)); await tp.clock.runFor(100);
  await tp.click('#pw-side-toggle'); await tp.clock.runFor(100);
  const cdp = await tc.newCDPSession(tp);
  const touchDrag = async (from, to) => {
    const h = await (await tp.$(from)).boundingBox();
    const d = await (await tp.$(to)).boundingBox();
    const at = (x, y) => [{ x, y }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(h.x + 4, h.y + 6) });
    for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(h.x + 4 + (d.x + 40 - h.x - 4) * i / 6, h.y + 6 + (d.y + 30 - h.y - 6) * i / 6) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await tp.clock.runFor(100);
  };
  await touchDrag('#pw-side-list .pw-card[data-id="b"] .pw-handle', '.pw-day[data-key="2026-10-12"] .pw-dhead');
  check('dedo: panel → lunes', await tp.evaluate(() => state.tasks.find((t) => t.id === 'b').due), '2026-10-12');
  await touchDrag('.pw-day[data-key="2026-10-12"] .pw-card[data-id="b"] .pw-handle', '#pw-side .pw-side-head');
  check('dedo: lunes → panel', await tp.evaluate(() => state.tasks.find((t) => t.id === 'b').due), null);
  check('columnas con desplazamiento', await tp.evaluate(() => $('#pw-days').scrollWidth > $('#pw-days').clientWidth), true);

  console.log('errors:', JSON.stringify(errs));
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
