'use strict';

// ---------- Estoicismo: práctica diaria ----------
// Espacio propio, separado del trabajo: máxima del día, premeditatio malorum por la mañana,
// examen de la noche (Séneca, De ira III, 36) y ejercicios para marcar.
// Cada día se guarda como una nota Markdown «<carpeta de estoicismo>/Práctica/Práctica AAAA-MM-DD»,
// así viaja con la sincronización de notas, la copia de seguridad y la búsqueda como cualquier otra.
// La máxima sale de las citas (líneas «> …») de tus notas de estoicismo; si hay pocas, se completa
// con una selección de las fuentes clásicas.

ICONS.pillar = '<path d="M4 21h16M5 18h14M6 18V8M10 18V8M14 18V8M18 18V8M3 8h18M12 3 3 7v1h18V7z"/>';
Object.assign(VIEW_TITLES, { stoa: 'Estoicismo' });
Object.assign(VIEW_ICONS, { stoa: 'pillar' });

const STOA_MAXIMS = [
  ['Al despuntar la aurora, dite: me encontraré con un entrometido, un ingrato, un insolente… Pero ninguno puede dañarme, y no puedo enojarme con mi pariente ni odiarlo: hemos nacido para colaborar.', 'Marco Aurelio, Meditaciones II, 1'],
  ['Tienes poder sobre tu mente, no sobre los acontecimientos. Date cuenta de esto y encontrarás la fuerza.', 'Marco Aurelio, Meditaciones (atribuida)'],
  ['La mejor manera de vengarse es no parecerse a quien te ofendió.', 'Marco Aurelio, Meditaciones VI, 6'],
  ['Lo que no es útil a la colmena tampoco es útil a la abeja.', 'Marco Aurelio, Meditaciones VI, 54'],
  ['No actúes como si fueras a vivir diez mil años. La muerte pende sobre ti: mientras vivas, mientras puedas, sé bueno.', 'Marco Aurelio, Meditaciones IV, 17'],
  ['Si no conviene, no lo hagas; si no es verdad, no lo digas.', 'Marco Aurelio, Meditaciones XII, 17'],
  ['El impedimento a la acción hace avanzar la acción. Lo que se interpone en el camino se convierte en el camino.', 'Marco Aurelio, Meditaciones V, 20'],
  ['Pierde el tiempo quien busca fuera la paz: retírate a ti mismo.', 'Marco Aurelio, Meditaciones IV, 3'],
  ['De las cosas, unas dependen de nosotros y otras no.', 'Epicteto, Enquiridión 1'],
  ['No nos perturban las cosas, sino las opiniones que tenemos de ellas.', 'Epicteto, Enquiridión 5'],
  ['No pidas que las cosas sucedan como quieres; quiere que sucedan como suceden, y vivirás sereno.', 'Epicteto, Enquiridión 8'],
  ['Nunca digas de nada «lo he perdido», sino «lo he devuelto».', 'Epicteto, Enquiridión 11'],
  ['Si quieres progresar, acepta parecer necio en lo externo.', 'Epicteto, Enquiridión 13'],
  ['Recuerda que eres actor de un drama tal como lo quiere el autor. Tu tarea es representar bien el papel que te toca.', 'Epicteto, Enquiridión 17'],
  ['Nadie es libre si no es dueño de sí mismo.', 'Epicteto, Disertaciones (fragmento)'],
  ['No es que tengamos poco tiempo, sino que perdemos mucho.', 'Séneca, Sobre la brevedad de la vida 1'],
  ['Reclama tu derecho sobre ti mismo y recoge y guarda el tiempo que hasta ahora te arrebataban o se te escapaba.', 'Séneca, Cartas a Lucilio 1'],
  ['Sufrimos más a menudo en la imaginación que en la realidad.', 'Séneca, Cartas a Lucilio 13'],
  ['Mientras se aplaza, la vida pasa.', 'Séneca, Cartas a Lucilio 1'],
  ['Ningún viento es favorable para quien no sabe a qué puerto se dirige.', 'Séneca, Cartas a Lucilio 71'],
  ['La suerte no tiene poder sobre las costumbres.', 'Séneca, Cartas a Lucilio 36'],
  ['Hay que meditar de antemano todo lo que puede ocurrir, para que nada nos tome desprevenidos.', 'Séneca, Cartas a Lucilio 91'],
  ['Mientras vivimos, mientras estamos entre los hombres, cultivemos la humanidad.', 'Séneca, De ira III, 43'],
  ['Cada día, al acostarme, examino mi jornada entera y repaso lo que hice y dije. Nada me oculto, nada paso por alto.', 'Séneca, De ira III, 36'],
  ['Es pobre no quien tiene poco, sino quien desea más.', 'Séneca, Cartas a Lucilio 2'],
  ['La dificultad fortalece la mente, como el trabajo al cuerpo.', 'Séneca, Cartas a Lucilio (atribuida)'],
  ['Si haces algo bueno con esfuerzo, el esfuerzo pasa y el bien queda; si haces algo vergonzoso con placer, el placer pasa y la vergüenza queda.', 'Musonio Rufo, Fragmento 51'],
  ['Puesto que la virtud no consiste solo en saber, sino en practicar, el filósofo debe ejercitarse.', 'Musonio Rufo, Disertación 6'],
];

