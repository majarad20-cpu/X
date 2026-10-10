const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
// Lunes 12 de octubre de 2026, 10:00
const now = new Date('2026-10-12T10:00:00').getTime();
const seed = {
  tasks: [
    { id: 'a', title: 'Correo', priority: 3, due: null, done: false, createdAt: now - 9e6, tags: [] },
    { id: 'b', title: 'Factura', priority: 2, due: null, done: false, createdAt: now - 8e6, tags: [] },
    { id: 'r', title: 'Regar', priority: 2, due: '2026-10-12', repeat: 'daily', done: false, createdAt: now - 7e6, tags: [] },
  ],
  habits: [], settings: { notesWelcome: true },
  notes: [{ id: 'nt', path: 'Pendientes', body: '# Pendientes\nTexto\n- [ ] Tarea de nota\n- [ ] Otra de nota', createdAt: now, updatedAt: now }],
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
  const open = async (time = now) => {
    const c = await b.newContext({ viewport: { width: 1600, height: 900 } });
    await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, seed);
    await c.route(/fonts\.g|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com/, (r) => r.abort());
    const p = await c.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
    await p.clock.install({ time: new Date(time) });
    await p.goto(url); await p.clock.runFor(800);
    return p;
  };
  const body = (p) => p.evaluate(() => noteById('nt').body.split('\n'));

  // ---- 1) Reparto automático: la fecha va a la línea de la tarea aunque la nota cambie
  let p = await open();
  await p.evaluate(() => { openPlanWeek(0); pwAutoPlan(); });
  check('propuesta con referencias', await p.evaluate(() => pw.preview.plan.map((x) => x.ref.id || x.ref.title)), ['a', 'b', 'Tarea de nota', 'Otra de nota']);
  // Se añade una línea encima de la tarea sin redibujar (el botón Aplicar sigue a la vista)
  await p.evaluate(() => { const n = noteById('nt'); n.body = n.body.replace('Texto\n', 'Texto\nLínea nueva\n'); });
  await p.evaluate(() => pwApplyPlan()); await p.clock.runFor(100);
  let lines = await body(p);
  check('línea añadida intacta', lines[2], 'Línea nueva');
  check('fecha en la tarea correcta', [/^- \[ \] Tarea de nota 📅 \d{4}-\d{2}-\d{2}$/.test(lines[3]), /^- \[ \] Otra de nota 📅 \d{4}-\d{2}-\d{2}$/.test(lines[4])], [true, true]);
  check('tareas de la app con fecha', await p.evaluate(() => ['a', 'b'].map((i) => !!state.tasks.find((t) => t.id === i).due)), [true, true]);
  // Nota más corta: antes fallaba (línea fuera de la nota)
  await p.click('#toast .toast-action'); await p.clock.runFor(100);
  await p.evaluate(() => { noteById('nt').body = '# Pendientes\nTexto\n- [ ] Tarea de nota\n- [ ] Otra de nota'; save(); pwAutoPlan(); });
  await p.evaluate(() => { noteById('nt').body = '- [ ] Otra de nota'; });
  console.log('DBG', await p.evaluate(() => JSON.stringify(pw.preview)));
  await p.evaluate(() => pwApplyPlan()); await p.clock.runFor(100);
  lines = await body(p);
  check('nota más corta: sin error y en su línea', [lines.length, /^- \[ \] Otra de nota 📅/.test(lines[0])], [1, true]);
  check('aviso de las que ya no están', /ya no estaba/.test(await p.textContent('#toast')), true);
  // Si cambian los datos, la propuesta se descarta al dibujar
  await p.evaluate(() => { state.tasks.forEach((t) => t.id !== 'r' && (t.due = null)); save(); pwAutoPlan(); });
  check('propuesta visible', await p.evaluate(() => !!pw.preview && !$('#pw-preview').hidden), true);
  await p.evaluate(() => { state.tasks[0].title = 'Correo urgente'; save(); renderPlanWeek(); });
  check('propuesta descartada al cambiar dataRev', await p.evaluate(() => [pw.preview, $('#pw-preview').hidden]), [null, true]);
  // setTaskDue comprueba la línea
  await p.evaluate(() => { noteById('nt').body = 'Nueva\n- [ ] Tarea de nota'; save(); });
  check('setTaskDue vuelve a encontrar la línea', await p.evaluate(() => [setTaskDue({ virtual: true, noteId: 'nt', line: 0, title: 'Tarea de nota' }, '2026-10-14'), noteById('nt').body]), [true, 'Nueva\n- [ ] Tarea de nota 📅 2026-10-14']);
  check('setTaskDue no toca si ya no está', await p.evaluate(() => [setTaskDue({ virtual: true, noteId: 'nt', line: 1, title: 'Borrada' }, '2026-10-15'), noteById('nt').body]), [false, 'Nueva\n- [ ] Tarea de nota 📅 2026-10-14']);

  // ---- 2) Tras deshacer (tareas nuevas en state.tasks) no se saltan las de la app
  await p.evaluate(() => { state.tasks.forEach((t) => t.id !== 'r' && (t.due = null)); noteById('nt').body = ''; save(); pwAutoPlan(); });
  await p.evaluate(() => { state.tasks = JSON.parse(JSON.stringify(state.tasks)); }); // como hace «Deshacer»
  await p.evaluate(() => pwApplyPlan()); await p.clock.runFor(100);
  check('tras deshacer, se aplican', await p.evaluate(() => ['a', 'b'].map((i) => !!state.tasks.find((t) => t.id === i).due)), [true, true]);

  // ---- 4) «Hechas (N)» incluye las repetidas hechas ese día
  await p.evaluate(() => toggleDone(state.tasks.find((t) => t.id === 'r'), true)); await p.clock.runFor(100);
  check('repetida en Hechas', await p.evaluate(() => dpTasks('2026-10-12', { id: 'x' }).done.map((t) => [t.title, t.done])), [['Regar', true]]);
  check('no sale como creada', await p.evaluate(() => dpTasks('2026-10-12', { id: 'x' }).created.some((t) => t.id === 'r')), false);
  await p.click('#toast .toast-action'); await p.clock.runFor(100);
  check('al deshacer ya no cuenta', await p.evaluate(() => dpTasks('2026-10-12', { id: 'x' }).done.length), 0);
  await p.evaluate(() => { const r = state.tasks.find((t) => t.id === 'r'); toggleDone(r, true); state.log.filter((e) => e.ref === 'r').forEach((e) => (e.removed = true)); });
  check('anotación retirada no cuenta', await p.evaluate(() => dpTasks('2026-10-12', { id: 'x' }).done.length), 0);

  // ---- 7) editNoteLine y objetivos comprueban la línea
  await p.evaluate(() => { noteById('nt').body = '- [ ] Uno\n- [ ] Dos'; save(); });
  await p.evaluate(() => { noteById('nt').body = 'Arriba\n- [ ] Uno\n- [ ] Dos'; });
  check('editNoteLine re-encuentra', await p.evaluate(() => [editNoteLine({ noteId: 'nt', line: 0, title: 'Uno' }, (l) => `${l} !alta`), noteById('nt').body]), [true, 'Arriba\n- [ ] Uno !alta\n- [ ] Dos']);
  check('editNoteLine no toca otra', await p.evaluate(() => [editNoteLine({ noteId: 'nt', line: 2, title: 'Tres' }, (l) => `${l} X`), noteById('nt').body]), [false, 'Arriba\n- [ ] Uno !alta\n- [ ] Dos']);
  await p.evaluate(() => { openPlanWeek(0); pwAddGoal('Objetivo A'); pwAddGoal('Objetivo B'); });
  const goals = () => p.evaluate(() => pwGoals(pwWeekNote()).map((g) => g.text));
  check('objetivos', await goals(), ['Objetivo A', 'Objetivo B']);
  // Se añade una línea encima en la nota: editar y borrar siguen yendo al objetivo correcto
  await p.evaluate(() => { const g = pwGoals(pwWeekNote()); window.__g = g; const n = pwWeekNote(); n.body = n.body.replace('## 🎯 Objetivos\n', '## 🎯 Objetivos\nnota suelta\n'); });
  await p.evaluate(() => pwEditGoal(window.__g[1], 'Objetivo B2'));
  check('editar objetivo movido', await goals(), ['Objetivo A', 'Objetivo B2']);
  await p.evaluate(() => pwDelGoal(window.__g[0]));
  check('borrar objetivo movido', [await goals(), await p.evaluate(() => pwWeekNote().body.includes('nota suelta'))], [['Objetivo B2'], true]);
  // La línea ya no es una tarea: no falla ni toca nada
  await p.evaluate(() => { const n = pwWeekNote(); window.__g = pwGoals(n); n.body = n.body.replace('- [ ] Objetivo B2', 'texto normal'); window.__b = n.body; });
  check('editar objetivo que ya no está', await p.evaluate(() => { pwEditGoal(window.__g[0], 'Otro'); pwDelGoal(window.__g[0]); pwGoalDue(window.__g[0]); return pwWeekNote().body === window.__b; }), true);
  await p.context().close();

  // ---- 5 y 6) Planificar el día: hora fija y cancelar mientras se crean los eventos
  p = await open();
  await p.evaluate(() => {
    window.__calls = [];
    window.__slow = false;
    cal.mcp = { callTool: async (s, tool, input) => {
      window.__calls.push([tool, input]);
      if (tool === 'create_event') { if (window.__slow) await new Promise((r) => setTimeout(r, 2000)); return { payload: { id: `ev${window.__calls.length}` } }; }
      return { payload: { events: [] } };
    } };
    state.tasks = [
      { id: 'f', title: 'Dentista', priority: 1, due: '2026-10-12', time: '16:00', duration: 60, done: false, createdAt: 1, tags: [] },
      { id: 'g', title: 'Informe', priority: 3, due: '2026-10-12', time: null, duration: 120, done: false, createdAt: 2, tags: [] },
      { id: 'h', title: 'Llamada', priority: 2, due: '2026-10-12', time: null, duration: 300, done: false, createdAt: 3, tags: [] },
    ];
    state.settings.planDay = { from: '09:00', to: '18:00' };
    save();
  });
  await p.evaluate(() => openPlanDay('2026-10-12')); await p.clock.runFor(200);
  const blocks = () => p.evaluate(() => pd.blocks.map((b) => `${hm(b.start)}-${hm(b.end)} ${b.title}`));
  await p.evaluate(() => Object.assign(pd, pdLocalPlan(pdCtx())));
  check('plan local respeta la hora fija', await blocks(), ['10:05-12:05 Informe', '16:00-17:00 Dentista']);
  check('lo que choca queda fuera', await p.evaluate(() => pd.fuera.map((f) => f.task.title)), ['Llamada']);
  check('regla en el prompt', await p.evaluate(() => /hora fija/.test(pdPrompt(pdCtx(), ''))), true);
  const raw = { bloques: [{ taskId: 'T1', inicio: '10:30', fin: '12:30' }, { taskId: 'T3', inicio: '09:00', fin: '10:00' }, { taskId: 'T2', inicio: '15:30', fin: '16:30' }] };
  check('validar mantiene la hora fija', await p.evaluate((r) => { const v = pdValidate(r, pdCtx()); return v.blocks.map((b) => `${hm(b.start)}-${hm(b.end)} ${b.title}`); }, raw), ['10:30-12:30 Informe', '16:00-17:00 Dentista']);
  check('ids del prompt', await p.evaluate(() => [...pd.ids].map(([k, t]) => `${k}=${t.title}`)), ['T1=Informe', 'T2=Llamada', 'T3=Dentista']);
  // Cancelar mientras se crean los eventos: no se aplica
  await p.evaluate(() => { Object.assign(pd, pdLocalPlan(pdCtx())); pdRender(); window.__slow = true; });
  await p.check('#pld-gcal');
  await p.click('#pld-accept'); await p.clock.runFor(100);
  await p.click('#pld-cancel'); await p.clock.runFor(2500);
  check('cancelado: sin cambios', await p.evaluate(() => [state.tasks.find((t) => t.id === 'g').time, state.settings.planEvents || null]), [null, null]);
  check('aviso con borrar eventos', [/Plan cancelado/.test(await p.textContent('#toast')), await p.isVisible('#toast .toast-action:has-text("Borrar eventos")')], [true, true]);
  await p.click('#toast .toast-action'); await p.clock.runFor(300);
  check('eventos borrados', await p.evaluate(() => window.__calls.filter((c) => c[0] === 'delete_event').map((c) => c[1].eventId).length), 2);
  // Aceptar de verdad: los eventos se guardan con el cambio y «Deshacer» avisa
  await p.evaluate(() => { window.__slow = false; openPlanDay('2026-10-12'); });
  await p.clock.runFor(200);
  await p.evaluate(() => { Object.assign(pd, pdLocalPlan(pdCtx())); pdRender(); });
  await p.check('#pld-gcal');
  await p.click('#pld-accept'); await p.clock.runFor(300);
  check('aplicado con eventos', await p.evaluate(() => [state.tasks.find((t) => t.id === 'g').time, Object.keys(state.settings.planEvents || {}).sort()]), ['10:05', ['f', 'g']]);
  check('aviso al deshacer', /Deshacer no borra los eventos/.test(await p.textContent('#toast')), true);
  await p.click('#toast .toast-action'); await p.clock.runFor(200);
  check('deshacer quita hora y registro', await p.evaluate(() => [state.tasks.find((t) => t.id === 'g').time, Object.keys(state.settings.planEvents || {}).length]), [null, 0]);
  await p.context().close();

  // ---- 3) Medianoche del domingo: el calendario de Hoy carga la semana nueva
  p = await open(new Date('2026-10-18T23:59:30').getTime());
  await p.evaluate(() => {
    window.__ranges = [];
    cal.mcp = { callTool: async (s, tool, input) => {
      window.__ranges.push(input.startTime.slice(0, 10));
      return { payload: { events: [{ id: 'm', summary: 'Lunes temprano', start: { dateTime: '2026-10-19T09:00:00' }, end: { dateTime: '2026-10-19T10:00:00' } }, { id: 's', summary: 'Domingo', start: { dateTime: '2026-10-18T20:00:00' }, end: { dateTime: '2026-10-18T21:00:00' } }].filter((e) => e.start.dateTime >= input.startTime.slice(0, 10) && e.start.dateTime < input.endTime.slice(0, 10)) } };
    } };
    state.settings.calendar = true;
    showView('today');
    loadCalendar();
  });
  await p.clock.runFor(300);
  check('domingo: rango viejo', await p.evaluate(() => [cal.range.from, cal.range.to]), ['2026-10-12', '2026-10-19']);
  await p.clock.runFor(60000); await p.clock.runFor(300);
  check('lunes: rango nuevo', await p.evaluate(() => [cal.range.from, cal.range.to]), ['2026-10-19', '2026-10-26']);
  check('Hoy muestra el evento del lunes', await p.$$eval('#today-calendar .cal-title', (n) => n.map((x) => x.textContent)), ['Lunes temprano']);
  // Sin el cambio de día: al dibujar Hoy con un rango que no incluye hoy, se vuelve a cargar (una vez)
  await p.evaluate(() => { cal.range = { from: '2026-10-05', to: '2026-10-12' }; cal.byDay = new Map(); window.__ranges = []; renderTodayCalendar(); });
  await p.clock.runFor(300);
  check('renderTodayCalendar recarga', await p.evaluate(() => [window.__ranges, cal.range.from]), [['2026-10-19'], '2026-10-19']);
  await p.context().close();

  await b.close();
  console.log('errors:', JSON.stringify(errs));
})();
