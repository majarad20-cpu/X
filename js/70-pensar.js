'use strict';

// ---------- Pensar: pregunta del día, ánimo y constancia, «hace un año hoy» y plantillas ----------
// Todo sale de lo que ya hay: las notas diarias (sección Diario y propiedad «animo», 08-diario.js)
// y las entradas antiguas del diario. Las plantillas van al menú «/», a «Insertar…» y a
// «Herramientas para pensar…» (en el menú Pensar y en Comandos), que crea una nota con ellas.

// ---------- 1. Pregunta del día ----------
const DAY_QUESTIONS = [
  '¿Qué es lo más importante que aprendí esta semana?',
  '¿Qué me está quitando energía últimamente y qué puedo hacer con ello?',
  '¿Por qué tres cosas estoy agradecido hoy?',
  '¿Qué haría hoy si no tuviera miedo?',
  '¿Qué conversación estoy evitando y por qué?',
  '¿En qué gasté mi tiempo esta semana que no me importa de verdad?',
  '¿Qué me haría sentir orgulloso al final de este día?',
  '¿Qué hábito pequeño cambiaría más mi vida si lo mantuviera un año?',
  '¿Qué decisión llevo tiempo aplazando?',
  '¿A quién debería dar las gracias y aún no lo he hecho?',
  '¿Qué creencia mía podría estar equivocada?',
  '¿Qué me preocupa ahora mismo? ¿Depende de mí?',
  '¿Cómo sería un día perfecto para mí, de principio a fin?',
  '¿Qué consejo le daría a mi yo de hace cinco años?',
  '¿Qué consejo me daría mi yo de dentro de diez años?',
  '¿Qué he dejado a medias que merece la pena terminar?',
  '¿Qué me hizo reír o disfrutar esta semana?',
  '¿Dónde estoy diciendo «sí» cuando debería decir «no»?',
  '¿Qué tema me gustaría dominar y qué paso puedo dar hoy?',
  '¿Qué error reciente me enseñó algo valioso?',
  '¿Qué personas me dan energía y cuáles me la quitan?',
  '¿Qué significa para mí «una buena vida»?',
  '¿Qué estoy dando por sentado que en realidad es un regalo?',
  '¿Qué haría distinto si supiera que nadie me juzga?',
  '¿Qué me gustaría que dijeran de mí las personas que quiero?',
  '¿Cuál es la tarea que, si la hago hoy, hace el resto más fácil o innecesario?',
  '¿Qué pequeña victoria tuve hoy?',
  '¿Qué emoción se repite últimamente y qué intenta decirme?',
  '¿Qué podría simplificar en mi vida esta semana?',
  '¿Qué estoy tolerando que ya no debería tolerar?',
  '¿Qué me inspira de alguien que admiro? ¿Cómo puedo aplicarlo?',
  '¿Qué haría con una hora libre extra cada día?',
  '¿Qué me da miedo perder y por qué?',
  '¿Qué es algo que hoy hice mejor que hace un año?',
  '¿Qué quiero recordar de este momento de mi vida?',
  '¿Qué límite necesito poner y con quién?',
  '¿Cuál de mis valores viví hoy y cuál dejé de lado?',
  '¿Qué pregunta me gustaría que alguien me hiciera?',
  '¿Qué tengo ahora que antes deseaba?',
  '¿Qué paso concreto me acerca hoy a mi objetivo del año?',
  '¿Qué he aprendido de una persona con la que no estoy de acuerdo?',
  '¿Qué cosa sencilla me cuida y estoy descuidando (sueño, comida, movimiento)?',
  '¿Qué historia me estoy contando sobre un problema? ¿Hay otra versión?',
  '¿Qué me gustaría crear o construir este año?',
  '¿Qué ruido puedo eliminar de mi día (notificaciones, compromisos, cosas)?',
  '¿Cuándo me sentí más «yo mismo» esta semana?',
  '¿Qué haría hoy una versión de mí un 10 % más valiente?',
  '¿Qué estoy esperando para empezar?',
  '¿Qué problema de otra persona podría ayudar a resolver?',
  '¿Qué me ha sorprendido últimamente?',
  '¿Qué debería dejar de hacer?',
  '¿Qué debería empezar a hacer?',
  '¿Qué debería seguir haciendo?',
  '¿Cómo quiero sentirme mañana al despertar y qué puedo hacer hoy para lograrlo?',
  '¿Qué libro, idea o conversación me cambió la forma de pensar?',
  '¿Qué parte de mi rutina disfruto más? ¿Cómo tener más de eso?',
  '¿Qué me diría un buen amigo sobre lo que me preocupa?',
  '¿Qué recuerdo me hace sonreír siempre?',
  '¿Qué compromiso conmigo mismo he roto y cómo lo retomo?',
  '¿Qué es «suficiente» para mí en el trabajo, el dinero y las cosas?',
];
let dayQuestionShift = 0;
function dayQuestion(key = dateKey(), shift = dayQuestionShift) {
  let h = 7;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return DAY_QUESTIONS[(h + shift) % DAY_QUESTIONS.length];
}

