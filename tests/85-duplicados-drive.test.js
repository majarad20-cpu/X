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
        if (input.contentMimeType !== FOLDER && !input.textContent) throw { code: 'tool_error', message: 'Only the following first-party mimetypes are supported for empty files' };
        const f = { id: 'f' + files.length, title: input.title, mimeType: input.contentMimeType, parentId: input.parentId, modifiedTime: new Date().toISOString(), text: input.textContent };
        files.push(f);
        const { text, ...meta } = f;
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
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, {
    tasks: [], habits: [], settings: { notesWelcome: true },
    notes: [{ id: 'a', path: 'Inicio', body: '# Inicio', createdAt: now, updatedAt: now }, { id: 'b', path: 'Diario/2026-10-08', body: 'Hoy', createdAt: now, updatedAt: now }],
    updatedAt: 1,
  });
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage(); const errs = [];
  const check = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${label}: ${JSON.stringify(got)}${ok ? ' ok' : ` ESPERADO ${JSON.stringify(want)}`}`); if (!ok) errs.push(label); };
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.clock.install({ time: new Date(now) });
  await p.goto(url); await p.clock.runFor(1500);
  for (let i = 0; i < 20 && !(await p.evaluate(() => gAvailable())); i++) await p.clock.runFor(500);
  await p.evaluate(() => { const i = document.getElementById('gvault-on'); i.checked = true; i.dispatchEvent(new Event('change')); });
  await p.clock.runFor(2000);
  const wait = async () => { for (let i = 0; i < 40 && (await p.evaluate(() => vault.busy)); i++) await p.clock.runFor(300); };
  const sync = async () => { await p.evaluate(() => syncVault({ manual: true })); await wait(); };
  const liveMd = () => p.evaluate(() => window.__files.filter((f) => !f.trashed && /\.md$/.test(f.title)).map((f) => f.title).sort());
  await sync();
  check('subidas', await liveMd(), ['2026-10-08.md', 'Inicio.md']);
  // 1) En Drive aparecen copias sobrantes (subidas antes desde otro dispositivo), con tildes descompuestas
  await p.evaluate(() => {
    const m = vaultMap();
    const add = (f) => window.__files.push({ modifiedTime: '2026-10-01T00:00:00Z', mimeType: 'text/markdown', text: 'viejo', ...f });
    add({ id: 'dup1', title: 'Inicio.md', parentId: m.root });
    add({ id: 'dup2', title: '2026-10-08.md', parentId: m.folders.Diario });
    add({ id: 'dup3', title: '2026-10-08.md', parentId: m.folders.Diario });
    add({ id: 'otra', title: 'Otra.md', parentId: m.root });
  });
  // Al subir de nuevo una nota, las otras copias con su nombre se quedan (pueden tener otro contenido)
  await p.evaluate(() => { const n = noteById('a'); n.body = '# Inicio\nmás'; n.updatedAt = Date.now(); save(); });
  await p.clock.runFor(9000);
  await p.evaluate(() => { vaultMap().lastPull = Date.now(); saveVaultMap(); });
  await sync();
  check('copias de «Inicio» se quedan', await p.evaluate(() => window.__files.filter((f) => f.title === 'Inicio.md' && !f.trashed).length), 2);
  // 2) Tarjeta de la revisión: busca y quita las que quedan (las de la nota diaria)
  await p.evaluate(() => showView('revision')); await p.clock.runFor(200);
  check('tarjeta', await p.evaluate(() => [...document.querySelectorAll('#view-revision .rv-card summary strong')].some((x) => x.textContent === '📄 Archivos repetidos en Drive')), true);
  await p.evaluate(() => dzScan()); await p.clock.runFor(500);
  check('repetidos', await p.evaluate(() => dz.groups.map((g) => `${g.path}:${g.extra.map((f) => f.id).join(',')}`)), ['Diario/2026-10-08:dup2,dup3', 'Inicio:dup1']);
  check('lista', await p.$$eval('#view-revision .lz-list li', (n) => n.map((x) => x.textContent.trim()).filter((t) => t.includes('2026-10-08'))), ['Diario/2026-10-08 · se queda la del 9 oct 2026; sobran 2 copias (1 oct 2026, 1 oct 2026)']);
  // Desmarcar «Inicio»: solo se quitan las de la nota diaria
  await p.click('#view-revision .lz-list li:has-text("Inicio") input'); await p.clock.runFor(100);
  await p.click('#view-revision button:has-text("Mandar 2 a la papelera de Drive")'); await p.clock.runFor(100);
  await p.click('#pomo-alert button:has-text("Mandar a la papelera")'); await p.clock.runFor(500);
  check('quitadas', await liveMd(), ['2026-10-08.md', 'Inicio.md', 'Inicio.md', 'Otra.md']);
  check('aviso', await p.textContent('#toast'), '2 archivos repetidos enviados a la papelera de Drive');
  // 3) Dos notas con la misma ruta en la app (una volvió desde el celular)
  await p.evaluate(() => {
    state.notes.push({ id: 'c', path: 'Inicio', body: '# Inicio\nmás', createdAt: 1, updatedAt: 1 });
    state.notes.push({ id: 'd', path: 'Diario/2026-10-08', body: 'Otra versión', createdAt: 1, updatedAt: 1 });
    dataRev++; save();
  });
  await p.evaluate(() => { vaultMap().lastPull = Date.now(); saveVaultMap(); });
  await sync();
  check('misma ruta', await p.evaluate(() => [state.notes.some((n) => n.id === 'c'), state.trash.some((t) => t.id === 'c'), noteById('d')?.path]), [false, true, 'Diario/2026-10-08']);
  await p.clock.runFor(9000);
  await sync();
  check('distinto texto: las dos se quedan', await p.evaluate(() => state.notes.filter((n) => n.path === 'Diario/2026-10-08').length), 2);
  // 4) Una nota en la papelera no vuelve aunque llegue de otro dispositivo
  check('papelera hace de lápida', await p.evaluate(() => {
    state.trash.push({ id: 'z', note: { id: 'z', path: 'Zombi', body: 'x' }, deletedAt: 100, from: 'Zombi' });
    state.notes.push({ id: 'z', path: 'Zombi', body: 'x', createdAt: 1, updatedAt: 50 });
    state.notes.push({ id: 'y', path: 'Viva', body: 'x', createdAt: 1, updatedAt: 200 });
    state.trash.push({ id: 'y', note: { id: 'y', path: 'Viva', body: 'x' }, deletedAt: 100, from: 'Viva' });
    dropTrashedNotes();
    return [!!noteById('z'), !!noteById('y')];
  }), [false, true]);
  console.log('errors:', JSON.stringify(errs)); await b.close();
  process.exit(errs.length ? 1 : 0);
})();
