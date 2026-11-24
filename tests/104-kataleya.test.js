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
    const radar = await T('radar_norma').execute({ norma: 'LIR' });
    window.__res = { hits: hits.map((h) => h.titulo), radar: radar.map((r) => [r.norma, r.notas.length]) };
    await T('crear_tablero').execute({ nombre: 'Tributaria por estado', origen: { tipo: 'carpeta', valor: 'MATRIZ' }, agrupar: 'estado', columnas: ['borrador', 'completa'] });
    await T('crear_dibujo').execute({ titulo: 'Cierre mensual', tipo: 'flujo', pasos: ['Inicio', 'Conciliar bancos', '¿Cuadra?', 'Emitir estados'] });
    await T('crear_diagrama').execute({ titulo: 'IVA', tipo: 'org', esquema: 'Débito fiscal\n  Ventas\nCrédito fiscal\n  Compras' });
    await T('crear_tarea').execute({ titulo: 'Revisar F29 de Comercial Cachapoal', fecha: '2026-12-20', prioridad: 'alta' });
    await T('recordar').execute({ hecho: 'Prefiero los tableros por estado', seccion: 'Preferencias' });
    const text = 'Según [[Ganancias de Capital]], el art. 107 LIR **cambia el 01-01-2027**. Te propuse un tablero, un dibujo, un diagrama, una tarea y guardar tu preferencia.';
    if (o.onText) { o.onText({ text: text.slice(0, 20) }); o.onText({ text }); }
    return { text, truncated: false };
  };
  sample.limits = async () => ({ tools: true });
  sample.json = async () => ({});
  window.claude = { use: async (k) => (k === 'sample' ? sample : null) };
};
(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const check = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${label}: ${JSON.stringify(got)}${ok ? ' ok' : ` ESPERADO ${JSON.stringify(want)}`}`); if (!ok) errs.push(label); };
  const c = await b.newContext({ viewport: { width: 1400, height: 900 } });
  await c.addInitScript((notes) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify({ tasks: [], habits: [], settings: { notesWelcome: true }, notes, updatedAt: 1 })); }, notes);
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
  check('herramientas', ['buscar_notas', 'radar_norma', 'contradicciones', 'crear_tablero', 'crear_base', 'crear_dibujo', 'crear_lienzo', 'recordar', 'agendar'].every((t) => call.tools.includes(t)), true);
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
  await p.keyboard.press('Alt+k'); await p.waitForTimeout(100);
  check('cerrar con Alt+K', await p.evaluate(() => document.querySelector('#kata-panel').hidden), true);
  console.log('errors:', JSON.stringify(errs));
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
