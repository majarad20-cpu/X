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
    notes: [{ id: 'a', path: 'Inicio', body: '# Inicio', createdAt: now, updatedAt: now }],
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
  // Copias de carpetas de Obsidian con fechas antiguas: una en «Enfoque» y otra en «Enfoque/Notas»
  await p.evaluate(() => {
    const F = 'application/vnd.google-apps.folder';
    const enfoque = window.__files.find((x) => x.title === 'Enfoque' && x.mimeType === F);
    const notas = window.__files.find((x) => x.title === 'Notas' && x.mimeType === F);
    const old = '2024-01-01T00:00:00Z';
    const add = (f) => window.__files.push({ modifiedTime: old, mimeType: 'text/markdown', ...f });
    add({ id: 'est', title: 'Estocismo', mimeType: F, parentId: enfoque.id });
    add({ id: 'e1', title: 'Dicotomía del control.md', parentId: 'est', text: '# Dicotomía\nVer [[Séneca]]' });
    add({ id: 'sen', title: 'Autores', mimeType: F, parentId: 'est' });
    add({ id: 'e2', title: 'Séneca.md', parentId: 'sen', text: 'Cartas a Lucilio\r\n' });
    add({ id: 'obs', title: '.obsidian', mimeType: F, parentId: 'est' });
    add({ id: 'e3', title: 'workspace.md', parentId: 'obs', text: 'x' });
    add({ id: 'img', title: 'foto.png', mimeType: 'image/png', parentId: 'est', text: 'x' });
    add({ id: 'ma', title: 'Marco Aurelio', mimeType: F, parentId: notas.id });
    add({ id: 'e4', title: 'Meditaciones.md', parentId: 'ma', text: 'Libro II' });
  });
  await p.evaluate(() => syncVault({ manual: true }));
  await p.clock.runFor(1000);
  check('notas traídas', await p.evaluate(() => state.notes.map((n) => n.path).sort()), ['Estocismo/Autores/Séneca', 'Estocismo/Dicotomía del control', 'Inicio', 'Marco Aurelio/Meditaciones']);
  check('contenido', await p.evaluate(() => state.notes.find((n) => n.path === 'Estocismo/Autores/Séneca').body), 'Cartas a Lucilio\n');
  check('enlace resuelto', await p.evaluate(() => !!findNoteByName('Séneca')), true);
  // Otra sincronización no duplica ni vuelve a subir
  const creates = await p.evaluate(() => window.__calls.filter((x) => x[1] === 'create_file').length);
  await p.evaluate(() => syncVault({ manual: true }));
  await p.clock.runFor(40000);
  check('sin duplicados', await p.evaluate(() => state.notes.length), 4);
  check('sin resubir', await p.evaluate(() => window.__calls.filter((x) => x[1] === 'create_file').length), creates);
  // Editar una nota de Estocismo se guarda en su carpeta de Drive
  await p.evaluate(() => { const n = state.notes.find((x) => x.path === 'Estocismo/Dicotomía del control'); n.body += '\nMás'; n.updatedAt = Date.now(); save(); });
  await p.clock.runFor(40000);
  check('guardada en su carpeta', await p.evaluate(() => window.__files.filter((f) => !f.trashed && f.title === 'Dicotomía del control.md').map((f) => [f.parentId, f.text.endsWith('Más')])), [['est', true]]);
  // Imágenes y PDF junto a las notas: se traen y se ven al leer, sin cambiar el texto de la nota
  await p.evaluate(() => {
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    window.__files.push({ id: 'img1', title: 'foto.png', mimeType: 'image/png', parentId: 'sen', modifiedTime: '2024-01-01T00:00:00Z', fileSize: '70', b64: png });
    window.__files.push({ id: 'pdf1', title: 'Cartas.pdf', mimeType: 'application/pdf', parentId: 'est', modifiedTime: '2024-01-01T00:00:00Z', fileSize: '20', b64: btoa('%PDF-1.4 prueba') });
    window.__files.push({ id: 'e9', title: 'Con adjuntos.md', mimeType: 'text/markdown', parentId: 'est', modifiedTime: '2024-01-01T00:00:00Z', text: 'Mira ![[foto.png|200]]\n\n![retrato](Autores/foto.png)\n\nLee [[Cartas.pdf]]\n' });
  });
  for (let i = 0; i < 20 && (await p.evaluate(() => vault.busy)); i++) await p.clock.runFor(500);
  await p.evaluate(() => syncVault({ manual: true }));
  await p.clock.runFor(2000);
  check('adjuntos guardados', await p.evaluate(() => Object.entries(state.settings.vaultAssets || {}).map(([k, v]) => `${k}:${v.k}`).sort()), ['cartas.pdf:file', 'estocismo/autores/foto.png:img', 'estocismo/cartas.pdf:file', 'foto.png:img']);
  check('nota sin cambios', await p.evaluate(() => state.notes.find((n) => n.path === 'Estocismo/Con adjuntos').body), 'Mira ![[foto.png|200]]\n\n![retrato](Autores/foto.png)\n\nLee [[Cartas.pdf]]\n');
  check('se ven al leer', await p.evaluate(() => { const h = renderMd(state.notes.find((n) => n.path === 'Estocismo/Con adjuntos').body); return [(h.match(/data-img=/g) || []).length, (h.match(/data-file=/g) || []).length, /width:\s*200px/.test(h)]; }), [2, 1, true]);
  check('no se vuelven a bajar', await p.evaluate(async () => { const n = window.__calls.filter((x) => x[1] === 'download_file_content').length; await syncVault({ manual: true }); return window.__calls.filter((x) => x[1] === 'download_file_content').slice(n).map((x) => x[2].fileId); }), []);
  // Libros pesados: no se traen de Drive (más de 200 KB) y los sacados de Enfoque se quedan en Drive
  await p.evaluate(() => {
    window.__files.push({ id: 'big1', title: 'Libro gordo.md', mimeType: 'text/markdown', parentId: 'est', modifiedTime: '2024-01-01T00:00:00Z', fileSize: String(600 * 1024), text: 'x'.repeat(1000) });
  });
  for (let i = 0; i < 20 && (await p.evaluate(() => vault.busy)); i++) await p.clock.runFor(500);
  await p.evaluate(() => syncVault({ manual: true })); await p.clock.runFor(1000);
  check('libro pesado no traído', await p.evaluate(() => state.notes.some((n) => /Libro gordo/.test(n.path))), false);
  const sen = await p.evaluate(() => { const n = state.notes.find((x) => x.path === 'Estocismo/Autores/Séneca'); return [n.id, vaultMap().files[n.id].id]; });
  await p.evaluate(() => excludeFromEnfoque([state.notes.find((x) => x.path === 'Estocismo/Autores/Séneca')]));
  await p.clock.runFor(40000);
  for (let i = 0; i < 20 && (await p.evaluate(() => vault.busy)); i++) await p.clock.runFor(500);
  await p.evaluate(() => syncVault({ manual: true })); await p.clock.runFor(1000);
  check('sacada: sigue en Drive y no vuelve', await p.evaluate((fid) => [window.__files.find((f) => f.id === fid).trashed || false, state.notes.some((n) => n.path === 'Estocismo/Autores/Séneca'), state.settings.vaultExcluded.map((x) => x.path)], sen[1]), [false, false, ['Estocismo/Autores/Séneca']]);
  // Quitarla de la lista la vuelve a traer
  await p.evaluate(() => { state.settings.vaultExcluded = []; save(); });
  for (let i = 0; i < 20 && (await p.evaluate(() => vault.busy)); i++) await p.clock.runFor(500);
  await p.evaluate(() => syncVault({ manual: true })); await p.clock.runFor(1000);
  check('vuelve a traerse', await p.evaluate(() => state.notes.filter((n) => n.path === 'Estocismo/Autores/Séneca').length), 1);
  // Un .md que ya existe como nota (p. ej. subido por otro dispositivo) no crea «… 2»
  await p.evaluate(() => {
    const est = 'est';
    window.__files.push({ id: 'dup1', title: 'Dicotomía del control.md', mimeType: 'text/markdown', parentId: est, modifiedTime: new Date(Date.now() + 60000).toISOString(), text: '# Dicotomía\nversión de otro dispositivo' });
  });
  for (let i = 0; i < 20 && (await p.evaluate(() => vault.busy)); i++) await p.clock.runFor(500);
  await p.evaluate(() => syncVault({ manual: true })); await p.clock.runFor(1000);
  check('sin duplicado «2»', await p.evaluate(() => [state.notes.filter((n) => /Dicotomía del control/.test(n.path)).map((n) => n.path), state.notes.find((n) => n.path === 'Estocismo/Dicotomía del control').body]), [['Estocismo/Dicotomía del control'], '# Dicotomía\nversión de otro dispositivo']);
  // Una carpeta que está directamente en «Enfoque» y además copiada en «Notas» (la creó un dispositivo que
  // había perdido el mapa): manda la de «Enfoque», las notas se enlazan con sus archivos y no se pierde nada.
  await p.evaluate(() => {
    const F = 'application/vnd.google-apps.folder';
    const enfoque = window.__files.find((x) => x.title === 'Enfoque' && x.mimeType === F);
    const notas = window.__files.find((x) => x.title === 'Notas' && x.mimeType === F);
    const old = '2024-01-01T00:00:00Z';
    const copyAt = new Date(Date.now() - 60000).toISOString();
    const later = new Date(Date.now() + 60000).toISOString();
    const add = (f) => window.__files.push({ mimeType: 'text/markdown', modifiedTime: old, ...f });
    add({ id: 'cA', title: 'Cerebro', mimeType: F, parentId: enfoque.id });
    add({ id: 'cA1', title: 'MOC.md', parentId: 'cA', text: 'MOC revisado', modifiedTime: later });
    add({ id: 'cA2', title: 'Igual.md', parentId: 'cA', text: 'mismo texto' });
    add({ id: 'cA3', title: 'Editada en la app.md', parentId: 'cA', text: 'versión vieja' });
    add({ id: 'cB', title: 'Cerebro', mimeType: F, parentId: notas.id, modifiedTime: copyAt });
    add({ id: 'cB1', title: 'MOC.md', parentId: 'cB', text: 'MOC viejo', modifiedTime: copyAt });
    add({ id: 'cB2', title: 'Igual.md', parentId: 'cB', text: 'mismo texto', modifiedTime: copyAt });
    add({ id: 'cB3', title: 'Editada en la app.md', parentId: 'cB', text: 'versión nueva', modifiedTime: copyAt });
    add({ id: 'cB4', title: 'Solo en la copia.md', parentId: 'cB', text: 'solo aquí', modifiedTime: copyAt });
    const m = vaultMap();
    m.folders.Cerebro = 'cB';
    const at = Date.now() - 60000;
    [['n1', 'MOC', 'MOC viejo', 'cB1'], ['n2', 'Igual', 'mismo texto', 'cB2'], ['n3', 'Editada en la app', 'versión nueva', 'cB3'], ['n4', 'Solo en la copia', 'solo aquí', 'cB4']].forEach(([id, t, body, fid]) => {
      state.notes.push({ id, path: `Cerebro/${t}`, body, createdAt: at, updatedAt: at });
      m.files[id] = { id: fid, path: `Cerebro/${t}`, at, mt: copyAt };
    });
    saveVaultMap();
    save();
  });
  for (let i = 0; i < 20 && (await p.evaluate(() => vault.busy)); i++) await p.clock.runFor(500);
  await p.evaluate(() => syncVault({ manual: true })); await p.clock.runFor(40000);
  for (let i = 0; i < 20 && (await p.evaluate(() => vault.busy)); i++) await p.clock.runFor(500);
  await p.evaluate(() => syncVault({ manual: true })); await p.clock.runFor(1000);
  const cerebro = () => p.evaluate(() => {
    const live = window.__files.filter((f) => !f.trashed);
    return {
      folder: vaultMap().folders.Cerebro,
      bodies: ['n1', 'n2', 'n3', 'n4'].map((id) => noteById(id).body),
      linked: ['n1', 'n2', 'n3', 'n4'].map((id) => live.find((f) => f.id === vaultMap().files[id].id)?.parentId),
      notes: state.notes.filter((n) => n.path.startsWith('Cerebro/')).length,
      folders: live.filter((f) => f.title === 'Cerebro').length,
    };
  });
  check('carpeta de «Enfoque» manda', await cerebro(), { folder: 'cA', bodies: ['MOC revisado', 'mismo texto', 'versión nueva', 'solo aquí'], linked: ['cA', 'cA', 'cA', 'cB'], notes: 4, folders: 2 });
  check('la más nueva queda en Drive', await p.evaluate(() => window.__files.filter((f) => !f.trashed && f.parentId === 'cA' && f.title === 'Editada en la app.md').map((f) => f.text)), ['versión nueva']);
  // Al cambiar la nota que solo estaba en la copia, se guarda en la carpeta de «Enfoque»
  await p.evaluate(() => { const n = noteById('n4'); n.body += ' y más'; n.updatedAt = Date.now(); save(); });
  await p.clock.runFor(40000);
  check('guardada en «Enfoque»', await p.evaluate(() => window.__files.filter((f) => !f.trashed && f.title === 'Solo en la copia.md').map((f) => [f.parentId, f.text])), [['cA', 'solo aquí y más']]);
  // Un dispositivo sin mapa no vuelve a crear la copia en «Notas»
  await p.evaluate(() => { localStorage.removeItem('enfoque:vault'); vault.map = null; state.notes.push({ id: 'n5', path: 'Cerebro/Nueva', body: 'nueva', createdAt: Date.now(), updatedAt: Date.now() }); save(); });
  for (let i = 0; i < 20 && (await p.evaluate(() => vault.busy)); i++) await p.clock.runFor(500);
  await p.evaluate(() => syncVault({ manual: true, adopt: true })); await p.clock.runFor(2000);
  check('sin copia nueva', await p.evaluate(() => [vaultMap().folders.Cerebro, window.__files.filter((f) => !f.trashed && f.title === 'Cerebro').length, window.__files.filter((f) => !f.trashed && f.title === 'Nueva.md').map((f) => f.parentId), window.__files.filter((f) => !f.trashed && f.title === 'MOC.md').length]), ['cA', 2, ['cA'], 2]);
  // Un archivo movido y renombrado en Drive (o en Obsidian): la nota cambia igual de ruta y no se vuelve a subir
  const before = await p.evaluate(() => {
    window.__files.push({ id: 'cSub', title: 'Archivo', mimeType: 'application/vnd.google-apps.folder', parentId: 'cA', modifiedTime: '2024-01-01T00:00:00Z' });
    const f = window.__files.find((x) => !x.trashed && x.title === 'Igual.md' && x.parentId === 'cA');
    f.parentId = 'cSub';
    f.title = 'Igual movida.md';
    return window.__calls.filter((x) => x[1] === 'create_file' && x[2].contentMimeType !== 'application/vnd.google-apps.folder').length;
  });
  for (let i = 0; i < 20 && (await p.evaluate(() => vault.busy)); i++) await p.clock.runFor(500);
  await p.evaluate(() => syncVault({ manual: true })); await p.clock.runFor(40000);
  check('movida en Drive', await p.evaluate((n) => [noteById('n2').path, noteById('n2').body, window.__calls.filter((x) => x[1] === 'create_file' && x[2].contentMimeType !== 'application/vnd.google-apps.folder').length === n, window.__files.filter((f) => !f.trashed && /^Igual/.test(f.title)).map((f) => [f.parentId, f.title]).sort()], before), ['Cerebro/Archivo/Igual movida', 'mismo texto', true, [['cB', 'Igual.md'], ['cSub', 'Igual movida.md']]]);
  // Un archivo borrado en Drive: su nota pasa a la papelera de Enfoque y no se vuelve a subir. Uno subido
  // hace un momento (la búsqueda de Drive puede no verlo aún) no se toca.
  await p.evaluate(() => {
    window.__files.find((f) => !f.trashed && f.title === 'Igual movida.md').trashed = true;
    window.__files.find((f) => !f.trashed && f.title === 'Nueva.md').trashed = true;
  });
  for (let i = 0; i < 20 && (await p.evaluate(() => vault.busy)); i++) await p.clock.runFor(500);
  await p.evaluate(() => syncVault({ manual: true })); await p.clock.runFor(1000);
  check('aviso de borradas', await p.evaluate(() => /1 nota\(s\) borradas en Drive pasaron a la papelera de Enfoque/.test(document.getElementById('gvault-status').textContent)), true);
  await p.clock.runFor(40000);
  check('borrada en Drive', await p.evaluate(() => [!!noteById('n2'), trashList().some((t) => t.id === 'n2'), window.__files.some((f) => !f.trashed && /^Igual movida/.test(f.title)), !!noteById('n5')]), [false, true, false, true]);
  // Carpeta renombrada («4.- ENFOQUE»): si hay que volver a buscarla, se encuentra igual
  check('carpeta renombrada', await p.evaluate(async () => {
    const f = window.__files.find((x) => x.title === 'Enfoque');
    f.title = '4.- ENFOQUE';
    window.__files.push({ id: 'otra', title: 'Enfoque viejo', mimeType: 'application/vnd.google-apps.folder', modifiedTime: '2024-01-01T00:00:00Z' });
    delete gSettings().driveFolder;
    return [await driveFolder() === f.id, window.__files.filter((x) => /enfoque/i.test(x.title)).length];
  }), [true, 2]);
  console.log('errors:', JSON.stringify(errs)); await b.close();
  process.exit(errs.length ? 1 : 0);
})();
