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
    notes: [
      { id: 'v', path: 'Bóveda/Libro Mayor', body: '---\nEstado: Pendiente\n---\n\n', createdAt: now, updatedAt: now },
      { id: 'w', path: 'Bóveda/Propia', body: 'Texto escrito en la app', createdAt: now, updatedAt: now },
    ],
    updatedAt: 1,
  });
  // En Drive ya existe la bóveda con el contenido completo de «Libro Mayor»
  await c.addInitScript(() => {
    const t = new Date(Date.now() - 86400000).toISOString();
    window.__files.push({ id: 'enf', title: 'Enfoque', mimeType: 'application/vnd.google-apps.folder', modifiedTime: t });
    window.__files.push({ id: 'bov', title: 'Bóveda', mimeType: 'application/vnd.google-apps.folder', parentId: 'enf', modifiedTime: t });
    window.__files.push({ id: 'lm', title: 'Libro Mayor.md', mimeType: 'text/markdown', parentId: 'bov', modifiedTime: t, text: '---\ntipo: concepto\n---\n# Libro Mayor\nRegistro por cuenta de los movimientos del Libro Diario.\n' });
    window.__files.push({ id: 'pr', title: 'Propia.md', mimeType: 'text/markdown', parentId: 'bov', modifiedTime: t, text: '' });
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
  check('nota vacía se llena desde Drive', await p.evaluate(() => /Registro por cuenta/.test(noteById('v').body)), true);
  check('el archivo bueno de Drive no se reemplaza', await p.evaluate(() => window.__files.filter((f) => !f.trashed && f.title === 'Libro Mayor.md').map((f) => /Registro por cuenta/.test(f.text))), [true]);
  check('una nota con texto propio no se pisa', await p.evaluate(() => noteById('w').body), 'Texto escrito en la app');
  // Una nota ya enlazada que quedó vacía también se repara al sincronizar a mano
  await p.evaluate(() => { const n = noteById('v'); n.body = '---\nEstado: Pendiente\n---\n'; vaultMap().files.v.at = n.updatedAt; saveVaultMap(); });
  await p.evaluate(() => syncVault({ manual: true }));
  for (let i = 0; i < 40 && (await p.evaluate(() => vault.busy)); i++) await p.clock.runFor(500);
  check('enlazada y vacía: se repara', await p.evaluate(() => /Registro por cuenta/.test(noteById('v').body)), true);
  await b.close();
  console.log('errors:', fails ? [...errs, `${fails} comprobación(es) fallida(s)`] : errs);
})();
