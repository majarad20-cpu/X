const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2], S = process.argv[3];
const now = new Date('2026-10-07T10:00:00').getTime();
const mock = (opts) => {
  window.__calls = [];
  const sample = async (input, o = {}) => {
    window.__calls.push(['sample', input.slice(0, 60)]);
    if (opts.denySample) throw { code: 'not_granted', message: 'x' };
    const text = '## Logros\n- Completaste 3 tareas\n## En qué se fue el tiempo\n- 2 pomodoros\n## Ánimo y energía\nBien.\n## Lo que queda pendiente\n- Nada urgente\n## Para la próxima semana\n- Planificar el lunes';
    if (o.onText) { o.onText({ text: text.slice(0, 20), delta: text.slice(0, 20) }); o.onText({ text, delta: text.slice(20) }); }
    return { text, truncated: false, modelTierApplied: 'default' };
  };
  sample.json = async (input) => {
    window.__calls.push(['json', input.includes('Proyectos existentes: "Web nueva"')]);
    return { tasks: [
      { title: 'Llamar al banco', due: '2026-10-08', time: '10:00', priority: 'alta', project: null, tags: ['finanzas'] },
      { title: 'Revisar diseño de la portada', due: null, time: null, priority: 'media', project: 'Web nueva', tags: [] },
    ], otros: ['Preocupación por la entrega'] };
  };
  const mcp = {
    callTool: async (server, tool, input) => {
      window.__calls.push(['mcp', server, tool, JSON.stringify(input).slice(0, 120)]);
      if (opts.calError) throw { code: opts.calError, message: 'x' };
      if (tool === 'list_events') return { payload: { events: [
        { id: 'e1', summary: 'Reunión de equipo', start: { dateTime: '2026-10-07T12:00:00-03:00' }, end: { dateTime: '2026-10-07T13:00:00-03:00' }, htmlLink: 'https://calendar.google.com/x', conferenceUrl: 'https://meet.google.com/x', status: 'confirmed' },
        { id: 'e2', summary: 'Cumpleaños de Ana', start: { date: '2026-10-09' }, end: { date: '2026-10-10' }, status: 'confirmed' },
      ] } };
      if (tool === 'create_event') return { payload: { id: 'nuevo1' } };
    },
  };
  window.claude = { use: async (n) => (n === 'sample' ? sample : n === 'mcp' ? mcp : null) };
};
(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const open = async (opts, seed) => {
    const c = await b.newContext({ viewport: { width: 1280, height: 900 } });
    await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, seed || { tasks: [], habits: [], pomodoros: {}, settings: { logVersion: 1, notesWelcome: true }, projects: [{ id: 'p1', name: 'Web nueva', status: 'active', color: 'teal', createdAt: now }] });
    await c.addInitScript(mock, opts);
    const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await p.clock.install({ time: new Date(now) });
    await p.goto(url); await p.clock.runFor(500);
    return p;
  };
  // ---- Claude: plan
  let p = await open({});
  await p.evaluate(() => showView('journal'));
  await p.fill('#journal-fields textarea', 'tengo que llamar al banco mañana a las 10, es urgente\nrevisar la portada de la web\nme preocupa la entrega');
  await p.click('#journal-form button[type=submit]');
  console.log('ai box visible:', await p.isVisible('#dump-convert .ai-box'));
  await p.click('#dump-convert .ai-go'); await p.clock.runFor(200);
  console.log('plan:', await p.$$eval('.plan-row', n => n.map(x => x.querySelector('.plan-title').value + ' [' + x.querySelector('.muted').textContent + ']')), '| otros:', await p.textContent('.plan-others'), '| projects in prompt:', JSON.stringify(await p.evaluate(() => window.__calls.find(c => c[0] === 'json'))));
  await p.screenshot({ path: S + '/ai-plan.png' });
  await p.click('#dump-convert .ai-result button.primary');
  console.log('created:', await p.evaluate(() => state.tasks.map(t => `${t.title}|${t.due}|${t.time}|${t.priority}|${t.projectId}|${t.tags}`)));
  // ---- Claude: resumen
  await p.evaluate(() => showView('progress'));
  await p.click('#summary-go'); await p.clock.runFor(200);
  console.log('summary h2:', await p.$$eval('#summary-out h2', n => n.map(x => x.textContent)), '| save visible:', await p.isVisible('#summary-save'));
  await p.click('#summary-save');
  console.log('summary note:', await p.textContent('#note-crumbs'));
  // ---- Calendario
  await p.evaluate(() => document.getElementById('open-settings').click());
  console.log('cal note before:', await p.textContent('#cal-note'));
  await p.check('#cal-enabled'); await p.clock.runFor(200);
  await p.evaluate(() => showView('today')); await p.clock.runFor(100);
  console.log('today agenda:', await p.$$eval('#today-calendar .cal-event', n => n.map(x => x.innerText.replace(/\n/g, ' | '))));
  await p.evaluate(() => showView('tasks')); await p.click('[data-taskview=week]'); await p.clock.runFor(200);
  console.log('week thu/fri events:', await p.$$eval('.day .cal-event .cal-title', n => n.map(x => x.textContent)));
  await p.screenshot({ path: S + '/cal-week.png' });
  // crear evento desde la tarea con hora
  await p.click('[data-taskview=list]');
  await p.click('#task-list .task:has-text("Llamar al banco") .sub-toggle');
  await p.click('#task-list .cal-add button'); await p.clock.runFor(200);
  console.log('create call:', JSON.stringify(await p.evaluate(() => window.__calls.filter(c => c[2] === 'create_event'))), '| marked:', await p.evaluate(() => state.tasks.find(t => t.title === 'Llamar al banco').calEventId));
  // ---- Plantillas
  await p.keyboard.press('Control+p'); await p.keyboard.type('desde plantilla'); await p.keyboard.press('Enter');
  console.log('templates:', await p.$$eval('.pk-item .pk-label', n => n.map(x => x.textContent)));
  await p.keyboard.type('Reunión'); await p.keyboard.press('Enter');
  await p.keyboard.type('Reunión con proveedor'); await p.keyboard.press('Enter');
  console.log('from template:', JSON.stringify((await p.inputValue('#note-editor')).slice(0, 60)), '| crumbs:', await p.textContent('#note-crumbs'));
  // ---- Consultas
  await p.keyboard.press('Control+o'); await p.keyboard.type('Panel'); await p.keyboard.press('Enter');
  await p.fill('#note-editor', '# Panel\n```tareas\n#finanzas\npendientes\n```\n```notas\ncarpeta: Plantillas\n```');
  await p.dispatchEvent('#note-editor', 'input'); await p.clock.runFor(700);
  await p.keyboard.press('Control+e');
  console.log('query tasks:', await p.$$eval('.query[data-kind=tareas] .task .title', n => n.map(x => x.textContent)), '| query notes:', await p.$$eval('.query[data-kind=notas] a', n => n.map(x => x.textContent)));
  await p.click('.query[data-kind=tareas] .task input[type=checkbox]');
  console.log('after check in query:', await p.evaluate(() => state.tasks.find(t => t.title === 'Llamar al banco').done));
  await p.screenshot({ path: S + '/query.png' });
  await p.close();
  // ---- Errores: Claude denegado y calendario sin conexión
  p = await open({ denySample: true, calError: 'needs_reauth' }, { tasks: [], habits: [], pomodoros: {}, settings: { logVersion: 1, notesWelcome: true, calendar: true } });
  await p.evaluate(() => showView('progress'));
  await p.click('#summary-go'); await p.clock.runFor(200);
  console.log('denied:', await p.textContent('#summary-status'), '| ai hidden:', !(await p.isVisible('#summary-go')));
  await p.evaluate(() => showView('today')); await p.clock.runFor(200);
  console.log('cal error:', await p.textContent('#today-calendar .cal-error'));
  // ---- Fuera de Claude: nada de esto se muestra
  const c3 = await b.newContext(); const p3 = await c3.newPage(); p3.on('pageerror', e => errs.push(e.message));
  await p3.goto(url); await p3.waitForTimeout(300);
  await p3.evaluate(() => showView('progress'));
  console.log('no claude:', await p3.isVisible('#summary-go'), await p3.isVisible('.ai-off-note'), await p3.evaluate(() => document.getElementById('cal-enabled').disabled));
  console.log('errors:', errs); await b.close();
})();
