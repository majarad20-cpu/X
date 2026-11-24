'use strict';

// ---------- Kataleya: la asistente de Enfoque ----------
// Un chat con Claude siempre a mano (botón con su avatar abajo a la derecha, o Alt+K) que se abre en un
// panel lateral sin salir de lo que estás haciendo. Sabe qué nota o vista tienes abierta (y el texto
// seleccionado), lee su memoria (la nota «Sistema/Memoria de Kataleya», que se puede editar e importar
// desde Claude) y responde según el modo: General, 🧾 Contador (norma vigente, trazabilidad, fuente,
// alertas y contradicciones), 🏛️ Estoico o el de una especialidad libre (su perfil como contexto).
// Herramientas: lee notas, tareas, diario, el Radar normativo, las contradicciones, las alertas, el
// calendario tributario y la cola de vigencia; abre vistas; y **propone** acciones —crear tareas, notas,
// alertas, tableros, bases, diagramas, lienzos y dibujos, cambiar propiedades, marcar notas revisadas,
// agendar en Google Calendar y recordar cosas— que solo se hacen cuando la persona pulsa «Aprobar».
// Las notas con contraseña no salen del dispositivo. La conversación se puede guardar como nota.

const KATA_MEMORY_PATH = 'Sistema/Memoria de Kataleya';
const KATA_AVATAR = `<svg class="kata-avatar" viewBox="0 0 64 64" aria-hidden="true"><defs><clipPath id="kata-clip"><circle cx="32" cy="32" r="32"/></clipPath></defs><g clip-path="url(#kata-clip)"><circle cx="32" cy="32" r="32" fill="#b07cd6"/><path d="M13 40c0-16 8-27 19-27s19 11 19 27v26H13z" fill="#3b2418"/><path d="M17 64c2-9 8-13 15-13s13 4 15 13z" fill="#4f46e5"/><rect x="28" y="44" width="8" height="8" rx="3" fill="#ecbf9b"/><ellipse cx="32" cy="34" rx="12" ry="13.5" fill="#f4cda9"/><path d="M19.5 32c1.5-10 8-15.5 12.5-15.5S44 21 45 31c-6-1.5-10.5-6-12.5-10.5C29.5 26.5 25 30 19.5 32z" fill="#3b2418"/><circle cx="27" cy="35" r="1.7" fill="#2b1a12"/><circle cx="37" cy="35" r="1.7" fill="#2b1a12"/><circle cx="24.5" cy="39.5" r="2.2" fill="#f19a9a" opacity=".55"/><circle cx="39.5" cy="39.5" r="2.2" fill="#f19a9a" opacity=".55"/><path d="M28.5 41.5q3.5 3.2 7 0" stroke="#a0524a" stroke-width="1.5" fill="none" stroke-linecap="round"/><g transform="translate(46 21)"><ellipse rx="4.2" ry="2.4" transform="rotate(-30)" fill="#f7e8ff"/><ellipse rx="4.2" ry="2.4" transform="rotate(30)" fill="#f7e8ff"/><ellipse rx="2.4" ry="4.2" fill="#e9c6ff"/><ellipse cy="1.8" rx="2.2" ry="2.6" fill="#a23fd1"/><circle r="1" fill="#ffd34d"/></g></g></svg>`;

const kata = { turns: [], busy: false, ctl: null, open: false, pending: new Map(), seq: 0, importing: false };
const kataCfg = () => {
  if (!state.settings.kata || typeof state.settings.kata !== 'object') state.settings.kata = {};
  return state.settings.kata;
};

// ---------- Fuentes: bóveda (siempre), internet y Drive ----------
// Internet usa el conector de búsqueda web de la cuenta (Parallel Search) y Drive el de Google Drive,
// los dos con las credenciales de quien usa la app. «auto»: Kataleya decide según las reglas (primero la
// bóveda); «off»: esa fuente no se le ofrece.
const KATA_WEB = 'Parallel Search';
const KATA_DRIVE = 'Google Drive';
const KATA_OFFICIAL = ['bcn.cl', 'leychile.cl', 'diariooficial.interior.gob.cl', 'sii.cl', 'uaf.cl', 'cmfchile.cl', 'dt.gob.cl', 'spensiones.cl', 'suseso.cl', 'tgr.cl', 'previred.com', 'hacienda.cl', 'bcentral.cl', 'ine.gob.cl', 'contach.cl', 'ifrs.org', 'iaasb.org', 'theiia.org', 'camara.cl', 'senado.cl', 'gob.cl'];
const kataOfficial = (url) => {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    return KATA_OFFICIAL.some((d) => h === d || h.endsWith(`.${d}`));
  } catch {
    return false;
  }
};
const kataSource = (k) => (['auto', 'off'].includes(kataCfg()[k]) ? kataCfg()[k] : 'auto');
const kataSearchId = (globalThis.crypto?.randomUUID?.() || `${Date.now()}${Math.random()}`).replace(/-/g, '');
let kataMcpNs;
async function kataMcp(server, tool, input) {
  if (kataMcpNs === undefined) kataMcpNs = (await window.claude?.use?.('mcp').catch(() => null)) || null;
  if (!kataMcpNs) throw new Error('Esta fuente solo funciona al abrir Enfoque desde Claude.');
  try {
    const r = await kataMcpNs.callTool(server, tool, input);
    return r?.payload ?? r;
  } catch (e) {
    const fix = { server_not_connected: `agrega «${server}» en claude.ai › Configuración › Conectores`, needs_reauth: `vuelve a conectar «${server}» en claude.ai › Configuración › Conectores`, not_in_manifest: `permite «${server}» en los permisos de esta página`, approval_required: 'aprueba el aviso de permiso', blocked_by_policy: 'tu organización no lo permite' }[e?.code];
    throw new Error(fix ? `No pude usar ${server}: ${fix}.` : `No pude usar ${server} (${e?.code || 'error'}): ${e?.message || ''}`.trim());
  }
}
const kataMark = (k, ref) => {
  const t = kata.turns.at(-1);
  if (!t || t.role !== 'assistant') return;
  (t.used ||= []).includes(k) || t.used.push(k);
  if (ref) (t.refs ||= []).some((r) => r.url === ref.url) || t.refs.push(ref);
};

// ---------- Memoria ----------
const KATA_MEMORY_SEED = `---
tipo: sistema
area: sistema
estado: en desarrollo
---
# Memoria de Kataleya

**Idea central:** lo que Kataleya recuerda de ti. La lee al empezar cada conversación. Puedes editarla cuando quieras; ella solo agrega algo cuando apruebas «¿Lo recuerdo?».

## Sobre mí
- Contador auditor en Chile. Uso Enfoque y la bóveda «Cerebro Digital X» como base única de conocimiento profesional: asesoría a clientes, consultas técnicas, estudio, cursos y contenidos.
- Practico el estoicismo (notas personales en su carpeta).

## Reglas de trabajo
- Lo que importa es que la bóveda no tenga errores en leyes y normas.
- Trazabilidad: indicar el historial de cada norma (origen → modificaciones → lo que rige hoy). Precaución con los cambios legales: una ley puede estar bien en su origen y haber sido cambiada después.
- Lo que no cuadre queda como alerta (⏰ Alertas Normativas), nunca como afirmación.
- Citar siempre la fuente y la fecha de vigencia. Si la bóveda no lo cubre, decirlo; no inventar.
- Los apuntes tienen menor rango: sus datos normativos son historia hasta verificarlos.

## Preferencias
- Responder en español de Chile, breve y concreto.
- Para cambios en la bóveda: primero un informe con 🆕/➕/🔄/✅/⛔/⚠️ y la pregunta «¿Apruebas todo, algunos números o ninguno?»; aplicar solo lo aprobado.

## Límites
- Los datos de clientes son confidenciales; en los ejemplos usar «Comercial Cachapoal Ltda.».
- No tocar notas personales (estoicismo, «MIS…», proyectos personales, carpeta PERSONAL) sin aprobación; nunca alterar mis ensayos.
- No abrir ni copiar claves ni credenciales.

## Hechos y decisiones
- 2026-11-24: Finanzas quedó oculta en Enfoque (sus datos se conservan).
- 2026-11-24: La Fase 3 de la especialidad Contador (clientes, calculadoras e informe) quedó pendiente en la hoja de ruta.
`;