JOURNAL_KINDS.question = {
  label: 'Pregunta del día',
  hint: 'Una pregunta distinta cada día para pensar con calma.',
  get prompts() {
    return [dayQuestion()];
  },
  hintExtra() {
    const other = el('button', { type: 'button', className: 'link' }, 'Otra pregunta');
    other.addEventListener('click', () => {
      saveDraftNow();
      dayQuestionShift++;
      writeDraft({ ...readDraft(), sections: null });
      renderComposer();
      $('#journal-fields textarea')?.focus();
    });
    return other;
  },
};

// ---------- 2. Ánimo y constancia ----------
const MOOD_COLORS = ['#e03131', '#f08c00', '#fab005', '#74b816', '#2f9e44'];

function journalBestStreak(days) {
  const sorted = [...days].sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const d of sorted) {
    run = prev && dateKey(addDays(new Date(`${prev}T12:00:00`), 1)) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

const svgEl = (tag, attrs = {}, kids = []) => {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
  n.append(...kids);
  return n;
};

// Ánimo medio de cada una de las últimas 12 semanas (lunes a domingo).
function moodWeeks(byDate, weeks = 12) {
  const start = addDays(weekStart(new Date()), -7 * (weeks - 1));
  return Array.from({ length: weeks }, (_, w) => {
    const from = addDays(start, w * 7);
    const vals = Array.from({ length: 7 }, (_, i) => byDate.get(dateKey(addDays(from, i)))?.dayMood?.v).filter(Boolean);
    return { from, avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, n: vals.length };
  });
}

function moodChart(weeks) {
  const W = 360;
  const H = 120;
  const pad = { l: 26, r: 8, t: 8, b: 20 };
  const x = (i) => pad.l + (i * (W - pad.l - pad.r)) / (weeks.length - 1);
  const y = (v) => pad.t + ((5 - v) * (H - pad.t - pad.b)) / 4;
  const kids = [];
  MOODS.forEach((m) => {
    kids.push(svgEl('line', { x1: pad.l, x2: W - pad.r, y1: y(m.v), y2: y(m.v), class: 'mc-grid' }));
    const t = svgEl('text', { x: 2, y: y(m.v) + 4, class: 'mc-axis' });
    t.textContent = m.e;
    kids.push(t);
  });
  // Línea por tramos (las semanas sin ánimo cortan la línea).
  let seg = [];
  const flush = () => {
    if (seg.length > 1) kids.push(svgEl('polyline', { points: seg.join(' '), class: 'mc-line' }));
    seg = [];
  };
  weeks.forEach((w, i) => {
    if (w.avg === null) return flush();
    seg.push(`${x(i).toFixed(1)},${y(w.avg).toFixed(1)}`);
  });
  flush();
  weeks.forEach((w, i) => {
    if (w.avg === null) return;
    const c = svgEl('circle', { cx: x(i), cy: y(w.avg), r: 4, fill: MOOD_COLORS[Math.round(w.avg) - 1], class: 'mc-dot' });
    const tip = svgEl('title');
    tip.textContent = `Semana del ${w.from.toLocaleDateString('es', { day: 'numeric', month: 'short' })}: ${w.avg.toFixed(1)} (${plural(w.n, 'día', 'días')})`;
    c.append(tip);
    kids.push(c);
  });
  [0, weeks.length - 1].forEach((i) => {
    const t = svgEl('text', { x: x(i), y: H - 4, class: 'mc-axis', 'text-anchor': i ? 'end' : 'start' });
    t.textContent = i ? 'esta semana' : weeks[0].from.toLocaleDateString('es', { day: 'numeric', month: 'short' });
    kids.push(t);
  });
  return svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'mood-chart', role: 'img', 'aria-label': 'Ánimo medio por semana, últimas 12 semanas' }, kids);
}

