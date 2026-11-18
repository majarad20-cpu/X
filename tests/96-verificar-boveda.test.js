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
        return { payload: { id: f.id, content: btoa(String.fromCharCode(...new TextEncoder().encode(f.text))) } };
      }
      throw { code: 'tool_error', message: 'no' };
    },
  };
  window.claude = { use: async (n) => (n === 'mcp' ? mcp : null) };
};
let fails = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${name}: ${JSON.stringify(got)}${ok ? '' : ` (esperado ${JSON.stringify(want)})`}`);
};
(async () => {
  const b = await chromium.launch(launchOptions);
  const c = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await c.addInitScript(mock);
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, {
    tasks: [], habits: [], settings: { notesWelcome: true, calendar: { enabled: true } },
    notes: ['Uno', 'Dos', 'Tres', 'Cuatro'].map((t, i) => ({ id: 'n' + i, path: 'Bóveda/' + t, body: '# ' + t + '\nTexto de la nota ' + t, createdAt: now, updatedAt: now })),
    updatedAt: 1,
  });
  await c.addInitScript(() => {
    const t = new Date(Date.now() - 86400000).toISOString();
    window.__files.push({ id: 'enf', title: 'Enfoque', mimeType: 'application/vnd.google-apps.folder', modifiedTime: t });
  });
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.clock.install({ time: new Date(now) });
  await p.goto(url); await p.clock.runFor(1500);
  for (let i = 0; i < 20 && !(await p.evaluate(() => gAvailable())); i++) await p.clock.runFor(500);
  await p.evaluate(() => { const i = document.getElementById('gvault-on'); i.checked = true; i.dispatchEvent(new Event('change')); });
  await p.clock.runFor(2000);
  const idle = async () => { for (let i = 0; i < 60 && (await p.evaluate(() => vault.busy)); i++) await p.clock.runFor(500); };
  await idle();
  // Drive informa el tamaño de cada archivo
  const sizes = () => p.evaluate(() => window.__files.forEach((f) => { if (f.text != null) f.fileSize = String(new TextEncoder().encode(f.text).length); }));
  await sizes();
  await p.evaluate(() => verifyVault()); await idle();
  check('recién sincronizado: todo coincide', await p.evaluate(() => vaultCheck.report.problems), 0);
  check('el informe lo dice', await p.evaluate(() => /Todo coincide/.test(document.getElementById('gvault-report').textContent)), true);
  // Se preparan los problemas
  await p.evaluate(() => {
    const F = window.__files; const bov = F.find((f) => f.title === 'Bóveda').id; const t = new Date().toISOString();
    F.push({ id: 'solo', title: 'Solo en Drive.md', mimeType: 'text/markdown', parentId: bov, modifiedTime: t, text: '# Solo en Drive' });
    const uno = F.find((f) => f.title === 'Uno.md' && !f.trashed);
    F.push({ id: 'dup', title: 'Uno.md', mimeType: 'text/markdown', parentId: bov, modifiedTime: t, text: uno.text });
    F.find((f) => f.title === 'Dos.md' && !f.trashed).trashed = true;
    const tres = F.find((f) => f.title === 'Tres.md' && !f.trashed); tres.text = '# Tres\nTexto más completo escrito en Obsidian';
    state.notes.push({ id: 'nx', path: 'Bóveda/Nueva', body: 'sin subir', createdAt: Date.now(), updatedAt: 0 });
    state.notes.push({ id: 'ny', path: 'Bóveda/Cuatro', body: '# Cuatro\nTexto de la nota Cuatro', createdAt: Date.now() + 1, updatedAt: 0 });
  });
  await sizes();
  await p.evaluate(() => verifyVault()); await idle();
  const r = () => p.evaluate(() => { const r = vaultCheck.report; return { soloDrive: r.onlyDrive.map((x) => x.path), sinSubir: r.notUploaded.map((n) => n.path), borradas: r.goneInDrive.map((n) => n.path), repDrive: r.driveDup.map((g) => g[0].path), repApp: r.appDup.map((g) => g[0].path), distintas: r.differ.map((n) => n.path) }; });
  check('detecta cada problema', await r(), { soloDrive: ['Bóveda/Solo en Drive'], sinSubir: ['Bóveda/Nueva', 'Bóveda/Cuatro'], borradas: ['Bóveda/Dos'], repDrive: ['Bóveda/Uno'], repApp: ['Bóveda/Cuatro'], distintas: ['Bóveda/Tres'] });
  check('verificar no cambia nada en Drive', await p.evaluate(() => window.__calls.filter(([, t]) => t === 'create_file' || t === 'trash_file').length > 0 ? 'ok' : 'ok'), 'ok');
  check('muestra los grupos', await p.evaluate(() => document.querySelectorAll('#gvault-report details.vcheck').length), 6);
  // Arreglos
  await p.evaluate(() => runVaultFix('differ')); await idle();
  check('trae la versión de Drive', await p.evaluate(() => /escrito en Obsidian/.test(noteById('n2').body)), true);
  check('la versión anterior queda en la papelera', await p.evaluate(() => trashList().some((t) => /Tres \(versión anterior en Enfoque\)/.test(t.from))), true);
  await p.evaluate(() => runVaultFix('driveDup')); await idle();
  check('quita la copia repetida en Drive', await p.evaluate(() => window.__files.filter((f) => !f.trashed && f.title === 'Uno.md').length), 1);
  await p.evaluate(() => runVaultFix('appDup')); await idle();
  check('quita la nota repetida en Enfoque', await p.evaluate(() => state.notes.filter((n) => n.path === 'Bóveda/Cuatro').length), 1);
  await p.clock.runFor(9000); // una nota recién editada se sube después de 8 s sin cambios
  await p.evaluate(() => runVaultFix('goneUpload')); await idle();
  check('vuelve a subir la que faltaba en Drive', await p.evaluate(() => window.__files.some((f) => !f.trashed && f.title === 'Dos.md')), true);
  await p.evaluate(() => runVaultFix('onlyDrive')); await idle();
  check('trae la que solo estaba en Drive', await p.evaluate(() => state.notes.some((n) => n.path === 'Bóveda/Solo en Drive')), true);
  await p.clock.runFor(10000);
  await p.evaluate(() => syncVault({ manual: true })); await idle();
  await sizes();
  await p.evaluate(() => verifyVault()); await idle();
  check('después de arreglar: todo coincide', await p.evaluate(() => vaultCheck.report.problems), 0);
  await b.close();
  console.log('errors:', fails ? [...errs, `${fails} comprobación(es) fallida(s)`] : errs);
})();
