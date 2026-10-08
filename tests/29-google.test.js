const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2], S = process.argv[3];
const now = new Date('2026-10-12T10:07:00').getTime(); // lunes
const mock = () => {
  window.__calls = [];
  const files = [];
  const mcp = {
    callTool: async (server, tool, input) => {
      window.__calls.push([server, tool, input]);
      if (server === 'Google Drive' && tool === 'search_files') {
        if (/title = 'Enfoque'/.test(input.query)) return { payload: { files: files.filter(f => f.mimeType === 'application/vnd.google-apps.folder') } };
        return { payload: { files: files.filter(f => f.title.startsWith('enfoque-copia')) } };
      }
      if (server === 'Google Drive' && tool === 'create_file') {
        const f = { id: 'f' + files.length, title: input.title, mimeType: input.contentMimeType, parentId: input.parentId, modifiedTime: new Date().toISOString(), viewUrl: 'https://drive.google.com/x/' + files.length, text: input.textContent };
        files.push(f);
        return { payload: f };
      }
      if (server === 'Google Drive' && tool === 'download_file_content') {
        const f = files.find(x => x.id === input.fileId);
        return { payload: { id: f.id, content: btoa(String.fromCharCode(...new TextEncoder().encode(f.text))) } };
      }
      if (tool === 'list_events') return { payload: { events: [
        { id: 'e1', summary: 'Reunión', start: { dateTime: '2026-10-12T11:00:00' }, end: { dateTime: '2026-10-12T12:30:00' }, status: 'confirmed' },
        { id: 'e2', summary: 'Almuerzo', start: { dateTime: '2026-10-12T13:00:00' }, end: { dateTime: '2026-10-12T14:00:00' }, status: 'confirmed' },
      ] } };
      if (tool === 'create_event') return { payload: { id: 'ev1', htmlLink: 'https://calendar.google.com/ev1' } };
      if (tool === 'send_message') return { payload: { id: 'm1' } };
      throw { code: 'tool_error', message: 'no' };
    },
  };
  const user = { me: async () => ({ id: 'u', email: 'yo@ejemplo.com' }), id: async () => 'u' };
  window.claude = { use: async (n) => (n === 'mcp' ? mcp : n === 'user' ? user : null) };
};
(async () => {
  const b = await chromium.launch(launchOptions);
  const c = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const seed = {
    tasks: [{ id: 't1', title: 'Preparar informe', priority: 2, due: null, done: false, createdAt: now, tags: [] }, { id: 't2', title: 'Llamar a Ana', priority: 3, due: '2026-10-14', time: '09:30', done: false, createdAt: now, tags: [] }],
    habits: [{ id: 'h', name: 'Leer', goal: 7, log: { '2026-10-06': true, '2026-10-08': true } }], settings: { notesWelcome: true },
    pomodoros: { '2026-10-07': 4 }, focusMinutes: { '2026-10-07': 100 },
    log: [{ id: 'l1', type: 'task', text: 'Enviar presupuesto', date: '2026-10-09', at: now - 3 * 864e5 }],
    notes: [{ id: 'n', path: 'Reunión', body: '# Acta\n- [x] Hecho\n- [ ] Pendiente\n\n**Importante**: ver [[Otra]] y $x^2$', createdAt: now, updatedAt: now }],
    updatedAt: 1,
  };
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, seed);
  await c.addInitScript(mock);
  await c.route(/cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com/, (r) => r.abort());
  const p = await c.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.clock.install({ time: new Date(now) });
  await p.goto(url); await p.clock.runFor(1000);
  const calls = (tool) => p.evaluate((t) => window.__calls.filter(c => c[1] === t).map(c => c[2]), tool);

  // 1) Copia en Drive
  await p.evaluate(() => showView('settings'));
  await p.click('#gdrive-now'); await p.clock.runFor(500);
  const created = await calls('create_file');
  console.log('drive:', created.map(x => `${x.title.replace(/\d{4}$/, 'HHMM')}|${x.contentMimeType}|${x.parentId || '-'}`).join(' ; '));
  console.log('backup json ok:', JSON.parse(created[1].textContent).data.tasks.length, '| status:', await p.textContent('#gdrive-status'));
  await p.check('#gdrive-auto');
  await p.evaluate(() => { state.tasks = []; save(); renderAll(); });
  await p.click('#gdrive-list'); await p.clock.runFor(300);
  console.log('backups listed:', await p.$$eval('#gdrive-backups .g-item', n => n.length));
  await p.click('#gdrive-backups .g-item button'); await p.clock.runFor(300);
  console.log('restored tasks:', await p.evaluate(() => state.tasks.length));

  // 2) Agendar una tarea sin fecha, con huecos libres
  await p.evaluate(() => openSchedule({ task: state.tasks.find(t => t.id === 't1') })); await p.clock.runFor(300);
  console.log('slots:', await p.$$eval('#gsched-slots .chip', n => n.map(x => x.textContent)));
  await p.selectOption('#gsched-dur', '60'); 
  console.log('slots 1h:', await p.$$eval('#gsched-slots .chip', n => n.map(x => x.textContent)));
  await p.click('#gsched-slots .chip');
  await p.click('#gsched-ok'); await p.clock.runFor(300);
  console.log('event:', JSON.stringify((await calls('create_event'))[0]), '| task:', JSON.stringify(await p.evaluate(() => { const t = state.tasks.find(x => x.id === 't1'); return [t.due, t.time, t.calEventId]; })));
  console.log('linkbar:', await p.textContent('#g-linkbar'));
  // Bloque de concentración desde Pomodoro
  await p.evaluate(() => showView('timer'));
  console.log('focus btn visible:', await p.isVisible('#focus-block'));
  await p.click('#focus-block'); await p.clock.runFor(200);
  console.log('focus dialog:', await p.inputValue('#gsched-name'), await p.inputValue('#gsched-dur'));
  await p.click('#gsched-cancel');

  // 3) Exportar nota a Google Docs
  await p.evaluate(() => { noteMode.set('n', 'read'); openNoteByLink('Reunión'); }); await p.clock.runFor(200);
  await p.evaluate(() => exportNoteToDocs(activeNote())); await p.clock.runFor(500);
  const doc = (await calls('create_file')).pop();
  console.log('doc:', doc.title, doc.contentMimeType, '| html:', doc.textContent.replace(/^[\s\S]*<body>/, '').slice(0, 220));
  console.log('note gdoc:', await p.evaluate(() => !!activeNote().gdoc?.url));

  // 4) Resumen semanal (lunes, activado): se envía al abrir y no se repite
  await p.evaluate(() => showView('settings'));
  await p.check('#gweekly-on'); await p.fill('#gweekly-to', 'yo@ejemplo.com'); await p.dispatchEvent('#gweekly-to', 'change');
  await p.click('#gweekly-preview');
  console.log('preview has:', await p.$eval('#gweekly-sample', x => [x.textContent.includes('Enviar presupuesto'), x.textContent.includes('Llamar a Ana'), x.textContent.includes('Leer: 2')]));
  await p.evaluate(() => runGoogleAutomations()); await p.clock.runFor(500);
  const sent = await calls('send_message');
  console.log('sent:', sent.length, sent[0]?.to, sent[0]?.subject);
  await p.evaluate(() => runGoogleAutomations()); await p.clock.runFor(500);
  console.log('sent again:', (await calls('send_message')).length, '| drive auto today again:', (await calls('create_file')).filter(x => x.title.startsWith('enfoque-copia')).length);
  await p.screenshot({ path: S + '/google-settings.png' });
  console.log('errors:', errs); await b.close();
})();
