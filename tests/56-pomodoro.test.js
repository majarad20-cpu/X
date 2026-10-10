// Pomodoro con contexto: tarea, nota y proyecto; registro de sesiones y tiempo dedicado; pausa larga,
// arranque automático, «Saltar descanso», «+5 min», modo estricto, ajustes rápidos, exactitud con la
// pestaña oculta, seguir tras recargar, sonidos, notificaciones, aviso de 1 minuto, estadísticas y
// sincronización del registro entre dispositivos.
const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const out = process.argv[3];
const now = new Date('2026-10-09T10:00:00').getTime();
const MIN = 60e3;

// AudioContext, Notification y visibilidad simulados (se instalan en cada carga).
const mocks = () => {
  window.__tones = [];
  window.__notes = [];
  window.__confirms = 0;
  window.confirm = () => (window.__confirms++, true);
  class P { setValueAtTime(v) { this.value = v; return this; } exponentialRampToValueAtTime() { return this; } linearRampToValueAtTime() { return this; } }
  window.AudioContext = class {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    createOscillator() { const o = { type: '', frequency: new P(), connect: (n) => n, start: () => window.__tones.push({ type: o.type, f: o.frequency.value }), stop() {} }; return o; }
    createGain() { return { gain: new P(), connect: (n) => n }; }
    createBuffer() { return {}; }
    createBufferSource() { return { connect() {}, start() {} }; }
  };
  const mode = localStorage.getItem('mock-notif') || 'granted';
  if (mode === 'none') window.Notification = undefined;
  else {
    window.Notification = class { constructor(t, o) { window.__notes.push(`${t}: ${o?.body || ''}`); } };
    window.Notification.permission = mode;
    window.Notification.requestPermission = () => Promise.resolve((window.Notification.permission = 'granted'));
  }
  let hidden = false;
  Object.defineProperty(document, 'visibilityState', { get: () => (hidden ? 'hidden' : 'visible'), configurable: true });
  Object.defineProperty(document, 'hidden', { get: () => hidden, configurable: true });
  window.__setHidden = (h) => { hidden = h; document.dispatchEvent(new Event('visibilitychange')); };
};

const seed = {
  settings: { notesWelcome: true, logVersion: 1, focus: 25, short: 5, long: 15 }, folders: ['Diario'], habits: [],
  tasks: [
    { id: 't2', title: 'Leer artículo', done: false, priority: 3, tags: [], createdAt: now - 864e5 },
    { id: 't1', title: 'Escribir informe', due: '2026-10-09', projectId: 'p1', done: false, priority: 2, tags: [], createdAt: now - 864e5 },
  ],
  projects: [{ id: 'p1', name: 'Web', status: 'active', color: 'teal', createdAt: now - 864e5 }],
  pomodoros: { '2026-10-08': 8, '2026-10-07': 9, '2026-10-06': 3 }, focusMinutes: { '2026-10-08': 200, '2026-10-07': 225, '2026-10-06': 75 },
  notes: [
    { id: 'n1', path: 'Ideas sueltas', body: 'Texto', createdAt: now - 864e5, updatedAt: now },
    { id: 'd9', path: 'Diario/2026-10-09', body: '# Viernes\n\nHoy.\n', createdAt: now, updatedAt: now },
  ],
  updatedAt: 1,
};

