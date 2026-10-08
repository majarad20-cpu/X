const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2], S = process.argv[3];
const DAY = 864e5, now = new Date('2026-10-07T09:00:00').getTime();
const seed = {
  tasks: [
    { id: 'old', title: 'Enviar factura', priority: 2, done: true, completedAt: now - DAY, createdAt: now - 3 * DAY, tags: [], subtasks: [] },
    { id: 'p1t1', title: 'Diseñar portada', priority: 2, done: false, createdAt: now - 3 * DAY, projectId: 'p1', tags: [], subtasks: [] },
    { id: 'p1t2', title: 'Escribir textos', priority: 2, done: false, createdAt: now - 3 * DAY, projectId: 'p1', tags: [], subtasks: [] },
  ],
  habits: [{ id: 'h1', name: 'Leer', log: Object.fromEntries([1,2,3,4,5,6].map(i => [new Date(now - i * DAY).toISOString().slice(0,10), true])) },
           { id: 'h2', name: 'Gimnasio', goal: 2, log: { [new Date(now - DAY).toISOString().slice(0,10)]: true } }],
  settings: { focus: 25, short: 5, long: 15 }, pomodoros: {},
  projects: [{ id: 'p1', name: 'Web', status: 'active', color: 'teal', createdAt: now - 3 * DAY, manual: null }],
  journal: [{ id: 'j0', date: new Date(now - DAY).toISOString().slice(0,10), createdAt: now - DAY + 3600e3, kind: 'free', text: 'Ayer escribí', mood: 3 }],
};
(async () => {
  const b = await chromium.launch(launchOptions);
  const c = await b.newContext({ viewport: { width: 390, height: 900 } });
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, seed);
  const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.clock.install({ time: new Date(now) });
  await p.goto(url);
  const log = () => p.$$eval('.log-item', n => n.map(x => x.innerText.replace(/\n/g, ' ')));
  console.log('today at start:', await log(), '|', await p.textContent('#log-empty'));
  await p.click('#log-prev');
  console.log('yesterday (backfill):', await p.textContent('#log-title'), await log(), '| summary:', await p.$$eval('.log-chip', n => n.map(x => x.textContent)));
  await p.click('#log-today');
  // Hitos de hoy desde varias pestañas
  await p.clock.fastForward('00:10'); await p.click('.habit-chip:has-text("Leer")');          // racha de 7
  await p.clock.fastForward('00:10'); await p.click('.habit-chip:has-text("Gimnasio")');      // objetivo 2/semana
  await p.evaluate(() => showView('projects')); await p.click('.project-card'); await p.clock.fastForward('00:10');
  await p.click('#pd-tasks .task:has-text("Diseñar") input[type=checkbox]');                   // 50 %
  await p.evaluate(() => showView('timer')); await p.click('summary'); await p.fill('#set-focus', '1'); await p.dispatchEvent('#set-focus', 'change');
  await p.selectOption('#timer-task', { label: 'Escribir textos' }); await p.click('#timer-start'); await p.clock.fastForward('01:05');
  await p.evaluate(() => showView('journal')); await p.fill('#journal-fields textarea', 'Buen día de trabajo'); await p.click('.mood:has-text("Genial")'); await p.click('#journal-form button[type=submit]');
  await p.evaluate(() => showView('ideas')); await p.fill('#idea-text', 'Newsletter mensual #marketing'); await p.click('#idea-form button');
  await p.evaluate(() => showView('tasks')); await p.click('#task-list .task:has-text("Escribir textos") input[type=checkbox]'); // 100 %
  await p.evaluate(() => showView('today'));
  console.log('today log:', await log());
  console.log('summary:', await p.$$eval('.log-chip', n => n.map(x => x.textContent)));
  await p.screenshot({ path: S + '/log.png', fullPage: true });
  // Desmarcar retira el hito
  await p.evaluate(() => showView('tasks')); await p.click('[data-filter=done]'); await p.click('#task-list .task:has-text("Escribir textos") input[type=checkbox]');
  await p.evaluate(() => showView('today'));
  console.log('after uncheck:', (await log()).filter(x => x.includes('Escribir') || x.includes('100')));
  // Borrar la idea no borra el hito
  await p.evaluate(() => showView('ideas')); await p.click('.idea .danger-link'); await p.evaluate(() => showView('today'));
  console.log('idea still logged:', (await log()).some(x => x.includes('Newsletter')));
  await p.evaluate(() => document.getElementById('open-settings').click());
  console.log('meter row:', await p.$eval('.storage-row:nth-child(5)', x => x.innerText.replace(/\n/g, ' | ')));
  await p.emulateMedia({ colorScheme: 'dark' }); await p.evaluate(() => showView('today')); await p.screenshot({ path: S + '/log-dark.png', fullPage: true });
  console.log('errors:', errs); await b.close();
})();
