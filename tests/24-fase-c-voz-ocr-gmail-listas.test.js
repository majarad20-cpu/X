const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2], S = process.argv[3];
const now = new Date('2026-10-08T10:00:00').getTime();
const seed = { tasks: [], habits: [], settings: { notesWelcome: true }, notes: [{ id: 'a', path: 'Viaje', body: 'Plan:\n', createdAt: 1, updatedAt: 1 }], updatedAt: 1 };

// Claude simulado: imágenes, JSON para el correo, Gmail por MCP y un almacén compartido en memoria.
const mock = (who) => {
  const docs = (window.__store = window.__store || new Map());
  const listeners = new Set();
  const snapOf = (col, order) => {
    const rows = [...docs].filter(([p]) => p.startsWith(col + '/') && p.slice(col.length + 1).split('/').length === 1).map(([p, d]) => ({ id: p.split('/').pop(), exists: true, data: () => d, metadata: { hasPendingWrites: false, fromCache: false } }));
    if (order) rows.sort((a, b) => ((a.data()[order.f] ?? 0) - (b.data()[order.f] ?? 0)) * (order.dir === 'desc' ? -1 : 1));
    return { docs: rows, size: rows.length, empty: !rows.length, metadata: { hasPendingWrites: false, fromCache: false }, docChanges: () => [] };
  };
  const notify = () => listeners.forEach((l) => setTimeout(() => l.next(snapOf(l.col, l.order)), 5));
  window.__notify = notify;
  const docRef = (path) => ({
    id: path.split('/').pop(), path,
    get: async () => ({ id: path.split('/').pop(), exists: docs.has(path), data: () => docs.get(path), metadata: {} }),
    set: async (d) => { docs.set(path, JSON.parse(JSON.stringify(d))); notify(); },
    update: async (d) => { if (!docs.has(path)) throw { code: 'invalid_argument' }; docs.set(path, { ...docs.get(path), ...JSON.parse(JSON.stringify(d)) }); notify(); },
    delete: async () => { docs.delete(path); notify(); },
    collection: (sub) => colRef(`${path}/${sub}`),
  });
  let n = 0;
  const colRef = (col, order) => ({
    path: col,
    doc: (id) => docRef(`${col}/${id || 'x' + Date.now().toString(36) + n++}`),
    add: async (d) => { const r = docRef(`${col}/x${Date.now().toString(36)}${n++}`); await r.set(d); return r; },
    orderBy: (f, dir) => colRef(col, { f, dir }),
    where: () => colRef(col, order), limit: () => colRef(col, order),
    onSnapshot(next) { const l = { col, order, next }; listeners.add(l); setTimeout(() => next(snapOf(col, order)), 10); return () => listeners.delete(l); },
  });
  const db = { doc: docRef, collection: (c) => colRef(c) };
  const user = { id: async () => who, isOwner: async () => who === 'u_ana', can: async () => true, profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { id: i, name: { u_ana: 'Ana', u_luis: 'Luis' }[i] || '' }])) };
  window.__mailCalls = [];
  const mcp = {
    callTool: async (server, tool, input) => {
      window.__mailCalls.push([server, tool, JSON.stringify(input)]);
      if (server !== 'Gmail') throw { code: 'server_not_connected' };
      if (tool === 'search_threads') return { payload: { threads: [
        { id: 't1', viewUrl: 'https://mail.google.com/mail/#all/t1', messages: [{ threadId: 't1', subject: 'Re: Presupuesto reforma', sender: 'Laura Gómez <laura@ejemplo.com>', date: '2026-10-08T08:00:00Z', snippet: 'Hola, ¿me envías el presupuesto antes del viernes?', labelIds: ['UNREAD', 'INBOX'] }] },
        { id: 't2', viewUrl: 'javascript:alert(1)', messages: [{ threadId: 't2', subject: 'Reunión de equipo', sender: 'jefe@ejemplo.com', date: '2026-10-07T08:00:00Z', snippet: 'Agenda adjunta', labelIds: ['INBOX'] }] },
      ] } };
      if (tool === 'get_thread') return { payload: { messages: [{ sender: 'Laura', date: '2026-10-08', plaintextBody: 'Necesito el presupuesto antes del viernes y que me confirmes la fecha de inicio.' }] } };
    },
  };
  const sample = async (input, o = {}) => { window.__img = o.images && o.images.length; return { text: 'Pan\nLeche' }; };
  sample.json = async () => ({ tareas: [{ titulo: 'Enviar presupuesto a Laura', fecha: '2026-10-09', prioridad: 'alta' }, { titulo: 'Confirmar fecha de inicio', fecha: null, prioridad: 'media' }] });
  sample.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 5, maxInputBytes: 5e6, mediaTypes: ['image/jpeg', 'image/png', 'image/webp'] } });
  window.claude = { use: async (k) => ({ db, user, mcp, sample }[k] || null) };
};

