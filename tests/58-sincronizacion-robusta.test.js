const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
// Almacén simulado (como en 08 y 12), con extras: sin conexión (__offline), foto de la caché (__meta),
// nube inicial guardada para recargar la página (__cloud) y reloj desplazado (skew).
const mock = ([initial, skew]) => {
  if (skew) { const n = Date.now; Date.now = () => n() + skew; }
  const saved = localStorage.getItem('__cloud');
  const docs = new Map(Object.entries(saved ? JSON.parse(saved) : initial || {}));
  let listener = null;
  window.__offline = false; window.__meta = {};
  const snap = () => ({ docs: [...docs].map(([id, d]) => ({ id, exists: true, data: () => d })), metadata: { hasPendingWrites: false, ...window.__meta } });
  window.__docs = docs;
  window.__emit = () => listener && listener(snap());
  const fail = () => { const e = new Error('offline'); e.code = 'unavailable'; throw e; };
  const col = {
    doc: (id) => ({ async set(d) { if (window.__offline) fail(); docs.set(id, JSON.parse(JSON.stringify(d))); }, async delete() { if (window.__offline) fail(); docs.delete(id); } }),
    onSnapshot(next) { listener = next; setTimeout(() => next(snap()), 30); return () => {}; },
  };
  // Otras colecciones (p. ej. las listas compartidas) no se quedan con el oyente de los datos.
  const other = { doc: () => ({ async set() {}, async delete() {} }), onSnapshot: () => () => {} };
  window.claude = { use: async (n) => (n === 'db' ? { collection: (path) => (path.startsWith('data/users/') ? col : other) } : n === 'user' ? { id: async () => 'u_x' } : null) };
};

