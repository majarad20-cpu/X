const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const out = process.argv[3];
const N = (id, path, body) => ({ id, path, body, createdAt: 1, updatedAt: 1 });
const notes = [
  N('a', 'MATRIZ/Ganancias de Capital', '---\nestado: borrador\narea: tributaria\n---\n# Ganancias\nEl art. 107 LIR paga 10 % hasta el 31-12-2026; desde el 01-01-2027 es ingreso no renta (Ley 21.850).\n'),
  N('b', 'MATRIZ/IVA en Servicios', '---\nestado: completa\narea: tributaria\n---\n# IVA\nLey 21.420.\n'),
];
const mock = () => {
  window.__calls = [];
  const sample = async (input, o = {}) => {
    window.__calls.push({ first: input[0].content, tools: (o.tools || []).map((t) => t.name) });
    const T = (n) => o.tools.find((t) => t.name === n);
    const hits = await T('buscar_notas').execute({ consulta: 'art. 107' });
    const radar = await T('contador').execute({ consulta: 'radar', norma: 'LIR' });
    window.__res = { hits: hits.map((h) => h.titulo), radar: radar.map((r) => [r.norma, r.notas.length]) };
    await T('crear_visual').execute({ tipo: 'tablero', nombre: 'Tributaria por estado', origen: { tipo: 'carpeta', valor: 'MATRIZ' }, agrupar: 'estado', columnas: ['borrador', 'completa'] });
    await T('crear_visual').execute({ tipo: 'dibujo', titulo: 'Cierre mensual', forma: 'flujo', pasos: ['Inicio', 'Conciliar bancos', '¿Cuadra?', 'Emitir estados'] });
    await T('crear_visual').execute({ tipo: 'diagrama', titulo: 'IVA', forma: 'org', esquema: 'Débito fiscal\n  Ventas\nCrédito fiscal\n  Compras' });
    await T('proponer').execute({ accion: 'tarea', titulo: 'Revisar F29 de Comercial Cachapoal', fecha: '2026-12-20', prioridad: 'alta' });
    await T('proponer').execute({ accion: 'recordar', hecho: 'Prefiero los tableros por estado', seccion: 'Preferencias' });
    window.__sizes = o.tools.map((t) => [t.name, t.description.length, JSON.stringify(t.inputSchema || {}).length]);
    const text = 'Según [[Ganancias de Capital]], el art. 107 LIR **cambia el 01-01-2027**. Te propuse un tablero, un dibujo, un diagrama, una tarea y guardar tu preferencia.';
    if (o.onText) { o.onText({ text: text.slice(0, 20) }); o.onText({ text }); }
    return { text, truncated: false };
  };
  sample.limits = async () => ({ maxPromptBytes: 262144, tools: { maxCount: 16 } });
  sample.json = async () => ({});
  const mcp = {
    callTool: async (server, tool, input) => {
      window.__mcp = (window.__mcp || []).concat([[server, tool, input]]);
      if (tool === 'search_files' && /folder/.test(input.query)) return { payload: { files: [{ id: 'carpeta-k', title: 'Kataleya' }] } };
      if (tool === 'web_search') return { payload: { results: [
        { url: 'https://solutiontax.cl/blog', title: 'Blog de impuestos', publish_date: '2026-07-31', excerpts: ['El interés penal es 7,70 %'] },
        { url: 'https://www.sii.cl/normativa_legislacion/resoluciones/2026/reso88.pdf', title: 'Res. Ex. SII N° 88', publish_date: '2026-06-26', excerpts: ['Tasa penal diaria 0,0213888889%'] },
      ] } };
      if (tool === 'search_files') return { payload: { files: [{ id: 'f1', title: 'Contrato cliente.pdf', mimeType: 'application/pdf', modifiedTime: '2026-11-01T00:00:00Z', contentSnippet: 'cláusula de honorarios' }] } };
      if (tool === 'create_file') return { payload: { id: 'nuevo', title: input.title, viewUrl: 'https://drive.google.com/file/d/nuevo/view' } };
      if (tool === 'create_draft') return { payload: { id: 'd1', viewUrl: 'https://mail.google.com/mail/#drafts/d1' } };
      if (tool === 'read_file_content') return { payload: { title: 'Contrato cliente.pdf', fileContent: 'Texto del contrato', viewUrl: 'https://drive.google.com/file/d/f1/view' } };
      throw Object.assign(new Error('x'), { code: 'tool_error' });
    },
  };
  window.claude = { use: async (k) => (k === 'sample' ? sample : k === 'mcp' ? mcp : null) };
};
(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const check = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${label}: ${JSON.stringify(got)}${ok ? ' ok' : ` ESPERADO ${JSON.stringify(want)}`}`); if (!ok) errs.push(label); };
  const c = await b.newContext({ viewport: { width: 1400, height: 900 } });
  await c.addInitScript((notes) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify({ tasks: [], habits: [{ id: 'h1', name: 'Leer', log: {}, createdAt: 1 }], settings: { notesWelcome: true }, notes, updatedAt: 1 })); }, notes);
  await c.addInitScript(mock);
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.goto(url); await p.waitForTimeout(1000);
  await p.evaluate(() => openNote(noteById('a'))); await p.waitForTimeout(150);
  check('avatar visible', await p.evaluate(() => !!document.querySelector('#kata-fab svg.kata-avatar')), true);
  await p.keyboard.press('Alt+k'); await p.waitForTimeout(200);
  check('panel con memoria y contexto', await p.evaluate(() => [!document.querySelector('#kata-panel').hidden, !!findNoteByName('Sistema/Memoria de Kataleya'), document.querySelector('.kata-ctx').textContent, document.querySelector('.kata-mode').value]), [true, true, 'Viendo: 📄 Ganancias de Capital', 'contador']);
  if (out) await p.screenshot({ path: `${out}/104-kataleya-inicio.png` });
  await p.fill('#kata-input', '¿Qué pasa con el art. 107?'); await p.keyboard.press('Enter'); await p.waitForTimeout(1500);
  const call = await p.evaluate(() => window.__calls[0]);
  check('instrucciones', [/Eres \*\*Kataleya\*\*/.test(call.first), /Modo Contador/.test(call.first), /Memoria de Kataleya/.test(call.first), /Comercial Cachapoal/.test(call.first), /\[\[Ganancias de Capital\]\]/.test(call.first)], [true, true, true, true, true]);
  check('herramientas agrupadas', call.tools, ['buscar_notas', 'leer_nota', 'tareas_y_diario', 'contador', 'buscar_fuera', 'abrir_vista', 'editar_nota', 'enlazar', 'organizar', 'proponer', 'crear_documento', 'crear_visual', 'comando']);
  check('dentro de los límites', await p.evaluate(() => window.__sizes.filter(([, d, sch]) => d > 1000 || sch > 4000)), []);
  check('lectura', await p.evaluate(() => window.__res), { hits: ['Ganancias de Capital'], radar: [['DL 824', 1]] });
  check('propuestas pendientes', await p.$$eval('#kata-panel .kata-act.s-pending strong', (n) => n.map((x) => x.textContent)), ['📋 Tablero «Tributaria por estado»', '✏️ Dibujo «Cierre mensual»', '🗺️ Diagrama «IVA»', '☑ Tarea «Revisar F29 de Comercial Cachapoal»', '🧠 ¿Lo recuerdo?']);
  check('nada se hizo aún', await p.evaluate(() => [gvCfg().boards.length, state.tasks.length, state.maps.length]), [0, 0, 0]);
  if (out) await p.screenshot({ path: `${out}/104-kataleya-propuestas.png` });
  // Aprobar todo, una a una
  for (let k = 0; k < 5; k++) { await p.click('#kata-panel .kata-act.s-pending .primary'); await p.waitForTimeout(k === 1 ? 1500 : 300); }
  check('aprobadas', await p.$$eval('#kata-panel .kata-act', (n) => n.map((x) => x.className.split(' ')[1])), ['s-done', 's-done', 's-done', 's-done', 's-done']);
  check('tablero', await p.evaluate(() => gvCfg().boards.map((x) => [x.name, x.group, x.src])), [['Tributaria por estado', 'estado', { t: 'folder', v: 'MATRIZ' }]]);
  const dib = await p.evaluate(async () => { const n = state.notes.find((x) => x.path === 'Dibujos/Cierre mensual'); const id = n && n.body.match(/img:([\w-]+)/)[1]; const rec = id && await getFile(id); return [!!n, rec?.drawing?.elements.filter((e) => e.type !== 'text').map((e) => e.type), rec?.drawing?.elements.filter((e) => e.containerId).length]; });
  check('dibujo editable', dib, [true, ['ellipse', 'rectangle', 'diamond', 'ellipse', 'arrow', 'arrow', 'arrow'], 4]);
  check('diagrama', await p.evaluate(() => { const m = state.maps.at(-1); return [m.title, m.kind, m.nodes.map((x) => x.text)]; }), ['IVA', 'org', ['IVA', 'Débito fiscal', 'Ventas', 'Crédito fiscal', 'Compras']]);
  check('tarea', await p.evaluate(() => state.tasks.map((t) => [t.title, t.due, t.priority])), [['Revisar F29 de Comercial Cachapoal', '2026-12-20', 3]]);
  check('recordado', await p.evaluate(() => /## Preferencias[\s\S]*- \d{4}-\d{2}-\d{2}: Prefiero los tableros por estado\n/.test(findNoteByName('Sistema/Memoria de Kataleya').body)), true);
  // Guardar la conversación
  await p.click('#kata-panel .kata-icon[title^="Guardar"]'); await p.waitForTimeout(150);
  check('conversación guardada', await p.evaluate(() => { const n = state.notes.find((x) => x.path.startsWith('Conversaciones/Kataleya ')); return [!!n, /> \*\*Tú:\*\* ¿Qué pasa con el art\. 107\?/.test(n?.body || ''), /✅ 📋 Tablero/.test(n?.body || '')]; }), [true, true, true]);
  // Importar memoria
  await p.evaluate(() => { kata.importing = true; kataRender(); }); await p.waitForTimeout(100);
  await p.fill('#kata-panel .kata-import', 'Trabajo con pymes agrícolas\nUso régimen Pro Pyme');
  await p.click('#kata-panel .kata-empty .primary'); await p.waitForTimeout(150);
  check('memoria importada', await p.evaluate(() => /## Importado de Claude \(\d{4}-\d{2}-\d{2}\)\n- Trabajo con pymes agrícolas\n- Uso régimen Pro Pyme/.test(findNoteByName('Sistema/Memoria de Kataleya').body)), true);
  // Si Claude rechaza las herramientas, responde igual sin ellas y muestra el código si todo falla
  const fb = await p.evaluate(async () => {
    const orig = ai.sample;
    const fake = async (input, o = {}) => { if (o.tools) throw { code: 'invalid_request', message: 'tools[3]: too many' }; const text = 'Respuesta sin herramientas'; o.onText && o.onText({ text }); return { text }; };
    fake.limits = orig.limits;
    ai.sample = fake;
    await kataSend('hola');
    const t = kata.turns.at(-1);
    const fail = async () => { throw { code: 'rate_limited', message: 'x' }; };
    fail.limits = orig.limits;
    ai.sample = fail;
    await kataSend('otra');
    const t2 = kata.turns.at(-1);
    ai.sample = orig;
    return [t.content, t.note, t2.error];
  });
  check('respaldo sin herramientas', fb, ['Respuesta sin herramientas', 'Respondí sin mis herramientas (no pude usarlas en esta vista).', 'Has hecho muchas peticiones seguidas o llegaste a tu límite de uso. Prueba de nuevo en un rato. (código: rate_limited)']);

  // Documentos: PDF, Google Doc, hoja y borrador de Gmail
  const docs = await p.evaluate(async () => {
    window.__pdf = null; window.__dl = null; window.__mcp = [];
    exportNotesPdf = async (notes, o) => { window.__pdf = [notes[0].path, notes[0].body, o.title]; };
    offerDownload = async (name, blob) => { window.__dl = [name, await blob.text()]; return true; };
    kata.turns = [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'ok' }];
    kata.pending.clear();
    const T = kataTools(16).find((t) => t.name === 'crear_documento');
    T.execute({ tipo: 'pdf', titulo: 'Cambio del art. 107 LIR', contenido: '## Qué cambia\nDesde el **01-01-2027** es ingreso no renta.', para: 'Comercial Cachapoal Ltda.', firma: 'Contador auditor', guardar_nota: true });
    T.execute({ tipo: 'doc', titulo: 'Minuta', contenido: 'Texto con [[Ganancias de Capital]]' });
    T.execute({ tipo: 'hoja', titulo: 'Vencimientos diciembre', columnas: ['Fecha', 'Obligación'], filas: [['2026-12-14', 'F29, en papel'], ['2026-12-21', 'F29 "internet"']] });
    T.execute({ tipo: 'hoja', titulo: 'Vencimientos CSV', columnas: ['A'], filas: [[1]], destino: 'csv' });
    T.execute({ tipo: 'correo', destinatarios: ['cliente@ejemplo.cl', 'no es correo'], asunto: 'F29 atrasado', cuerpo: 'Hola,\nle escribo por <su> F29.' });
    const cards = [...kata.pending.values()].map((a) => a.label);
    for (const id of [...kata.pending.keys()]) await kataApprove(id);
    const calls = window.__mcp.filter((c) => c[1] !== 'search_files');
    return { cards, status: [...kata.pending.values()].map((a) => a.status), pdf: window.__pdf, nota: !!state.notes.find((n) => n.path === 'Documentos/Cambio del art. 107 LIR'),
      doc: [calls[0][2].title, calls[0][2].contentMimeType, calls[0][2].parentId, /<h1[^>]*>Minuta<\/h1>/.test(calls[0][2].textContent), /wikilink/.test(calls[0][2].textContent)],
      hoja: [calls[1][2].contentMimeType, calls[1][2].textContent], csv: window.__dl,
      correo: [calls[2][1], calls[2][2].to, calls[2][2].subject, calls[2][2].htmlBody] };
  });
  check('tarjetas de documentos', docs.cards, ['📄 PDF «Cambio del art. 107 LIR»', '📝 Google Doc «Minuta»', '📊 Hoja «Vencimientos diciembre»', '📊 Hoja «Vencimientos CSV»', '✉️ Borrador «F29 atrasado»']);
  check('todas hechas', docs.status, ['done', 'done', 'done', 'done', 'done']);
  check('pdf', [docs.pdf[0], /^# Cambio del art\. 107 LIR\n\*\d+ de \S+ de \d{4} · Para: Comercial Cachapoal Ltda\.\*\n\n## Qué cambia/.test(docs.pdf[1]), /---\nContador auditor$/.test(docs.pdf[1]), docs.nota], ['Cambio del art. 107 LIR', true, true, true]);
  check('google doc', docs.doc, ['Minuta', 'text/html', 'carpeta-k', true, false]);
  check('hoja', docs.hoja, ['text/csv', 'Fecha,Obligación\r\n2026-12-14,"F29, en papel"\r\n2026-12-21,"F29 ""internet"""']);
  check('csv', [docs.csv[0], docs.csv[1].replace(/^\ufeff/, '')], ['Vencimientos CSV.csv', 'A\r\n1']);
  check('borrador', docs.correo, ['create_draft', ['cliente@ejemplo.cl'], 'F29 atrasado', '<div>Hola,<br>le escribo por &lt;su&gt; F29.</div>']);

  // Editar notas, organizar y comandos
  const ed = await p.evaluate(async () => {
    kata.turns = [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'ok' }];
    kata.pending.clear();
    const tools = kataTools(16);
    const T = (n) => tools.find((t) => t.name === n);
    const err = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
    const notFound = err(() => T('editar_nota').execute({ accion: 'reemplazar', nota: 'Ganancias de Capital', buscar: 'no está', poner: 'x' }));
    T('editar_nota').execute({ accion: 'reemplazar', nota: 'Ganancias de Capital', buscar: 'paga 10 % hasta el 31-12-2026', poner: 'pagó 10 % hasta el 31-12-2026' });
    T('editar_nota').execute({ accion: 'agregar', nota: 'Ganancias de Capital', bajo_titulo: 'Ganancias', texto: '> [!info] Revisado por Kataleya' });
    T('editar_nota').execute({ accion: 'renombrar', nota: 'IVA en Servicios', nuevo_nombre: 'IVA a los Servicios' });
    T('organizar').execute({ accion: 'completar_tarea', tarea: 'Revisar F29 de Comercial Cachapoal' });
    T('organizar').execute({ accion: 'anotar_idea', texto: 'Curso de Operación Renta #cursos' });
    T('organizar').execute({ accion: 'escribir_diario', texto: 'Hoy configuré a Kataleya.' });
    T('organizar').execute({ accion: 'marcar_habito', habito: 'leer' });
    const listado = T('comando').execute({ accion: 'listar', filtro: 'nota diaria' });
    T('comando').execute({ accion: 'ejecutar', nombre: 'Abrir la nota diaria de hoy' });
    kataRender();
    const cards = [...kata.pending.values()].map((a) => a.label);
    const diff = kata.pending.get([...kata.pending.keys()][0]).diff.filter((d) => d.t !== ' ').map((d) => `${d.t}${d.l}`);
    const diffShown = !!document.querySelector('#kata-panel .kata-diff .dm') && !!document.querySelector('#kata-panel .kata-diff .dp');
    for (const id of [...kata.pending.keys()]) await kataApprove(id);
    const a = noteById('a');
    return { notFound, cards, diff, diffShown, status: [...kata.pending.values()].map((x) => x.status),
      body: a.body.split('\n').slice(-3).join('|'), renamed: noteById('b').path, task: state.tasks.concat(state.archive).find((t) => t.title.startsWith('Revisar F29'))?.done,
      idea: state.ideas.at(-1)?.tags, diario: !!state.notes.find((n) => /^Diario\//.test(n.path) && /Hoy configuré a Kataleya/.test(n.body)), habito: !!state.habits[0].log[dateKey()], listado, active: activeNote()?.path };
  });
  check('no adivina', ed.notFound, 'No encontré ese texto exacto en la nota: léela y copia el fragmento tal cual');
  check('tarjetas de edición', ed.cards, ['✏️ Reemplazar en «Ganancias de Capital»', '➕ Agregar a «Ganancias de Capital» (bajo «Ganancias»)', '🏷 Renombrar «IVA en Servicios» → «IVA a los Servicios»', '✅ Completar «Revisar F29 de Comercial Cachapoal»', '💡 Idea', '📓 Entrada del diario', '🔥 Marcar «Leer»', '⌘ Abrir la nota diaria de hoy']);
  check('vista de cambios', [ed.diff, ed.diffShown], [['-El art. 107 LIR paga 10 % hasta el 31-12-2026; desde el 01-01-2027 es ingreso no renta (Ley 21.850).', '+El art. 107 LIR pagó 10 % hasta el 31-12-2026; desde el 01-01-2027 es ingreso no renta (Ley 21.850).'], true]);
  check('todas aplicadas, una tras otra', ed.status, ['done', 'done', 'done', 'done', 'done', 'done', 'done', 'done']);
  check('resultados', [ed.body, ed.renamed, ed.task, ed.idea, ed.diario, ed.habito, ed.listado.includes('Abrir la nota diaria de hoy'), /^Diario\//.test(ed.active || '')], ['El art. 107 LIR pagó 10 % hasta el 31-12-2026; desde el 01-01-2027 es ingreso no renta (Ley 21.850).|> [!info] Revisado por Kataleya|', 'MATRIZ/IVA a los Servicios', true, ['cursos'], true, true, true, true]);

  // Enlazar notas
  const ln = await p.evaluate(async () => {
    const add = (id, path, body) => state.notes.push({ id, path, body, createdAt: 1, updatedAt: 1 });
    add('ni', 'MATRIZ/Ingreso no renta', '# Ingreso no renta\nConcepto.\n');
    add('moc', 'MOCS/MOC Tributaria', '# MOC Tributaria\n## Renta\n- [[IVA a los Servicios]]\n\n## IVA\n- nada\n');
    add('rt', 'MATRIZ/Con roto', '# Roto\nVer [[Gananzias de Capital#Ganancias|la nota]] y [[IVA a los Servicios]].\n');
    dataRev++; save();
    kata.turns = [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'ok' }];
    kata.pending.clear();
    const T = kataTools(16).find((t) => t.name === 'enlazar');
    const sug = T.execute({ accion: 'sugerir', nota: 'Ganancias de Capital' });
    const rotos = T.execute({ accion: 'rotos' });
    T.execute({ accion: 'menciones', nota: 'Ganancias de Capital', hacia: ['Ingreso no renta'] });
    T.execute({ accion: 'relacionar', nota: 'Ganancias de Capital', con: ['IVA a los Servicios'], ambos_sentidos: true });
    T.execute({ accion: 'moc', nota: 'Ganancias de Capital', moc: 'MOC Tributaria', seccion: 'Renta' });
    T.execute({ accion: 'reparar', nota: 'Con roto', roto: 'Gananzias de Capital', por: 'Ganancias de Capital' });
    const cards = [...kata.pending.values()].map((a) => a.label);
    for (const id of [...kata.pending.keys()]) await kataApprove(id);
    const g = noteById('a');
    return { sug: [sug.menciones_sin_enlazar, sug.moc], rotos: rotos.primeros.map((r) => [r.nota, r.enlace]), cards, status: [...kata.pending.values()].map((x) => x.status),
      gan: [/\[\[Ingreso no renta\|ingreso no renta\]\]/.test(g.body), /## Relacionadas\n- \[\[IVA a los Servicios\]\]/.test(g.body), propOf(g, 'moc')],
      iva: /## Relacionadas\n- \[\[Ganancias de Capital\]\]/.test(noteById('b').body),
      moc: noteById('moc').body.split('\n').slice(1, 4).join('|'), roto: noteById('rt').body.split('\n')[1] };
  });
  check('sugerir', ln.sug, [['Ingreso no renta'], null]);
  check('rotos', ln.rotos, [['Con roto', 'Gananzias de Capital']]);
  check('tarjetas de enlaces', ln.cards, ['🔗 Enlazar 1 mención en «Ganancias de Capital»', '🔗 Enlazar «Ganancias de Capital» con 1 nota', '🔗 Enlazar «IVA a los Servicios» con «Ganancias de Capital»', '🧭 Agregar «Ganancias de Capital» al MOC «MOC Tributaria» (bajo «Renta»)', '🏷 moc: [[MOC Tributaria]]', '🩹 Reparar [[Gananzias de Capital]] → [[Ganancias de Capital]] en «Con roto»']);
  check('enlaces aplicados', [ln.status.every((x) => x === 'done'), ln.gan, ln.iva, ln.moc, ln.roto], [true, [true, true, '[[MOC Tributaria]]'], true, '## Renta|- [[IVA a los Servicios]]|- [[Ganancias de Capital]]', 'Ver [[Ganancias de Capital#Ganancias|la nota]] y [[IVA a los Servicios]].']);

  // Internet y Drive
  await p.evaluate(() => { kata.turns = []; kata.pending.clear(); kataRender(); });
  const web = await p.evaluate(async () => {
    kata.turns.push({ role: 'user', content: 'x' }, { role: 'assistant', content: 'Respuesta' });
    const tools = kataToolsAll();
    const T = (n) => tools.find((t) => t.name === n);
    const r = await T('buscar_en_internet').execute({ objetivo: 'interés penal 2027', consultas: ['interés penal SII 2027'] });
    const d = await T('buscar_en_drive').execute({ consulta: "contrato d'agua" });
    const f = await T('leer_archivo_drive').execute({ id: 'f1' });
    await T('buscar_notas').execute({ consulta: 'IVA' });
    kataRender();
    return { names: tools.map((t) => t.name).filter((n) => /internet|pagina|drive/.test(n)), first: r.map((x) => [x.titulo, x.oficial]), drive: d.map((x) => x.titulo), file: f.texto, query: window.__mcp.filter((c) => c[1] === 'search_files').at(-1)[2].query, used: kata.turns.at(-1).used };
  });
  check('herramientas externas', web.names, ['buscar_en_internet', 'leer_pagina', 'buscar_en_drive', 'leer_archivo_drive']);
  check('oficial primero', web.first, [['Res. Ex. SII N° 88', true], ['Blog de impuestos', false]]);
  check('drive', [web.drive, web.file, web.query], [['Contrato cliente.pdf'], 'Texto del contrato', "fullText contains 'contrato d\\'agua' and trashed = false"]);
  check('fuentes usadas', web.used, ['web', 'drive', 'boveda']);
  check('chips y enlaces', await p.evaluate(() => [[...document.querySelectorAll('#kata-panel .kata-chip-src')].map((x) => x.textContent), [...document.querySelectorAll('#kata-panel .kata-refs li')].map((x) => x.textContent)]), [['🌐 Internet', '📁 Drive', '🗂 Bóveda'], ['Res. Ex. SII N° 88 · sii.cl · 2026-06-26 ✓ oficial', 'Blog de impuestos · solutiontax.cl · 2026-07-31', '📁 Contrato cliente.pdf · drive.google.com']]);
  if (out) await p.screenshot({ path: `${out}/104-kataleya-fuentes.png` });
  await p.click('#kata-panel .kata-src >> text=Internet'); await p.waitForTimeout(100);
  check('apagar internet', await p.evaluate(() => [kataCfg().web, kataTools().some((t) => t.name === 'buscar_en_internet'), /Internet está apagado/.test(kataRules())]), ['off', false, true]);
  check('reglas de dónde buscar', await p.evaluate(() => { kataCfg().web = 'auto'; const r = kataRules(); return [/1\. 🗂 \*\*Bóveda\*\*/.test(r), /3\. 🌐 \*\*Internet\*\*: solo si/.test(r), /agregar_alerta/.test(r)]; }), [true, true, true]);
  await p.keyboard.press('Alt+k'); await p.waitForTimeout(100);
  check('cerrar con Alt+K', await p.evaluate(() => document.querySelector('#kata-panel').hidden), true);
  console.log('errors:', JSON.stringify(errs));
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
