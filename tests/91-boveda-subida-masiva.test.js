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
  const notes = Array.from({ length: 20 }, (_, i) => ({ id: 'n' + i, path: `MATRIZ DE NOTAS/Nota ${i}`, body: `Texto ${i}`, createdAt: now, updatedAt: now }));
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, {
    tasks: [], habits: [], settings: { notesWelcome: true, calendar: { enabled: true } }, notes, updatedAt: 1,
  });
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.clock.install({ time: new Date(now) });
  await p.goto(url); await p.clock.runFor(1500);
  for (let i = 0; i < 20 && !(await p.evaluate(() => gAvailable())); i++) await p.clock.runFor(500);
  const mdCount = () => p.evaluate(() => window.__files.filter((f) => !f.trashed && /\.md$/.test(f.title)).length);
  const wait = async () => { for (let i = 0; i < 40 && (await p.evaluate(() => vault.busy)); i++) await p.clock.runFor(500); };
  const click = (label) => p.evaluate((l) => [...document.querySelectorAll('#pomo-alert button')].find((x) => x.textContent.startsWith(l)).click(), label);
  // Activar con 20 notas que no están en Drive: no se sube nada sin preguntar
  await p.evaluate(() => { const i = document.getElementById('gvault-on'); i.checked = true; i.dispatchEvent(new Event('change')); });
  await p.clock.runFor(2000); await wait();
  check('sin subida masiva', await mdCount(), 0);
  check('en espera', await p.evaluate(() => vaultMap().hold.length), 20);
  check('pregunta', await p.evaluate(() => !document.getElementById('pomo-alert').hidden && /20 notas de este dispositivo no están en tu Drive/.test(document.getElementById('pomo-alert').textContent)), true);
  // Las sincronizaciones automáticas tampoco las suben
  await p.clock.runFor(40000); await wait();
  check('sigue en espera', await mdCount(), 0);
  // Una nota nueva suelta sí se sube
  await p.evaluate(() => { state.notes.push({ id: 'x1', path: 'Suelta', body: 'Hola', createdAt: Date.now() - 20000, updatedAt: Date.now() - 20000 }); save(); });
  await p.clock.runFor(40000); await wait();
  check('nota suelta subida', await mdCount(), 1);
  // Al elegir subirlas, se suben
  await p.evaluate(() => syncVault({ manual: true })); await p.clock.runFor(1000); await wait();
  await click('Subirlas a Drive'); await p.clock.runFor(1000); await wait();
  check('subidas tras confirmar', await mdCount(), 21);
  check('sin espera', await p.evaluate(() => vaultMap().hold.length), 0);
  // Otras 16 nuevas: se elige mandarlas a la papelera de Enfoque
  await p.evaluate(() => { for (let i = 0; i < 16; i++) state.notes.push({ id: 'y' + i, path: `Viejas/V ${i}`, body: 'v', createdAt: Date.now() - 20000, updatedAt: Date.now() - 20000 }); save(); });
  await p.evaluate(() => syncVault({ manual: true })); await p.clock.runFor(1000); await wait();
  check('no subidas', await mdCount(), 21);
  await click('Mandarlas a la papelera');
  await p.clock.runFor(500);
  check('fuera de la app', await p.evaluate(() => state.notes.filter((n) => n.path.startsWith('Viejas/')).length), 0);
  check('en la papelera', await p.evaluate(() => trashList().filter((t) => t.from.startsWith('Viejas/')).length), 16);
  await b.close();
  console.log('errors:', fails ? [...errs, `${fails} comprobación(es) fallida(s)`] : errs);
})();
