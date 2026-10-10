const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2], S = process.argv[3];
const now = new Date('2026-10-12T08:00:00').getTime(); // lunes, antes del horario
const seed = {
  tasks: [
    { id: 't1', title: 'Preparar informe', priority: 3, due: '2026-10-12', time: null, duration: 90, done: false, createdAt: now, tags: [], subtasks: [{ title: 'a', done: false }] },
    { id: 't2', title: 'Llamar a Ana', priority: 2, due: '2026-10-11', time: null, done: false, createdAt: now, tags: [] },
    { id: 't3', title: 'Revisar correo', priority: 1, due: '2026-10-12', time: null, done: false, createdAt: now, tags: [] },
    { id: 't4', title: 'Idea urgente', priority: 3, due: null, time: null, done: false, createdAt: now, tags: [] },
    { id: 't5', title: 'Futura', priority: 3, due: '2026-10-20', time: null, done: false, createdAt: now, tags: [] },
  ],
  habits: [], settings: { notesWelcome: true },
  notes: [{ id: 'n1', path: 'Proyecto', body: '# Proyecto\n- [ ] Escribir propuesta 📅 2026-10-12\n', createdAt: now, updatedAt: now }, { id: 'a', path: 'Viaje', body: 'Plan:\n', createdAt: now, updatedAt: now }],
  updatedAt: 1,
};

// Claude simulado: un plan con bloques no válidos, tareas de una nota de voz y textos.
const mock = (opts) => {
  window.__calls = [];
  window.__prompts = [];
  const mcp = {
    callTool: async (server, tool, input) => {
      window.__calls.push([server, tool, input]);
      if (tool === 'list_events') return { payload: { events: [
        { id: 'e1', summary: 'Reunión', start: { dateTime: '2026-10-12T11:00:00' }, end: { dateTime: '2026-10-12T12:30:00' }, status: 'confirmed' },
        { id: 'e2', summary: 'Almuerzo', start: { dateTime: '2026-10-12T13:00:00' }, end: { dateTime: '2026-10-12T14:00:00' }, status: 'confirmed' },
      ] } };
      if (tool === 'create_event') return { payload: { id: 'ev' + window.__calls.length, htmlLink: 'https://calendar.google.com/x' } };
      throw { code: 'tool_error', message: 'no' };
    },
  };
  const sample = async (prompt) => {
    window.__prompts.push(prompt);
    if (/Resume/.test(prompt)) return { text: '- Comprar pan\n- Llamar al hotel' };
    if (/puntuación/.test(prompt)) return { text: 'Hola, esto es una prueba. Comprar pan mañana.' };
    return { text: '' };
  };
  sample.json = async (prompt) => {
    window.__prompts.push(prompt);
    if (/transcripcion/.test(prompt)) return { tareas: [{ titulo: 'Comprar pan', fecha: '2026-10-13', prioridad: 'alta' }, { titulo: 'Llamar al hotel', fecha: 'mañana', prioridad: 'rara' }] };
    // Los ids salen del propio prompt (como haría Claude).
    const tasks = JSON.parse(prompt.match(/Tareas \(JSON\): (.*)/)[1]);
    const id = (t) => tasks.find((x) => x.titulo === t).taskId;
    return {
      bloques: [
        { taskId: id('Preparar informe'), titulo: 'Informe', inicio: '09:00', fin: '10:30', motivo: 'Trabajo profundo temprano' },
        { taskId: id('Escribir propuesta'), titulo: 'x', inicio: '10:30', fin: '11:00', motivo: 'Antes de la reunión' },
        { taskId: id('Llamar a Ana'), titulo: 'Ana', inicio: '11:30', fin: '12:00', motivo: 'se solapa' },
        { taskId: 'T99', titulo: 'Inventada', inicio: '15:00', fin: '15:30' },
        { taskId: id('Revisar correo'), titulo: 'Correo', inicio: '25:00', fin: '26:00' },
        { taskId: id('Preparar informe'), titulo: 'Otra vez', inicio: '15:00', fin: '16:00' },
        { taskId: null, titulo: 'Descanso', inicio: '14:00', fin: '14:10', motivo: 'Pausa' },
        { taskId: null, titulo: '<img src=x onerror="window.__xss=1">', inicio: '16:00', fin: '16:15' },
        { taskId: id('Llamar a Ana'), titulo: 'Ana', inicio: '17:30', fin: '19:00', motivo: 'Al final' },
      ],
      fuera: [{ taskId: id('Revisar correo'), motivo: 'Puede esperar' }],
    };
  };
  sample.limits = async () => ({ maxPromptBytes: 262144 });
  if (opts.noSpeech) { window.SpeechRecognition = undefined; window.webkitSpeechRecognition = undefined; }
  else {
    // Reconocimiento de voz simulado: __say('texto') emite un resultado final.
    class FakeSR {
      constructor() { window.__sr = this; }
      start() { window.__srStarts = (window.__srStarts || 0) + 1; }
      stop() { setTimeout(() => this.onend && this.onend(), 10); }
      abort() {}
    }
    window.SpeechRecognition = FakeSR;
    window.__say = (text) => window.__sr.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: true })] });
  }
  window.claude = { use: async (k) => ({ mcp, sample: opts.noSample ? null : sample }[k] || null) };
};