(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const check = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    console.log(`${ok ? 'ok' : 'FALLA'} ${name}: ${JSON.stringify(got)}`);
    if (!ok) errs.push(`${name}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`);
  };
  const now = Date.now();
  const task = (id, title, extra = {}) => ({ id, title, priority: 2, done: false, createdAt: now - 864e5, tags: [], ...extra });
  const base = (extra) => ({ tasks: [], habits: [], settings: { notesWelcome: true, logVersion: 1 }, pomodoros: {}, updatedAt: 1, ...extra });
  const open = async (local, remote, skew = 0) => {
    const c = await b.newContext();
    if (local) await c.addInitScript((l) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(l)); }, local);
    await c.addInitScript(mock, [remote, skew]);
    const p = await c.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(url);
    await p.waitForTimeout(1200);
    return p;
  };
  const dump = (p) => p.evaluate(() => JSON.parse(JSON.stringify(Object.fromEntries([...window.__docs]))));
  // Entrega a `p` la nube entera (como una foto nueva) y deja que suba lo suyo.
  const deliver = async (p, docs, wait = 1200) => {
    await p.evaluate((d) => { window.__docs.clear(); Object.entries(d).forEach(([k, v]) => window.__docs.set(k, v)); window.__emit(); }, docs);
    await p.waitForTimeout(wait);
  };
  const titles = (p) => p.evaluate(() => Object.fromEntries(state.tasks.map((t) => [t.id, t.title])));

  // ---------- 1A. Arranque tras días sin conexión: archivar al arrancar no gana a la nube ----------
  {
    const A = await open(base({ tasks: [task('t1', 'Uno'), task('t2', 'Dos'), task('old', 'Vieja', { done: true, completedAt: now - 30 * 864e5 })], settings: { notesWelcome: true, logVersion: 1, archiveDays: -1 } }), {});
    await A.waitForTimeout(600);
    const B = await open(null, await dump(A));
    await B.evaluate(() => { state.settings.archiveDays = 7; });
    await B.evaluate(() => save()); await B.waitForTimeout(1200);
    await deliver(A, await dump(B));
    // B se queda sin conexión; A edita t1 y sincroniza.
    await A.evaluate(() => { state.tasks.find((t) => t.id === 't1').title = 'Uno (escritorio)'; save(); });
    await A.waitForTimeout(1200);
    const cloud = await dump(A);
    // B vuelve a abrir días después: al arrancar archiva «Vieja» (save()) y luego llega la nube.
    await B.evaluate((d) => localStorage.setItem('__cloud', JSON.stringify(d)), cloud);
    await B.evaluate(() => flushLocal());
    await B.reload(); await B.waitForTimeout(1500);
    check('1A B conserva la edición del escritorio', (await titles(B)).t1, 'Uno (escritorio)');
    check('1A «Vieja» archivada en B', await B.evaluate(() => state.archive.map((t) => t.id)), ['old']);
    const after = await dump(B);
    check('1A la nube conserva la edición', after.state.tasks.find((t) => t.id === 't1').title, 'Uno (escritorio)');
    await A.context().close(); await B.context().close();
  }

  // ---------- 1B. Cada dispositivo edita una tarea distinta: se juntan ----------
  {
    const A = await open(base({ tasks: [task('x', 'X'), task('y', 'Y'), task('z', 'Z')] }), {});
    await A.waitForTimeout(600);
    const B = await open(null, await dump(A));
    await B.evaluate(() => { window.__offline = true; state.tasks.find((t) => t.id === 'x').title = 'X de B'; save(); });
    await B.waitForTimeout(1200);
    await A.evaluate(() => { state.tasks.find((t) => t.id === 'y').title = 'Y de A'; state.tasks = state.tasks.filter((t) => t.id !== 'z'); save(); });
    await A.waitForTimeout(1200);
    await B.evaluate(() => { state.ideas.push({ id: 'i1', text: 'Idea de B', createdAt: Date.now() }); save(); });
    await B.waitForTimeout(1200);
    await B.evaluate(() => { window.__offline = false; });
    await deliver(B, await dump(A));
    check('1B B tiene las dos ediciones (y no la borrada)', await titles(B), { x: 'X de B', y: 'Y de A' });
    const cloud = await dump(B);
    check('1B nube', [cloud.state.tasks.map((t) => t.title), cloud.ideas.items.map((i) => i.text)], [['X de B', 'Y de A'], ['Idea de B']]);
    check('1B lápida de la borrada', (cloud.state.gone || []).map((g) => `${g.k}:${g.id}`), ['tasks:z']);
    await deliver(A, cloud);
    check('1B A tiene las dos ediciones', await titles(A), { x: 'X de B', y: 'Y de A' });
    // Una copia vieja con la tarea borrada no la devuelve.
    const stale = JSON.parse(JSON.stringify(cloud));
    stale.state.tasks.push(task('z', 'Z'));
    delete stale.state.gone;
    stale.state.updatedAt = Date.now() + 9e5;
    await deliver(A, stale);
    check('1B la borrada no vuelve', Object.keys(await titles(A)).sort(), ['x', 'y']);
    await A.context().close(); await B.context().close();
  }

  // ---------- 2. Reloj atrasado: la versión de B se acepta igual ----------
  {
    const A = await open(base({ notes: [{ id: 'n1', path: 'Compartida', body: 'Hola', createdAt: now, updatedAt: now }] }), {});
    await A.waitForTimeout(600);
    const B = await open(null, await dump(A), -120000);
    await B.evaluate(() => { const n = state.notes.find((x) => x.id === 'n1'); n.body = 'Hola desde B'; n.updatedAt = Date.now(); save(); });
    await B.waitForTimeout(1200);
    const cloud = await dump(B);
    check('2 versión de B mayor que la de A', cloud['note-n1'].updatedAt > (await A.evaluate(() => state.syncMeta.times['note-n1'])), true);
    await deliver(A, cloud);
    check('2 A recibe lo de B', await A.evaluate(() => state.notes.find((x) => x.id === 'n1').body), 'Hola desde B');
    await A.context().close(); await B.context().close();
  }

  // ---------- 3. Deshacer solo lo que hizo el cambio ----------
  {
    const A = await open(base({ tasks: [task('a', 'Borrable'), task('b', 'Otra'), task('c', 'Tercera')] }), {});
    await A.waitForTimeout(600);
    const remoteNote = { note: { id: 'rn', path: 'Remota', body: 'De B', createdAt: now, updatedAt: now }, updatedAt: Date.now() + 1000 };
    const today = await A.evaluate(() => dateKey());
    await A.evaluate(() => { window.__c = state.tasks.find((t) => t.id === 'c'); deleteTask(state.tasks.find((t) => t.id === 'a')); });
    await A.waitForTimeout(1200);
    const cloud = await dump(A);
    cloud['note-rn'] = remoteNote;
    await deliver(A, cloud, 300);
    await A.evaluate((d) => {
      state.pomodoros[d] = (state.pomodoros[d] || 0) + 1;
      state.focusLog.push({ id: 'f-1', start: Date.now() - 1500e3, end: Date.now(), date: d, minutes: 25, kind: 'focus', completed: true, updatedAt: Date.now() });
      state.tasks.find((t) => t.id === 'b').done = true;
      save();
    }, today);
    await A.click('#toast .toast-action');
    await A.waitForTimeout(1200);
    const s = await A.evaluate((d) => ({ tasks: state.tasks.map((t) => `${t.id}${t.done ? '+' : ''}`), note: state.notes.some((n) => n.id === 'rn'), pomos: state.pomodoros[d], log: state.focusLog.length, same: window.__c === state.tasks.find((t) => t.id === 'c') }), today);
    check('3 deshacer: vuelve la tarea y se queda lo demás', s, { tasks: ['a', 'b+', 'c'], note: true, pomos: 1, log: 1, same: true });
    check('3 la nota remota sigue en la nube', !!(await dump(A))['note-rn'], true);
    // Cambió después: no se pisa y se avisa.
    await A.evaluate(() => { window.__t = state.tasks.find((t) => t.id === 'c'); withUndo('Renombrada', () => (window.__t.title = 'Renombrada')); });
    await A.evaluate(() => { window.__t.priority = 3; save(); });
    await A.click('#toast .toast-action');
    check('3 aviso al no poder', [await A.textContent('#toast'), await A.evaluate(() => window.__t.title)], ['No se pudo deshacer del todo: cambió después', 'Renombrada']);
    // Sin cambios después: se restaura en el mismo objeto.
    await A.evaluate(() => withUndo('Renombrada', () => (window.__t.title = 'Otra vez')));
    await A.click('#toast .toast-action');
    check('3 restaurada en el mismo objeto', await A.evaluate(() => [window.__t.title, state.tasks.includes(window.__t), $('#toast').hidden]), ['Renombrada', true, true]);
    await A.context().close();
  }

  // ---------- 4. Deshacer el borrado de una archivada: el otro dispositivo no la vuelve a borrar ----------
  {
    const A = await open(base({ archive: [task('ar', 'Archivada', { done: true, completedAt: now - 3600e3 })] }), {});
    await A.waitForTimeout(600);
    const B = await open(null, await dump(A));
    check('4 B la tiene', await B.evaluate(() => state.archive.map((t) => t.id)), ['ar']);
    await A.evaluate(() => deleteTask(state.archive.find((t) => t.id === 'ar')));
    await A.waitForTimeout(1200);
    await deliver(B, await dump(A), 600);
    check('4 B la borra', await B.evaluate(() => state.archive.length), 0);
    await A.click('#toast .toast-action');
    await A.waitForTimeout(1200);
    await deliver(B, await dump(A));
    check('4 B la recupera', await B.evaluate(() => state.archive.map((t) => t.id)), ['ar']);
    await deliver(A, await dump(B));
    check('4 A la conserva', await A.evaluate(() => state.archive.map((t) => t.id)), ['ar']);
    const m = Object.keys(await dump(A)).find((k) => k.startsWith('archive-'));
    check('4 sin «gone» para ella', ((await dump(A))[m].gone || []).length, 0);
    await A.context().close(); await B.context().close();
  }

  // ---------- 5. Una foto sin documentos no borra nada ----------
  {
    const A = await open(base({ notes: [{ id: 'k1', path: 'Guardada', body: 'Texto', createdAt: now, updatedAt: now }] }), {});
    await A.waitForTimeout(600);
    const full = await dump(A);
    check('5 syncMeta por usuario', await A.evaluate(() => state.syncMeta.user), 'u_x');
    await deliver(A, {}, 400);
    check('5 nube vacía: la nota sigue', await A.evaluate(() => state.notes.some((n) => n.id === 'k1')), true);
    const without = { ...full };
    delete without['note-k1'];
    await A.evaluate(() => (window.__meta = { fromCache: true }));
    await deliver(A, without, 400);
    check('5 foto de la caché: la nota sigue', await A.evaluate(() => state.notes.some((n) => n.id === 'k1')), true);
    await A.evaluate(() => (window.__meta = {}));
    await deliver(A, without, 400);
    check('5 borrada de verdad en otro dispositivo', await A.evaluate(() => state.notes.some((n) => n.id === 'k1')), false);
    await A.context().close();
  }

  // ---------- 6 y 7. Notas protegidas ----------
  {
    const A = await open(base({ notes: [{ id: 'p1', path: 'Secreta', body: 'En claro', createdAt: now, updatedAt: now }] }), {});
    await A.waitForTimeout(600);
    const cloud = await dump(A);
    // 6: llega protegida desde otro dispositivo: se olvida el historial en claro.
    await A.evaluate(() => { window.__forgot = []; const f = forgetHistory; window.forgetHistory = (id) => (window.__forgot.push(id), f(id)); noteHist.set('p1', { cur: { text: 'En claro' }, undo: [], redo: [] }); });
    const enc = JSON.parse(JSON.stringify(cloud));
    enc['note-p1'] = { note: { id: 'p1', path: 'Secreta', body: '🔒', enc: { v: 1, salt: 'cw==', iv: 'aXY=', ct: 'Y3Q=' }, createdAt: now, updatedAt: Date.now() }, updatedAt: Date.now() + 1000 };
    await deliver(A, enc, 400);
    check('6 historial olvidado', await A.evaluate(() => [window.__forgot, noteHist.has('p1')]), [['p1'], false]);
    // 7: B protege la suya (como 27 hoy: sin lo último enviado) y llega una copia en claro más antigua.
    const B = await open(null, cloud);
    await B.evaluate(() => {
      window.__offline = true;
      const n = state.notes.find((x) => x.id === 'p1');
      n.enc = { v: 1, salt: 'cw==', iv: 'aXY=', ct: 'QkI=' }; n.body = '🔒'; n.updatedAt = Date.now();
      delete state.syncMeta.sent['note-p1'];
      save();
    });
    await B.waitForTimeout(1200);
    const plain = JSON.parse(JSON.stringify(cloud));
    plain['note-p1'].note.body = 'Editada en claro (antes)';
    plain['note-p1'].note.updatedAt = now + 1;
    plain['note-p1'].updatedAt = Date.now() + 5000;
    await B.evaluate(() => (window.__offline = false));
    await deliver(B, plain);
    check('7 B conserva la cifrada', await B.evaluate(() => state.notes.find((x) => x.id === 'p1').enc?.ct), 'QkI=');
    check('7 la nube recibe la cifrada', (await dump(B))['note-p1'].note.enc?.ct, 'QkI=');
    await A.context().close(); await B.context().close();
  }

  // ---------- 8. Contadores de enfoque tras fusionar ----------
  {
    const d = '2026-10-01';
    const rec = (id, at) => ({ id, start: at - 1500e3, end: at, date: d, minutes: 25, kind: 'focus', completed: true, updatedAt: at });
    const A = await open(base({ pomodoros: { [d]: 1 }, focusMinutes: { [d]: 25 }, focusLog: [rec('f-1', now - 9e6)] }), {});
    await A.waitForTimeout(600);
    const B = await open(null, await dump(A));
    await B.evaluate(([d, r]) => { window.__offline = true; state.focusLog.push(r); state.pomodoros[d]++; state.focusMinutes[d] += 25; save(); }, [d, rec('f-3', now - 3e6)]);
    await B.waitForTimeout(1200);
    await A.evaluate(([d, r]) => { state.focusLog.push(r); state.pomodoros[d]++; state.focusMinutes[d] += 25; save(); }, [d, rec('f-2', now - 6e6)]);
    await A.waitForTimeout(1200);
    await B.evaluate(() => (window.__offline = false));
    await deliver(B, await dump(A));
    check('8 B cuadra con focusLog', await B.evaluate((d) => [state.focusLog.length, state.pomodoros[d], state.focusMinutes[d]], d), [3, 3, 75]);
    await deliver(A, await dump(B));
    check('8 A cuadra con focusLog', await A.evaluate((d) => [state.focusLog.length, state.pomodoros[d], state.focusMinutes[d]], d), [3, 3, 75]);
    await A.context().close(); await B.context().close();
  }

  console.log('errors:', errs);
  await b.close();
})();
