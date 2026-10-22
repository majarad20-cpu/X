const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const now = new Date('2026-10-09T10:00:00').getTime();
const mock = () => {
  window.__calls = [];
  const files = [];
  window.__files = files;
  const FOLDER = 'application/vnd.google-apps.folder';
  const live = () => files.filter((f) => !f.trashed);
  const mcp = {
    callTool: async (server, tool, input) => {
      window.__calls.push([server, tool, input]);
      if (server !== 'Google Drive') throw { code: 'tool_error', message: 'no' };
      if (tool === 'search_files') {
        const q = input.query;
        const t = q.match(/title = '([^']+)'/);
        const since = q.match(/modifiedTime > '([^']+)'/);
        const parents = [...q.matchAll(/parentId = '([^']+)'/g)].map((m) => m[1]);
        let out = live();
        if (t) out = out.filter((f) => f.title === t[1]);
        if (parents.length) out = out.filter((f) => parents.includes(f.parentId));
        if (since) out = out.filter((f) => f.modifiedTime > since[1]);
        if (/mimeType = 'application\/vnd.google-apps.folder'/.test(q)) out = out.filter((f) => f.mimeType === FOLDER);
        return { payload: { files: out.map(({ text, trashed, ...f }) => f) } };
      }
      if (tool === 'create_file') {
        if (input.contentMimeType !== FOLDER && window.__failNext) { window.__failNext--; throw { code: 'tool_error', message: 'Request too large' }; }
        if (input.contentMimeType !== FOLDER && !input.textContent && !input.base64Content) throw { code: 'tool_error', message: 'Only the following first-party mimetypes are supported for empty files' };
        const f = { id: 'f' + files.length, title: input.title, mimeType: input.contentMimeType, parentId: input.parentId, modifiedTime: new Date().toISOString(), text: input.textContent, b64: input.base64Content };
        files.push(f);
        const { text, b64, ...meta } = f;
        return { payload: meta };
      }
      if (tool === 'trash_file') {
        const f = files.find((x) => x.id === input.fileId);
        if (f) f.trashed = true;
        return { payload: {} };
      }
      if (tool === 'download_file_content') {
        const f = files.find((x) => x.id === input.fileId);
        return { payload: { id: f.id, content: f.b64 || btoa(String.fromCharCode(...new TextEncoder().encode(f.text))) } };
      }
      throw { code: 'tool_error', message: 'no' };
    },
  };
  window.claude = { use: async (n) => (n === 'mcp' ? mcp : null) };
};
(async () => {
  const b = await chromium.launch(launchOptions);
  const c = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await c.addInitScript(mock);
  await c.addInitScript(() => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify({ tasks: [{ id: 't', title: 'Tarea', done: false, priority: 2, subtasks: [], tags: [] }], habits: [], settings: { notesWelcome: true }, notes: [], updatedAt: 1 })); });
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage(); const errs = [];
  const check = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${label}: ${JSON.stringify(got)}${ok ? ' ok' : ` ESPERADO ${JSON.stringify(want)}`}`); if (!ok) errs.push(label); };
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.clock.install({ time: new Date(now) });
  await p.goto(url); await p.clock.runFor(1500);
  for (let i = 0; i < 20 && !(await p.evaluate(() => gAvailable())); i++) await p.clock.runFor(500);
  check('botón junto al de sincronizar', await p.evaluate(() => { const b = document.getElementById('drive-backup-btn'); return [!b.hidden, b.previousElementSibling?.id]; }), [true, 'drive-sync-btn']);
  await p.click('#drive-backup-btn');
  for (let i = 0; i < 10 && (await p.evaluate(() => backupBusy)); i++) await p.clock.runFor(300);
  check('copia guardada (comprimida)', await p.evaluate(async () => { const f = window.__files.find((x) => /^enfoque-copia-/.test(x.title)); const enf = window.__files.find((x) => x.title === 'Enfoque'); return f && [f.parentId === enf.id, /\.json\.gz$/.test(f.title), f.mimeType, JSON.parse(await backupFromB64(f.b64)).data.tasks[0].title]; }), [true, true, 'application/gzip', 'Tarea']);
  check('aviso', await p.textContent('#toast'), '✓ Copia de seguridad guardada en Google Drive');
  check('última copia en el título', await p.evaluate(() => /última/.test(document.getElementById('drive-backup-btn').title)), true);
  // Si la subida falla (p. ej. demasiado grande), se reintenta sin imágenes y sale bien
  await p.evaluate(() => { window.__failNext = 1; state.tasks[0].title = 'Tarea 2'; save(); });
  await p.click('#drive-backup-btn');
  for (let i = 0; i < 10 && (await p.evaluate(() => backupBusy)); i++) await p.clock.runFor(300);
  check('reintento', await p.evaluate(() => window.__files.filter((x) => /^enfoque-copia-/.test(x.title)).length), 2);
  check('aviso reintento', await p.textContent('#toast'), '✓ Copia de seguridad guardada en Google Drive');
  // Si falla siempre, el aviso dice por qué (sin repetir «No se pudo…»)
  await p.evaluate(() => { window.__failNext = 9; });
  await p.click('#drive-backup-btn');
  for (let i = 0; i < 10 && (await p.evaluate(() => backupBusy)); i++) await p.clock.runFor(300);
  check('aviso de error', await p.textContent('#toast'), 'No se pudo guardar la copia. Google Drive respondió con un error: Request too large.');
  await p.evaluate(() => { window.__failNext = 0; });
  // Restaurar la copia comprimida
  await p.evaluate(() => { const f = window.__files.filter((x) => /^enfoque-copia-/.test(x.title)).pop(); state.tasks = []; save(); return restoreFromDrive(f, document.createElement('button')); });
  await p.clock.runFor(300);
  check('restaurada', await p.evaluate(() => state.tasks.map((t) => t.title)), ['Tarea 2']);
  // Menú con clic derecho
  await p.click('#drive-backup-btn', { button: 'right' }); await p.clock.runFor(50);
  check('menú', await p.$$eval('#note-menu .menu-item', (n) => n.map((x) => x.textContent)), ['💾 Guardar copia ahora', 'Activar la copia automática diaria', 'Ver y restaurar copias…']);
  console.log('errors:', JSON.stringify(errs)); await b.close();
  process.exit(errs.length ? 1 : 0);
})();
