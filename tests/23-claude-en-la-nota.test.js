const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2], S = process.argv[3];
const mock = (opts) => {
  window.__prompts = [];
  const sample = async (input, o = {}) => {
    window.__prompts.push(typeof input === 'string' ? input : JSON.stringify(input));
    if (opts.deny) throw { code: 'not_granted' };
    const p = String(input);
    const text = p.startsWith('Resume') ? '- Lanzamiento el día 20\n- Falta el diseño' : p.startsWith('Lee este texto') ? '- [ ] Llamar a Ana 📅 2026-10-09 !alta\n- [ ] Enviar presupuesto' : p.startsWith('Mejora') ? 'El lanzamiento será el día 20.' : p.startsWith('Continúa') ? 'Después revisaremos los textos.' : p.startsWith('Traduce') ? 'Launch on the 20th.' : '| A | B |\n| --- | --- |\n| 1 | 2 |';
    if (o.onText) { o.onText({ text: text.slice(0, 5) }); o.onText({ text }); }
    return { text };
  };
  sample.limits = async () => ({ tools: false });
  window.claude = { use: async (k) => (k === 'sample' ? sample : null) };
};
(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const open = async (opts) => {
    const c = await b.newContext({ viewport: { width: 1280, height: 900 } });
    await c.addInitScript(() => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify({ tasks: [], habits: [], settings: { notesWelcome: true }, notes: [{ id: 'a', path: 'Reunión', body: '# Reunión\nel lanzamiento va a ser el dia 20 y falta el diseño. hay que llamar a Ana mañana y mandar el presupuesto.', createdAt: 1, updatedAt: 1 }], updatedAt: 1 })); });
    if (opts) await c.addInitScript(mock, opts);
    const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await p.goto(url); await p.waitForFunction(() => document.documentElement.dataset.ready); await p.waitForTimeout(200);
    await p.keyboard.press('Control+o'); await p.keyboard.type('Reunión'); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
    return p;
  };
  let p = await open({});
  console.log('button visible:', await p.isVisible('#note-ai-btn'));
  await p.click('#note-ai-btn');
  console.log('panel:', await p.isVisible('#note-ai'), await p.textContent('#note-ai-scope'));
  await p.click('[data-ai-action=summary]'); await p.waitForTimeout(200);
  console.log('result:', await p.textContent('#note-ai-result'), '| insert label:', await p.textContent('#note-ai-insert'));
  await p.screenshot({ path: S + '/noteai.png' });
  await p.click('#note-ai-insert'); await p.waitForTimeout(200);
  console.log('body after summary:', JSON.stringify(await p.evaluate(() => activeNote().body)));
  // tareas → aparecen en Tareas
  await p.keyboard.press('Control+j'); await p.click('[data-ai-action=tasks]'); await p.waitForTimeout(200); await p.click('#note-ai-insert'); await p.waitForTimeout(400);
  console.log('tasks from note:', await p.evaluate(() => noteTasks().map(t => `${t.title}|${t.due}|${t.priority}`)));
  // selección + mejorar + reemplazar
  await p.keyboard.press('Control+e'); await p.waitForTimeout(100);
  await p.evaluate(() => { const ta = document.getElementById('note-editor'); ta.focus(); const s = ta.value.indexOf('el lanzamiento'); ta.setSelectionRange(s, ta.value.indexOf('presupuesto.') + 12); });
  await p.keyboard.press('Control+j'); await p.waitForTimeout(100);
  console.log('scope:', await p.textContent('#note-ai-scope'));
  await p.click('[data-ai-action=improve]'); await p.waitForTimeout(200);
  console.log('buttons:', await p.isVisible('#note-ai-replace'), await p.textContent('#note-ai-insert'));
  await p.click('#note-ai-replace'); await p.waitForTimeout(200);
  console.log('body after improve:', JSON.stringify(await p.evaluate(() => activeNote().body.split('\n').slice(0, 3))));
  // /claude + continuar en el cursor
  await p.click('#note-editor'); await p.keyboard.press('Control+End'); await p.keyboard.type('\n/clau');
  console.log('slash:', await p.$$eval('#link-suggest .sg-label', n => n.map(x => x.textContent)));
  await p.keyboard.press('Enter'); await p.waitForTimeout(100);
  await p.click('[data-ai-action=continue]'); await p.waitForTimeout(200); await p.click('#note-ai-insert'); await p.waitForTimeout(200);
  console.log('ends with:', JSON.stringify(await p.evaluate(() => activeNote().body.slice(-40))));
  // petición libre
  await p.keyboard.press('Control+j'); await p.fill('#note-ai-input', 'haz una tabla con esto'); await p.press('#note-ai-input', 'Enter'); await p.waitForTimeout(200);
  console.log('custom prompt starts:', await p.evaluate(() => window.__prompts.at(-1).slice(0, 25)), '| table rendered:', await p.$$eval('#note-ai-result table', n => n.length));
  await p.keyboard.press('Escape'); console.log('closed:', !(await p.isVisible('#note-ai')));
  console.log('versions:', await p.evaluate(() => historyGet('a').then(r => r.versions.length)));
  // nota protegida: sin botón
  await p.evaluate(() => protectNote(activeNote(), 'clave1')); await p.waitForTimeout(800);
  console.log('locked note button:', await p.isVisible('#note-ai-btn'), '| slash item hidden:', await p.evaluate(() => !SLASH_ITEMS[0].when()));
  // sin Claude
  p = await open(null);
  console.log('outside Claude button:', await p.isVisible('#note-ai-btn'));
  // permiso denegado
  p = await open({ deny: true });
  await p.click('#note-ai-btn'); await p.click('[data-ai-action=summary]'); await p.waitForTimeout(200);
  console.log('denied:', await p.textContent('#note-ai-error'), '| button now:', await p.isVisible('#note-ai-btn'));
  console.log('errors:', errs); await b.close();
})();
