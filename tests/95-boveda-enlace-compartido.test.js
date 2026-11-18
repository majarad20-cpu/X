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
    notes: ['Uno', 'Dos', 'Tres'].map((t, i) => ({ id: 'n' + i, path: 'Bóveda/' + t, body: '# ' + t + '\nTexto de la nota ' + t, createdAt: now, updatedAt: now })),
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
  for (let i = 0; i < 40 && (await p.evaluate(() => vault.busy)); i++) await p.clock.runFor(500);
  const md = () => p.evaluate(() => window.__files.filter((f) => !f.trashed && /\.md$/.test(f.title)).length);
  check('las 3 notas se subieron', await md(), 3);
  // 1) El enlace nota ↔ archivo queda en la nube (bloque vault-link)
  check('enlace compartido con las 3 notas', await p.evaluate(() => Object.keys(state.vaultLink?.files || {}).sort()), ['n0', 'n1', 'n2']);
  check('viaja como bloque «vault-link»', await p.evaluate(() => !!localBuckets().get('vault-link')?.link?.root), true);
  // Dispositivo nuevo: sin el mapa local, pero con el enlace que llegó de la nube
  await p.evaluate(() => { localStorage.removeItem('enfoque:vault'); vault.map = null; });
  check('el dispositivo nuevo conoce los archivos sin preguntar a Drive', await p.evaluate(() => Object.keys(vaultMap().files).length), 3);
  await p.evaluate(() => { window.__calls.length = 0; syncVault({ manual: true }); });
  for (let i = 0; i < 40 && (await p.evaluate(() => vault.busy)); i++) await p.clock.runFor(500);
  check('no crea copias en Drive', await md(), 3);
  check('ninguna nota queda «en espera»', await p.evaluate(() => (vaultMap().hold || []).length), 0);
  check('no sube nada nuevo', await p.evaluate(() => window.__calls.filter(([, t, i]) => t === 'create_file' && /\.md$/.test(i.title)).length), 0);
  // Llega desde otro dispositivo un enlace más nuevo: se vuelve a leer
  await p.evaluate(() => { applyBucket('vault-link', { link: { ...state.vaultLink, files: { ...state.vaultLink.files, n9: { id: 'zz', path: 'Bóveda/Otra', at: 1, mt: '' } }, rev: Date.now() + 1000 } }); });
  check('enlace nuevo de otro dispositivo se aplica', await p.evaluate(() => !!vaultMap().files.n9), true);
  await p.evaluate(() => { delete vaultMap().files.n9; delete state.vaultLink.files.n9; });
  // 2) Al abrir la app se trae siempre lo de Drive, aunque la última vez fue hace un minuto
  await p.evaluate(() => { vaultMap().lastPull = Date.now() - 60000; window.__calls.length = 0; syncVault({ pull: true }); });
  for (let i = 0; i < 40 && (await p.evaluate(() => vault.busy)); i++) await p.clock.runFor(500);
  check('al abrir, busca cambios en Drive', await p.evaluate(() => window.__calls.some(([, t, i]) => t === 'search_files' && /modifiedTime >/.test(i.query))), true);
  await p.evaluate(() => { vaultMap().lastPull = Date.now() - 60000; window.__calls.length = 0; syncVault(); });
  for (let i = 0; i < 40 && (await p.evaluate(() => vault.busy)); i++) await p.clock.runFor(500);
  check('en el intervalo normal respeta los 5 minutos', await p.evaluate(() => window.__calls.some(([, t, i]) => t === 'search_files' && /modifiedTime >/.test(i.query))), false);
  // 4) Una nota editada se sube a los pocos segundos
  await p.evaluate(() => { const n = noteById('n0'); n.body += '\nLínea nueva'; n.updatedAt = Date.now(); save(); window.__calls.length = 0; vaultSoon(); });
  await p.clock.runFor(8000);
  check('a los 8 s todavía no sube', await p.evaluate(() => window.__calls.some(([, t]) => t === 'create_file')), false);
  await p.clock.runFor(2000);
  for (let i = 0; i < 40 && (await p.evaluate(() => vault.busy)); i++) await p.clock.runFor(500);
  check('a los 10 s ya subió la nota editada', await p.evaluate(() => window.__files.some((f) => !f.trashed && f.title === 'Uno.md' && /Línea nueva/.test(f.text))), true);
  await b.close();
  console.log('errors:', fails ? [...errs, `${fails} comprobación(es) fallida(s)`] : errs);
})();
