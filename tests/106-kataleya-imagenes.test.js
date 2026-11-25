const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const out = process.argv[3];
const N = (id, path, body) => ({ id, path, body, createdAt: 1, updatedAt: 1 });
const notes = [
  N('e', 'ESTOICISMO', '![Dibujo](img:dib1)\n'),
  N('t', 'Notas largas', `# Notas\n${'Texto de la nota sobre IVA y PPM. '.repeat(10)}\n![Gráfico](img:dib1)\n`),
];
const mock = () => {
  window.__calls = [];
  window.__mode = 'ok';
  const sample = async (input, o = {}) => {
    const last = input[input.length - 1].content;
    window.__calls.push({ images: o.images ? o.images.map((b) => b.type) : null, last, tools: !!o.tools });
    if (window.__mode === 'reject' && o.images) throw { code: 'image_rejected', message: 'x' };
    const text = o.images ? `Veo ${o.images.length} imagen(es).` : 'Sin imágenes.';
    o.onText?.({ text });
    return { text, truncated: false };
  };
  sample.limits = async () => (window.__noImages ? { maxPromptBytes: 262144, tools: { maxCount: 16 } } : { maxPromptBytes: 262144, tools: { maxCount: 16 }, images: { maxCount: 4, maxInputBytes: 20e6, mediaTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] } });
  sample.json = async () => ({});
  window.claude = { use: async (k) => (k === 'sample' ? sample : null) };
};
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
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
  await p.evaluate(async (png) => { await putFile({ id: 'dib1', data: png, name: 'Dibujo', drawing: true }); }, PNG);
  const ask = async (q) => { await p.evaluate((q) => kataSend(q), q); await p.waitForTimeout(400); return p.evaluate(() => window.__calls.at(-1)); };

  // 1) Nota que es solo un dibujo: Kataleya lo ve aunque la pregunta no diga «dibujo».
  await p.evaluate(() => { openNote(noteById('e')); kataToggle(); }); await p.waitForTimeout(300);
  let call = await ask('¿De qué trata?');
  check('nota solo con dibujo', [call.images, /dibujo «Dibujo» de la nota \[\[ESTOICISMO\]\]/.test(call.last)], [['image/png'], true]);
  check('chip 🖼 en el mensaje', await p.evaluate(() => [...document.querySelectorAll('.kata-imgs-note')].map((x) => x.textContent)), ['🖼 1 imagen']);
  if (out) await p.screenshot({ path: `${out}/106-kataleya-imagen.png` });

  // 2) Nota con mucho texto: solo si la pregunta habla de la imagen.
  await p.evaluate(() => openNote(noteById('t'))); await p.waitForTimeout(200);
  call = await ask('Resume la nota en tres líneas');
  check('nota larga sin pedir imagen', call.images, null);
  call = await ask('¿Qué muestra el gráfico?');
  check('nota larga pidiendo el gráfico', call.images, ['image/png']);

  // 3) Imagen adjunta con 📎 (o pegada): va con el mensaje y luego se limpia.
  await p.evaluate(async (png) => { const blob = await (await fetch(png)).blob(); kataAddAttach([new File([blob], 'balance.png', { type: 'image/png' })]); }, PNG);
  check('miniatura', await p.evaluate(() => document.querySelectorAll('.kata-attach .kata-thumb').length), 1);
  call = await ask('Revisa este balance');
  check('adjunta', [call.images, /«balance» \(adjunta por la persona\)/.test(call.last)], [['image/png'], true]);
  check('adjuntas limpias', await p.evaluate(() => [kata.attach.length, document.querySelectorAll('.kata-attach .kata-thumb').length]), [0, 0]);

  // 4) Claude rechaza la imagen: responde igual sin ella y avisa.
  await p.evaluate(() => { window.__mode = 'reject'; openNote(noteById('e')); }); await p.waitForTimeout(200);
  call = await ask('¿Qué ves?');
  check('rechazada: reintento sin imagen', [call.images, await p.evaluate(() => kata.turns.at(-1).note)], [null, 'No pude abrir la imagen (formato o tamaño no aceptado): respondí sin verla.']);

  // 5) Vista sin imágenes: no se envían y se avisa si había adjuntas.
  await p.evaluate(async (png) => { window.__mode = 'ok'; window.__noImages = true; const blob = await (await fetch(png)).blob(); kataAddAttach([new File([blob], 'x.png', { type: 'image/png' })]); }, PNG);
  call = await ask('¿Qué ves?');
  check('sin permiso de imágenes', [call.images, await p.evaluate(() => kata.turns.at(-1).note)], [null, 'No puedo ver imágenes en esta vista de Claude: descríbemela con palabras.']);

  console.log('errors:', JSON.stringify(errs));
  await b.close();
})();