const kataMemoryNote = () => findNoteByName(KATA_MEMORY_PATH) || null;
function kataEnsureMemory() {
  let note = kataMemoryNote();
  if (!note) {
    if (!state.folders.includes('Sistema')) state.folders.push('Sistema');
    note = createNote({ folder: 'Sistema', title: baseName(KATA_MEMORY_PATH), body: KATA_MEMORY_SEED, open: false, edit: false, log: false });
  }
  return note;
}
function kataMemoryText() {
  const n = kataMemoryNote();
  if (!n || n.enc) return KATA_MEMORY_SEED.split('\n').slice(6).join('\n');
  return gvBodyText(n).slice(0, 7000);
}
// Añade una línea bajo una sección de la memoria (la crea si no existe).
function kataRemember(text, section = 'Hechos y decisiones') {
  const note = kataEnsureMemory();
  const lines = note.body.split('\n');
  let h = lines.findIndex((l) => new RegExp(`^##\\s+${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i').test(l));
  if (h < 0) {
    lines.push('', `## ${section}`);
    h = lines.length - 1;
  }
  let i = h + 1;
  while (i < lines.length && !/^##\s/.test(lines[i])) i++;
  while (i > h + 1 && !lines[i - 1].trim()) i--;
  lines.splice(i, 0, `- ${dateKey()}: ${text.replace(/\n+/g, ' ').trim()}`);
  note.body = lines.join('\n');
  note.updatedAt = Date.now();
  dataRev++;
  save();
  if (typeof snapshotNote === 'function') snapshotNote(note);
}

// ---------- Modos ----------
function kataModes() {
  const list = [{ id: 'general', label: '✨ General' }];
  if (typeof specList === 'function') specList().filter((s) => specOn(s.id)).forEach((s) => list.push({ id: s.id, label: `${s.icon} ${s.name}` }));
  return list;
}
const kataMode = () => (kataModes().some((m) => m.id === kataCfg().mode) ? kataCfg().mode : proOn() ? 'contador' : 'general');

function kataModeRules(mode) {
  if (mode === 'contador') {
    return `Modo Contador (Chile):
- Para cualquier pregunta normativa (leyes, DL, circulares, resoluciones, oficios, NIC/NIIF/NIA): busca en las notas y usa radar_norma. Responde con lo que **rige hoy**, su **trazabilidad** (origen → cambios → vigente), la **fuente** y la **fecha de vigencia** si la nota la trae.
- Si hay una alerta abierta o una contradicción sobre el tema (usa alertas_abiertas y contradicciones), avísalo con ⚠️.
- Si la bóveda no lo cubre o los datos no cuadran, dilo y sugiere dejarlo como alerta. Nunca inventes tasas, plazos ni artículos.
- Los datos de clientes son confidenciales: en ejemplos usa «Comercial Cachapoal Ltda.».`;
  }
  if (mode === 'estoicismo') {
    const mx = typeof stoaMaxim === 'function' ? stoaMaxim() : null;
    return `Modo Estoico: acompaña la práctica con calma y sin sermones. Usa las citas y notas de estoicismo de la persona (busca antes), propone ejercicios concretos (premeditatio malorum, dicotomía del control, examen de la noche, memento mori) y cita la fuente clásica (autor y obra). ${mx ? `Máxima de hoy: «${mx.text}» (${mx.ref || ''}).` : ''}`;
  }
  const spec = typeof specById === 'function' ? specById(mode) : null;
  if (spec) {
    const n = specNote(spec);
    return `Modo ${spec.name}: la persona trabaja la especialidad «${spec.name}». Su perfil (origen, fuentes y calendario):\n${n ? gvBodyText(n).slice(0, 2000) : '(sin perfil todavía)'}`;
  }
  return 'Modo General: ayuda con las notas, tareas, proyectos y la organización del día.';
}

// ---------- Contexto de lo que se ve ----------
function kataSelection() {
  const ta = $('#note-editor');
  if (ta && document.activeElement === ta && ta.selectionEnd > ta.selectionStart) return ta.value.slice(ta.selectionStart, ta.selectionEnd);
  const s = String(window.getSelection?.() || '').trim();
  return s && !$('#kata-panel')?.contains(window.getSelection().anchorNode) ? s : '';
}
// Lo que Kataleya «ve», en corto, para la línea de arriba del chat.
function kataSeeing() {
  const tab = activeTab();
  if (tab?.type === 'note') return noteById(tab.id) ? `📄 ${baseName(noteById(tab.id).path)}${kataSelection() ? ' · con texto seleccionado' : ''}` : '';
  if (tab?.type === 'view') return `🧭 ${VIEW_TITLES[tab.view] || tab.view}`;
  if (tab?.type === 'graph') return '🕸 Grafo';
  return '';
}

function kataContext() {
  const tab = activeTab();
  const sel = kataSelection().slice(0, 3000);
  if (tab?.type === 'note') {
    const n = noteById(tab.id);
    if (!n) return '';
    if (n.enc) return `La persona tiene abierta una nota protegida con contraseña («${baseName(n.path)}»): su texto no se puede leer.`;
    return `La persona tiene abierta la nota [[${baseName(n.path)}]] (${n.path}).${sel ? `\nTexto seleccionado:\n"""\n${sel}\n"""` : ''}\nInicio de la nota:\n"""\n${n.body.slice(0, 3500)}\n"""`;
  }
  if (tab?.type === 'view') return `La persona está en la vista «${VIEW_TITLES[tab.view] || tab.view}» de Enfoque.${sel ? `\nTexto seleccionado:\n"""\n${sel}\n"""` : ''}`;
  if (tab?.type === 'graph') return 'La persona está en el grafo de notas.';
  return '';
}

// Dónde buscar: siempre primero la bóveda; Drive e internet solo cuando corresponde.
function kataWhereRules() {
  const web = kataSource('web') !== 'off';
  const drive = kataSource('drive') !== 'off';
  return `- Dónde buscar, en este orden:
  1. 🗂 **Bóveda** (tus notas): siempre primero.
  ${drive ? '2. 📁 **Drive**: si la persona habla de un archivo o documento (PDF, Word, planilla) que no es una nota, o la bóveda no lo tiene.' : '2. (Drive no está disponible ahora.)'}
  ${web ? `3. 🌐 **Internet**: solo si la bóveda no lo cubre, si el dato puede haber cambiado (tasas, plazos, valores como UF o UTM, normas o circulares recientes, alertas abiertas) o si la persona lo pide. Prefiere fuentes oficiales: ${KATA_OFFICIAL.slice(0, 12).join(', ')}…; blogs y prensa solo de apoyo.` : '3. (Internet está apagado: no busques afuera; si hace falta, dilo.)'}
- Cuando uses más de una fuente, sepáralas en la respuesta: «🗂 En tu bóveda: …» y «🌐 En internet (fuente, fecha): …» (y «📁 En tu Drive: …»).
- Si lo de internet contradice o actualiza la bóveda, dilo con claridad y propone **agregar_alerta** (o guardar la fuente en la carpeta «Bandeja IA» con crear_nota, con el enlace, la fecha y el extracto). Nunca cambies una nota con datos de internet sin que la persona lo apruebe.
- Cita cada dato de internet con su enlace y fecha de publicación.`;
}

function kataRules() {
  return `Eres **Kataleya**, la asistente de Enfoque, la app de notas y productividad de esta persona. Hablas en español de Chile, cercana y profesional, breve y concreta. Te presentas como Kataleya si te preguntan.

Hoy es ${new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} (${dateKey()}).

Reglas:
- Busca en las notas antes de responder. Cita cada dato con [[Título exacto de la nota]]. Si no encuentras algo, dilo; no inventes.
${kataWhereRules()}
- Para crear o cambiar cosas usa las herramientas de acción: **no hacen nada solas**, dejan una propuesta que la persona aprueba con un botón. Di qué propusiste y nunca digas que ya está hecho.
- Para mostrar algo, usa abrir_vista (no necesita aprobación).
- Si la persona te cuenta algo que valga la pena recordar (una preferencia, una regla, una decisión), propón guardarlo con recordar.
- Respeta la memoria: sus reglas y límites mandan.
- Markdown sencillo: párrafos cortos y listas.

${kataModeRules(kataMode())}

Tu memoria (nota [[${baseName(KATA_MEMORY_PATH)}]]):
"""
${kataMemoryText()}
"""

${kataContext()}`;
}

// ---------- Herramientas ----------
const kataNote = (t) => {
  const n = findNoteByName(String(t || '')) || gvLive().find((x) => fold(baseName(x.path)) === fold(String(t || '')));
  if (!n) throw new Error(`No existe una nota llamada «${t}»`);
  if (n.enc) throw new Error('Esa nota está protegida con contraseña');
  return n;
};
const kataProgress = (t) => {
  const p = $('#kata-progress');
  if (p) p.textContent = t;
};
const kataSrc = (o) => {
  if (!o || !o.tipo) return { t: 'all' };
  const v = String(o.valor || '');
  if (o.tipo === 'carpeta') return { t: 'folder', v };
  if (o.tipo === 'etiqueta') return { t: 'tag', v: v.replace(/^#/, '').toLowerCase() };
  if (o.tipo === 'moc') {
    const n = findNoteByName(v) || gvMocs().find((m) => fold(baseName(m.path)).includes(fold(v)));
    return n ? { t: 'moc', v: n.id } : { t: 'all' };
  }
  return { t: 'all' };
};
const KATA_SRC_SCHEMA = { type: 'object', description: 'Origen de las notas: {tipo: "carpeta"|"etiqueta"|"moc"|"todo", valor}', properties: { tipo: { type: 'string', enum: ['carpeta', 'etiqueta', 'moc', 'todo'] }, valor: { type: 'string' } } };

// Deja una acción pendiente de aprobación y devuelve su resumen a Claude.
function kataPropose(label, detail, run) {
  const id = `a${++kata.seq}`;
  const turn = kata.turns.at(-1);
  kata.pending.set(id, { label, detail, run, status: 'pending', result: null });
  if (turn) (turn.actions ||= []).push(id);
  kataRender();
  return { propuesta: id, estado: 'pendiente de aprobación por la persona', resumen: `${label}${detail ? ` · ${detail}` : ''}` };
}

function kataTools() {
  const read = [
    { name: 'buscar_notas', description: 'Busca en las notas por palabras clave. Devuelve hasta 8 notas con título, ruta, fecha y las líneas que coinciden.', inputSchema: { type: 'object', properties: { consulta: { type: 'string' } }, required: ['consulta'] }, execute: ({ consulta }) => (kataProgress(`Buscando «${String(consulta).slice(0, 40)}»…`), searchNotesForAI(String(consulta)).filter((x) => !findNoteByName(x.ruta)?.enc)) },
    { name: 'leer_nota', description: 'Texto completo (hasta 9.000 caracteres) de una nota por su título o ruta.', inputSchema: { type: 'object', properties: { titulo: { type: 'string' } }, required: ['titulo'] }, execute: ({ titulo }) => { const n = kataNote(titulo); kataProgress(`Leyendo [[${baseName(n.path)}]]…`); return { titulo: baseName(n.path), ruta: n.path, texto: n.body.slice(0, 9000) }; } },
    { name: 'buscar_tareas', description: 'Tareas (de la lista y de las casillas de las notas). estado: pendientes (por defecto), hechas o todas.', inputSchema: { type: 'object', properties: { consulta: { type: 'string' }, estado: { type: 'string', enum: ['pendientes', 'hechas', 'todas'] } } }, execute: (i) => (kataProgress('Revisando tus tareas…'), tasksForAI({ consulta: String(i.consulta || ''), estado: String(i.estado || 'pendientes') })) },
    { name: 'buscar_diario', description: 'Entradas del diario. consulta, desde y hasta (AAAA-MM-DD) opcionales.', inputSchema: { type: 'object', properties: { consulta: { type: 'string' }, desde: { type: 'string' }, hasta: { type: 'string' } } }, execute: (i) => (kataProgress('Leyendo tu diario…'), journalForAI({ consulta: String(i.consulta || ''), desde: String(i.desde || ''), hasta: String(i.hasta || '') })) },
  ];
  const pro = typeof proIndex === 'function' ? [
    { name: 'radar_norma', description: 'Radar normativo: para una norma (p. ej. «Ley 21.713», «DL 824», «Circular UAF 62», «LIR»), las notas que la citan, sus artículos, señales (derogada, modificada, postergada), fechas de vigencia futuras y alertas abiertas.', inputSchema: { type: 'object', properties: { norma: { type: 'string' } }, required: ['norma'] }, execute: ({ norma }) => {
      kataProgress(`Consultando el Radar: ${norma}…`);
      const keys = proNormsIn(String(norma), proProfile()).map((x) => x.key);
      const { norms } = proIndex();
      const q = fold(String(norma));
      const hits = [...norms.values()].filter((e) => keys.includes(e.key) || fold(e.key).includes(q) || (e.name && fold(e.name).includes(q))).slice(0, 4);
      return hits.map((e) => ({ norma: e.key, nombre: e.name || null, notas: [...e.notes.keys()].map((id) => baseName(noteById(id)?.path || '')).slice(0, 15), articulos: [...e.arts.keys()].slice(0, 12), señales: Object.fromEntries([...e.signals].map(([k, v]) => [k, v.slice(0, 4).map((r) => `${baseName(r.note.path)}: ${r.text}`)])), vigencias_futuras: e.future.slice(0, 5).map((f) => `${f.date} · ${baseName(f.note.path)}: ${f.text}`), alertas_abiertas: e.alerts.map((a) => a.text) }));
    } },
    { name: 'contradicciones', description: 'Contradicciones detectadas en la bóveda: artículos con datos distintos entre notas y normas derogadas citadas sin aclararlo.', inputSchema: { type: 'object', properties: {} }, execute: () => (kataProgress('Revisando contradicciones…'), proContradictions().slice(0, 15).map((c) => (c.type === 'derogada' ? { tipo: 'norma derogada citada sin aclarar', norma: c.subject, la_citan: c.plain.map((p) => baseName(p.note.path)) } : { tipo: 'datos distintos', tema: c.subject, dato: c.fact.label, valores: c.notes.map((x) => `${baseName(x.note.path)}: ${[...x.values].join(', ')}`) }))) },
    { name: 'alertas_abiertas', description: 'Alertas abiertas de la nota ⏰ Alertas Normativas y Seguimiento.', inputSchema: { type: 'object', properties: {} }, execute: () => { const al = vgAlertsNote(); return al ? al.body.split('\n').filter((l) => /^\s*\|\s*\[ \]/.test(l) || /^\s*-\s*\[ \]/.test(l)).map((l) => gvSnippet(l)).slice(0, 40) : []; } },
    { name: 'calendario', description: 'Vencimientos tributarios, alertas con fecha y vigencias futuras de los próximos días (por defecto 30).', inputSchema: { type: 'object', properties: { dias: { type: 'number' } } }, execute: ({ dias = 30 } = {}) => ctEvents(dateKey(), dateKey(new Date(Date.now() + Math.min(366, Number(dias) || 30) * 864e5))).map((e) => `${e.date} · ${e.title}${e.detail ? ` · ${e.detail}` : ''}`).slice(0, 60) },
    { name: 'notas_por_revisar', description: 'Cola de revisión de vigencia: notas que conviene revisar y por qué.', inputSchema: { type: 'object', properties: { meses: { type: 'number' } } }, execute: ({ meses = 6 } = {}) => vgQueue({ t: 'all' }, Number(meses) || 6).slice(0, 25).map((x) => ({ nota: baseName(x.note.path), motivos: x.reasons.map((r) => r.text) })) },
  ] : [];
  const ext = [];
  if (kataSource('web') !== 'off') {
    ext.push(
      { name: 'buscar_en_internet', description: 'Busca en internet (datos actualizados). objetivo: qué se quiere saber; consultas: 2 o 3 búsquedas cortas (3 a 6 palabras), pueden usar site:sii.cl o site:bcn.cl. Devuelve hasta 6 resultados con título, url, fecha, si es fuente oficial y un extracto.', inputSchema: { type: 'object', properties: { objetivo: { type: 'string' }, consultas: { type: 'array', items: { type: 'string' } } }, required: ['objetivo', 'consultas'] }, execute: async (i) => {
        kataProgress(`🌐 Buscando en internet: ${String(i.objetivo).slice(0, 50)}…`);
        const r = await kataMcp(KATA_WEB, 'web_search', { objective: String(i.objetivo), search_queries: (i.consultas || []).map(String).slice(0, 4), session_id: kataSearchId });
        const list = (r?.results || []).map((x) => ({ titulo: x.title, url: x.url, fecha: x.publish_date || null, oficial: kataOfficial(x.url), extracto: (x.excerpts || []).join(' … ').replace(/\s+/g, ' ').slice(0, 1800) }));
        list.sort((a, b) => b.oficial - a.oficial);
        const top = list.slice(0, 6);
        top.forEach((x) => kataMark('web', { title: x.titulo, url: x.url, date: x.fecha, official: x.oficial }));
        if (!top.length) kataMark('web');
        return top;
      } },
      { name: 'leer_pagina', description: 'Lee una página web concreta (cuando los extractos no bastan). objetivo: qué buscar en ella.', inputSchema: { type: 'object', properties: { url: { type: 'string' }, objetivo: { type: 'string' } }, required: ['url'] }, execute: async (i) => {
        if (!/^https:\/\//.test(String(i.url))) throw new Error('Solo leo páginas https');
        kataProgress(`🌐 Leyendo ${String(i.url).replace(/^https:\/\/(www\.)?/, '').slice(0, 50)}…`);
        const r = await kataMcp(KATA_WEB, 'web_fetch', { urls: [String(i.url)], objective: String(i.objetivo || '').slice(0, 200) || null, session_id: kataSearchId });
        const x = (r?.results || [])[0] || {};
        kataMark('web', { title: x.title || i.url, url: String(i.url), date: x.publish_date || null, official: kataOfficial(String(i.url)) });
        return { titulo: x.title || null, fecha: x.publish_date || null, texto: (x.excerpts || [x.full_content || '']).join(' … ').slice(0, 6000) };
      } }
    );
  }
  if (kataSource('drive') !== 'off') {
    ext.push(
      { name: 'buscar_en_drive', description: 'Busca archivos en tu Google Drive (PDF, Word, planillas, documentos) por palabras de su título o contenido. Devuelve hasta 8 con id, título, tipo, fecha y un extracto.', inputSchema: { type: 'object', properties: { consulta: { type: 'string' }, solo_titulo: { type: 'boolean' } }, required: ['consulta'] }, execute: async (i) => {
        const q = String(i.consulta).replace(/\\/g, '').replace(/'/g, "\\'").slice(0, 80);
        kataProgress(`📁 Buscando en tu Drive: ${q}…`);
        const r = await kataMcp(KATA_DRIVE, 'search_files', { query: `${i.solo_titulo ? 'title' : 'fullText'} contains '${q}' and trashed = false`, pageSize: 8, snippetVerbosity: 'BRIEF' });
        kataMark('drive');
        return (r?.files || []).map((f) => ({ id: f.id, titulo: f.title, tipo: f.mimeType, modificado: String(f.modifiedTime || '').slice(0, 10), extracto: String(f.contentSnippet || '').replace(/\s+/g, ' ').slice(0, 500) }));
      } },
      { name: 'leer_archivo_drive', description: 'Lee el contenido de un archivo de Drive por su id (de buscar_en_drive): PDF, Word, planilla, presentación o texto. Hasta 9.000 caracteres.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }, execute: async (i) => {
        kataProgress('📁 Leyendo el archivo de Drive…');
        const r = await kataMcp(KATA_DRIVE, 'read_file_content', { fileId: String(i.id) });
        kataMark('drive', r?.viewUrl ? { title: `📁 ${r.title || 'Archivo de Drive'}`, url: r.viewUrl, date: null, official: false, drive: true } : null);
        return { titulo: r?.title || null, texto: String(r?.fileContent || '').slice(0, 9000) };
      } }
    );
  }
  const views = Object.keys(VIEW_TITLES).filter((v) => !['settings'].includes(v));
  const actions = [
    { name: 'abrir_vista', description: `Abre una vista o una nota (no necesita aprobación). vista: una de ${views.join(', ')}; o nota: título. origen opcional para vistas gráficas; buscar opcional para radar o línea de tiempo.`, inputSchema: { type: 'object', properties: { vista: { type: 'string' }, nota: { type: 'string' }, origen: KATA_SRC_SCHEMA, buscar: { type: 'string' } } }, execute: (i) => {
      if (i.nota) { const n = kataNote(i.nota); openNote(n); return { abierta: baseName(n.path) }; }
      const v = String(i.vista || '');
      if (!VIEW_TITLES[v]) throw new Error(`No existe la vista «${v}»`);
      if (i.origen && gvCfg()) { gvCfg().view[v] = { ...(gvCfg().view[v] || {}), src: kataSrc(i.origen) }; save(); }
      if (i.buscar && v === 'radar') proState.q = String(i.buscar);
      if (i.buscar && v === 'linea') gvLine.q = String(i.buscar);
      showView(v);
      return { abierta: VIEW_TITLES[v] };
    } },
    { name: 'crear_tarea', description: 'Propone crear una tarea. fecha AAAA-MM-DD y hora HH:MM opcionales; prioridad alta, media o baja.', inputSchema: { type: 'object', properties: { titulo: { type: 'string' }, fecha: { type: 'string' }, hora: { type: 'string' }, prioridad: { type: 'string', enum: ['alta', 'media', 'baja'] } }, required: ['titulo'] }, execute: (i) => kataPropose(`☑ Tarea «${i.titulo}»`, [i.fecha && `📅 ${i.fecha}`, i.hora && `⏰ ${i.hora}`, i.prioridad && `prioridad ${i.prioridad}`].filter(Boolean).join(' · '), () => {
      const t = addTask(String(i.titulo), { raw: true, due: /^\d{4}-\d{2}-\d{2}$/.test(i.fecha || '') ? i.fecha : null, time: /^\d{2}:\d{2}$/.test(i.hora || '') ? i.hora : null, priority: { alta: 3, media: 2, baja: 1 }[i.prioridad] || 2 });
      renderAll();
      return { texto: 'Tarea creada', abrir: () => showView('tasks'), t };
    }) },
    { name: 'crear_nota', description: 'Propone crear una nota en Markdown. carpeta opcional (por defecto MATRIZ de la bóveda si existe); moc opcional: el MOC donde va.', inputSchema: { type: 'object', properties: { titulo: { type: 'string' }, contenido: { type: 'string' }, carpeta: { type: 'string' }, moc: { type: 'string' } }, required: ['titulo', 'contenido'] }, execute: (i) => kataPropose(`📝 Nota «${i.titulo}»`, `${i.carpeta ? `en ${i.carpeta}` : ''}${i.moc ? ` · MOC ${i.moc}` : ''} · ${String(i.contenido).length} caracteres`, () => {
      const folder = String(i.carpeta || gvFolders().find((f) => /matriz/i.test(f)) || '');
      const body = `${i.moc && !/^---/.test(i.contenido) ? `---\nmoc: "[[${i.moc}]]"\nestado: borrador\ncreada: ${dateKey()}\n---\n` : ''}${i.contenido}`;
      const n = createNote({ folder, title: String(i.titulo), body, open: false, edit: false });
      renderAll();
      return { texto: 'Nota creada', abrir: () => openNote(n) };
    }) },
    { name: 'agregar_alerta', description: 'Propone añadir una alerta a ⏰ Alertas Normativas (tabla 🟠). nota: la nota afectada.', inputSchema: { type: 'object', properties: { texto: { type: 'string' }, nota: { type: 'string' } }, required: ['texto', 'nota'] }, execute: (i) => { const n = kataNote(i.nota); return kataPropose(`⚠️ Alerta «${i.texto}»`, `nota: ${baseName(n.path)}`, () => { vgAddAlert(n, String(i.texto)); return { texto: 'Alerta añadida', abrir: () => vgAlertsNote() && openNote(vgAlertsNote()) }; }); } },
    { name: 'cambiar_propiedad', description: 'Propone cambiar (o quitar, con valor vacío) una propiedad de una o varias notas.', inputSchema: { type: 'object', properties: { notas: { type: 'array', items: { type: 'string' } }, propiedad: { type: 'string' }, valor: { type: 'string' } }, required: ['notas', 'propiedad'] }, execute: (i) => { const ns = (i.notas || []).map(kataNote); return kataPropose(`🏷 ${i.propiedad}: ${i.valor || '(quitar)'}`, plural(ns.length, 'nota', 'notas') + `: ${ns.slice(0, 4).map((n) => baseName(n.path)).join(', ')}${ns.length > 4 ? '…' : ''}`, () => { ns.forEach((n) => gvSetProps(n, [[String(i.propiedad), String(i.valor || '')]])); return { texto: `${plural(ns.length, 'nota cambiada', 'notas cambiadas')}` }; }); } },
    { name: 'marcar_revisadas', description: 'Propone marcar notas como revisadas hoy (propiedad revisada).', inputSchema: { type: 'object', properties: { notas: { type: 'array', items: { type: 'string' } } }, required: ['notas'] }, execute: (i) => { const ns = (i.notas || []).map(kataNote); return kataPropose(`✅ Revisadas hoy`, ns.map((n) => baseName(n.path)).join(', '), () => { ns.forEach((n) => gvSetProps(n, [['revisada', dateKey()]])); return { texto: `${plural(ns.length, 'nota marcada', 'notas marcadas')}` }; }); } },
    { name: 'crear_tablero', description: 'Propone crear un tablero kanban. agrupar: la propiedad de las columnas (p. ej. estado, area, tipo); columnas y mostrar opcionales.', inputSchema: { type: 'object', properties: { nombre: { type: 'string' }, origen: KATA_SRC_SCHEMA, agrupar: { type: 'string' }, columnas: { type: 'array', items: { type: 'string' } }, mostrar: { type: 'array', items: { type: 'string' } } }, required: ['nombre', 'agrupar'] }, execute: (i) => { const src = kataSrc(i.origen); const n = gvNotes(src).length; return kataPropose(`📋 Tablero «${i.nombre}»`, `columnas por ${i.agrupar} · ${gvSrcLabel(src)} · ${plural(n, 'nota', 'notas')}`, () => { gvNewBoard({ name: String(i.nombre), src, group: String(i.agrupar), columns: (i.columnas || []).map(String), show: (i.mostrar || []).map(String) }); showView('tableros'); return { texto: 'Tablero creado' }; }); } },
    { name: 'crear_base', description: 'Propone crear una Base (notas como base de datos) en su carpeta, con sus propiedades y vistas: tabla, tablero (agrupado por una propiedad) y calendario (por una propiedad de fecha).', inputSchema: { type: 'object', properties: { nombre: { type: 'string' }, carpeta: { type: 'string' }, propiedades: { type: 'array', items: { type: 'string' } }, tablero_por: { type: 'string' }, fecha: { type: 'string' }, icono: { type: 'string' } }, required: ['nombre', 'propiedades'] }, execute: (i) => kataPropose(`📇 Base «${i.nombre}»`, `carpeta ${i.carpeta || i.nombre} · ${(i.propiedades || []).join(', ')}`, () => {
      const folder = String(i.carpeta || i.nombre);
      const props = Object.fromEntries((i.propiedades || []).map((p) => [String(p), '']));
      const keys = Object.keys(props);
      const views = [['Tabla', tbl(folder, keys)]];
      if (i.tablero_por) views.push([`Por ${i.tablero_por}`, brd(folder, String(i.tablero_por), '', keys.filter((k) => k !== i.tablero_por).slice(0, 2))]);
      if (i.fecha) views.push(['Calendario', calv(folder, String(i.fecha))]);
      const note = createBase({ name: String(i.nombre), folder, views, props, icon: String(i.icono || '📇') });
      if (!note) throw new Error('Ya existe una base con ese nombre');
      showView('bases');
      openBase(note.id);
      return { texto: 'Base creada' };
    }) },
    { name: 'crear_diagrama', description: 'Propone crear un diagrama en Ideas y mapas. tipo: mindmap, radial, org, outline, fishbone, process, timeline, matrix, pyramid, concept, flow, venn, cycle, funnel o radar. esquema: el contenido como lista con sangría (dos espacios por nivel), sin el título.', inputSchema: { type: 'object', properties: { titulo: { type: 'string' }, tipo: { type: 'string' }, esquema: { type: 'string' } }, required: ['titulo', 'esquema'] }, execute: (i) => { const items = mmParseLines(String(i.esquema)); return kataPropose(`🗺️ Diagrama «${i.titulo}»`, `${i.tipo || 'mindmap'} · ${plural(items.length, 'elemento', 'elementos')}`, () => { const map = newMap(String(i.titulo)); mmAddLines(map, 'root', items); if (i.tipo && i.tipo !== 'mindmap') map.kind = String(i.tipo); map.updatedAt = Date.now(); save(); openMap(map.id); return { texto: 'Diagrama creado' }; }); } },
    { name: 'crear_lienzo', description: 'Propone crear un lienzo con tarjetas: notas existentes (por título) y tarjetas de texto, unidas con flechas. conexiones: pares [desde, hasta] con los índices de tarjetas (primero las notas, después los textos), con etiqueta opcional.', inputSchema: { type: 'object', properties: { titulo: { type: 'string' }, notas: { type: 'array', items: { type: 'string' } }, textos: { type: 'array', items: { type: 'string' } }, conexiones: { type: 'array', items: { type: 'object', properties: { desde: { type: 'number' }, hasta: { type: 'number' }, etiqueta: { type: 'string' } } } }, enlazar: { type: 'boolean', description: 'Unir también las notas según sus [[enlaces]]' } }, required: ['titulo'] }, execute: (i) => { const ns = (i.notas || []).map(kataNote); const ts = (i.textos || []).map(String); return kataPropose(`🧩 Lienzo «${i.titulo}»`, `${plural(ns.length, 'nota', 'notas')} · ${plural(ts.length, 'texto', 'textos')} · ${plural((i.conexiones || []).length, 'flecha', 'flechas')}`, () => {
      const c = newCanvas(String(i.titulo));
      const all = [...ns.map((n) => ({ type: 'note', noteId: n.id, w: 300, h: 200 })), ...ts.map((t) => ({ type: 'text', text: t, w: 260, h: 120 }))];
      const cols = Math.max(1, Math.ceil(Math.sqrt(all.length)));
      const cards = all.map((k, j) => ({ id: uid(), x: (j % cols) * 380, y: Math.floor(j / cols) * 280, ...k }));
      c.cards.push(...cards);
      (i.conexiones || []).forEach((e) => { const a = cards[Number(e.desde)]; const b = cards[Number(e.hasta)]; if (a && b && a !== b) c.edges.push({ id: uid(), from: a.id, to: b.id, ...(e.etiqueta ? { label: String(e.etiqueta) } : {}) }); });
      if (i.enlazar !== false) linkNoteCards(c);
      touchCanvas(c);
      openCanvas(c.id);
      return { texto: 'Lienzo creado' };
    }); } },
    { name: 'crear_dibujo', description: 'Propone crear un dibujo editable (estilo Excalidraw) en una nota nueva de «Dibujos». tipo «flujo»: pasos en orden, de arriba abajo, unidos por flechas (un paso que termina en «?» es una decisión, en rombo). tipo «libre»: elementos con forma (rectangulo, elipse, rombo, texto), x, y, ancho, alto y texto, y flechas [desde, hasta] por índice.', inputSchema: { type: 'object', properties: { titulo: { type: 'string' }, tipo: { type: 'string', enum: ['flujo', 'libre'] }, pasos: { type: 'array', items: { type: 'string' } }, elementos: { type: 'array', items: { type: 'object' } }, flechas: { type: 'array', items: { type: 'array', items: { type: 'number' } } } }, required: ['titulo'] }, execute: (i) => kataPropose(`✏️ Dibujo «${i.titulo}»`, i.tipo === 'libre' ? plural((i.elementos || []).length, 'elemento', 'elementos') : plural((i.pasos || []).length, 'paso', 'pasos'), async () => {
      const note = await kataDrawing(i);
      return { texto: 'Dibujo creado', abrir: () => openNote(note) };
    }) },
    { name: 'agendar', description: 'Propone crear un evento en Google Calendar. fecha AAAA-MM-DD, hora HH:MM (por defecto 09:00) y duración en minutos (por defecto 30).', inputSchema: { type: 'object', properties: { titulo: { type: 'string' }, fecha: { type: 'string' }, hora: { type: 'string' }, minutos: { type: 'number' }, detalle: { type: 'string' } }, required: ['titulo', 'fecha'] }, execute: (i) => kataPropose(`📅 Evento «${i.titulo}»`, `${i.fecha} ${i.hora || '09:00'}`, async () => {
      if (typeof gAvailable !== 'function' || !gAvailable()) throw new Error('Google Calendar no está conectado aquí');
      const [y, m, d] = String(i.fecha).split('-').map(Number);
      const [hh, mm] = String(i.hora || '09:00').split(':').map(Number);
      const start = new Date(y, m - 1, d, hh, mm);
      const end = new Date(start.getTime() + (Number(i.minutos) || 30) * 60000);
      await gCall('Google Calendar', 'create_event', { summary: String(i.titulo), startTime: localStamp(start), endTime: localStamp(end), timeZone: tz(), description: `${i.detalle || ''}\n\nAgendado por Kataleya desde Enfoque.`.trim() });
      return { texto: 'Evento creado en Google Calendar' };
    }) },
    { name: 'recordar', description: 'Propone guardar algo en tu memoria (preferencias, reglas, decisiones, datos de contexto). seccion: Sobre mí, Reglas de trabajo, Preferencias, Límites o Hechos y decisiones.', inputSchema: { type: 'object', properties: { hecho: { type: 'string' }, seccion: { type: 'string' } }, required: ['hecho'] }, execute: (i) => kataPropose('🧠 ¿Lo recuerdo?', `${i.hecho}${i.seccion ? ` (${i.seccion})` : ''}`, () => { kataRemember(String(i.hecho), String(i.seccion || 'Hechos y decisiones')); return { texto: 'Guardado en la memoria' }; }) },
  ];
  // Lo que lee la bóveda queda marcado como fuente 🗂.
  [...read, ...pro].forEach((t) => {
    const run = t.execute;
    t.execute = (input) => {
      kataMark('boveda');
      return run(input);
    };
  });
  return [...read, ...pro, ...ext, ...actions];
}

// ---------- Dibujos generados ----------
function kataShape(type, x, y, w, h, text, extra = {}) {
  const id = uid();
  const shape = xdNormalize({ id, type, x, y, width: w, height: h, roughness: 1, roundness: type === 'rectangle' ? { type: 3 } : null, backgroundColor: extra.bg || 'transparent', fillStyle: 'solid', strokeColor: extra.stroke || '#1e1e1e', boundElements: [] });
  const els = [shape];
  if (text) {
    const size = 20;
    const perLine = Math.max(6, Math.floor((w - 2 * XD_PAD - (type === 'diamond' ? w * 0.3 : 0)) / (size * 0.55)));
    const words = String(text).split(/\s+/);
    const lines = [];
    words.forEach((wd) => (lines.length && `${lines.at(-1)} ${wd}`.length <= perLine ? (lines[lines.length - 1] = `${lines.at(-1)} ${wd}`) : lines.push(wd)));
    const th = lines.length * size * 1.25;
    const t = xdNormalize({ id: uid(), type: 'text', x: x + XD_PAD, y: y + (h - th) / 2, width: w - 2 * XD_PAD, height: th, text: lines.join('\n'), originalText: String(text), fontSize: size, fontFamily: 1, textAlign: 'center', verticalAlign: 'middle', containerId: type === 'text' ? null : id, lineHeight: 1.25 });
    if (type === 'text') return [t];
    shape.boundElements.push({ id: t.id, type: 'text' });
    els.push(t);
  }
  return els;
}
function kataArrow(a, b) {
  const [x1, y1] = [a.x + a.width / 2, a.y + a.height];
  const [x2, y2] = [b.x + b.width / 2, b.y];
  const down = y2 > y1 + 4;
  const sx = down ? x1 : a.x + a.width;
  const sy = down ? y1 : a.y + a.height / 2;
  const ex = down ? x2 : b.x;
  const ey = down ? y2 : b.y + b.height / 2;
  const arrow = xdNormalize({ id: uid(), type: 'arrow', x: sx, y: sy, width: Math.abs(ex - sx), height: Math.abs(ey - sy), points: [[0, 0], [ex - sx, ey - sy]], endArrowhead: 'arrow', startArrowhead: null, startBinding: { elementId: a.id, focus: 0, gap: 6 }, endBinding: { elementId: b.id, focus: 0, gap: 6 } });
  a.boundElements.push({ id: arrow.id, type: 'arrow' });
  b.boundElements.push({ id: arrow.id, type: 'arrow' });
  return arrow;
}
async function kataDrawing(i) {
  const els = [];
  const shapes = [];
  if (i.tipo === 'libre' && Array.isArray(i.elementos) && i.elementos.length) {
    const map = { rectangulo: 'rectangle', 'rectángulo': 'rectangle', elipse: 'ellipse', rombo: 'diamond', texto: 'text' };
    i.elementos.slice(0, 60).forEach((e) => {
      const made = kataShape(map[fold(String(e.forma || e.tipo || 'rectangulo'))] || 'rectangle', Number(e.x) || 0, Number(e.y) || 0, Number(e.ancho) || 220, Number(e.alto) || 90, String(e.texto || ''));
      shapes.push(made[0]);
      els.push(...made);
    });
    (i.flechas || []).forEach(([a, b]) => shapes[a] && shapes[b] && shapes[a].type !== 'text' && shapes[b].type !== 'text' && els.push(kataArrow(shapes[a], shapes[b])));
  } else {
    const steps = (i.pasos || []).map(String).filter(Boolean).slice(0, 30);
    let y = 0;
    const title = kataShape('text', -60, -90, 400, 40, String(i.titulo));
    title[0].fontSize = 28;
    els.push(...title);
    steps.forEach((s, k) => {
      const dec = /\?\s*$/.test(s);
      const w = dec ? 300 : 280;
      const h = dec ? 140 : Math.max(80, 26 * Math.ceil(s.length / 18) + 30);
      const made = kataShape(dec ? 'diamond' : k === 0 || k === steps.length - 1 ? 'ellipse' : 'rectangle', 140 - w / 2, y, w, h, s, { bg: dec ? '#fff3bf' : k === 0 || k === steps.length - 1 ? '#d3f9d8' : '#e7f5ff' });
      shapes.push(made[0]);
      els.push(...made);
      y += h + 60;
    });
    for (let k = 1; k < shapes.length; k++) els.push(kataArrow(shapes[k - 1], shapes[k]));
  }
  if (!els.length) throw new Error('El dibujo no tiene elementos');
  await xdLoadFont();
  const blob = await xdRenderBlob(els, '#ffffff');
  const { data, type, width, height } = await compressImage(new File([blob], 'dibujo.png', { type: 'image/png' }));
  const scene = { type: 'excalidraw', version: 2, elements: JSON.parse(JSON.stringify(els)), appState: { viewBackgroundColor: '#ffffff', gridSize: null } };
  const rec = { id: uid(), name: 'Dibujo', type, data, width, height, createdAt: Date.now(), drawing: scene };
  await putFile(rec);
  xdDrawingIds.add(rec.id);
  if (!state.folders.includes('Dibujos')) state.folders.push('Dibujos');
  const note = createNote({ folder: 'Dibujos', title: String(i.titulo).slice(0, 80), body: `Dibujo hecho por Kataleya el ${dateKey()}. Tócalo para editarlo.\n\n![Dibujo](img:${rec.id})\n`, open: false, edit: false, log: false });
  if (typeof scheduleFilesSync === 'function') scheduleFilesSync();
  renderAll();
  return note;
}

// ---------- Conversación ----------
async function kataSend(question) {
  const q = String(question || '').trim();
  if (!q || kata.busy) return;
  if (!aiReady()) return kataRender();
  kata.busy = true;
  kata.ctl = new AbortController();
  kata.turns.push({ role: 'user', content: q });
  const answer = { role: 'assistant', content: '' };
  kata.turns.push(answer);
  kataRender();
  kataProgress('Pensando…');
  const history = kata.turns.slice(0, -1).filter((t) => t.content).slice(-10).map((t) => ({ role: t.role, content: t.content }));
  let tools = false;
  try {
    tools = !!(await ai.sample.limits().catch(() => null))?.tools;
  } catch {
    tools = false;
  }
  const first = tools ? kataRules() : `${kataRules()}\n\n${contextFor(q)}\n\n(En esta vista no puedes usar herramientas: si hace falta crear algo, explica cómo hacerlo.)`;
  try {
    const { text } = await ai.sample([{ role: 'user', content: first }, ...history], {
      signal: kata.ctl.signal,
      ...(tools ? { tools: kataTools() } : { cache: false }),
      onText: ({ text: t }) => {
        answer.content = t;
        kataProgress('');
        const b = $('#kata-messages .kata-msg.assistant:last-of-type .kata-md');
        if (b) b.innerHTML = renderMd(t, { noTasks: true, noExternalImages: true });
      },
    });
    answer.content = text;
  } catch (e) {
    answer.content = e?.text || answer.content;
    if (e?.code !== 'cancelled') answer.error = aiErrorText(e);
    if (AI_FATAL.includes(e?.code)) {
      ai.unavailable = true;
      renderAIControls();
    }
  } finally {
    kata.busy = false;
    kata.ctl = null;
    kataProgress('');
    kataRender();
  }
}

async function kataApprove(id) {
  const a = kata.pending.get(id);
  if (!a || a.status !== 'pending') return;
  a.status = 'running';
  kataRender();
  try {
    a.result = (await a.run()) || { texto: 'Hecho' };
    a.status = 'done';
  } catch (e) {
    a.status = 'error';
    a.result = { texto: e?.message || 'No se pudo hacer' };
  }
  kataRender();
}
function kataReject(id) {
  const a = kata.pending.get(id);
  if (!a || a.status !== 'pending') return;
  a.status = 'rejected';
  kataRender();
}

function kataSaveConversation() {
  if (!kata.turns.some((t) => t.role === 'assistant' && t.content)) return;
  if (!state.folders.includes('Conversaciones')) state.folders.push('Conversaciones');
  const d = new Date();
  const firstQ = kata.turns.find((t) => t.role === 'user')?.content || 'Conversación';
  const body = kata.turns.map((t) => {
    if (t.role === 'user') return `> **Tú:** ${t.content}`;
    const acts = (t.actions || []).map((id) => kata.pending.get(id)).filter(Boolean).map((a) => `- ${a.status === 'done' ? '✅' : a.status === 'rejected' ? '❌' : '⏳'} ${a.label}${a.detail ? ` · ${a.detail}` : ''}`);
    return `**Kataleya:** ${t.content}${acts.length ? `\n\n${acts.join('\n')}` : ''}`;
  }).join('\n\n');
  const note = createNote({ folder: 'Conversaciones', title: `Kataleya ${dateKey(d)} ${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')} - ${firstQ.replace(/[\\/:*?"<>|#^[\]]/g, '').slice(0, 50)}`, body: `---\ntipo: conversación\nfecha: ${dateKey(d)}\nmodo: ${kataMode()}\n---\n${body}\n`, open: false, edit: false, log: false });
  showToastMessage('Conversación guardada en «Conversaciones».');
  return note;
}

// ---------- Interfaz ----------
const KATA_QUICK = {
  general: ['¿Qué tengo pendiente esta semana?', 'Resume la nota abierta', '¿Qué notas debería revisar hoy?', 'Hazme un tablero de mis notas por estado'],
  contador: ['¿Qué vence en los próximos 15 días?', '¿Qué dice la bóveda sobre el art. 107 LIR?', '¿Salió algo nuevo de mis alertas abiertas? Búscalo en internet', '¿Hay contradicciones que deba revisar?', 'Dibújame el flujo del cierre contable mensual'],
  estoicismo: ['Ayúdame con la premeditatio de hoy', 'Hagamos el examen de la noche', 'Dame una cita de Séneca de mis notas', 'Separa esto en lo que depende de mí y lo que no'],
};

function kataBuild() {
  const fab = el('button', { id: 'kata-fab', className: 'kata-fab', title: 'Kataleya, tu asistente (Alt+K)', ariaLabel: 'Abrir a Kataleya' });
  fab.innerHTML = KATA_AVATAR;
  fab.addEventListener('click', () => kataToggle());
  const panel = el('aside', { id: 'kata-panel', className: 'kata-panel', ariaLabel: 'Kataleya', hidden: true });
  document.body.append(fab, panel);
}

function kataToggle(on = !kata.open) {
  kata.open = on;
  const panel = $('#kata-panel');
  panel.hidden = !on;
  document.body.classList.toggle('kata-open', on);
  if (on) {
    if (kataCfg().memory !== false) kataEnsureMemory();
    kataRender();
    setTimeout(() => $('#kata-input')?.focus(), 30);
  }
}

function kataRender() {
  const panel = $('#kata-panel');
  if (!panel || panel.hidden) return;
  const mode = kataMode();
  const modeSel = el('select', { className: 'kata-mode', ariaLabel: 'Modo de Kataleya', title: 'Modo: cómo responde Kataleya' }, kataModes().map((m) => el('option', { value: m.id, selected: m.id === mode }, m.label)));
  modeSel.addEventListener('change', () => {
    kataCfg().mode = modeSel.value;
    save();
    kataRender();
  });
  const btn = (label, title, fn, cls = 'kata-icon') => {
    const b = el('button', { className: cls, title, ariaLabel: title }, label);
    b.addEventListener('click', fn);
    return b;
  };
  const avatar = el('span', { className: 'kata-head-avatar' });
  avatar.innerHTML = KATA_AVATAR;
  const head = el('header', { className: 'kata-head' }, [
    avatar,
    el('div', { className: 'kata-name' }, [el('strong', {}, 'Kataleya'), modeSel]),
    btn('🧠', 'Memoria: abrir o importar desde Claude', (e) => showMenu(e.currentTarget, [
      { label: '📖 Abrir mi memoria', action: () => openNote(kataEnsureMemory()) },
      { label: '📥 Importar memoria de Claude…', action: () => { kata.importing = true; kataRender(); } },
    ])),
    btn('💾', 'Guardar la conversación como nota', () => kataSaveConversation()),
    btn('🗑', 'Nueva conversación', () => { kata.turns = []; kata.pending.clear(); kataRender(); }),
    btn('✕', 'Cerrar (Alt+K)', () => kataToggle(false)),
  ]);
  const ctx = kataSeeing();
  const ctxBar = ctx ? el('div', { className: 'kata-ctx', title: 'Lo que Kataleya tiene a la vista' }, `Viendo: ${ctx}`) : '';
  const srcBtn = (k, icon, label) => {
    const on = kataSource(k) !== 'off';
    const b = btn(`${icon} ${label}${on ? '' : ' (apagado)'}`, on ? `${label}: Kataleya lo usa cuando hace falta. Toca para apagarlo.` : `${label}: apagado. Toca para encenderlo.`, () => {
      kataCfg()[k] = on ? 'off' : 'auto';
      save();
      kataRender();
    }, `kata-src${on ? ' on' : ''}`);
    return b;
  };
  const srcBar = el('div', { className: 'kata-srcbar' }, [el('span', { className: 'muted' }, 'Fuentes:'), el('span', { className: 'kata-src on fixed', title: 'Tus notas: siempre la primera fuente' }, '🗂 Bóveda'), srcBtn('drive', '📁', 'Drive'), srcBtn('web', '🌐', 'Internet')]);
  const msgs = el('div', { id: 'kata-messages', className: 'kata-messages' });
  if (!aiReady()) {
    msgs.append(el('div', { className: 'kata-empty' }, [el('p', {}, '👋 Soy Kataleya.'), el('p', { className: 'muted' }, 'Funciono cuando abres Enfoque desde Claude (con permiso para usar Claude). Aquí puedes revisar mi memoria con 🧠.')]));
  } else if (kata.importing) {
    const ta = el('textarea', { className: 'kata-import', rows: 10, placeholder: 'Pega aquí tu memoria de Claude (Configuración › Memoria) o las instrucciones de tu proyecto…' });
    msgs.append(el('div', { className: 'kata-empty' }, [
      el('p', {}, [el('strong', {}, '📥 Importar memoria de Claude')]),
      el('p', { className: 'muted' }, 'Copia el texto de tu memoria en la configuración de Claude y pégalo aquí. Se agregará a mi memoria en una sección «Importado de Claude» con la fecha; luego puedes ordenarlo o pedirme que lo ordene.'),
      ta,
      el('div', { className: 'kata-row' }, [
        btn('Agregar a la memoria', '', () => {
          const t = ta.value.trim();
          if (!t) return;
          const note = kataEnsureMemory();
          note.body = `${note.body.replace(/\s+$/, '')}\n\n## Importado de Claude (${dateKey()})\n${t.split('\n').map((l) => (l.trim() && !/^\s*[-*]\s/.test(l) ? `- ${l.trim()}` : l)).join('\n')}\n`;
          note.updatedAt = Date.now();
          dataRev++;
          save();
          if (typeof snapshotNote === 'function') snapshotNote(note);
          kata.importing = false;
          kataRender();
          showToastMessage('Memoria importada. La versión anterior queda en el historial de la nota.');
        }, 'primary'),
        btn('Cancelar', '', () => { kata.importing = false; kataRender(); }, 'link'),
      ]),
    ]));
  } else if (!kata.turns.length) {
    msgs.append(el('div', { className: 'kata-empty' }, [
      el('p', {}, '👋 Hola, soy Kataleya. ¿En qué te ayudo?'),
      el('p', { className: 'muted' }, 'Busco en tu bóveda, te digo qué rige hoy y puedo crear tareas, notas, alertas, tableros, bases, diagramas, lienzos y dibujos (siempre con tu aprobación).'),
      el('div', { className: 'kata-quick' }, (KATA_QUICK[mode] || KATA_QUICK.general).map((q) => btn(q, '', () => kataSend(q), 'kata-chip'))),
    ]));
  } else {
    kata.turns.forEach((t) => {
      if (t.role === 'user') return msgs.append(el('div', { className: 'kata-msg user' }, t.content));
      const md = el('div', { className: 'kata-md md' });
      md.innerHTML = renderMd(t.content || (kata.busy && t === kata.turns.at(-1) ? '…' : ''), { noTasks: true, noExternalImages: true });
      const acts = (t.actions || []).map((id) => {
        const a = kata.pending.get(id);
        if (!a) return '';
        const status = { pending: '', running: '⏳ Haciendo…', done: `✅ ${a.result?.texto || 'Hecho'}`, rejected: '❌ Descartado', error: `⚠️ ${a.result?.texto || 'Error'}` }[a.status];
        return el('div', { className: `kata-act s-${a.status}` }, [
          el('div', {}, [el('strong', {}, a.label), a.detail ? el('div', { className: 'muted' }, a.detail) : '']),
          a.status === 'pending' ? el('div', { className: 'kata-row' }, [btn('Aprobar', '', () => kataApprove(id), 'primary'), btn('Descartar', '', () => kataReject(id), 'link')]) : el('div', { className: 'kata-row' }, [el('span', {}, status), a.status === 'done' && a.result?.abrir ? btn('Abrir', '', () => a.result.abrir(), 'link') : '']),
        ]);
      });
      const used = (t.used || []).map((k) => ({ boveda: '🗂 Bóveda', drive: '📁 Drive', web: '🌐 Internet' })[k]);
      const refs = (t.refs || []).filter((r) => /^https:\/\//.test(r.url));
      const srcs = used.length ? el('div', { className: 'kata-used' }, [
        el('div', { className: 'kata-used-chips' }, [el('span', { className: 'muted' }, 'Consultó:'), ...used.map((u) => el('span', { className: 'kata-chip-src' }, u))]),
        refs.length ? el('ol', { className: 'kata-refs' }, refs.slice(0, 8).map((r) => {
          let host = '';
          try {
            host = new URL(r.url).hostname.replace(/^www\./, '');
          } catch {}
          const a = el('a', { href: r.url, target: '_blank', rel: 'noopener noreferrer' }, r.title || host);
          return el('li', {}, [a, el('span', { className: 'muted' }, ` · ${host}${r.date ? ` · ${r.date}` : ''}`), r.official ? el('span', { className: 'kata-official' }, ' ✓ oficial') : '']);
        })) : '',
      ]) : '';
      const bubble = el('div', { className: 'kata-msg assistant' }, [md, srcs, ...acts, t.error ? el('p', { className: 'ask-error' }, t.error) : '']);
      msgs.append(bubble);
    });
  }
  const input = el('textarea', { id: 'kata-input', className: 'kata-input', rows: 2, placeholder: aiReady() ? 'Escríbele a Kataleya… (Enter envía, Mayús+Enter salta de línea)' : 'Kataleya funciona al abrir Enfoque desde Claude', disabled: !aiReady() || kata.busy });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const v = input.value;
      input.value = '';
      kataSend(v);
    }
  });
  const send = btn(kata.busy ? '■' : '➤', kata.busy ? 'Detener' : 'Enviar', () => {
    if (kata.busy) return kata.ctl?.abort();
    const v = input.value;
    input.value = '';
    kataSend(v);
  }, 'kata-send');
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const mic = SR && aiReady() ? btn('🎤', 'Dictar la pregunta', () => {
    const r = new SR();
    r.lang = 'es-CL';
    r.interimResults = true;
    mic.classList.add('on');
    r.onresult = (ev) => (input.value = [...ev.results].map((x) => x[0].transcript).join(' '));
    r.onend = () => mic.classList.remove('on');
    r.onerror = () => mic.classList.remove('on');
    r.start();
  }, 'kata-icon kata-mic') : '';
  const foot = el('footer', { className: 'kata-foot' }, [el('div', { id: 'kata-progress', className: 'muted kata-progress' }), el('div', { className: 'kata-compose' }, [input, mic, send])]);
  panel.replaceChildren(head, ctxBar, srcBar, msgs, foot);
  msgs.scrollTop = msgs.scrollHeight;
}

// Los [[enlaces]] de las respuestas abren la nota.
document.addEventListener('click', (e) => {
  const link = e.target.closest?.('#kata-panel a.wikilink');
  if (!link) return;
  e.preventDefault();
  openNoteByLink(link.dataset.target, { heading: link.dataset.heading, newTab: e.ctrlKey || e.metaKey });
});
document.addEventListener('keydown', (e) => {
  if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'k' || e.key === 'K' || e.code === 'KeyK')) {
    e.preventDefault();
    kataToggle();
  } else if (e.key === 'Escape' && kata.open && $('#kata-panel')?.contains(document.activeElement)) kataToggle(false);
});
// Al cambiar de nota o de vista, se actualiza lo que Kataleya «ve».
RENDER_HOOKS.push(() => kata.open && $('.kata-ctx') && ($('.kata-ctx').textContent = `Viendo: ${kataSeeing()}`));

kataBuild();
COMMANDS_EXTRA.push(() => [{ label: '✨ Kataleya: abrir la asistente (Alt+K)', action: () => kataToggle(true) }, { label: '🧠 Kataleya: abrir su memoria', action: () => openNote(kataEnsureMemory()) }]);