(async () => {
  const b = await chromium.launch(launchOptions);
  const c = await b.newContext({ viewport: { width: 1300, height: 860 } });
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, seed);
  await c.addInitScript(mocks);
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.clock.install({ time: new Date(now) });
  await p.goto(url); await p.clock.runFor(800);
  const check = (name, ok, info = '') => { console.log(`${ok ? 'ok' : 'FALLA'} ${name}${info ? ` · ${info}` : ''}`); if (!ok) errs.push(`falla: ${name} ${info}`); };
  const ev = (f, a) => p.evaluate(f, a);
  const run = (ms) => p.clock.runFor(ms);
  const ff = (ms) => p.clock.fastForward(ms);
  const last = () => ev(() => state.focusLog[state.focusLog.length - 1]);
  const alertText = () => ev(() => ($('#pomo-alert').hidden ? '' : $('#pomo-alert').textContent));
  const set = (k, v) => ev(([k, v]) => psetSet(k, v), [k, v]);

  // ---- Selector «Trabajando en» ----
  await ev(() => showView('timer')); await run(50);
  let r = await ev(() => ({ first: $('#timer-task').options[1].textContent, groups: [...$$('#timer-task optgroup')].map((g) => g.label), label: !$('#timer-label').hidden }));
  check('selector: tareas de hoy primero, notas y proyectos', r.first === 'Escribir informe' && r.groups.join() === 'Tareas,Notas,Proyectos' && r.label, JSON.stringify(r));

  // ---- Desde una tarea (clic derecho) ----
  await ev(() => taskMenuItems(state.tasks.find((t) => t.id === 't1')).find((i) => i.label === '▶ Pomodoro con esta tarea').action());
  await run(100);
  r = await ev(() => ({ view: activeTab().view, run: !!timer.endsAt, ctx: timer.ctx, sel: $('#timer-task').value, tones: window.__tones.slice(), notes: window.__notes.slice() }));
  check('tarea: abre y empieza con contexto', r.view === 'timer' && r.run && r.ctx.type === 'task' && r.ctx.id === 't1' && r.sel === 't1', JSON.stringify(r.ctx));
  check('sonido de inicio (madera, sube)', r.tones.map((t) => `${t.type}${t.f}`).join() === 'triangle660,triangle990', JSON.stringify(r.tones));
  check('notificación de inicio', r.notes.some((n) => n.includes('Enfoque de 25 min') && n.includes('Escribir informe')), r.notes.join('|'));
  check('aviso en la app al empezar', (await alertText()).includes('Enfoque de 25 min'));
  await ev(() => (window.__tones = []));
  await ff(25 * MIN); await run(300);
  let rec = await last();
  r = await ev(() => ({ pomos: state.pomodoros['2026-10-09'], mins: state.focusMinutes['2026-10-09'], task: state.tasks.find((t) => t.id === 't1').pomodoros, mode: timer.mode, tones: window.__tones.filter((t, i) => t.type === 'sine' && i % 2 === 0).map((t) => t.f), log: state.log.filter((e) => e.type === 'pomodoro').map((e) => e.text) }));
  check('registro de la sesión', rec.completed && rec.minutes === 25 && rec.ctx.type === 'task' && rec.end - rec.start === 25 * MIN && rec.date === '2026-10-09', JSON.stringify(rec));
  check('contadores y bitácora siguen al día', r.pomos === 1 && r.mins === 25 && r.task === 1 && r.mode === 'short' && r.log.join() === 'Escribir informe', JSON.stringify(r));
  check('sonido de fin distinto (campana, baja)', r.tones.join() === '1320,1100,880', r.tones.join());
  check('aviso «¿Qué hiciste?»', (await alertText()).includes('¡Pomodoro completado!') && (await p.isVisible('#pomo-alert .pomo-note-input')));
  await p.fill('#pomo-alert .pomo-note-input', 'Primer borrador'); await p.press('#pomo-alert .pomo-note-input', 'Enter');
  check('nota de la sesión guardada', (await last()).note === 'Primer borrador' && (await p.isHidden('#pomo-alert')));

  // Tiempo en el formulario de la tarea y en la lista.
  await ev(() => showView('tasks')); await run(50);
  check('fila de la tarea: tiempo', (await p.textContent('#task-list .task:has-text("Escribir informe") .meta')).includes('⏱ 25 min'));
  await ev(() => startEditing('t1')); await run(50);
  check('formulario: ⏱ 25 min (1 🍅)', (await p.textContent('.task-edit .pomo-time')) === '⏱ 25 min (1 🍅)', await p.textContent('.task-edit .pomo-time'));
  await ev(() => stopEditing());

  // ---- Desde una nota (menú ⋯), con lo hecho añadido a la nota ----
  await set('appendNote', true);
  await ev(() => NOTE_MENU_EXTRA.map((f) => f(noteById('n1'))).find((i) => i?.label === '▶ Pomodoro con esta nota').action());
  await run(100);
  r = await ev(() => ({ mode: timer.mode, run: !!timer.endsAt, ctx: timer.ctx, sel: $('#timer-task').value }));
  check('nota: deja la pausa y empieza con la nota', r.mode === 'focus' && r.run && r.ctx.type === 'note' && r.sel === 'note:n1', JSON.stringify(r));
  await ff(25 * MIN); await run(300);
  await p.fill('#pomo-alert .pomo-note-input', 'Revisé enlaces'); await p.click('#pomo-alert .pomo-note button');
  rec = await last();
  const line = await ev((rec) => `- 🍅 ${hmNow(new Date(rec.start))}–${hmNow(new Date(rec.end))} Revisé enlaces`, rec);
  check('se añade a la nota', (await ev(() => noteById('n1').body)).endsWith(`${line}\n`), line);
  check('nota: Relacionado con su tiempo', (await ev(() => relatedBlock('note', 'n1').querySelector('.rel-time')?.textContent)) === '⏱ 25 min (1 🍅)');

  // ---- Desde un proyecto (clic derecho), interrumpida a los 10 min ----
  await ev(() => ctxExtra('project', projectById('p1')).find((i) => i.label === '▶ Pomodoro para el proyecto').action());
  await run(100);
  check('proyecto: contexto', (await ev(() => timer.ctx.type + timer.ctx.id + timer.mode)) === 'projectp1focus');
  await ff(10 * MIN); await run(300);
  await p.click('#timer-reset'); await run(50);
  rec = await last();
  check('interrumpida: queda registrada', rec.completed === false && rec.minutes === 10 && rec.ctx.type === 'project', JSON.stringify(rec));
  await ev(() => openProject('p1')); await run(100);
  r = await ev(() => ({ head: $('#pd-time h2').textContent, rows: [...$$('#pd-time .pomo-trow')].map((x) => x.textContent) }));
  check('proyecto: tiempo dedicado por tarea', r.head.includes('⏱ 35 min (1 🍅)') && r.rows[0].includes('Escribir informe') && r.rows[0].includes('25 min') && r.rows[1].includes('El proyecto en general'), JSON.stringify(r));

  // ---- Panel de la nota diaria: sesiones con su contexto ----
  await ev(() => { noteMode.set('d9', 'read'); openNote(noteById('d9')); }); await run(100);
  const sess = await ev(() => [...$$('#day-panel .dp-sessions li')].map((x) => x.textContent));
  check('panel del día: sesiones', sess.length === 3 && sess[0].includes('☑ Escribir informe') && sess[0].includes('«Primer borrador»') && sess[1].includes('📝 Ideas sueltas') && sess[2].includes('interrumpida'), sess.join(' | '));

  // ---- Pausa larga tras N pomodoros ----
  await ev(() => showView('timer'));
  await set('focus', 1); await set('rounds', 2);
  await ev(() => { setMode('focus'); timer.focusCount = 0; startTimer(); });
  await ff(MIN); await run(300);
  check('1.º: pausa corta', (await ev(() => timer.mode)) === 'short');
  check('botón «Saltar descanso»', (await p.textContent('#timer-skip')) === 'Saltar descanso');
  await p.click('#timer-skip'); await run(50);
  await ev(() => startTimer()); await ff(MIN); await run(300);
  check('2.º: pausa larga', (await ev(() => timer.mode)) === 'long');

  // ---- Arranque automático ----
  await set('autoBreak', true); await set('autoFocus', true);
  await p.click('#timer-skip'); await run(50);
  await ev(() => startTimer()); await ff(MIN); await run(300);
  r = await ev(() => ({ mode: timer.mode, run: !!timer.endsAt }));
  check('pausa automática', r.mode === 'short' && r.run, JSON.stringify(r));
  await ff(5 * MIN); await run(300);
  r = await ev(() => ({ mode: timer.mode, run: !!timer.endsAt }));
  check('siguiente pomodoro automático', r.mode === 'focus' && r.run, JSON.stringify(r));
  await set('autoBreak', false); await set('autoFocus', false);
  await ev(() => { stopTimer(); resetTimer(); });

  // ---- +5 min ----
  await ev(() => startTimer()); await run(100);
  await p.click('#timer-plus5'); await run(50);
  check('+5 min', (await ev(() => timer.total)) === 360);
  await ff(6 * MIN); await run(300);
  check('+5 min cuenta en la sesión', (await last()).minutes === 6);

  // ---- Modo estricto (confirmación propia) ----
  await set('strict', true); await set('focus', 25);
  await ev(() => setMode('focus')); await ev(() => startTimer()); await run(100);
  await p.click('#timer-start'); await run(50);
  check('estricto: pide confirmar al pausar', (await ev(() => !!timer.endsAt)) && (await alertText()).includes('Modo estricto'));
  await p.click('#pomo-alert button:has-text("Seguir enfocado")'); await run(50);
  check('estricto: «Seguir» no para', await ev(() => !!timer.endsAt));
  await p.click('#timer-reset'); await run(50);
  await p.click('#pomo-alert button:has-text("Parar")'); await run(50);
  check('estricto: «Parar» reinicia', await ev(() => !timer.endsAt && timer.remaining === timer.total && window.__confirms === 0));
  await set('strict', false);

  // ---- Ajustes rápidos (presets) ----
  await ev(() => showView('settings')); await run(50);
  await p.click('#pomo-settings [data-preset="long"]'); await run(50);
  r = await ev(() => ({ s: [state.settings.focus, state.settings.short, state.settings.long].join('/'), on: $('#pomo-settings [data-preset].active').dataset.preset, disp: $('#timer-display').textContent }));
  check('preset Largo 50/10/30', r.s === '50/10/30' && r.on === 'long' && r.disp === '50:00', JSON.stringify(r));
  await ev(() => showView('timer')); await p.click('#timer-gear'); await run(50);
  await p.fill('#set-focus', '30'); await p.dispatchEvent('#set-focus', 'change'); await run(50);
  check('Personalizado al cambiar minutos', (await ev(() => $('#pomo-quick [data-preset].active').dataset.preset)) === 'custom');
  await p.click('#pomo-quick [data-preset="classic"]'); await run(50);
  check('preset Clásico', (await ev(() => state.settings.focus)) === 25 && (await p.textContent('#timer-display')) === '25:00');

  // ---- Exactitud con la pestaña oculta ----
  await ev(() => { window.__notes = []; startTimer(); }); const t0 = await ev(() => timer.startedAt);
  await ev(() => window.__setHidden(true));
  await ff(40 * MIN); await run(300);
  rec = await last();
  r = await ev(() => ({ title: document.title, notes: window.__notes.slice() }));
  check('oculta: se registra a su hora', rec.completed && rec.end === t0 + 25 * MIN, `${rec.end - t0}`);
  check('oculta: notificación y título que parpadea', r.notes.some((n) => n.includes('Pomodoro completado')) && /🔔|Enfoque/.test(r.title) && (await ev(() => timer.alert)), JSON.stringify(r));
  await ev(() => window.__setHidden(false));
  check('al volver: aviso con la hora de fin', !(await ev(() => document.title)).includes('🔔') && (await alertText()).includes('terminó a las'));

  // ---- 1 minuto restante ----
  await set('warn', true);
  await ev(() => { setMode('focus'); window.__tones = []; window.__notes = []; startTimer({ quiet: true }); });
  await ff(24 * MIN + 1000); await run(300);
  r = await ev(() => ({ warned: timer.warned, tones: window.__tones.map((t) => t.f), notes: window.__notes.slice() }));
  check('aviso de 1 minuto', r.warned && r.tones.includes(1760) && r.notes.some((n) => n.includes('Queda 1 minuto')) && (await alertText()).includes('Queda 1 minuto'), JSON.stringify(r));

  // ---- Sigue tras recargar ----
  const before = await ev(() => ({ endsAt: timer.endsAt, ctx: timer.ctx }));
  await ev(() => flushLocal());
  await p.reload(); await run(800);
  r = await ev(() => ({ endsAt: timer.endsAt, mode: timer.mode, btn: $('#timer-start').textContent, ctx: timer.ctx }));
  check('recarga: sigue en marcha', r.endsAt === before.endsAt && r.mode === 'focus' && r.btn === 'Pausar' && JSON.stringify(r.ctx) === JSON.stringify(before.ctx), JSON.stringify(r));
  // Terminó con la página cerrada: completada a su hora.
  const n0 = await ev(() => state.focusLog.length);
  const gone = await ev(() => { const run = JSON.parse(localStorage.getItem(POMO_RUN_KEY)); run.endsAt = Date.now() - 5 * 60e3; localStorage.setItem(POMO_RUN_KEY, JSON.stringify(run)); flushLocal(); return run.endsAt; });
  await p.reload(); await run(800);
  rec = await last();
  check('recarga: terminó cerrada → completada a su hora', (await ev(() => state.focusLog.length)) === n0 + 1 && rec.completed && rec.end === gone && (await ev(() => timer.mode)) !== 'focus', JSON.stringify(rec));

  // ---- Estadísticas y racha (ayer 8 y anteayer 9 cumplen la meta de 8; hoy, si ya llega) ----
  await ev(() => { pomoAlertHide(); showView('timer'); }); await run(100);
  r = await ev(() => ({
    tiles: [...$$('#pomo-stats .stat')].map((x) => x.innerText.replace(/\n/g, ' ')),
    bars: $$('#pomo-stats .pomo-bar-mark').length, cols: $$('#pomo-stats .pomo-col').length,
    top: [...$$('#pomo-stats .pomo-trow')].map((x) => x.textContent), goal: $('#pomo-goal').textContent,
    today: state.pomodoros['2026-10-09'],
  }));
  check('estadísticas: hoy, racha y barras', r.tiles[0].startsWith(`${r.today}/8`) && r.tiles[3].startsWith(`🔥 ${r.today >= 8 ? 3 : 2}`) && r.cols === 7 && r.bars === 4 && r.goal.includes(`${r.today}/8`), JSON.stringify(r));
  check('estadísticas: en qué se fue el tiempo', r.top.some((x) => x.includes('Escribir informe')) && r.top.some((x) => x.includes('Ideas sueltas')), r.top.join(' | '));
  await ev(() => showView('today')); await run(50);
  check('meta en Hoy', await ev(() => !$('#stat-pomo-goal').hidden && parseInt($('#stat-pomo-goal i').style.width) > 0));
  await p.screenshot({ path: `${out}/56-pomodoro.png` });

  // ---- Notificaciones: bloqueadas, sin API y permiso desde un clic ----
  for (const [mode, text] of [['denied', 'bloqueadas'], ['none', 'no hay notificaciones'], ['default', 'Pulsa «Permitir notificaciones»']]) {
    await ev((m) => localStorage.setItem('mock-notif', m), mode);
    await p.reload(); await run(800);
    await ev(() => showView('settings')); await run(50);
    r = await ev(() => ({ msg: $('#pomo-settings .pomo-sys-msg').textContent, perm: !$('#pomo-settings .pomo-perm').hidden }));
    check(`notificación ${mode}: mensaje`, r.msg.includes(text) && r.perm === (mode === 'default'), JSON.stringify(r));
    if (mode === 'denied') {
      await ev(() => { pomoAlertHide(); setMode('focus'); psetSet('focus', 1); startTimer(); }); await ff(MIN); await run(300);
      check('bloqueadas: aviso en la app y sonido igualmente', (await ev(() => window.__notes.length)) === 0 && (await alertText()).includes('Pomodoro completado') && (await ev(() => window.__tones.length)) > 0);
      await ev(() => { pomoAlertHide(); psetSet('focus', 25); });
    }
  }
  await p.click('#pomo-settings .pomo-perm'); await run(100);
  check('permiso concedido desde el clic', (await p.textContent('#pomo-settings .pomo-sys-msg')).includes('activadas'));
  await c.close();

  // ---- Dos dispositivos: el registro de sesiones se fusiona por id ----
  const syncMock = (initial) => {
    const docs = new Map(Object.entries(initial)); let listener;
    window.__docs = docs;
    const snap = () => ({ docs: [...docs].map(([id, d]) => ({ id, exists: true, data: () => d })), metadata: { hasPendingWrites: false } });
    const col = { doc: (id) => ({ async set(d) { docs.set(id, JSON.parse(JSON.stringify(d))); }, async delete() { docs.delete(id); } }),
      onSnapshot(next) { listener = next; setTimeout(() => next(snap()), 30); return () => {}; } };
    window.claude = { use: async (n) => (n === 'db' ? { collection: () => col } : n === 'user' ? { id: async () => 'u' } : null) };
  };
  const mk = (id, start, ctx) => ({ id, start, end: start + 25 * MIN, date: '2026-10-09', minutes: 25, kind: 'focus', ctx, completed: true, updatedAt: start + 25 * MIN });
  const remote = { 'pomo-2026-10': { items: [mk('fromB', now - 120 * MIN, { type: 'free', id: null, label: 'Móvil' })], updatedAt: now + MIN } };
  const local = { ...seed, focusLog: [mk('fromA', now - 60 * MIN, { type: 'task', id: 't1', label: 'Escribir informe' })], updatedAt: now + 2 * MIN };
  const c2 = await b.newContext();
  await c2.addInitScript((l) => localStorage.setItem('enfoque:v1', JSON.stringify(l)), local);
  await c2.addInitScript(syncMock, remote);
  const q = await c2.newPage(); q.on('pageerror', (e) => errs.push(e.message));
  await q.clock.install({ time: new Date(now) });
  await q.goto(url); await q.waitForTimeout(2500);
  r = await q.evaluate(() => ({ local: state.focusLog.map((x) => x.id).sort().join(), cloud: window.__docs.get('pomo-2026-10').items.map((x) => x.id).sort().join() }));
  check('sincronización: ambos dispositivos', r.local === 'fromA,fromB' && r.cloud === 'fromA,fromB', JSON.stringify(r));
  console.log('errors:', errs); await b.close();
})();