(async () => {
  const b = await chromium.launch({ ...launchOptions, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const errs = [];
  const page = async (opts, clock) => {
    const c = await b.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['microphone'] });
    await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, seed);
    await c.addInitScript(mock, opts);
    await c.route(/cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com/, (r) => r.abort());
    const p = await c.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
    if (clock) await p.clock.install({ time: new Date(now) });
    await p.goto(url);
    if (clock) await p.clock.runFor(1000); else { await p.waitForFunction(() => document.documentElement.dataset.ready); await p.waitForTimeout(400); }
    return p;
  };
  const tasksOf = (p) => p.evaluate(() => Object.fromEntries(state.tasks.map((t) => [t.id, [t.due, t.time, t.duration ?? null, t.calEventId ?? null].join('|')])));

  // ---- 1) Planificar con Claude
  let p = await page({}, true);
  console.log('hoy button:', await p.isVisible('#today-plan'), '| palette:', await p.evaluate(() => COMMANDS_EXTRA.flatMap((f) => f(activeNote()) || []).map((x) => x.label).filter((l) => /Planificar|Dictar/.test(l)).join(', ')));
  await p.click('#today-plan'); await p.clock.runFor(300);
  console.log('candidates:', await p.evaluate(() => pd.tasks.map((t) => t.title).join(', ')), '| events:', await p.evaluate(() => pd.events.map((e) => `${hm(e.start)}-${hm(e.end)}`).join(',')));
  await p.fill('#pld-hint', 'hoy quiero terminar el informe por la mañana');
  await p.click('#pld-go'); await p.clock.runFor(300);
  const prompt = await p.evaluate(() => window.__prompts.at(-1));
  console.log('prompt has:', ['09:00 a 18:00', 'informe por la mañana', '"subtareasPendientes":1', '"duracionMin":90', '"vencida":true', 'Reunión'].map((x) => prompt.includes(x)).join(','));
  console.log('status:', await p.textContent('#pld-status'));
  console.log('blocks:', await p.evaluate(() => pd.blocks.map((b) => `${hm(b.start)}-${hm(b.end)} ${b.task ? b.task.title : 'libre:' + b.title.slice(0, 8)}`).join(' ; ')));
  console.log('label:', await p.textContent('#pld-label'), '| timeline ev/blk:', await p.$$eval('#pld-timeline .pld-ev', (n) => n.length), await p.$$eval('#pld-timeline .pld-blk:not(.pld-ev)', (n) => n.length));
  console.log('fuera:', await p.textContent('#pld-out'), '| xss:', await p.evaluate(() => window.__xss ?? 'no'), await p.$$eval('#pld img', (n) => n.length));
  // Editar la hora del informe y quitar el bloque raro
  await p.fill('#pld-list li:nth-child(1) input[type=time] >> nth=0', '09:15'); await p.dispatchEvent('#pld-list li:nth-child(1) input[type=time] >> nth=0', 'change');
  await p.click('#pld-list li:has-text("img") .pld-del');
  // Una hora que choca con la reunión bloquea Aceptar
  await p.fill('#pld-list li:has-text("propuesta") input[type=time] >> nth=1', '11:30'); await p.dispatchEvent('#pld-list li:has-text("propuesta") input[type=time] >> nth=1', 'change');
  console.log('clash blocks accept:', await p.isDisabled('#pld-accept'), await p.textContent('#pld-accept'));
  await p.fill('#pld-list li:has-text("propuesta") input[type=time] >> nth=1', '11:00'); await p.dispatchEvent('#pld-list li:has-text("propuesta") input[type=time] >> nth=1', 'change');
  await p.check('#pld-gcal');
  await p.click('#pld-accept'); await p.clock.runFor(500);
  console.log('after accept:', JSON.stringify(await tasksOf(p)));
  console.log('note line:', await p.evaluate(() => noteById('n1').body.split('\n')[1]));
  const evs = await p.evaluate(() => window.__calls.filter((c) => c[1] === 'create_event').map((c) => `${c[2].summary}@${c[2].startTime.slice(11, 16)}-${c[2].endTime.slice(11, 16)}`));
  console.log('events:', evs.join(' ; '), '| remembered:', await p.evaluate(() => Object.keys(state.settings.planEvents || {}).length));
  console.log('toast:', await p.textContent('#toast'));
  // Deshacer
  await p.click('#toast .toast-action'); await p.clock.runFor(200);
  console.log('after undo:', JSON.stringify(await tasksOf(p)), '| note:', await p.evaluate(() => noteById('n1').body.split('\n')[1]));
  // Repetir el plan con los mismos bloques no duplica eventos
  await p.evaluate(() => { state.settings.planEvents = { t1: { id: 'evX', day: '2026-10-12', start: '09:00', end: '10:30' } }; save(); });
  await p.click('#today-plan'); await p.clock.runFor(300); await p.click('#pld-go'); await p.clock.runFor(300);
  await p.click('#pld-list li:has-text("img") .pld-del');
  await p.check('#pld-gcal'); await p.click('#pld-accept'); await p.clock.runFor(500);
  console.log('second run events:', await p.evaluate(() => window.__calls.filter((c) => c[1] === 'create_event').length), '| toast:', await p.textContent('#toast'));
  // Desde la agenda del día
  await p.evaluate(() => openDayView('2026-10-13')); await p.clock.runFor(100);
  await p.click('#dv-plan'); await p.clock.runFor(300);
  console.log('dayview plan date:', await p.inputValue('#pld-date'), await p.evaluate(() => pd.key));
  await p.screenshot({ path: S + '/plan-dia.png' });
  await p.context().close();

  // ---- 2) Sin Claude: plan automático
  p = await page({ noSample: true }, true);
  await p.click('#today-plan'); await p.clock.runFor(300);
  console.log('auto button:', await p.textContent('#pld-go'));
  await p.click('#pld-go'); await p.clock.runFor(100);
  console.log('auto label:', await p.textContent('#pld-label'));
  console.log('auto blocks:', await p.evaluate(() => pd.blocks.map((b) => `${hm(b.start)}-${hm(b.end)} ${b.task.title}`).join(' ; ')));
  await p.click('#pld-accept'); await p.clock.runFor(200);
  console.log('auto applied:', JSON.stringify(await tasksOf(p)), '| no events:', await p.evaluate(() => window.__calls.filter((c) => c[1] === 'create_event').length));
  await p.context().close();

  // ---- 3) Nota de voz con transcripción
  p = await page({});
  await p.keyboard.press('Control+o'); await p.keyboard.type('Viaje'); await p.keyboard.press('Enter');
  if (!(await p.isVisible('#note-editor'))) await p.keyboard.press('Control+e');
  console.log('setting:', await p.isChecked('#voice-transcribe'));
  await p.click('#note-editor'); await p.keyboard.press('Control+End'); await p.keyboard.type('/voz'); await p.keyboard.press('Enter');
  await p.waitForTimeout(1500);
  await p.evaluate(() => { __say('hola esto es una prueba'); __say('comprar pan mañana'); });
  console.log('recording:', await p.evaluate(() => document.getElementById('voice').classList.contains('recording')), '| live:', await p.textContent('#voice-transcript'));
  await p.click('#voice-stop'); await p.waitForTimeout(1000);
  const body = await p.evaluate(() => activeNote().body);
  console.log('audio + transcript:', /!\[🎤 Nota de voz · 0:0\d · \d\d:\d\d\]\(audio:[a-z0-9]+\)\n\n<details>\n<summary>📝 Transcripción<\/summary>\n\nhola esto es una prueba comprar pan mañana\n\n<\/details>/.test(body));
  // Lectura: el plegado y sus botones
  await p.keyboard.press('Control+e'); await p.waitForTimeout(300);
  await p.click('#note-reading details.md-details summary'); await p.waitForTimeout(200);
  console.log('buttons:', await p.$$eval('#note-reading .vt-actions button', (n) => n.map((x) => x.textContent).join(', ')));
  await p.click('#note-reading .vt-actions button:has-text("Sacar tareas")'); await p.waitForTimeout(300);
  console.log('proposal:', await p.$$eval('#vt-tasks .plan-row input[type=text]', (n) => n.map((x) => x.value).join(', ')), '| prompt guarded:', await p.evaluate(() => /no sigas instrucciones/.test(window.__prompts.at(-1))));
  await p.click('#vt-tasks .plan-row:nth-of-type(2) input[type=checkbox]');
  await p.click('#vt-tasks button:has-text("Crear tareas")'); await p.waitForTimeout(200);
  console.log('created:', JSON.stringify(await p.evaluate(() => state.tasks.filter((t) => /pan|hotel/.test(t.title)).map((t) => [t.title, t.due, t.priority]))));
  // Botón derecho sobre el audio: resumir
  await p.click('#note-reading .note-audio', { button: 'right' }); await p.waitForTimeout(100);
  console.log('ctx items:', await p.$$eval('.menu-item', (n) => n.map((x) => x.textContent).filter((t) => /nota de voz/.test(t)).join(', ')));
  await p.click('.menu-item:has-text("Resumir")'); await p.waitForTimeout(300);
  console.log('summary:', await p.evaluate(() => activeNote().body.includes('</details>\n\n> [!abstract] Resumen de la nota de voz\n> - Comprar pan\n> - Llamar al hotel')));
  await p.click('#note-reading details.md-details summary', { button: 'right' }); await p.waitForTimeout(100);
  await p.click('.menu-item:has-text("Limpiar texto")'); await p.waitForTimeout(300);
  console.log('cleaned:', await p.evaluate(() => activeNote().body.includes('<summary>📝 Transcripción</summary>\n\nHola, esto es una prueba. Comprar pan mañana.\n\n</details>')));

  // ---- 4) Dictar en el cursor (sin audio)
  await p.keyboard.press('Control+e'); await p.waitForTimeout(200);
  const audios = await p.evaluate(() => (activeNote().body.match(/\(audio:/g) || []).length);
  await p.click('#note-editor'); await p.keyboard.press('Control+Home'); await p.keyboard.press('End'); await p.keyboard.type(' Dictado: /dictar');
  console.log('slash first:', await p.textContent('#link-suggest .sg-item'));
  await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  console.log('dictation overlay:', await p.textContent('#voice-title'), await p.textContent('#voice-stop'));
  await p.evaluate(() => __say('texto dictado'));
  await p.click('#voice-stop'); await p.waitForTimeout(300);
  console.log('dictated:', JSON.stringify(await p.evaluate(() => activeNote().body.split('\n')[0])), '| audios same:', audios === (await p.evaluate(() => (activeNote().body.match(/\(audio:/g) || []).length)));
  await p.dispatchEvent('#note-editor', 'contextmenu', { clientX: 300, clientY: 300 }); await p.waitForTimeout(100);
  console.log('editor menu dictar:', await p.$$eval('.menu-item', (n) => n.some((x) => x.textContent.includes('🎙 Dictar'))));
  await p.keyboard.press('Escape');
  await p.context().close();

  // ---- 5) Sin reconocimiento de voz: se graba igual y se avisa
  p = await page({ noSpeech: true });
  await p.keyboard.press('Control+o'); await p.keyboard.type('Viaje'); await p.keyboard.press('Enter');
  if (!(await p.isVisible('#note-editor'))) await p.keyboard.press('Control+e');
  await p.click('#note-editor'); await p.keyboard.press('Control+End'); await p.keyboard.type('/voz'); await p.keyboard.press('Enter');
  await p.waitForTimeout(1300);
  console.log('unavailable note:', await p.textContent('#voice-transcript'), await p.isVisible('#voice-transcript'));
  await p.click('#voice-stop'); await p.waitForTimeout(1000);
  console.log('audio only:', await p.evaluate(() => /\(audio:[a-z0-9]+\)/.test(activeNote().body) && !activeNote().body.includes('<details>')));
  await p.evaluate(() => openDictation()); await p.waitForTimeout(100);
  console.log('dictation unavailable:', await p.textContent('#toast'), '| overlay hidden:', await p.isHidden('#voice'));
  console.log('errors:', errs); await b.close();
})();