const STOA_QUESTIONS = ['¿Qué mal corregí hoy?', '¿Qué vicio resistí?', '¿En qué soy mejor?'];
const STOA_EXERCISES = [
  { id: 'premeditatio', label: 'Premeditatio malorum', hint: 'Por la mañana: anticipa lo que puede salir mal y cómo responderás.' },
  { id: 'control', label: 'Dicotomía del control', hint: 'Separa lo que depende de ti de lo que no, en algo concreto de hoy.' },
  { id: 'memento', label: 'Memento mori', hint: 'Un minuto para recordar que el tiempo es finito y usarlo bien.' },
  { id: 'examen', label: 'Examen de la noche', hint: 'Las tres preguntas de Séneca antes de dormir.' },
  { id: 'gratitud', label: 'Gratitud', hint: 'Tres cosas concretas del día por las que estás agradecido.' },
  { id: 'lectura', label: 'Lectura', hint: 'Unas páginas de Marco Aurelio, Séneca, Epicteto o Musonio.' },
];
const STOA_H = { morning: '☀️ Premeditatio malorum', evening: '🌙 Examen de la noche', gratitude: '🙏 Gratitud', exercises: '✅ Ejercicios', notes: '📝 Notas' };

const stoaSettings = () => (state.settings.stoa ||= { today: true });

// Carpeta: la de estoicismo que ya tengas (p. ej. «ESTOICISMO» o «10.- Estoicismo»); si no hay, «Estoicismo».
function stoaFolder() {
  const s = stoaSettings();
  if (s.folder) return s.folder;
  const roots = [...new Set([...(state.folders || []), ...state.notes.map((n) => n.path.split('/').slice(0, -1).join('/'))].filter(Boolean))];
  const own = roots.filter((f) => !f.includes('/') && /estoic/i.test(f)).sort((a, b) => a.length - b.length)[0];
  s.folder = `${own || 'Estoicismo'}/Práctica`;
  return s.folder;
}
const stoaTitle = (key) => `Práctica ${key}`;
const stoaFind = (key) => state.notes.find((n) => n.path === `${stoaFolder()}/${stoaTitle(key)}`) || null;
const stoaIsPractice = (note) => note.path.startsWith(`${stoaFolder()}/`);

