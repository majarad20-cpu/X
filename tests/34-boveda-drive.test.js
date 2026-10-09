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
(async () => {
  const b = await chromium.launch(launchOptions);
  const c = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await c.addInitScript(mock);
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, {
    tasks: [], habits: [], settings: { notesWelcome: true, calendar: { enabled: true } },
    notes: [
      { id: 'a', path: 'Inicio', body: '# Inicio\nHola', createdAt: now, updatedAt: now },
      { id: 'b', path: 'Proyectos/Web/Plan', body: '- [ ] Diseño', createdAt: now, updatedAt: now },
      { id: 'e', path: 'Sin título', body: '', createdAt: now, updatedAt: now },
      { id: 's', path: 'Secreto', body: '', enc: { salt: 'x', iv: 'y', ct: 'z' }, createdAt: now, updatedAt: now },
    ],
    updatedAt: 1,
  });
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.clock.install({ time: new Date(now) });
  await p.goto(url); await p.clock.runFor(1500);
  for (let i = 0; i < 20 && !(await p.evaluate(() => gAvailable())); i++) await p.clock.runFor(500);
  // Activar
  await p.evaluate(() => { const i = document.getElementById('gvault-on'); i.checked = true; i.dispatchEvent(new Event('change')); });
  await p.clock.runFor(2000);
  const tree = () => p.evaluate(() => {
    const byId = Object.fromEntries(window.__files.map((f) => [f.id, f]));
    const path = (f) => (f.parentId && byId[f.parentId] ? path(byId[f.parentId]) + '/' : '') + f.title;
    return window.__files.filter((f) => !f.trashed && f.mimeType !== 'application/vnd.google-apps.folder').map((f) => `${path(f)}=${JSON.stringify(f.text)}`).sort();
  });
  console.log('first push:', await tree());
  console.log('available:', await p.evaluate(() => gAvailable() && !document.getElementById('gvault-on').disabled));
  console.log('status:', await p.textContent('#gvault-status'));
  // Editar una nota: se sube al rato y el archivo anterior va a la papelera
  await p.evaluate(() => { const n = noteById('a'); n.body = '# Inicio\nHola de nuevo'; n.updatedAt = Date.now(); save(); });
  await p.clock.runFor(40000);
  console.log('after edit:', await tree());
  console.log('trashed:', await p.evaluate(() => window.__files.filter((f) => f.trashed).length));
  // Renombrar y borrar
  await p.evaluate(() => { const n = noteById('b'); n.path = 'Proyectos/Web/Plan final'; n.updatedAt = Date.now(); state.notes = state.notes.filter((x) => x.id !== 'a'); dataRev++; save(); });
  await p.clock.runFor(40000);
  console.log('after rename+delete:', await tree());
  // Cambios hechos en Drive: un archivo editado y un .md nuevo
  await p.evaluate(() => {
    const f = window.__files.find((x) => !x.trashed && x.title === 'Plan final.md');
    f.text = '- [ ] Diseño\n- [ ] Editado en Obsidian'; f.modifiedTime = new Date(Date.now() + 1000).toISOString();
    const web = window.__files.find((x) => x.title === 'Web');
    window.__files.push({ id: 'ext1', title: 'Desde el móvil.md', mimeType: 'text/markdown', parentId: web.id, modifiedTime: new Date(Date.now() + 1000).toISOString(), text: 'Nota escrita en Drive' });
  });
  await p.clock.runFor(1000);
  await p.evaluate(() => syncVault({ manual: true }));
  await p.clock.runFor(1000);
  console.log('pulled:', await p.evaluate(() => [noteById('b').body, state.notes.find((n) => n.path === 'Proyectos/Web/Desde el móvil')?.body]));
  // No se vuelve a subir lo que vino de Drive
  const creates = await p.evaluate(() => window.__calls.filter((x) => x[1] === 'create_file').length);
  await p.clock.runFor(40000);
  console.log('no re-upload:', creates === await p.evaluate(() => window.__calls.filter((x) => x[1] === 'create_file').length));
  // Otro dispositivo no escribe
  console.log('other device:', await p.evaluate(() => { localStorage.setItem('enfoque:device', 'otro'); return vaultOn(); }));
  console.log('errors:', errs); await b.close();
})();
