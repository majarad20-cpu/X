const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const mock = () => {
  window.__prompts = [];
  const sample = async (input, o = {}) => {
    const p = String(input);
    window.__prompts.push(p);
    const text = p.startsWith('Escribe el contenido')
      ? '## Definición\nEl balance muestra el [[Activo]] y el [[Pasivo inventado|pasivo]].\n\n## Fuentes\n- [[MOC Contabilidad]]\n- [[Nota que no existe]]'
      : '## Hecho\nTexto libre.';
    if (o.onText) o.onText({ text });
    return { text };
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
      { id: 'moc', path: 'Contabilidad/MOC Contabilidad', body: '# MOC Contabilidad\n## Estados financieros\n- [[Balance General]]: foto de la empresa a una fecha.\n- [[Activo]]', createdAt: 1, updatedAt: 3 },
      { id: 'bg', path: 'Contabilidad/Balance General', body: '# Balance General', createdAt: 1, updatedAt: 1 },
      { id: 'ac', path: 'Contabilidad/Activo', body: '---\nestado: revisada\n---\nRecursos controlados por la empresa. Aparecen en el Balance General.', createdAt: 1, updatedAt: 2 },
      { id: 'sec', path: 'Contabilidad/Secreta', body: 'x', enc: { v: 1 }, createdAt: 1, updatedAt: 4 },
      { id: 'otra', path: 'Recetas/Pan', body: 'Harina y agua.', createdAt: 1, updatedAt: 1 },
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
  check('nota vacía', await p.evaluate(() => [document.getElementById('note-ai').classList.contains('na-empty'), document.getElementById('note-ai-scope').textContent, document.getElementById('note-ai-write').textContent, document.getElementById('note-ai-vault').checked]), [true, 'La nota está vacía: Claude puede escribirla a partir de su título', '✍️ Escribir esta nota', true]);
  await p.selectOption('#note-ai-kind', 'concepto');
  await p.click('#note-ai-write'); await p.waitForTimeout(200);
  const prompt = await p.evaluate(() => window.__prompts.at(-1));
  check('prompt: título, tipo y bóveda', [/«Balance General»/.test(prompt), /carpeta «Contabilidad»/.test(prompt), /nota de concepto/.test(prompt), /<boveda>/.test(prompt), /titulo="MOC Contabilidad" relacion="enlaza a esta nota"/.test(prompt), /titulo="Activo"/.test(prompt), /\[\[Activo\]\]/.test(prompt.split('<nota')[0])], [true, true, true, true, true, true, true]);
  check('sin notas protegidas ni de otras carpetas', [/Secreta/.test(prompt), /Harina/.test(prompt), /estado: revisada/.test(prompt)], [false, false, false]);
  check('enlaces inventados fuera', await p.evaluate(() => noteAI.result), '## Definición\nEl balance muestra el [[Activo]] y el pasivo.\n\n## Fuentes\n- [[MOC Contabilidad]]');
  check('contexto visible', await p.textContent('#note-ai-ctx'), 'Contexto: 2 notas de tu bóveda');
  check('botón', await p.textContent('#note-ai-insert'), 'Escribir en la nota');
  await p.click('#note-ai-insert'); await p.waitForTimeout(300);
  check('nota escrita como borrador', await p.evaluate(() => noteById('bg').body), '---\nestado: borrador\n---\n# Balance General\n\n## Definición\nEl balance muestra el [[Activo]] y el pasivo.\n\n## Fuentes\n- [[MOC Contabilidad]]\n');
  // Petición libre en una nota vacía: Claude sabe el título y que está vacía
  await p.evaluate(() => { noteById('bg').body = '# Balance General'; save(); renderAll(); });
  await p.keyboard.press('Control+j'); await p.waitForTimeout(100);
  await p.fill('#note-ai-input', 'hazla de cero'); await p.press('#note-ai-input', 'Enter'); await p.waitForTimeout(200);
  const custom = await p.evaluate(() => window.__prompts.at(-1));
  check('petición libre', [custom.startsWith('hazla de cero'), /nota «Balance General»/.test(custom), /La nota está vacía/.test(custom), /<boveda>/.test(custom)], [true, true, true, true]);
  // Sin la bóveda
  await p.uncheck('#note-ai-vault');
  await p.click('#note-ai-write'); await p.waitForTimeout(200);
  check('sin bóveda', [/<boveda>/.test(await p.evaluate(() => window.__prompts.at(-1))), await p.evaluate(() => state.settings.noteAIVault), await p.isHidden('#note-ai-ctx')], [false, false, true]);
  // Nota con texto: «Completar la nota» y los botones de siempre funcionan
  await p.keyboard.press('Escape');
  await p.evaluate(() => openNoteByLink('Activo')); await p.waitForTimeout(200);
  await p.keyboard.press('Control+j'); await p.waitForTimeout(100);
  check('nota con texto', await p.evaluate(() => [document.getElementById('note-ai').classList.contains('na-empty'), document.getElementById('note-ai-write').textContent]), [false, '✍️ Completar la nota']);
  // Menú de la nota vacía
  await p.keyboard.press('Escape');
  await p.evaluate(() => openNoteByLink('Balance General')); await p.waitForTimeout(200);
  check('menú', await p.evaluate(() => NOTE_MENU_EXTRA.map((f) => f(activeNote())?.label).filter(Boolean).filter((l) => /Claude/.test(l))), ['✨ Claude en esta nota… (Ctrl+J)', '✍️ Escribir esta nota con Claude']);
  console.log('errors:', JSON.stringify(errs)); await b.close();
  process.exit(errs.length ? 1 : 0);
})();