// ---------- Máxima del día ----------
function stoaUserMaxims() {
  const out = [];
  const seen = new Set();
  for (const note of state.notes) {
    if (stoaIsPractice(note) || note.enc) continue;
    const isStoic = /estoic|stoic|s[eé]neca|marco aurelio|epicteto|musonio/i.test(note.path) || /#estoic/i.test(note.body.slice(0, 600));
    if (!isStoic) continue;
    for (const raw of note.body.split('\n')) {
      if (!/^\s*>/.test(raw) || /^\s*>\s*\[!/.test(raw)) continue;
      const line = raw.replace(/^\s*(>\s*)+/, '').replace(/\*\*|__|\*/g, '').trim();
      if (line.length < 25 || line.length > 320) continue;
      const m = line.match(/^[«"“]?(.+?)[»"”]?(?:\s+[—–-]{1,2}\s+([^«»"“”]{3,80}))?$/);
      const text = (m?.[1] || line).trim();
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ text, ref: m?.[2]?.trim() || '', note });
    }
  }
  return out;
}

let stoaOffset = 0; // «Otra máxima»: solo en esta sesión
function stoaMaxim(key = dateKey()) {
  const mine = stoaUserMaxims();
  const classic = STOA_MAXIMS.map(([text, ref]) => ({ text, ref, note: null }));
  const pool = mine.length >= 7 ? mine : [...mine, ...classic];
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return pool[(h + stoaOffset) % pool.length];
}

// ---------- Nota del día: Markdown ↔ datos ----------
function stoaBody(key, d) {
  const mx = d.maxim;
  return [
    '---', 'tipo: práctica estoica', `fecha: ${key}`, '---',
    ...(mx ? [`> «${mx.text}»${mx.ref ? ` — ${mx.ref}` : ''}`, ''] : []),
    `## ${STOA_H.morning}`, d.morning || '', '',
    `## ${STOA_H.evening}`,
    ...STOA_QUESTIONS.flatMap((q, i) => [`### ${q}`, d.answers[i] || '', '']),
    `## ${STOA_H.gratitude}`, d.gratitude || '', '',
    `## ${STOA_H.exercises}`,
    ...STOA_EXERCISES.map((x) => `- [${d.done[x.id] ? 'x' : ' '}] ${x.label}`), '',
    `## ${STOA_H.notes}`, d.notes || '', '',
  ].join('\n').replace(/\n{3,}/g, '\n\n');
}

function stoaParse(text) {
  const d = { morning: '', answers: ['', '', ''], gratitude: '', done: {}, notes: '', maxim: null };
  if (!text) return d;
  const lines = text.split('\n');
  let sec = null;
  let q = -1;
  const buf = { morning: [], answers: [[], [], []], gratitude: [], notes: [] };
  const fm = parseProps(text).end;
  lines.forEach((line, i) => {
    if (fm > 0 && i <= fm) return;
    const h2 = line.match(/^##\s+(.*)$/);
    if (h2) {
      const t = h2[1];
      sec = /premeditatio/i.test(t) ? 'morning' : /examen/i.test(t) ? 'evening' : /gratitud/i.test(t) ? 'gratitude' : /ejercicio/i.test(t) ? 'exercises' : 'notes';
      if (sec === 'notes' && !/^📝?\s*Notas$/i.test(t.trim())) buf.notes.push(line); // otras secciones tuyas se conservan
      q = -1;
      return;
    }
    if (!sec) {
      const m = line.match(/^>\s*«(.+)»(?:\s*—\s*(.+))?$/);
      if (m) d.maxim = { text: m[1], ref: m[2] || '' };
      return;
    }
    if (sec === 'evening') {
      const h3 = line.match(/^###\s+(.*)$/);
      if (h3) {
        q = STOA_QUESTIONS.findIndex((x) => x === h3[1].trim());
        return;
      }
      if (q >= 0) buf.answers[q].push(line);
    } else if (sec === 'exercises') {
      const m = line.match(/^\s*[-*]\s*\[([ xX])\]\s*(.+)$/);
      const x = m && STOA_EXERCISES.find((e) => e.label.toLowerCase() === m[2].trim().toLowerCase());
      if (x) d.done[x.id] = m[1] !== ' ';
      else if (line.trim()) buf.notes.push(line);
    } else buf[sec].push(line);
  });
  const tidy = (a) => a.join('\n').trim();
  d.morning = tidy(buf.morning);
  d.gratitude = tidy(buf.gratitude);
  d.answers = buf.answers.map(tidy);
  d.notes = tidy(buf.notes);
  return d;
}

function stoaData(key) {
  const note = stoaFind(key);
  const text = note ? noteText(note) : '';
  return { note, locked: text === null, data: stoaParse(text || '') };
}

const stoaEmpty = (d) => !d.morning && !d.notes && !d.gratitude && !d.answers.some(Boolean) && !Object.values(d.done).some(Boolean);

function stoaWrite(key, d) {
  let note = stoaFind(key);
  if (!note) {
    if (stoaEmpty(d)) return null;
    const folder = stoaFolder();
    const parts = folder.split('/');
    parts.forEach((_, i) => {
      const f = parts.slice(0, i + 1).join('/');
      if (!state.folders.includes(f)) state.folders.push(f);
    });
    note = createNote({ folder, title: stoaTitle(key), body: stoaBody(key, d), open: false, log: false });
    return note;
  }
  if (!djEdit(note, () => stoaBody(key, d))) return null;
  save();
  return note;
}

// Racha: días seguidos (hasta hoy o ayer) con al menos un ejercicio o el examen escrito.
function stoaPracticed(key) {
  const { data } = stoaData(key);
  return Object.values(data.done).some(Boolean) || data.answers.some(Boolean) || !!data.morning || !!data.gratitude;
}
function stoaStreak() {
  let d = new Date();
  if (!stoaPracticed(dateKey(d))) d = addDays(d, -1);
  let n = 0;
  while (n < 3650 && stoaPracticed(dateKey(d))) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

// ---------- Vista ----------
let stoaDay = dateKey();
let stoaTimer = null;
let stoaPending = null;

function stoaFlush() {
  clearTimeout(stoaTimer);
  if (!stoaPending) return;
  const { key, d } = stoaPending;
  stoaPending = null;
  stoaWrite(key, d);
  stoaRenderStats();
}

function stoaQueue(key, d) {
  stoaPending = { key, d };
  clearTimeout(stoaTimer);
  stoaTimer = setTimeout(stoaFlush, 700);
  const s = $('#stoa-status');
  if (s) s.textContent = 'Guardando…';
}

function stoaMaximCard(mx, { compact = false } = {}) {
  const card = el('figure', { className: `stoa-maxim${compact ? ' compact' : ''}` }, [
    el('blockquote', {}, `«${mx.text}»`),
    el('figcaption', {}, [mx.ref || (mx.note ? baseName(mx.note.path) : ''), mx.note ? el('span', { className: 'muted' }, ' · de tus notas') : '']),
  ]);
  if (mx.note) {
    const open = el('button', { type: 'button', className: 'link' }, 'Abrir la nota');
    open.addEventListener('click', () => openNote(mx.note));
    card.querySelector('figcaption').append(' ', open);
  }
  return card;
}

function stoaRenderStats() {
  const box = $('#stoa-stats');
  if (!box) return;
  const days = [...Array(7)].map((_, i) => dateKey(addDays(new Date(), i - 6)));
  box.replaceChildren(
    el('div', { className: 'stat' }, [el('span', { className: 'num' }, String(stoaStreak())), el('span', { className: 'label' }, 'Días seguidos')]),
    el('div', { className: 'stoa-week', ariaLabel: 'Últimos 7 días' }, days.map((k) => {
      const on = stoaPracticed(k);
      const b = el('button', { type: 'button', className: `stoa-day${on ? ' on' : ''}${k === stoaDay ? ' sel' : ''}`, title: `${k}${on ? ' · practicado' : ''}` },
        parseKey(k).toLocaleDateString('es', { weekday: 'narrow' }));
      b.addEventListener('click', () => {
        stoaFlush();
        stoaDay = k;
        renderStoa({ force: true });
      });
      return b;
    })),
  );
  const s = $('#stoa-status');
  if (s && !stoaPending) {
    const note = stoaFind(stoaDay);
    s.replaceChildren(note ? 'Guardado en ' : 'Se guardará como nota al escribir o marcar algo.');
    if (note) {
      const a = el('button', { type: 'button', className: 'link' }, baseName(note.path));
      a.addEventListener('click', () => openNote(note));
      s.append(a);
    }
  }
}

function renderStoa({ force = false } = {}) {
  const view = $('#view-stoa');
  if (!view) return;
  // Si estás escribiendo aquí, no se rehace el formulario (una sincronización no te quita el foco).
  if (!force && view.contains(document.activeElement) && view.querySelector('#stoa-form')) {
    stoaRenderStats();
    return;
  }
  const key = stoaDay;
  const isToday = key === dateKey();
  const { locked, data } = stoaData(key);
  const mx = data.maxim || stoaMaxim(key);
  const st = stoaSettings();

  const head = el('div', { className: 'stoa-head' }, [
    el('div', {}, [
      el('h2', { className: 'stoa-title' }, 'Práctica estoica'),
      el('p', { className: 'muted' }, (isToday ? parseKey(key).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' }) : `Día ${parseKey(key).toLocaleDateString('es', { dateStyle: 'long' })}`).replace(/^./, (c) => c.toUpperCase())),
    ]),
    el('div', { id: 'stoa-stats', className: 'stoa-stats' }),
  ]);

  const other = el('button', { type: 'button', className: 'chip' }, 'Otra máxima');
  other.addEventListener('click', () => {
    stoaOffset++;
    currentMaxim = stoaMaxim(key);
    $('#stoa-maxim-slot').replaceChildren(stoaMaximCard(currentMaxim));
    if (!locked && stoaFind(key)) stoaQueue(key, readForm()); // la nota del día guarda la máxima elegida
  });
  let currentMaxim = mx;
  const maximBox = el('section', { className: 'card stoa-card' }, [
    el('div', { className: 'stoa-card-head' }, [el('h3', {}, 'Máxima del día'), other]),
    el('div', { id: 'stoa-maxim-slot' }, stoaMaximCard(mx)),
  ]);

  if (locked) {
    view.replaceChildren(head, maximBox, el('p', { className: 'card muted' }, 'La nota de este día está protegida con contraseña. Desbloquéala para verla aquí.'));
    stoaRenderStats();
    return;
  }

  const ta = (name, value, rows, label, placeholder = '') => el('textarea', { className: 'notes', name, rows, value, ariaLabel: label, placeholder });
  const morning = el('section', { className: 'card stoa-card' }, [
    el('h3', {}, STOA_H.morning),
    el('p', { className: 'muted' }, '¿Qué puede salir mal hoy? ¿Qué depende de mí y cómo voy a responder?'),
    ta('morning', data.morning, 4, 'Premeditatio malorum', 'Puede que… Si pasa, responderé…'),
  ]);
  const evening = el('section', { className: 'card stoa-card' }, [
    el('h3', {}, STOA_H.evening),
    el('p', { className: 'muted' }, 'Las tres preguntas de Séneca (De ira III, 36).'),
    ...STOA_QUESTIONS.map((q, i) => el('label', { className: 'prompt' }, [el('span', {}, q), ta(`a${i}`, data.answers[i], 2, q)])),
  ]);
  const gratitude = el('section', { className: 'card stoa-card' }, [
    el('h3', {}, STOA_H.gratitude),
    el('p', { className: 'muted' }, 'Tres cosas concretas de hoy por las que estás agradecido.'),
    ta('gratitude', data.gratitude, 3, 'Gratitud', '1. …\n2. …\n3. …'),
  ]);
  const exercises = el('section', { className: 'card stoa-card' }, [
    el('h3', {}, STOA_H.exercises),
    el('ul', { className: 'stoa-ex' }, STOA_EXERCISES.map((x) =>
      el('li', {}, el('label', {}, [
        el('input', { type: 'checkbox', name: `x-${x.id}`, checked: !!data.done[x.id] }),
        el('span', {}, [el('strong', {}, x.label), el('span', { className: 'muted' }, ` — ${x.hint}`)]),
      ])))),
  ]);
  const notes = el('section', { className: 'card stoa-card' }, [
    el('h3', {}, STOA_H.notes),
    ta('notes', data.notes, 3, 'Notas', 'Lo que quieras anotar de tu práctica de hoy.'),
  ]);

  const form = el('form', { id: 'stoa-form', className: 'stoa-form' }, [morning, evening, gratitude, exercises, notes]);
  function readForm() {
    const v = (n) => form.elements[n]?.value.trim() || '';
    return {
      morning: v('morning'),
      answers: STOA_QUESTIONS.map((_, i) => v(`a${i}`)),
      gratitude: v('gratitude'),
      done: Object.fromEntries(STOA_EXERCISES.map((x) => [x.id, !!form.elements[`x-${x.id}`]?.checked])),
      notes: v('notes'),
      maxim: currentMaxim,
    };
  }
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('input', () => stoaQueue(key, readForm()));
  form.addEventListener('change', (e) => {
    if (e.target.type === 'checkbox') {
      stoaQueue(key, readForm());
      stoaFlush();
    }
  });

  const showToday = el('label', { className: 'muted stoa-opt' }, [
    el('input', { type: 'checkbox', checked: st.today !== false }),
    ' Mostrar la máxima del día en «Hoy»',
  ]);
  showToday.querySelector('input').addEventListener('change', (e) => {
    st.today = e.target.checked;
    save();
  });
  const foot = el('div', { className: 'stoa-foot' }, [
    el('p', { id: 'stoa-status', className: 'muted' }),
    ...(isToday ? [] : [(() => {
      const b = el('button', { type: 'button', className: 'chip' }, 'Volver a hoy');
      b.addEventListener('click', () => { stoaFlush(); stoaDay = dateKey(); renderStoa({ force: true }); });
      return b;
    })()]),
    showToday,
  ]);

  view.replaceChildren(head, maximBox, form, foot);
  stoaRenderStats();
}

Object.assign(VIEW_RENDER, { stoa: () => renderStoa() });

// Al salir de la sección o cerrar la página, lo escrito se guarda sin esperar.
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && stoaFlush());
window.addEventListener('pagehide', stoaFlush);
document.addEventListener('click', (e) => {
  if (stoaPending && !e.target.closest('#view-stoa')) stoaFlush();
}, true);

// ---------- Máxima en «Hoy» ----------
function renderTodayStoa() {
  const box = $('#today-stoa');
  if (!box) return;
  const on = stoaSettings().today !== false;
  box.hidden = !on;
  if (!on) return;
  const key = dateKey();
  const mx = stoaData(key).data.maxim || stoaMaxim(key);
  const go = el('button', { type: 'button', className: 'chip' }, stoaPracticed(key) ? '🏛️ Seguir con la práctica' : '🏛️ Practicar hoy');
  go.addEventListener('click', () => { stoaDay = dateKey(); showView('stoa'); });
  box.replaceChildren(stoaMaximCard(mx, { compact: true }), el('div', { className: 'row' }, go));
}
const stoaTodayRender = VIEW_RENDER.today;
VIEW_RENDER.today = () => {
  stoaTodayRender();
  renderTodayStoa();
};
paintIcons();
