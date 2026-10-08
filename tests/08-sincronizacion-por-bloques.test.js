const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
// Almacén simulado: una colección de documentos con onSnapshot.
const mock = (initial) => {
  const docs = new Map(Object.entries(initial || {}));
  let listener = null;
  const snap = () => ({ docs: [...docs].map(([id, d]) => ({ id, exists: true, data: () => d })), metadata: { hasPendingWrites: false } });
  window.__docs = docs; window.__writes = [];
  window.__emit = () => listener && listener(snap());
  const col = {
    doc: (id) => ({ async set(d) { window.__writes.push(id); docs.set(id, JSON.parse(JSON.stringify(d))); }, async delete() { window.__writes.push('-' + id); docs.delete(id); } }),
    onSnapshot(next) { listener = next; setTimeout(() => next(snap()), 30); return () => {}; },
  };
  window.claude = { use: async (n) => n === 'db' ? { collection: () => col } : n === 'user' ? { id: async () => 'u_x' } : null };
};
(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const open = async (local, remote) => {
    const c = await b.newContext();
    if (local) await c.addInitScript((l) => localStorage.setItem('enfoque:v1', JSON.stringify(l)), local);
    await c.addInitScript(mock, remote);
    const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(url); await p.waitForTimeout(1200); return p;
  };
  const dump = (p) => p.evaluate(() => Object.fromEntries([...window.__docs]));

  // 1) Dispositivo A con datos de la versión anterior + nube vieja casi vacía y más reciente.
  const legacy = { tasks: [{ id: 'a', title: 'Tarea antigua', priority: 2, done: false, createdAt: 1 }], habits: [], settings: { focus: 25, short: 5, long: 15 }, pomodoros: {} };
  const A = await open(legacy, { state: { tasks: [], habits: [], settings: { accent: 'teal' }, updatedAt: Date.now() } });
  console.log('A keeps legacy:', await A.evaluate(() => state.tasks.map(t => t.title)), '| cloud state tasks:', (await dump(A)).state.tasks.map(t => t.title));

  // 2) A crea diario, idea y mapa.
  await A.evaluate(() => showView('journal')); await A.fill('#journal-fields textarea', 'Probando la sincronización'); await A.click('#journal-form button[type=submit]');
  await A.click('#dump-convert button:has-text("Ahora no")');
  await A.evaluate(() => showView('ideas')); await A.fill('#idea-text', 'Idea sincronizada'); await A.click('#idea-form button');
  await A.click('[data-ideaview=maps]'); await A.fill('#map-title', 'Mapa compartido'); await A.click('#map-form button');
  await A.click('#mm-child'); await A.keyboard.type('Rama 1'); await A.keyboard.press('Enter');
  await A.waitForTimeout(1500);
  const cloud = await dump(A);
  console.log('cloud docs:', Object.keys(cloud).sort().map(k => k.replace(/map-.+/, 'map-*')), '| writes:', (await A.evaluate(() => window.__writes)).map(k => k.replace(/map-.+/, 'map-*')).join(','));

  // 3) Dispositivo B vacío recibe todo.
  const B = await open(null, cloud);
  const bState = await B.evaluate(() => { const s = (flushLocal(), JSON.parse(localStorage.getItem('enfoque:v1'))); return [s.tasks.map(t => t.title), s.journal.map(e => e.text), s.ideas.map(i => i.text), s.maps.map(m => m.nodes.map(n => n.text))]; });
  console.log('B got:', JSON.stringify(bState), '| B writes on open:', await B.evaluate(() => window.__writes.length));

  // 4) B borra el mapa -> A lo pierde al recibir la nube sin ese documento.
  await B.evaluate(() => showView('ideas')); await B.click('[data-ideaview=maps]'); await B.click('.map-card .del'); await B.waitForTimeout(1500);
  const cloud2 = await dump(B);
  console.log('cloud after B delete:', Object.keys(cloud2).sort());
  await A.evaluate((d) => { window.__docs.clear(); Object.entries(d).forEach(([k, v]) => window.__docs.set(k, v)); window.__emit(); }, cloud2);
  await A.waitForTimeout(300);
  console.log('A maps after:', await A.evaluate(() => (flushLocal(), JSON.parse(localStorage.getItem('enfoque:v1'))).maps.length));

  // 5) Cambio remoto en el diario llega a A en vivo; un cambio local sin subir no se pisa.
  const month = Object.keys(cloud2).find(k => k.startsWith('journal-'));
  await A.evaluate(([m, d]) => { const doc = d[m]; doc.items[0].text = 'Editado en B'; doc.updatedAt = Date.now() + 5000; window.__docs.set(m, doc); window.__emit(); }, [month, cloud2]);
  await A.evaluate(() => showView('journal'));
  console.log('A journal live:', await A.$$eval('.entry-text', n => n.map(x => x.textContent)));
  console.log('errors:', errs); await b.close();
})();
