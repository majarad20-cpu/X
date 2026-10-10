// Revisión de vistas, finanzas y pegamento de la interfaz: Claude y el editor, Alt+flechas,
// CSV (fórmulas, columnas), números en tablas, plantillas con «$», apariencia con teclado,
// «Ocultar importes», palabras clave de consultas, portadas, totales con límite, pegar en el dibujo
// y mover tarjetas con listas.
const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const now = new Date('2026-10-10T10:00:00').getTime();
const N = (id, path, body) => ({ id, path, body, createdAt: now, updatedAt: now });
const seed = {
  tasks: [], habits: [], settings: { notesWelcome: true }, folders: ['Agenda', 'T', 'Libros'], updatedAt: 1,
  notes: [
    N('v1', 'Voz', 'Antes\n\n> [!quote] Transcripción\n> hola mundo que tal\n\nDespués'),
    N('v2', 'Otra', 'Texto de otra nota'),
    N('a1', 'Agenda/Cita', '---\nfecha: 2026-10-05\n---\n'),
    N('t1', 'T/Uno', '---\nprecio: 1.200\n---\n'),
    N('t2', 'T/Dos', '---\nprecio: 1.234,50\n---\n'),
    N('t3', 'T/Tres', '---\nprecio: 12 €\n---\n'),
    N('l1', 'Libros/Dune', '---\nestado: [leído, favorito]\n---\nTexto'),
    N('img', 'Fotos', 'Mira ![Atardecer](img:abc123)\n'),
    N('q', 'Consultas', ''),
  ],
};