// Mapa del año: una casilla por día (columnas = semanas). Color = ánimo; claro = escribiste sin ánimo.
function yearHeatmap(byDate) {
  const end = new Date();
  const start = addDays(weekStart(end), -7 * 52);
  const cell = 11;
  const gap = 2;
  const kids = [];
  for (let d = new Date(start), i = 0; d <= end; d = addDays(d, 1), i++) {
    const key = dateKey(d);
    const day = byDate.get(key);
    const col = Math.floor(i / 7);
    const row = i % 7;
    const mood = day?.dayMood?.v;
    const r = svgEl('rect', {
      x: col * (cell + gap), y: row * (cell + gap), width: cell, height: cell, rx: 2,
      class: `hm-cell${mood ? ' has-mood' : day?.wrote ? ' on' : ''}`,
      ...(mood ? { style: `fill:${MOOD_COLORS[mood - 1]}` } : {}),
      'data-date': key,
    });
    const tip = svgEl('title');
    tip.textContent = `${new Date(`${key}T12:00:00`).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}${mood ? ` · ${MOODS[mood - 1].e} ${MOODS[mood - 1].l}` : day?.wrote ? ' · escribiste' : ''}`;
    r.append(tip);
    kids.push(r);
  }
  const cols = Math.ceil(kids.length / 7);
  const svg = svgEl('svg', { viewBox: `0 0 ${cols * (cell + gap)} ${7 * (cell + gap)}`, class: 'year-heatmap', role: 'img', 'aria-label': 'Días escritos y ánimo del último año' }, kids);
  svg.addEventListener('click', (e) => {
    const key = e.target.closest?.('rect')?.dataset.date;
    const note = key && typeof djFind === 'function' && djFind(key);
    if (note) openNote(note);
  });
  return svg;
}

function renderJournalInsights(days = journalTimeline()) {
  const box = $('#journal-insights');
  if (!box) return;
  const byDate = new Map(days.map((d) => [d.date, d]));
  const wrote = new Set(days.filter((d) => d.wrote || d.dayMood).map((d) => d.date));
  if (!wrote.size) {
    box.hidden = true;
    return box.replaceChildren();
  }
  box.hidden = false;
  const now = journalStreak(wrote);
  const best = journalBestStreak(wrote);
  const year = [...wrote].filter((d) => d >= dateKey(addDays(new Date(), -364))).length;
  const weeks = moodWeeks(byDate);
  const hasMood = weeks.some((w) => w.avg !== null);
  const stat = (n, label) => el('div', { className: 'ji-stat' }, [el('strong', {}, String(n)), el('span', { className: 'muted' }, label)]);
  const legend = el('div', { className: 'hm-legend muted' }, ['Menos ánimo', ...MOOD_COLORS.map((c) => el('i', { style: `background:${c}` })), 'Más ánimo']);
  box.replaceChildren(
    el('summary', {}, '📈 Ánimo y constancia'),
    el('div', { className: 'ji-stats' }, [stat(now, now === 1 ? 'día de racha' : 'días de racha'), stat(best, 'mejor racha'), stat(year, 'días escritos en el último año')]),
    hasMood ? el('div', { className: 'ji-block' }, [el('h4', {}, 'Ánimo por semana'), moodChart(weeks)]) : el('p', { className: 'muted' }, 'Marca cómo te sientes al escribir para ver aquí la evolución de tu ánimo.'),
    el('div', { className: 'ji-block' }, [el('h4', {}, 'Tu año'), el('div', { className: 'hm-wrap' }, yearHeatmap(byDate)), legend])
  );
}

