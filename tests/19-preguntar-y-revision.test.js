const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2], S = process.argv[3];
// Viernes: en Hoy aparece el aviso de la revisión semanal.
const now = new Date('2026-10-09T10:00:00').getTime();
const n = (id, path, body) => ({ id, path, body, createdAt: now, updatedAt: now });
const seed = {
  tasks: [
    { id: 't1', title: 'Pagar la luz', priority: 3, due: '2026-10-05', done: false, createdAt: now, tags: [] },
    { id: 't2', title: 'Ordenar el garaje', priority: 1, due: null, done: false, createdAt: now, tags: [] },
    { id: 't3', title: 'Llamar a Luis', priority: 2, due: '2026-10-01', done: false, createdAt: now, tags: [] },
  ],
  habits: [{ id: 'h1', name: 'Leer', log: { '2026-10-08': true, '2026-10-07': true }, createdAt: now }],
  pomodoros: {}, completions: {},
  projects: [{ id: 'p1', name: 'Web nueva', status: 'active', color: 'teal', createdAt: now }],
  settings: { logVersion: 1, notesWelcome: true },
  folders: ['Proyectos', 'Reuniones'],
  notes: [
    n('a', 'Proyectos/Web nueva', '# Web nueva\nLanzamiento el 20 de octubre.\n- [ ] Revisar textos 📅 2026-10-06\n#trabajo'),
    n('b', 'Reuniones/Reunión con Ana', 'Decidimos usar colores verdes para la [[Web nueva]].'),
  ],
};
const mock = (opts) => {
  window.__calls = [];
  const sample = async (input, o = {}) => {
    window.__calls.push({ input, tools: (o.tools || []).map((t) => t.name), cache: o.cache });
    let found = '';
    if (o.tools) {
      const r = await o.tools.find((t) => t.name === 'buscar_notas').execute({ consulta: 'colores web' });
      const nota = await o.tools.find((t) => t.name === 'leer_nota').execute({ titulo: r[0].titulo });
      const tareas = await o.tools.find((t) => t.name === 'buscar_tareas').execute({ estado: 'pendientes' });
      window.__tools = { r, nota: nota.titulo, tareas: tareas.map((t) => t.tarea) };
      found = r[0].titulo;
    }
    const text = `Según [[${found || 'Reunión con Ana'}]], elegisteis **colores verdes**.`;
    if (o.onText) { o.onText({ text: text.slice(0, 12), delta: '' }); o.onText({ text, delta: '' }); }
    return { text, truncated: false };
  };
  sample.limits = async () => ({ tools: !!opts.tools });
  sample.json = async () => ({});
  window.claude = { use: async (k) => (k === 'sample' ? sample : null) };
};
(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const open = async (opts, withAI = true) => {
    const c = await b.newContext({ viewport: { width: 1280, height: 900 } });
    await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, seed);
    if (withAI) await c.addInitScript(mock, opts);
    const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await p.clock.install({ time: new Date(now) });
    await p.goto(url); await p.clock.runFor(500);
    return p;
  };

  // ---- Preguntar con herramientas
  let p = await open({ tools: true });
  await p.click('.rib[data-view=ask]');
  console.log('ask tab:', await p.textContent('.ws-tab.active'), '| empty visible:', await p.isVisible('#ask-empty'), '| form:', await p.isVisible('#ask-form'));
  await p.fill('#ask-input', '¿Qué colores decidimos para la web?');
  await p.press('#ask-input', 'Enter'); await p.clock.runFor(200);
  console.log('bubbles:', await p.$$eval('.ask-msg', n => n.map(x => x.className.replace('ask-msg ', '').replace(' md', '') + ': ' + x.textContent)));
  console.log('tools used:', JSON.stringify(await p.evaluate(() => ({ names: window.__calls[0].tools, ...window.__tools, r: window.__tools.r.map(x => x.titulo) }))));
  console.log('first turn has rules:', await p.evaluate(() => window.__calls[0].input[0].content.startsWith('Eres el asistente')), '| turns:', await p.evaluate(() => window.__calls[0].input.length));
  await p.screenshot({ path: S + '/ask.png' });
  await p.click('.ask-msg.assistant a.wikilink');
  console.log('link opened:', await p.textContent('.ws-tab.active'));
  await p.click('.rib[data-view=ask]');
  await p.click('#ask-save');
  console.log('saved note:', await p.evaluate(() => state.notes.filter(n => n.path.startsWith('Preguntas/')).map(n => n.path)));
  await p.click('.rib[data-view=ask]');
  await p.click('#ask-clear');
  console.log('cleared:', await p.$$eval('.ask-msg', n => n.length), '| empty visible:', await p.isVisible('#ask-empty'));

  // ---- Preguntar sin herramientas: se adjunta el contexto
  p = await open({ tools: false });
  await p.evaluate(() => showView('ask'));
  await p.fill('#ask-input', '¿Qué colores para la web?');
  await p.click('#ask-send'); await p.clock.runFor(200);
  console.log('no tools → context attached:', await p.evaluate(() => window.__calls[0].input[0].content.includes('### [[Web nueva]]')), '| cache:', await p.evaluate(() => window.__calls[0].cache), '| answer:', await p.textContent('.ask-msg.assistant'));

  // ---- Fuera de Claude
  p = await open({}, false);
  await p.evaluate(() => showView('ask'));
  console.log('without Claude → note visible:', await p.isVisible('#view-ask .ai-off-note'), '| form visible:', await p.isVisible('#ask-form'), '| empty visible:', await p.isVisible('#ask-empty'));

  // ---- Revisión semanal
  await p.evaluate(() => showView('today'));
  console.log('nudge on friday:', await p.isVisible('#today-review'));
  await p.click('#today-review');
  console.log('review tab:', await p.textContent('.ws-tab.active'), '| step:', await p.textContent('#review-title'));
  console.log('overdue rows:', await p.$$eval('#review-body .rv-title', n => n.map(x => x.textContent)));
  await p.screenshot({ path: S + '/review-1.png' });
  await p.click('#review-body .rv-row:has-text("Pagar la luz") button:has-text("Mañana")');
  await p.click('#review-body .rv-row:has-text("Revisar textos") button:has-text("Próx. semana")');
  await p.click('#review-body .rv-row:has-text("Llamar a Luis") button:has-text("Hecha")');
  await p.clock.runFor(300);
  console.log('after decisions rows:', await p.$$eval('#review-body .rv-title', n => n.map(x => x.textContent)), '| luz due:', await p.evaluate(() => state.tasks.find(t => t.id === 't1').due), '| note line:', await p.evaluate(() => state.notes.find(n => n.id === 'a').body.split('\n')[2]));
  await p.click('#review-next');
  console.log('step 2:', await p.textContent('#review-title'), await p.$$eval('#review-body .rv-title', n => n.map(x => x.textContent)));
  await p.click('#review-body .rv-row:has-text("Ordenar el garaje") button:has-text("Algún día")');
  console.log('someday tags:', await p.evaluate(() => state.tasks.find(t => t.id === 't2').tags), '| rows left:', await p.$$eval('#review-body .rv-row', n => n.length));
  await p.click('#review-next');
  console.log('step 3:', await p.textContent('#review-title'), await p.$$eval('#review-body .rv-title', n => n.map(x => x.textContent)));
  await p.click('#review-next');
  await p.fill('#review-body input[type=text]', 'Preparar demo !alta');
  await p.press('#review-body input[type=text]', 'Enter');
  console.log('step 4:', await p.textContent('#review-title'), '| next week tasks:', await p.$$eval('#review-body .list .task-title, #review-body .list .title', n => n.map(x => x.textContent)));
  await p.click('#review-next');
  console.log('step 5:', await p.textContent('#review-body'));
  await p.click('#review-next');
  await p.fill('#review-body textarea >> nth=0', 'Terminé el diseño');
  await p.fill('#review-body textarea >> nth=1', 'Me distraje con el correo');
  await p.fill('[aria-label="Prioridad 1"]', 'Lanzar la web');
  await p.fill('[aria-label="Prioridad 2"]', 'Cerrar presupuesto');
  await p.screenshot({ path: S + '/review-6.png' });
  await p.click('#review-finish'); await p.clock.runFor(300);
  const rev = await p.evaluate(() => state.notes.find(n => n.path.startsWith('Revisiones/')));
  console.log('review note:', rev.path, '\n' + rev.body);
  console.log('priority tasks:', await p.evaluate(() => state.tasks.filter(t => ['Lanzar la web', 'Cerrar presupuesto'].includes(t.title)).map(t => `${t.title}|${t.due}|${t.priority}`)));
  console.log('log:', await p.evaluate(() => state.log.filter(e => e.type === 'goal').map(e => e.text)), '| lastReview:', await p.evaluate(() => state.settings.lastReview));
  await p.evaluate(() => showView('today'));
  console.log('nudge after review:', await p.isVisible('#today-review'));
  await p.emulateMedia({ colorScheme: 'dark' }); await p.evaluate(() => showView('review')); await p.screenshot({ path: S + '/review-dark.png' });
  console.log('errors:', errs); await b.close();
})();
