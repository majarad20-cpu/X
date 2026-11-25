const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const out = process.argv[3];
const N = (id, path, body) => ({ id, path, body, createdAt: 1, updatedAt: 1 });
const notes = [N('r', 'MATRIZ/Fórmulas Rápidas', '# Fórmulas Rápidas\nTope IAS: 90 UF y 11 años.\n')];
const mock = () => {
  window.__calls = [];
  window.__script = null;
  const sample = async (input, o = {}) => {
    window.__calls.push({ first: typeof input === 'string' ? input : input[0].content });
    let text = 'Respuesta.';
    if (window.__script) { const T = (n) => o.tools.find((t) => t.name === n); window.__toolOut = await window.__script(T); }
    o.onText?.({ text });
    return { text, truncated: false };
  };
  sample.limits = async () => ({ maxPromptBytes: 262144, tools: { maxCount: 16 } });
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
  const approveLast = async () => { await p.evaluate(async () => { await kataApprove([...kata.pending.keys()].at(-1)); }); await p.waitForTimeout(200); };

  check('sin habilidades al inicio', await p.evaluate(() => khList().length), 0);
  check('instalar', await p.evaluate(() => [khInstall(), khList().map((s) => s.title).sort(), !!khGlossaryNote()]), [8, ['Auditar una nota', 'Cierre de mes del cliente', 'Ingesta rápida', 'Preparar un finiquito', 'Reflexión estoica', 'Responder consulta de cliente', 'Revisar un F29'], true]);
  check('no duplica', await p.evaluate(() => khInstall()), 0);
  check('elige la habilidad', await p.evaluate(() => [khMatch('Revisa el F29 de octubre').map((s) => s.title), khMatch('¿Cómo preparo el finiquito por despido?').map((s) => s.title), khMatch('Usa la habilidad Auditar una nota').map((s) => s.title)[0], khMatch('hola').length]), [['Revisar un F29'], ['Preparar un finiquito'], 'Auditar una nota', 0]);

  // Referencia desde la paleta.
  await p.evaluate(() => { const n = noteById('r'); setProp(n, 'kataleya', 'referencia'); dataRev++; });
  await p.evaluate(() => kataToggle()); await p.waitForTimeout(200);
  await p.evaluate(() => kataSend('¿Cómo preparo el finiquito por despido?')); await p.waitForTimeout(500);
  const first = await p.evaluate(() => window.__calls.at(-1).first);
  check('instrucciones', [/HABILIDAD A SEGUIR: «Preparar un finiquito»/.test(first), /Glosario de la persona/.test(first), /RAI: Rentas Afectas a Impuesto/.test(first), /Notas de referencia[\s\S]*\[\[Fórmulas Rápidas\]\][\s\S]*Tope IAS/.test(first), /proponer › leccion/.test(first)], [true, true, true, true, true]);
  check('🎓 Usé', await p.evaluate(() => [kata.turns.at(-1).skills, document.querySelector('#kata-panel .kh-used')?.textContent]), [['Preparar un finiquito'], '🎓 Preparar un finiquito']);
  check('botón 🎓', await p.evaluate(() => !!document.querySelector('#kata-panel .kh-btn')), true);
  if (out) await p.screenshot({ path: `${out}/108-habilidades.png` });

  // Nueva habilidad y lecciones.
  await p.evaluate(() => { window.__script = (T) => T('proponer').execute({ accion: 'habilidad', titulo: 'Revisar contrato de arriendo', cuando: ['arriendo', 'contrato de arriendo'], contenido: '## Para qué\nRevisar un arriendo.\n\n## Pasos\n1. Leer.\n\n## Errores a evitar\n- ' }); });
  await p.evaluate(() => kataSend('Crea una habilidad para revisar contratos de arriendo')); await p.waitForTimeout(400); await approveLast();
  check('habilidad nueva', await p.evaluate(() => { const n = findNoteByName('Sistema/Habilidades de Kataleya/Revisar contrato de arriendo'); return [!!n, propOf(n, 'tipo'), khMatch('revisa este contrato de arriendo').map((s) => s.title)]; }), [true, 'habilidad', ['Revisar contrato de arriendo']]);
  await p.evaluate(() => { window.__script = (T) => T('proponer').execute({ accion: 'leccion', texto: 'Revisar siempre si el arriendo está en UF.', habilidad: 'Revisar contrato de arriendo' }); });
  await p.evaluate(() => kataSend('No, te faltó revisar la UF')); await p.waitForTimeout(400); await approveLast();
  check('lección en la habilidad', await p.evaluate(() => /## Errores a evitar\n- \d{4}-\d{2}-\d{2}: Revisar siempre si el arriendo está en UF\.\n$/.test(findNoteByName('Sistema/Habilidades de Kataleya/Revisar contrato de arriendo').body)), true);
  await p.evaluate(() => { window.__script = (T) => T('proponer').execute({ accion: 'leccion', texto: 'La persona prefiere tablas en vez de listas largas.' }); });
  await p.evaluate(() => kataSend('Prefiero tablas')); await p.waitForTimeout(400); await approveLast();
  check('lección en la memoria', await p.evaluate(() => /## Errores a evitar\n- \d{4}-\d{2}-\d{2}: La persona prefiere tablas/.test(kataMemoryNote().body)), true);
  check('herramientas', await p.evaluate(() => { const t = kataTools(16); const pr = t.find((x) => x.name === 'proponer'); return [t.length, pr.inputSchema.properties.accion.enum.slice(-2), pr.description.length <= 1024, JSON.stringify(pr.inputSchema).length <= 4096]; }), [14, ['habilidad', 'leccion'], true, true]);

  console.log('errors:', JSON.stringify(errs));
  await b.close();
})();
