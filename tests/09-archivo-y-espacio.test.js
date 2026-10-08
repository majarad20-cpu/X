const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2], S = process.argv[3];
const DAY = 864e5, now = new Date('2026-10-07T10:00:00').getTime();
const task = (id, title, extra) => ({ id, title, priority: 2, done: false, createdAt: now - 30 * DAY, tags: [], subtasks: [], ...extra });
const seed = {
  tasks: [
    task('a', 'Hecha hace 10 días', { done: true, completedAt: now - 10 * DAY, projectId: 'p1' }),
    task('b', 'Hecha hace 2 días', { done: true, completedAt: now - 2 * DAY, projectId: 'p1' }),
    task('c', 'Hecha hace 40 días', { done: true, completedAt: now - 40 * DAY }),
    task('d', 'Pendiente', { projectId: 'p1' }),
  ],
  habits: [], settings: { focus: 25, short: 5, long: 15 }, pomodoros: {},
  projects: [{ id: 'p1', name: 'Web', status: 'active', color: 'teal', createdAt: now - 30 * DAY, manual: null }],
  ideas: Array.from({ length: 800 }, (_, i) => ({ id: 'i' + i, text: 'Idea número ' + i + ' ' + 'x'.repeat(220), tags: [], createdAt: now, updatedAt: now })),
};
const mock = () => {
  const docs = new Map(); let listener;
  window.__docs = docs;
  const col = {
    doc: (id) => ({ async set(d) { if (JSON.stringify(d).length > 256 * 1024) { const e = new Error('too big'); e.code = 'invalid_argument'; throw e; } docs.set(id, d); }, async delete() { docs.delete(id); } }),
    onSnapshot(next) { listener = next; setTimeout(() => next({ docs: [], metadata: { hasPendingWrites: false } }), 30); return () => {}; },
  };
  window.claude = { use: async (n) => n === 'db' ? { collection: () => col } : n === 'user' ? { id: async () => 'u' } : null };
};
(async () => {
  const b = await chromium.launch(launchOptions);
  const c = await b.newContext({ viewport: { width: 390, height: 900 } });
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, seed);
  await c.addInitScript(mock);
  const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.clock.install({ time: new Date(now) });
  await p.goto(url); await p.waitForTimeout(2000);
  const st = () => p.evaluate(() => { const s = JSON.parse(localStorage.getItem('enfoque:v1')); return { tasks: s.tasks.map(t => t.id).join(''), archive: s.archive.map(t => t.id).join('') }; });
  console.log('after load:', await st());
  console.log('cloud docs:', await p.evaluate(() => [...window.__docs.keys()].sort()));
  console.log('sync status:', await p.textContent('#sync-status'), '| gear warn:', await p.$eval('#open-settings', x => x.classList.contains('warn')));
  await p.evaluate(() => showView('tasks')); await p.click('[data-filter=done]');
  console.log('Hechas:', await p.$$eval('#task-list .title', n => n.map(x => x.textContent)));
  await p.click('#task-list .task:has-text("10 días") input[type=checkbox]');
  console.log('after uncheck archived:', await st());
  await p.evaluate(() => showView('projects'));
  console.log('project card:', await p.textContent('.project-card .pc-meta'));
  await p.evaluate(() => document.getElementById('open-settings').click());
  console.log('meter:', await p.$$eval('.storage-row', n => n.map(x => x.innerText.replace(/\n/g, ' | '))));
  await p.screenshot({ path: S + '/storage.png', fullPage: true });
  // Al borrar ideas se libera espacio y la sincronización vuelve.
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('enfoque:v1')); }); 
  console.log('errors:', errs); await b.close();
})();