(async () => {
  const b = await chromium.launch({ ...launchOptions, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const errs = [];
  const c = await b.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['microphone'] });
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, seed);
  await c.addInitScript(mock, 'u_ana');
  const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(url); await p.waitForFunction(() => document.documentElement.dataset.ready); await p.waitForTimeout(400);

  // ---- Nota de voz
  await p.keyboard.press('Control+o'); await p.keyboard.type('Viaje'); await p.keyboard.press('Enter');
  if (!(await p.isVisible('#note-editor'))) await p.keyboard.press('Control+e');
  await p.click('#note-editor'); await p.keyboard.press('Control+End'); await p.keyboard.type('/voz'); await p.keyboard.press('Enter');
  await p.waitForTimeout(1800);
  console.log('recording:', await p.evaluate(() => document.getElementById('voice').classList.contains('recording')));
  await p.click('#voice-stop'); await p.waitForTimeout(1000);
  console.log('voice in note:', await p.evaluate(() => /!\[🎤 Nota de voz · 0:0\d · \d\d:\d\d\]\(audio:[a-z0-9]+\)/.test(activeNote().body)));
  await p.keyboard.press('Control+e'); await p.waitForTimeout(300);
  console.log('audio playable:', await p.$eval('#note-reading audio', (a) => a.src.startsWith('data:audio')));

  // ---- Texto de una imagen
  await p.keyboard.press('Control+e'); await p.click('#note-editor'); await p.keyboard.press('Control+End');
  const png = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 300; c.height = 120; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 300, 120); x.fillStyle = '#000'; x.font = '28px sans-serif'; x.fillText('Pan, Leche', 20, 70); return c.toDataURL('image/png'); });
  await p.evaluate(async (data) => { const blob = await (await fetch(data)).blob(); const dt = new DataTransfer(); dt.items.add(new File([blob], 'lista.png', { type: 'image/png' })); const ta = document.getElementById('note-editor'); ta.focus(); ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }, png);
  await p.waitForTimeout(800); await p.keyboard.press('Control+e'); await p.waitForTimeout(300);
  await p.click('#note-reading img.note-img'); await p.waitForTimeout(300);
  await p.click('#image-viewer-ocr'); await p.waitForTimeout(800);
  console.log('ocr:', await p.evaluate(() => [window.__img, activeNote().body.includes('> [!note] Texto de la imagen\n> Pan\n> Leche')]));

  // ---- Gmail
  await p.evaluate(() => showView('tasks'));
  console.log('gmail button:', await p.isVisible('#tasks-mail'));
  await p.click('#tasks-mail'); await p.waitForTimeout(300);
  console.log('threads:', await p.$$eval('#mail-list .mail-subject', (n) => n.map((x) => x.textContent)), '| query:', await p.evaluate(() => window.__mailCalls[0][2]));
  console.log('unsafe link dropped:', await p.$$eval('#mail-list a', (n) => n.map((a) => a.href)));
  await p.click('#mail-list .mail-row:has-text("Presupuesto") .primary-chip'); await p.waitForTimeout(200);
  const t = await p.evaluate(() => state.tasks.map((x) => [x.title, x.tags.join(','), x.mail?.id, x.notes.split('\n')[0]]));
  console.log('task from mail:', JSON.stringify(t), '| button now:', await p.textContent('#mail-list .mail-row:has-text("Presupuesto") .chip'));
  await p.click('#mail-list .mail-row:has-text("Reunión") button:has-text("Claude")'); await p.waitForTimeout(400);
  console.log('proposals:', await p.$$eval('#mail-list .plan-row', (n) => n.map((x) => x.textContent)));
  await p.click('#mail-list button:has-text("Crear tareas")'); await p.waitForTimeout(200);
  console.log('tasks now:', await p.evaluate(() => state.tasks.map((x) => `${x.title}|${x.due}|${x.priority}|${x.mail?.id}`)));
  await p.keyboard.press('Escape');
  console.log('mail chip in list:', await p.$$eval('#task-list a.mail-tag', (n) => n.length));
  await p.screenshot({ path: S + '/tasks-mail.png' });

  // ---- Listas compartidas
  await p.click('.rib[data-view=shared]'); await p.waitForTimeout(200);
  await p.fill('#shared-new-title', 'Compra de la semana'); await p.press('#shared-new-title', 'Enter'); await p.waitForTimeout(300);
  console.log('list open:', await p.textContent('#shared-title'), '|', await p.textContent('#shared-meta'));
  for (const it of ['Pan', 'Leche', 'Café']) { await p.fill('#shared-item-text', it); await p.press('#shared-item-text', 'Enter'); await p.waitForTimeout(80); }
  await p.waitForTimeout(200);
  // Otra persona marca «Leche» y añade «Huevos» (escritura directa en el almacén compartido).
  await p.evaluate(() => {
    const store = window.__store;
    const leche = [...store].find(([k, v]) => k.includes('/items/') && v.text === 'Leche');
    store.set(leche[0], { ...leche[1], done: true, doneBy: 'u_luis' });
    const list = [...store].find(([k]) => /^lists\/[^/]+$/.test(k))[0];
    store.set(`${list}/items/remote1`, { text: 'Huevos', done: false, by: 'u_luis', doneBy: null, at: Date.now() + 10 });
    window.__notify();
  });
  await p.waitForTimeout(300);
  console.log('items:', await p.$$eval('#shared-items .shared-item', (n) => n.map((x) => x.innerText.replace(/\n/g, ' | ').replace(/ \| [＋✕]/g, ''))));
  await p.click('#shared-items .shared-item:has-text("Pan") input'); await p.waitForTimeout(200);
  console.log('pan done by:', await p.evaluate(() => [...window.__store.values()].find((v) => v.text === 'Pan').doneBy));
  await p.click('#shared-items .shared-item:has-text("Café") button[title="Copiar a mis tareas"]');
  console.log('copied:', await p.evaluate(() => state.tasks.some((x) => x.title === 'Café')));
  await p.click('#shared-clear'); await p.waitForTimeout(200);
  console.log('after clear:', await p.$$eval('#shared-items .si-text', (n) => n.map((x) => x.textContent)));
  await p.screenshot({ path: S + '/shared.png' });
  await p.click('#shared-delete-list'); await p.click('#shared-delete-list'); await p.waitForTimeout(300);
  console.log('deleted:', await p.evaluate(() => [...window.__store.keys()].filter((k) => k.startsWith('lists/')).length), '| back to lists:', await p.isVisible('#shared-lists-pane'));

  // ---- Fuera de Claude
  const c2 = await b.newContext(); await c2.addInitScript((s) => localStorage.setItem('enfoque:v1', JSON.stringify(s)), seed);
  const p2 = await c2.newPage(); p2.on('pageerror', e => errs.push(e.message));
  await p2.goto(url); await p2.waitForFunction(() => document.documentElement.dataset.ready);
  await p2.evaluate(() => showView('shared'));
  console.log('outside Claude:', await p2.isVisible('#shared-off'), '| gmail button:', await p2.evaluate(() => { showView('tasks'); return !document.getElementById('tasks-mail').hidden; }));
  console.log('errors:', errs); await b.close();
})();