(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const check = (label, got, want) => {
    const ok = JSON.stringify(got).replace(/ | /g, ' ') === JSON.stringify(want);
    console.log(`${label}:`, JSON.stringify(got), ok ? 'ok' : `ESPERADO ${JSON.stringify(want)}`);
    if (!ok) errs.push(`${label}: ${JSON.stringify(got)}`);
  };
  const c = await b.newContext({ viewport: { width: 1300, height: 900 }, locale: 'es-ES' });
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, seed);
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.clock.install({ time: new Date(now) });
  await p.goto(url); await p.clock.runFor(800);
  const ev = (f, a) => p.evaluate(f, a);
  const show = async (block) => {
    await ev((bl) => { const n = noteById('q'); n.body = bl; noteMode.set('q', 'read'); openNote(n); renderAll(); }, block);
    await p.clock.runFor(100);
  };

  // ---- 1. Claude sobre una transcripción: no pisa otra nota abierta en el editor ----
  await ev(() => { openNote(noteById('v1')); setNoteMode(noteById('v1'), 'edit'); });
  await p.clock.runFor(100);
  await ev(() => {
    ai.sample = async () => { openNote(noteById('v2')); setNoteMode(noteById('v2'), 'edit'); return { text: 'Hola, mundo. ¿Qué tal?' }; };
    const n = noteById('v1');
    window.__run = vtRun('clean', n, vtBlocks(n.body)[0]);
  });
  await p.clock.runFor(300); await ev(() => window.__run);
  check('voz: editor sigue con la otra', await ev(() => { const ta = $('#note-editor'); return [ta.dataset.note, ta.value]; }), ['v2', 'Texto de otra nota']);
  check('voz: la nota cambió', await ev(() => noteById('v1').body.includes('Hola, mundo. ¿Qué tal?')), true);
  check('voz: otra intacta', await ev(() => noteById('v2').body), 'Texto de otra nota');
  // Sin cambiar de nota, el editor sí se actualiza.
  await ev(() => { openNote(noteById('v1')); setNoteMode(noteById('v1'), 'edit'); });
  await p.clock.runFor(100);
  await ev(() => { ai.sample = async () => ({ text: 'Resumen corto' }); const n = noteById('v1'); window.__run = vtRun('sum', n, vtBlocks(n.body)[0]); });
  await p.clock.runFor(300); await ev(() => window.__run);
  check('voz: editor al día', await ev(() => $('#note-editor').value === noteById('v1').body && $('#note-editor').value.includes('Resumen corto')), true);
  // syncOpenEditor (34) no toca el editor si muestra otra nota.
  await ev(() => { openNote(noteById('v2')); setNoteMode(noteById('v2'), 'edit'); });
  await p.clock.runFor(100);
  check('ocr: otra nota', await ev(() => { noteMode.set('v1', 'edit'); syncOpenEditor(noteById('v1')); return $('#note-editor').value; }), 'Texto de otra nota');
  await ev(() => { ai.sample = null; noteMode.set('v1', 'read'); noteMode.set('v2', 'read'); });

  // ---- 2. Alt+flecha en el calendario mueve la nota y no navega ----
  await ev(() => openNote(noteById('v2'))); await p.clock.runFor(50);
  await show('```calendario\ncarpeta: Agenda\n```');
  await p.focus('#note-reading .vc-chip[data-id="a1"]');
  await p.keyboard.press('Alt+ArrowRight'); await p.clock.runFor(100);
  check('calendario: movida', await ev(() => propOf(noteById('a1'), 'fecha')), '2026-10-06');
  check('calendario: no navega', await ev(() => activeNote()?.id), 'q');
  // Lienzo: Alt+flecha no mueve la tarjeta (es atrás/adelante); la flecha sola sí.
  await ev(() => { const cnv = newCanvas('Prueba'); openCanvas(cnv.id); window.__k = addCanvasCard(cnv, { type: 'text', text: 'hola', x: 0, y: 0 }); cv.editing = null; });
  await p.clock.runFor(100);
  const key = (k, alt) => ev(([k, alt]) => { $('#cv-viewport').dispatchEvent(new KeyboardEvent('keydown', { key: k, altKey: alt, bubbles: true, cancelable: true })); return window.__k.x; }, [k, alt]);
  check('lienzo: flecha mueve', await key('ArrowRight', false), 10);
  check('lienzo: Alt+flecha no mueve', await key('ArrowLeft', true), 10);
  check('lienzo: Alt+flecha navega', await ev(() => activeTab().type === 'note' && activeNote()?.id), 'q');

  // ---- 3. CSV: fórmulas ----
  check('csv celda', await ev(() => [finCsvCell('=1+1', ';'), finCsvCell('+34 600', ';'), finCsvCell('-resta', ';'), finCsvCell('@x', ';'), finCsvCell('\tx', ';'), finCsvCell('normal', ';'), finCsvCell('-8,40', ';', true)]), ["'=1+1", "'+34 600", "'-resta", "'@x", "'\tx", 'normal', '-8,40']);
  await ev(() => finAddTx({ date: '2026-10-02', cents: 840, kind: 'gasto', note: '=HYPERLINK("x")' }, { toast: false }));
  check('csv nota', (await ev(() => finCsv('2026-10'))).split('\r\n')[1].split(';').slice(3), ['8,40', '"\'=HYPERLINK(""x"")"']);

  // ---- 4. Números en tablas ----
  check('tableNum', await ev(() => ['1.200', '1.234,50', '12 €', '-3,5', '1,234.5', '0.125', '€ 1.000', '2026-01-02', 'abc', '', '1.2.3'].map(tableNum)), [1200, 1234.5, 12, -3.5, 1234.5, 0.125, 1000, null, null, null, null]);
  check('tableTotal', await ev(() => [tableTotal('suma', ['1.200', '1.234,50', '12 €']), tableTotal('máx', ['1.200', '900']), tableTotal('promedio', ['10', '20 €'])]), ['2446,5', '1200', '15']);
  check('compareCells', await ev(() => [compareCells('1.200', '900') > 0, propCompare('1.234,50', '1.200') > 0, propCompare('12 €', '9') > 0]), [true, true, true]);

  // ---- 11. Totales con límite: los de las filas que se ven ----
  await show('```tabla\ncarpeta: T\norden: nombre\nlímite: 2\ncolumnas: precio\ntotales: precio=suma\n```');
  check('total límite', await ev(() => [$('#note-reading .nt-foot-label').textContent, $('#note-reading .nt-total-val').textContent]), ['Total (2 filas)', '1246,5']);
  await show('```tabla\ncarpeta: T\ncolumnas: precio\ntotales: precio=suma\n```');
  check('total todo', await ev(() => [$('#note-reading .nt-foot-label').textContent, $('#note-reading .nt-total-val').textContent]), ['Total', '2446,5']);

  // ---- 5. Importar CSV: columnas ----
  check('columnas fecha valor', await ev(() => finGuessColumns(['Fecha', 'Fecha valor', 'Concepto', 'Importe'])), { date: 0, amount: 3, note: 2, category: -1, kind: -1 });
  check('columnas valor', await ev(() => finGuessColumns(['Fecha', 'Valor', 'Concepto', 'Importe total']).amount), 3);
  const plan = await ev(() => {
    const rows = [['Fecha', 'Concepto', 'Cargo', 'Abono'], ['01/10/2026', 'Luz', '45,10', ''], ['02/10/2026', 'Nómina', '', '1.500,00']];
    return finImportPlan(rows, finGuessColumns(rows[0])).map((x) => x.tx && [x.tx.kind, x.tx.cents, x.tx.note]);
  });
  check('cargo/abono', plan, [['gasto', 4510, 'Luz'], ['ingreso', 150000, 'Nómina']]);
  check('debe', await ev(() => { const rows = [['Fecha', 'Débito'], ['01/10/2026', '12']]; return finImportPlan(rows, finGuessColumns(rows[0]))[0].tx.kind; }), 'gasto');
  check('haber', await ev(() => { const rows = [['Fecha', 'Haber'], ['01/10/2026', '-12']]; return finImportPlan(rows, finGuessColumns(rows[0]))[0].tx.kind; }), 'ingreso');

  // ---- 6. Plantillas: «$» en el título ----
  check('plantilla $', await ev(() => fillTemplate('# {{título}} | {{titulo}}', 'Coste $& y $1 $$ $`')), '# Coste $& y $1 $$ $` | Coste $& y $1 $$ $`');

  // ---- 9. Consultas: palabras clave en etiquetas ----
  check('consulta etiquetas', await ev(() => { const q = parseQuery('#hoy #semana #hecha +hoy'); return [q.when, q.status, q.tags]; }), [null, 'pending', ['hoy', 'semana', 'hecha']]);
  check('consulta palabras', await ev(() => { const q = parseQuery('hechas hoy #casa'); return [q.when, q.status, q.tags]; }), ['today', 'done', ['casa']]);

  // ---- 10. Portadas: índice alt → imagen ----
  check('portada por nombre', await ev(() => coverFromName('Atardecer', new Set())), { img: 'abc123' });
  check('índice en caché', await ev(() => { const a = imgAltIndex(); const same = imgAltIndex() === a; save(); return [same, imgAltIndex() !== a]; }), [true, true]);

  // ---- 13. Tablero: mover con lista conserva los demás valores ----
  await ev(() => moveBoardNote(noteById('l1'), 'estado', 'pendiente'));
  check('tablero lista', await ev(() => propValues(noteById('l1'), 'estado')), ['pendiente', 'favorito']);
  await ev(() => moveBoardNote(noteById('l1'), 'estado', 'favorito'));
  check('tablero sin repetir', await ev(() => propValues(noteById('l1'), 'estado')), ['favorito']);
  await ev(() => { const n = noteById('l1'); n.body = '---\nestado: [leído, favorito]\n---\nTexto'; moveBoardNote(n, 'estado', null); });
  check('tablero a «Sin»', await ev(() => propValues(noteById('l1'), 'estado')), ['favorito']);

  // ---- 8. Ocultar importes ----
  await ev(() => { fin().hide = true; const cat = finCatsOf('gasto')[0]; cat.budget = 50000; save(); showView('finanzas'); renderAll(); });
  await p.clock.runFor(100);
  check('oculto: presupuesto', await ev(() => !!$('#fin-cards .fin-c-left .delta .fin-amt')), true);
  check('oculto: búsqueda', await ev(() => gsSearch('HYPERLINK').groups.find((x) => x.type === 'finance').items[0].it.sub.includes('€')), false);
  await ev(() => finAddTx({ date: '2026-10-10', cents: 1234, kind: 'gasto', note: 'pan' }));
  check('oculto: aviso', await ev(() => $('#toast').textContent.includes('12,34')), false);
  await ev(() => { $('#fin-amount').value = '7,25'; $('#fin-amount').dispatchEvent(new Event('input')); });
  check('oculto: vista previa', await ev(() => $('#fin-preview .fin-amt')?.textContent), '7,25 €');
  await ev(() => finImportDialog('Fecha;Importe\n01/10/2026;-3,00\n'));
  check('oculto: importar', await ev(() => !!$('#fin-dialog .fin-import-preview td .fin-amt')), true);
  await p.keyboard.press('Escape');
  await ev(() => { fin().hide = false; save(); });
  check('visible: búsqueda', await ev(() => gsSearch('HYPERLINK').groups.find((x) => x.type === 'finance').items[0].it.sub.includes('8,40')), true);

  // ---- 7. Apariencia: el foco se queda en el control ----
  await ev(() => showView('today')); await p.click('#open-settings'); await p.clock.runFor(200);
  const seg = await p.$('#appearance .segmented[aria-label="Densidad"] .seg:not(.active)');
  await seg.focus(); await p.keyboard.press('Enter'); await p.clock.runFor(50);
  check('foco: botón', await ev(() => { const a = document.activeElement; return [a.closest('.segmented')?.ariaLabel, a.classList.contains('active'), look().density]; }), ['Densidad', true, 'compact']);
  await p.focus('#appearance select[aria-label="Fuente de las notas"]');
  await ev(() => { const s = document.activeElement; s.selectedIndex = (s.selectedIndex + 1) % s.options.length; s.dispatchEvent(new Event('change')); });
  check('foco: select', await ev(() => document.activeElement.ariaLabel), 'Fuente de las notas');
  await p.focus('#appearance input[type=range][aria-label="Tamaño general"]');
  await p.keyboard.press('ArrowRight'); await p.clock.runFor(50);
  check('foco: rango', await ev(() => [document.activeElement.ariaLabel, look().scale]), ['Tamaño general', 105]);

  // ---- 12. Dibujo: pegar con copia fallida usa el portapapeles interno ----
  await ev(() => { $('#settings-close')?.click(); openNote(noteById('v2')); openDrawing(); });
  await p.clock.runFor(400);
  const paste = (text) => ev((t) => {
    const dt = new DataTransfer();
    if (t) dt.setData('text/plain', t);
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    return [xd.elements.length, xd.elements.filter((e) => e.type === 'text').map((e) => e.text)];
  }, text);
  await ev(() => {
    xdMutate(() => { const r = newXdElement('rectangle', 0, 0, { width: 40, height: 40 }); xd.elements.push(r); xd.selected = new Set([r.id]); });
    navigator.clipboard.writeText = () => Promise.reject(new Error('no'));
    xdCopySelection();
  });
  await p.clock.runFor(50);
  check('dibujo: copia fallida', await ev(() => xd.clipFailed), true);
  check('dibujo: pega lo copiado', await paste('texto viejo'), [2, []]);
  await ev(() => { navigator.clipboard.writeText = () => Promise.resolve(); xdCopySelection(); });
  await p.clock.runFor(50);
  const copied = await ev(() => xd.clipText);
  check('dibujo: mismo texto', (await paste(copied))[0], 3);
  check('dibujo: texto nuevo', await paste('otro texto'), [4, ['otro texto']]);

  console.log('errors:', JSON.stringify(errs));
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
