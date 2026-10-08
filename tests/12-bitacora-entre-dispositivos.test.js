const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const now = new Date('2026-10-07T09:00:00').getTime();
const mock = (initial) => {
  const docs = new Map(Object.entries(initial)); let listener;
  window.__docs = docs;
  const snap = () => ({ docs: [...docs].map(([id, d]) => ({ id, exists: true, data: () => d })), metadata: { hasPendingWrites: false } });
  window.__emit = () => listener(snap());
  const col = { doc: (id) => ({ async set(d) { docs.set(id, JSON.parse(JSON.stringify(d))); }, async delete() { docs.delete(id); } }),
    onSnapshot(next) { listener = next; setTimeout(() => next(snap()), 30); return () => {}; } };
  window.claude = { use: async (n) => n === 'db' ? { collection: () => col } : n === 'user' ? { id: async () => 'u' } : null };
};
(async () => {
  const b = await chromium.launch(launchOptions);
  // La nube ya tiene un hito del móvil (B); este dispositivo (A) registra otro sin haber sincronizado.
  const remote = { 'log-2026-10': { items: [{ id: 'fromB', type: 'idea', text: 'Idea desde el móvil', date: '2026-10-07', at: now - 600e3 }], updatedAt: now + 60e3 } };
  const local = { tasks: [], habits: [], settings: { focus: 25, short: 5, long: 15, logVersion: 1 }, pomodoros: {},
    log: [{ id: 'fromA', type: 'task', text: 'Tarea desde el ordenador', date: '2026-10-07', at: now - 300e3 }], updatedAt: now + 120e3 };
  const c = await b.newContext();
  await c.addInitScript((l) => localStorage.setItem('enfoque:v1', JSON.stringify(l)), local);
  await c.addInitScript(mock, remote);
  const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.clock.install({ time: new Date(now) });
  await p.goto(url); await p.waitForTimeout(1500);
  console.log('A log:', await p.$$eval('.log-item .log-text', n => n.map(x => x.textContent)));
  console.log('cloud log:', await p.evaluate(() => window.__docs.get('log-2026-10').items.map(e => e.id)));
  console.log('errors:', errs); await b.close();
})();
