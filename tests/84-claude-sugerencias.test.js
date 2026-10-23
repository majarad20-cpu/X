const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const mock = () => {
  window.__prompts = [];
  const sample = async (input, o = {}) => {
    const p = String(input);
    window.__prompts.push(p);
    const text = JSON.stringify({ sugerencias: [
      { tipo: 'seccion', titulo: 'Ejemplo', contenido: '## Ejemplo\nUna empresa con caja de 100.', motivo: 'Falta un caso práctico.' },
      { tipo: 'enlace', texto: 'activo', nota: 'Activo', motivo: 'Existe la nota.' },
      { tipo: 'enlace', texto: 'pasivo', nota: 'Nota inventada', motivo: 'no existe' },
      { tipo: 'redaccion', buscar: 'muestra la situacion', reemplazar: 'muestra la situación', motivo: 'Tilde.' },
      { tipo: 'redaccion', buscar: 'frase que no está', reemplazar: 'x', motivo: 'no está' },
      { tipo: 'etiqueta', etiqueta: '#contabilidad', motivo: 'Tema.' },
      { tipo: 'etiqueta', etiqueta: 'finanzas', motivo: 'ya la tiene' },
      { tipo: 'estado', valor: 'revisada', motivo: 'Está completa.' },
      { tipo: 'nota_nueva', titulo: 'Patrimonio', motivo: 'Se menciona sin nota.' },
      { tipo: 'nota_nueva', titulo: 'Activo', motivo: 'ya existe' },
    ] });
    if (o.onText) o.onText({ text: text.slice(0, 10) });
    return { text: '```json\n' + text + '\n```' };
  };
  sample.limits = async () => ({ tools: false });
  window.claude = { use: async (k) => (k === 'sample' ? sample : null) };
};
(async () => {
  const b = await chromium.launch(launchOptions);
  const c = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await c.addInitScript(() => {
    if (localStorage.getItem('enfoque:v1')) return;
    const notes = [
      { id: 'bg', path: 'Contabilidad/Balance General', body: '---\ntags: [finanzas]\nestado: borrador\n---\n# Balance General\nEl balance muestra la situacion: activo, pasivo y patrimonio.\n\n## Fuentes\n- [[Activo]]', createdAt: 1, updatedAt: 1 },
      { id: 'ac', path: 'Contabilidad/Activo', body: 'Recursos.', createdAt: 1, updatedAt: 2 },
    ];
    localStorage.setItem('enfoque:v1', JSON.stringify({ tasks: [], habits: [], settings: { notesWelcome: true }, notes, updatedAt: 1 }));
  });
  await c.addInitScript(mock);
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage(); const errs = [];
  const check = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${label}: ${JSON.stringify(got)}${ok ? ' ok' : ` ESPERADO ${JSON.stringify(want)}`}`); if (!ok) errs.push(label); };
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.goto(url); await p.waitForFunction(() => document.documentElement.dataset.ready); await p.waitForTimeout(200);
  await p.evaluate(() => openNoteByLink('Balance General')); await p.waitForTimeout(200);
  await p.keyboard.press('Control+j'); await p.waitForTimeout(100);
  await p.click('#note-ai-suggest'); await p.waitForTimeout(300);
  const prompt = await p.evaluate(() => window.__prompts.at(-1));
  check('prompt', [prompt.startsWith('Revisa la nota «Balance General»'), /estado: borrador/.test(prompt), /<boveda>/.test(prompt), /"sugerencias"/.test(prompt)], [true, true, true, true]);
  const items = await p.$$eval('#note-ai-result .sg-item', (n) => n.map((x) => x.textContent));
  check('solo las válidas', items, [
    '➕ Sección · «Ejemplo» — Falta un caso práctico.',
    '🔗 Enlace · «activo» → [[Activo]] — Existe la nota.',
    '✏️ Redacción · «muestra la situacion» → «muestra la situación» — Tilde.',
    '🏷 Etiqueta · #contabilidad — Tema.',
    '📌 Estado · revisada — Está completa.',
    '📝 Nota nueva · [[Patrimonio]] — Se menciona sin nota.',
  ]);
  check('botón', await p.textContent('#note-ai-insert'), 'Aplicar las marcadas (6)');
  // Desmarcar el estado
  await p.click('#note-ai-result .sg-item:nth-child(5) input');
  check('botón tras desmarcar', await p.textContent('#note-ai-insert'), 'Aplicar las marcadas (5)');
  await p.click('#note-ai-insert'); await p.waitForTimeout(300);
  check('nota mejorada', await p.evaluate(() => noteById('bg').body), '---\ntags:\n  - finanzas\n  - contabilidad\nestado: borrador\n---\n# Balance General\nEl balance muestra la situación: [[activo]], pasivo y patrimonio.\n\n## Ejemplo\nUna empresa con caja de 100.\n\n## Notas relacionadas\n- [[Patrimonio]]\n\n## Fuentes\n- [[Activo]]\n');
  check('nota nueva creada', await p.evaluate(() => state.notes.find((n) => n.path === 'Contabilidad/Patrimonio')?.body), '# Patrimonio\n');
  check('aviso', await p.textContent('#toast'), '5 mejoras aplicadas y 1 nota nueva. Lo anterior queda en el historial de versiones.');
  check('historial', await p.evaluate(() => historyGet('bg').then((r) => r.versions.length > 0)), true);
  // Respuesta que no es JSON: aviso claro
  await p.evaluate(() => { window.claude = null; });
  await p.evaluate(() => { const s = async () => ({ text: 'No sé.' }); s.limits = async () => ({}); ai.sample = s; });
  await p.keyboard.press('Control+j'); await p.waitForTimeout(100);
  await p.click('#note-ai-suggest'); await p.waitForTimeout(300);
  check('sin sugerencias', [await p.textContent('#note-ai-error'), await p.isHidden('#note-ai-insert')], ['Claude no encontró mejoras que se puedan aplicar. Prueba «Otra vez».', true]);
  console.log('errors:', JSON.stringify(errs)); await b.close();
  process.exit(errs.length ? 1 : 0);
})();