// ---------- 3. Hace un año hoy ----------
// Lo escrito el mismo día y mes de años anteriores (diario de la nota diaria o entradas antiguas).
function onThisDay(key = dateKey()) {
  const md = key.slice(5);
  return journalTimeline()
    .filter((d) => d.date.slice(5) === md && d.date < key && (d.section || d.preview || d.entries.length))
    .map((d) => {
      const legacy = d.entries[0];
      const raw = (d.section || '').replace(/^###.*$/gm, '').trim() || d.preview || legacy?.text || (legacy?.sections || []).filter((s) => s.a).map((s) => `${s.q} ${s.a}`).join(' ') || '';
      const text = raw.replace(/[#>*_`]/g, '').replace(/\s+/g, ' ').trim();
      return { date: d.date, years: Number(key.slice(0, 4)) - Number(d.date.slice(0, 4)), mood: d.dayMood, text: text.length > 220 ? `${text.slice(0, 220)}…` : text, note: d.note || null };
    })
    .filter((x) => x.text);
}

function onThisDayCard(list) {
  return list.map((x) => {
    const open = el('button', { className: 'link' }, 'Abrir');
    open.addEventListener('click', () => (x.note ? openNote(x.note) : showView('journal')));
    return el('div', { className: 'otd-item' }, [
      el('div', { className: 'otd-head' }, [el('strong', {}, x.years === 1 ? 'Hace un año' : `Hace ${x.years} años`), x.mood ? el('span', { title: x.mood.l }, x.mood.e) : '', x.note ? open : '']),
      el('p', { className: 'otd-text' }, x.text),
    ]);
  });
}

function renderOnThisDay() {
  const list = onThisDay();
  for (const id of ['#journal-onthisday', '#today-onthisday']) {
    const box = $(id);
    if (!box) continue;
    const off = id === '#today-onthisday' && state.settings.onThisDayToday === false;
    box.hidden = !list.length || off;
    box.replaceChildren(...(box.hidden ? [] : [el('h3', { className: 'otd-title' }, '🕰️ Tal día como hoy'), ...onThisDayCard(list)]));
  }
}

// ---------- 9. Plantillas para pensar ----------
const THINK_TEMPLATES = [
  ['⚖️', 'Pros y contras', 'pros contras ventajas desventajas decidir', '## ⚖️ Pros y contras: ‸\n\n| ✅ A favor | ❌ En contra |\n| --- | --- |\n|  |  |\n|  |  |\n|  |  |\n\n**Conclusión:** '],
  ['❓', '5 porqués', 'cinco porques causa raiz problema', '## ❓ 5 porqués\n\n**Problema:** ‸\n\n1. ¿Por qué? \n2. ¿Por qué? \n3. ¿Por qué? \n4. ¿Por qué? \n5. ¿Por qué? \n\n**Causa raíz:** \n**Qué haré:** '],
  ['🧭', 'FODA / DAFO', 'foda dafo swot fortalezas debilidades oportunidades amenazas', '## 🧭 FODA: ‸\n\n| 💪 Fortalezas (interno) | 🩹 Debilidades (interno) |\n| --- | --- |\n|  |  |\n\n| 🌱 Oportunidades (externo) | ⚠️ Amenazas (externo) |\n| --- | --- |\n|  |  |\n\n**Estrategia:** '],
  ['🧮', 'Matriz de decisión', 'matriz decision criterios ponderar opciones comparar', '## 🧮 Matriz de decisión: ‸\n\nPuntúa cada opción de 1 a 5; el peso dice cuánto importa cada criterio.\n\n| Criterio | Peso | Opción A | Opción B | Opción C |\n| --- | --- | --- | --- | --- |\n| Coste |  |  |  |  |\n| Tiempo |  |  |  |  |\n| Impacto |  |  |  |  |\n| Me ilusiona |  |  |  |  |\n| **Total** |  |  |  |  |\n\n**Decisión:** '],
  ['🪦', 'Pre-mortem', 'premortem fracaso riesgos proyecto anticipar', '## 🪦 Pre-mortem: ‸\n\n*Imagina que ha pasado un año y salió mal. ¿Por qué fracasó?*\n\n- \n- \n- \n\n**Cómo lo evito:**\n- [ ] '],
  ['🧱', 'Primeros principios', 'primeros principios fundamentos suposiciones elon', '## 🧱 Primeros principios: ‸\n\n**Lo que se suele creer:** \n\n**Suposiciones que hay detrás:**\n- \n\n**Lo que sé que es verdad (los hechos básicos):**\n- \n\n**Una solución desde cero:** '],
  ['🎩', 'Seis sombreros', 'seis sombreros de bono perspectivas', '## 🎩 Seis sombreros: ‸\n\n- ⚪ **Hechos:** ¿qué datos tengo? \n- 🔴 **Emociones:** ¿qué siento? \n- ⚫ **Riesgos:** ¿qué puede fallar? \n- 🟡 **Beneficios:** ¿qué puede salir bien? \n- 🟢 **Creatividad:** ¿qué alternativas hay? \n- 🔵 **Proceso:** ¿qué decido y cuál es el siguiente paso? '],
  ['🗂️', 'Matriz de Eisenhower', 'eisenhower urgente importante prioridades', '## 🗂️ Matriz de Eisenhower ‸\n\n| | Urgente | No urgente |\n| --- | --- | --- |\n| **Importante** | 🔥 Hacer ya:  | 📅 Planificar:  |\n| **No importante** | 🤝 Delegar:  | 🗑️ Eliminar:  |'],
  ['🐟', 'Causas (Ishikawa)', 'ishikawa espina pescado causas efecto', '## 🐟 Causas de: ‸\n\n- **Personas:** \n- **Métodos:** \n- **Herramientas:** \n- **Entorno:** \n- **Materiales / recursos:** \n- **Medición / información:** \n\n**Causa más probable:** '],
  ['⏳', 'Regla 10/10/10', '10 10 10 diez minutos meses anos decision', '## ⏳ 10/10/10: ‸\n\n- ¿Cómo me sentiré con esta decisión dentro de **10 minutos**? \n- ¿Y dentro de **10 meses**? \n- ¿Y dentro de **10 años**? \n\n**Decisión:** '],
  ['🙃', 'Inversión', 'inversion munger al reves evitar fracaso', '## 🙃 Inversión: ‸\n\n*En vez de «¿cómo lo consigo?», pregúntate «¿qué haría seguro que fracasara?» y evítalo.*\n\n**Lo que garantizaría el fracaso:**\n- \n- \n\n**Por tanto, haré lo contrario:**\n- [ ] '],
  ['🛡️', 'Abogado del diablo', 'abogado diablo steelman argumento contrario sesgo', '## 🛡️ Abogado del diablo: ‸\n\n**Lo que pienso:** \n\n**El mejor argumento en contra** (como lo defendería alguien inteligente):\n\n**¿Qué tendría que pasar para que cambiara de opinión?** '],
  ['🧒', 'Técnica Feynman', 'feynman explicar simple aprender entender', '## 🧒 Feynman: ‸\n\n**Explícalo como a un niño de 12 años:**\n\n**Dónde me trabé (lo que aún no entiendo):**\n- \n\n**Versión simplificada con un ejemplo:** '],
  ['🎯', 'Objetivo SMART', 'smart objetivo meta especifico medible', '## 🎯 Objetivo: ‸\n\n- **Específico:** ¿qué exactamente? \n- **Medible:** ¿cómo sabré que lo logré? \n- **Alcanzable:** ¿con qué recursos? \n- **Relevante:** ¿por qué me importa? \n- **Con fecha:** 📅 \n\n**Primer paso:**\n- [ ] '],
  ['❤️', 'Mapa de empatía', 'empatia persona cliente usuario entender', '## ❤️ Mapa de empatía: ‸\n\n- **Qué piensa y siente:** \n- **Qué ve:** \n- **Qué oye:** \n- **Qué dice y hace:** \n- **Qué le duele (frustraciones):** \n- **Qué gana (deseos):** '],
  ['🔁', 'Retrospectiva', 'retrospectiva retro balance que fue bien mal mejorar', '## 🔁 Retrospectiva: ‸\n\n- ✅ **Qué fue bien:** \n- ❌ **Qué fue mal:** \n- 💡 **Qué aprendí:** \n- 🔧 **Qué cambiaré:** \n- 🙏 **A quién agradezco:** '],
  ['🛞', 'Rueda de la vida', 'rueda vida areas equilibrio balance puntuar', '## 🛞 Rueda de la vida ‸\n\nPuntúa del 1 al 10 cómo estás en cada área.\n\n| Área | Hoy | Quiero | Un paso |\n| --- | --- | --- | --- |\n| Salud |  |  |  |\n| Familia y pareja |  |  |  |\n| Amistades |  |  |  |\n| Trabajo / carrera |  |  |  |\n| Dinero |  |  |  |\n| Crecimiento personal |  |  |  |\n| Ocio y diversión |  |  |  |\n| Entorno / hogar |  |  |  |'],
  ['♟️', 'Segundo orden', 'segundo orden consecuencias y despues', '## ♟️ Consecuencias de: ‸\n\n- **Primer orden (lo inmediato):** \n- **Segundo orden (¿y después qué?):** \n- **Tercer orden (¿y después?):** \n\n**¿Sigue valiendo la pena?** '],
  ['🎛️', 'Círculo de control', 'control influencia estoico preocupaciones', '## 🎛️ Círculo de control: ‸\n\n- **Lo que controlo:** \n- **Lo que puedo influir:** \n- **Lo que no depende de mí (lo suelto):** \n\n**Me centro en:**\n- [ ] '],
  ['📊', 'Esfuerzo / impacto', 'esfuerzo impacto priorizar matriz rapido', '## 📊 Esfuerzo / impacto ‸\n\n| | Poco esfuerzo | Mucho esfuerzo |\n| --- | --- | --- |\n| **Mucho impacto** | ⭐ Hacer primero:  | 🏔️ Planificar:  |\n| **Poco impacto** | 🍬 Si sobra tiempo:  | 🚫 Evitar:  |'],
  ['🔬', 'Experimento personal', 'experimento hipotesis probar metodo cientifico', '## 🔬 Experimento: ‸\n\n- **Hipótesis:** si hago … entonces … \n- **Cómo lo pruebo:** \n- **Durante:** 📅 \n- **Cómo lo mido:** \n\n**Resultado y lo que aprendí:** '],
  ['💸', 'Coste de oportunidad', 'coste costo oportunidad renunciar alternativa', '## 💸 Coste de oportunidad: ‸\n\n**Si digo que sí, dejo de hacer:**\n- \n\n**La mejor alternativa a la que renuncio:** \n\n**¿Vale más que eso?** '],
];
const THINK_GROUP = '🧠 Plantillas para pensar';
SLASH_ITEMS.push(...THINK_TEMPLATES.map(([icon, label, keys, text]) => ({ group: THINK_GROUP, icon, label, keys: `plantilla pensar ${keys}`, text })));

// Una nota nueva con la plantilla (en la carpeta «Pensar»).
function openThinkTools() {
  pickFrom('Herramientas para pensar…', THINK_TEMPLATES.map(([icon, label, keys, text]) => ({
    label: `${icon} ${label}`,
    keys,
    action: () => {
      if (!state.folders.includes('Pensar')) state.folders.push('Pensar');
      const note = createNote({ folder: 'Pensar', title: `${label} ${dateKey()}`, body: text.replace('‸', ''), open: true, edit: true });
      // El cursor donde marca la plantilla.
      const at = text.indexOf('‸');
      const ta = $('#note-editor');
      if (at >= 0 && ta && ta.dataset.note === note.id) {
        ta.focus();
        ta.setSelectionRange(at, at);
      }
    },
  })));
}

const thinkRib = el('button', { id: 'rib-think', className: 'rib', title: 'Herramientas para pensar: pros y contras, 5 porqués, FODA…', ariaLabel: 'Herramientas para pensar', role: 'menuitem' }, [el('span', { className: 'ico', ariaHidden: 'true' }, '🧠'), el('span', { className: 'rib-label' }, 'Herramientas para pensar…')]);
thinkRib.addEventListener('click', openThinkTools);
$('[data-group="write"] .tb-menu')?.append(thinkRib);

COMMANDS_EXTRA.push(() => [
  { label: 'Herramientas para pensar… (plantillas)', action: openThinkTools },
  { label: 'Diario: pregunta del día', action: () => { showView('journal'); journalKind = 'question'; renderComposer(); $('#journal-fields textarea')?.focus(); } },
  state.settings.onThisDayToday === false
    ? { label: 'Mostrar «Tal día como hoy» en Hoy', action: () => { state.settings.onThisDayToday = true; save(); renderOnThisDay(); } }
    : { label: 'Ocultar «Tal día como hoy» en Hoy', action: () => { state.settings.onThisDayToday = false; save(); renderOnThisDay(); } },
]);

RENDER_HOOKS.push(renderOnThisDay);
renderOnThisDay();

// En Hoy, el aviso «Aún no has escrito hoy» propone la pregunta del día y abre el Diario con ella.
function renderJournalNudgeQuestion() {
  const span = $('#today-journal > span:last-child');
  if (!span) return;
  span.replaceChildren(el('strong', {}, 'Aún no has escrito hoy.'), ` Pregunta de hoy: «${dayQuestion()}»`);
}
$('#today-journal')?.addEventListener('click', () => {
  journalKind = 'question';
  renderComposer();
  $('#journal-fields textarea')?.focus();
});
RENDER_HOOKS.push(renderJournalNudgeQuestion);
renderJournalNudgeQuestion();
