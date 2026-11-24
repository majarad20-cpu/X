'use strict';

// ---------- Especialidad: el módulo profesional (perfil «Contador Chile») ----------
// Un motor general que reconoce normas en el texto de las notas, junta sus menciones y artículos y
// compara los datos (tasas, topes en UF/UTM, plazos) entre notas. Lo propio de la profesión vive en
// una nota de la bóveda, el **perfil** (Sistema/Perfil - Contador Chile.md): qué tipos de norma se
// reconocen, las abreviaturas (LIR → DL 824…) y qué datos se vigilan. Sin esa nota se usa el perfil
// de fábrica; «⚙ Perfil» la crea para editarla. Cambiar el perfil no requiere tocar el código.
// Vistas (sección «Contador» de la barra, se activa en Ajustes › Notas › Especialidad):
//   ⚖️ Radar normativo · cada norma citada: notas, menciones, artículos, señales (derogada,
//                        modificada, fecha futura) y alertas abiertas; tocar una línea abre la nota
//   🔍 Contradicciones · el mismo artículo con datos distintos en notas distintas, y normas que una
//                        nota da por derogadas y otra cita sin decirlo

const PRO_PROFILE_PATH = 'Sistema/Perfil - Contador Chile';
const PRO_KINDS = [
  { id: 'ley', label: 'Leyes', sample: 'Ley 21.713' },
  { id: 'dl', label: 'Decretos ley', sample: 'DL 824' },
  { id: 'dfl', label: 'Decretos con fuerza de ley', sample: 'DFL 1' },
  { id: 'ds', label: 'Decretos supremos', sample: 'DS 437/2026' },
  { id: 'circ', label: 'Circulares (SII, UAF, CMF)', sample: 'Circular SII 53/2025' },
  { id: 'res', label: 'Resoluciones exentas', sample: 'Res. Ex. 88/2026' },
  { id: 'ofi', label: 'Oficios', sample: 'Oficio 278/2026' },
  { id: 'nic', label: 'Normas contables y de auditoría (NIC, NIIF, NIA, NIGC, NCG)', sample: 'NIC 12' },
];
const PRO_FACTS = [
  { id: 'pct', label: 'Porcentajes (tasas)', re: /(\d{1,3}(?:,\d{1,4})?)\s?%/g, unit: '%' },
  { id: 'uf', label: 'Montos en UF', re: /(\d{1,3}(?:\.\d{3})*(?:,\d+)?)\s?UF\b/g, unit: 'UF' },
  { id: 'utm', label: 'Montos en UTM', re: /(\d{1,3}(?:\.\d{3})*(?:,\d+)?)\s?UTM\b/g, unit: 'UTM' },
  { id: 'dias', label: 'Plazos en días', re: /(\d{1,4})\s?d[ií]as\b/gi, unit: 'días' },
];
const PRO_DEFAULT_ABBR = [
  ['LIR', 'DL 824', 'Ley sobre Impuesto a la Renta'],
  ['Ley de la Renta', 'DL 824', 'Ley sobre Impuesto a la Renta'],
  ['CT', 'DL 830', 'Código Tributario'],
  ['Código Tributario', 'DL 830', 'Código Tributario'],
  ['Ley de IVA', 'DL 825', 'Ley sobre Impuesto a las Ventas y Servicios'],
  ['LIVS', 'DL 825', 'Ley sobre Impuesto a las Ventas y Servicios'],
  ['LSA', 'Ley 18.046', 'Ley de Sociedades Anónimas'],
  ['LMV', 'Ley 18.045', 'Ley de Mercado de Valores'],
];

const PRO_PROFILE_TEXT = `---
tipo: perfil
area: sistema
especialidad: Contador Chile
estado: completa
---
# Perfil - Contador Chile

**Idea central:** este perfil le dice a Enfoque qué es una norma y qué datos vigilar en la bóveda. Lo usan el ⚖️ Radar normativo y el 🔍 Detector de contradicciones. Puedes editarlo: los cambios se aplican al volver a abrir esas vistas.

## Normas que se reconocen
Marca o desmarca cada tipo.
${PRO_KINDS.map((k) => `- [x] ${k.label} (ej.: ${k.sample})`).join('\n')}

## Abreviaturas
Cada línea: \`abreviatura → norma · nombre\`. La abreviatura se busca tal cual en el texto.
${PRO_DEFAULT_ABBR.map(([a, k, n]) => `- ${a} → ${k} · ${n}`).join('\n')}

## Datos que se vigilan
Los que se comparan entre notas para buscar contradicciones.
${PRO_FACTS.map((f) => `- [${f.id === 'dias' ? ' ' : 'x'}] ${f.label}`).join('\n')}

## Notas que no se comparan
Registros y bitácoras: cuentan historia, así que el detector de contradicciones no las usa (el radar sí).
- Registro de fuentes
- Visión, Usos y Reglas
- Panel de Control

## Palabras de historial
Una línea con estas palabras se trata como historia (no se compara con lo vigente).
- hasta, antes, derogad, original, histor, regía, rigió, anterior, reemplazad, ex
`;

// ---------- Perfil ----------
const proCfg = () => {
  if (!state.settings.pro || typeof state.settings.pro !== 'object') state.settings.pro = {};
  const c = state.settings.pro;
  if (!Array.isArray(c.ignored)) c.ignored = [];
  return c;
};
const proOn = () => proCfg().on !== false;
const proProfileNote = () => findNoteByName(PRO_PROFILE_PATH) || state.notes.find((n) => baseName(n.path) === baseName(PRO_PROFILE_PATH));

function proProfile() {
  const note = proProfileNote();
  const text = note && !note.enc ? note.body : PRO_PROFILE_TEXT;
  return gvCached(`pro-profile:${note?.id || 'base'}`, () => {
    const section = (title) => {
      const m = text.match(new RegExp(`^##\\s+${title}[^\\n]*\\n([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, 'mi'));
      return m ? m[1].split('\n') : [];
    };
    const checked = (lines, list) => {
      const out = new Set();
      list.forEach((x) => {
        const line = lines.find((l) => fold(l).includes(fold(x.label)));
        if (!line || /^\s*-\s*\[[xX]\]/.test(line)) out.add(x.id);
      });
      return out;
    };
    const kinds = checked(section('Normas'), PRO_KINDS);
    const facts = checked(section('Datos'), PRO_FACTS);
    const abbr = [];
    section('Abreviaturas').forEach((l) => {
      const m = l.match(/^\s*-\s*(.+?)\s*(?:→|->|=)\s*([^·=]+?)\s*(?:[·=]\s*(.+))?$/);
      if (m) abbr.push({ alias: m[1].trim(), key: proNormalizeKey(m[2].trim()) || m[2].trim(), name: (m[3] || '').trim() });
    });
    const hist = (section('Palabras').find((l) => /^\s*-/.test(l)) || '').replace(/^\s*-\s*/, '').split(',').map((w) => w.trim().toLowerCase()).filter(Boolean);
    const exclude = section('Notas que no se comparan').map((l) => l.replace(/^\s*-\s*/, '').trim()).filter((l) => l && !/^[A-ZÁÉÍÓÚ].*:$/.test(l) && !/^Notas /.test(l));
    return { exclude: exclude.length ? exclude : ['Registro de fuentes', 'Visión, Usos y Reglas', 'Panel de Control'], kinds, facts, abbr: abbr.length ? abbr : PRO_DEFAULT_ABBR.map(([a, k, n]) => ({ alias: a, key: k, name: n })), hist: hist.length ? hist : ['hasta', 'antes', 'derogad', 'original', 'histor'] };
  });
}

function proOpenProfile() {
  let note = proProfileNote();
  if (!note) {
    if (!state.folders.includes('Sistema')) state.folders.push('Sistema');
    note = createNote({ folder: 'Sistema', title: baseName(PRO_PROFILE_PATH), body: PRO_PROFILE_TEXT, open: false, edit: false, log: false });
    showToastMessage('Perfil creado en «Sistema». Edítalo para ajustar normas, abreviaturas y datos vigilados.');
  }
  openNote(note);
}

// ---------- Reconocer normas ----------
const PRO_NUM = String.raw`(?:N[°º.o]\s*|N\.?\s*°?\s*)?`;
const PRO_YEAR = String.raw`(?:\s*(?:,\s*)?(?:de|del|\/)\s*(?:año\s*)?((?:19|20)\d{2}))?`;
const PRO_RE = {
  ley: new RegExp(String.raw`\bLey(?:es)?\s+${PRO_NUM}(\d{1,2}\.\d{3}|\d{5}|\d{4})\b`, 'gi'),
  dl: new RegExp(String.raw`\b(?:D\.\s?L\.?|DL|Decreto\s+Ley)\s+${PRO_NUM}(\d{1,4})\b`, 'g'),
  dfl: new RegExp(String.raw`\b(?:D\.\s?F\.\s?L\.?|DFL)\s+${PRO_NUM}(\d{1,4})${PRO_YEAR}`, 'g'),
  ds: new RegExp(String.raw`\b(?:D\.\s?S\.?|DS|Decreto\s+Supremo)\s+${PRO_NUM}(\d{1,4})${PRO_YEAR}`, 'g'),
  circ: new RegExp(String.raw`\bCircular(?:es)?\s+(?:(SII|UAF|CMF|TGR)\s+)?${PRO_NUM}(\d{1,4})${PRO_YEAR}`, 'gi'),
  res: new RegExp(String.raw`\bRes(?:oluci[oó]n)?\.?\s*Ex(?:enta)?\.?\s*(?:(SII|UAF|CMF)\s+)?${PRO_NUM}(\d{1,5})${PRO_YEAR}`, 'gi'),
  ofi: new RegExp(String.raw`\bOficios?\s+(?:(SII|UAF|CMF)\s+)?${PRO_NUM}(\d{1,5})${PRO_YEAR}`, 'gi'),
  nic: /\b(NIC|NIIF|NIA|NIGC|NCG|NIIF para las PYMES)\s+(?:N[°º]\s*)?(\d{1,4})\b/g,
};
const proLey = (n) => (/^\d{5}$/.test(n) ? `${n.slice(0, 2)}.${n.slice(2)}` : n);

// Clave canónica de una norma escrita a mano (para el perfil): «Ley 21713» → «Ley 21.713».
function proNormalizeKey(s) {
  const hits = proNormsIn(s, { kinds: new Set(PRO_KINDS.map((k) => k.id)), abbr: [] });
  return hits[0]?.key || '';
}

// Normas de una línea: [{ key, kind, at, end }].
function proNormsIn(line, prof) {
  const out = [];
  const push = (kind, key, m) => out.push({ kind, key, at: m.index, end: m.index + m[0].length });
  if (prof.kinds.has('ley')) for (const m of line.matchAll(PRO_RE.ley)) push('ley', `Ley ${proLey(m[1])}`, m);
  if (prof.kinds.has('dl')) for (const m of line.matchAll(PRO_RE.dl)) push('dl', `DL ${m[1]}`, m);
  if (prof.kinds.has('dfl')) for (const m of line.matchAll(PRO_RE.dfl)) push('dfl', `DFL ${m[1]}${m[2] ? `/${m[2]}` : ''}`, m);
  if (prof.kinds.has('ds')) for (const m of line.matchAll(PRO_RE.ds)) push('ds', `DS ${m[1]}${m[2] ? `/${m[2]}` : ''}`, m);
  if (prof.kinds.has('circ')) for (const m of line.matchAll(PRO_RE.circ)) {
    const org = (m[1] || (/\bUAF\b/.test(line) && !/\bSII\b/.test(line) ? 'UAF' : /\bCMF\b/.test(line) && !/\bSII\b/.test(line) ? 'CMF' : 'SII')).toUpperCase();
    push('circ', `Circular ${org} ${m[2]}${m[3] ? `/${m[3]}` : ''}`, m);
  }
  if (prof.kinds.has('res')) for (const m of line.matchAll(PRO_RE.res)) push('res', `Res. Ex. ${m[1] ? `${m[1].toUpperCase()} ` : ''}${m[2]}${m[3] ? `/${m[3]}` : ''}`, m);
  if (prof.kinds.has('ofi')) for (const m of line.matchAll(PRO_RE.ofi)) push('ofi', `Oficio ${m[1] ? `${m[1].toUpperCase()} ` : ''}${m[2]}${m[3] ? `/${m[3]}` : ''}`, m);
  if (prof.kinds.has('nic')) for (const m of line.matchAll(PRO_RE.nic)) push('nic', `${m[1]} ${m[2]}`, m);
  prof.abbr.forEach((a) => {
    const short = a.alias.length <= 5 && a.alias === a.alias.toUpperCase();
    const re = new RegExp(`(^|[^\\wÁÉÍÓÚáéíóúÑñ])(${a.alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?![\\wÁÉÍÓÚáéíóúÑñ])`, short ? 'g' : 'gi');
    for (const m of line.matchAll(re)) {
      const at = m.index + m[1].length;
      if (!out.some((o) => at >= o.at && at < o.end)) out.push({ kind: a.key.split(' ')[0] === 'Ley' ? 'ley' : PRO_KINDS.find((k) => a.key.toLowerCase().startsWith(k.id))?.id || 'ley', key: a.key, at, end: at + m[2].length });
    }
  });
  return out.sort((x, y) => x.at - y.at);
}

// Artículos de una línea, unidos a la norma que los sigue (o a la única de la línea).
const PRO_ART_RE = /\bart(?:[íi]culos?|s?\.)\s*(\d{1,4}(?:\s*(?:bis|ter|qu[aá]ter|quinquies))?)(?:\s*(?:N[°º]\s*\d+|letra\s+[a-zñ]\)?|inciso\s+\w+|[a-zñ]\)|,|°|º))*/gi;
function proArticlesIn(line, norms) {
  const out = [];
  for (const m of line.matchAll(PRO_ART_RE)) {
    const end = m.index + m[0].length;
    const next = norms.find((n) => n.at >= end && n.at - end <= 40);
    const norm = next || (norms.length === 1 ? norms[0] : null);
    if (norm) out.push({ art: m[1].replace(/\s+/g, ' ').toLowerCase(), norm: norm.key, at: m.index });
  }
  return out;
}

// Señales de estado cerca de una norma: derogada, modificada, postergada, reemplazada.
const PRO_SIGNALS = [
  { id: 'derogada', icon: '⛔', label: 'derogada', after: /\bderogad[ao]s?\b/gi, before: /\bderog(?:a|ó|aron|ar)(?![\wáéíóúñ])/gi },
  { id: 'reemplazada', icon: '🔁', label: 'reemplazada', after: /\breemplazad[ao]s?\b/gi, before: /\breemplaz(?:a|ó|aron)(?![\wáéíóúñ])/gi },
  { id: 'modificada', icon: '🔄', label: 'modificada', after: /\bmodificad[ao]s?\b/gi, before: /\bmodific(?:a|ó|aron)(?![\wáéíóúñ])/gi },
  { id: 'postergada', icon: '⏸', label: 'postergada', after: /\bpostergad[ao]s?\b/gi, before: /\bposterg(?:a|ó|aron)(?![\wáéíóúñ])/gi },
];
// La señal es de la norma solo si entre ambas no hay un artículo (entonces es del artículo: «el
// art. 14 ter de la LIR fue derogado» no deroga la LIR) ni otra norma, y si la norma no es la que
// deroga («derogada por la Ley 21.210»).
const PRO_ART_NEAR = /\bart(?:[íi]culos?|s?\.)\s*\d/i;
function proSignalsIn(line, norms) {
  const out = [];
  PRO_SIGNALS.forEach((s) => {
    for (const m of line.matchAll(s.after)) {
      const n = [...norms].reverse().find((x) => x.end <= m.index && m.index - x.end <= 60);
      if (!n) continue;
      const between = line.slice(n.end, m.index);
      const lead = line.slice(Math.max(0, n.at - 40), n.at);
      if (PRO_ART_NEAR.test(between) || PRO_ART_NEAR.test(lead) || /\bpor\s+(?:la|el|los|las)?\s*$/i.test(line.slice(Math.max(0, n.at - 12), n.at))) continue;
      out.push({ norm: n.key, sig: s.id });
    }
    for (const m of line.matchAll(s.before)) {
      const from = m.index + m[0].length;
      // «NIC 1 → la reemplaza la NIIF 18»: con «la/lo» delante, la afectada es la norma de antes.
      if (/\b(?:la|lo|las|los)\s+$/i.test(line.slice(Math.max(0, m.index - 5), m.index))) {
        const prev = [...norms].reverse().find((x) => x.end <= m.index && m.index - x.end <= 60);
        if (prev && !PRO_ART_NEAR.test(line.slice(prev.end, m.index))) out.push({ norm: prev.key, sig: s.id });
        continue;
      }
      const n = norms.find((x) => x.at >= from && x.at - from <= 60);
      if (!n || PRO_ART_NEAR.test(line.slice(from, n.at))) continue;
      out.push({ norm: n.key, sig: s.id });
    }
  });
  return out;
}

// ---------- Índice de la bóveda (una vez por versión de los datos) ----------
// norms: Map key -> { key, kind, name, notes: Map(noteId -> [{ line, text }]), arts: Map(art -> Set(noteId)), signals: Map(sig -> [{ note, line }]), future: [{ date, note, line }], alerts: [...] }
// facts: Map «art. 107 DL 824» -> Map(factId -> [{ note, line, text, values: [], hist }])
function proIndex() {
  return gvCached('pro-index', () => {
    const prof = proProfile();
    const norms = new Map();
    const facts = new Map();
    const today = dateKey();
    const names = new Map(prof.abbr.filter((a) => a.name).map((a) => [a.key, a.name]));
    const get = (key, kind) => {
      if (!norms.has(key)) norms.set(key, { key, kind, name: names.get(key) || '', notes: new Map(), arts: new Map(), signals: new Map(), future: [], alerts: [] });
      return norms.get(key);
    };
    const histRe = new RegExp(`(${prof.hist.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'i');
    gvLive().forEach((n) => {
      const isAlerts = /alertas normativas/i.test(baseName(n.path));
      let inCode = false;
      n.body.split('\n').forEach((line, i) => {
        if (/^\s*```/.test(line)) inCode = !inCode;
        if (inCode || line.length < 4) return;
        const found = proNormsIn(line, prof);
        if (!found.length) return;
        const text = gvSnippet(line);
        const keys = new Set();
        found.forEach((f) => {
          const e = get(f.key, f.kind);
          if (keys.has(f.key)) return;
          keys.add(f.key);
          if (!e.notes.has(n.id)) e.notes.set(n.id, []);
          e.notes.get(n.id).push({ line: i, text });
          if (isAlerts && /^\s*\|\s*\[ \]/.test(line)) e.alerts.push({ note: n, line: i, text });
        });
        proSignalsIn(line, found).forEach(({ norm, sig }) => {
          const e = norms.get(norm);
          if (!e.signals.has(sig)) e.signals.set(sig, []);
          e.signals.get(sig).push({ note: n, line: i, text });
        });
        const dates = gvDatesIn(line).filter((d) => d.date > today);
        if (dates.length && /\b(rige|regir[áa]|vigencia|vigente|entra|entrar[áa]|desde|a partir)(?![\wáéíóúñ])/i.test(line)) found.forEach((f) => norms.get(f.key).future.push({ date: dates[0].date, note: n, line: i, text }));
        const arts = proArticlesIn(line, found);
        arts.forEach((a) => {
          const e = norms.get(a.norm);
          if (!e.arts.has(a.art)) e.arts.set(a.art, new Set());
          e.arts.get(a.art).add(n.id);
        });
        // Datos de la línea, solo para artículos (una ley entera tiene muchas tasas y plazos distintos).
        const subjects = [...new Set(arts.map((a) => `art. ${a.art} ${a.norm}`))];
        if (!subjects.length) return;
        const hist = histRe.test(line) || gvDatesIn(line).some((d) => d.date < today && /\bhasta\b/i.test(line));
        PRO_FACTS.filter((f) => prof.facts.has(f.id)).forEach((f) => {
          const values = [...line.matchAll(f.re)].map((m) => m[1].replace(/\.(?=\d{3})/g, ''));
          if (!values.length) return;
          subjects.forEach((s) => {
            if (!facts.has(s)) facts.set(s, new Map());
            const byFact = facts.get(s);
            if (!byFact.has(f.id)) byFact.set(f.id, []);
            byFact.get(f.id).push({ note: n, line: i, text, values: [...new Set(values)], hist });
          });
        });
      });
    });
    return { norms, facts };
  });
}

// Notas que no se comparan (registros y bitácoras: solo cuentan historia), según el perfil.
const proExcluded = (note) => {
  const name = fold(baseName(note.path));
  return /^registro$/i.test(propOf(note, 'tipo')) || proProfile().exclude.some((x) => name.includes(fold(x)));
};

// Contradicciones: el mismo tema con valores que no comparten nada entre dos notas (sin contar historia).
function proContradictions() {
  return gvCached('pro-contra', () => {
    const { norms, facts } = proIndex();
    const ignored = new Set(proCfg().ignored);
    const out = [];
    facts.forEach((byFact, subject) => {
      byFact.forEach((rows, factId) => {
        const live = rows.filter((r) => !r.hist && !proExcluded(r.note));
        const perNote = new Map();
        live.forEach((r) => {
          if (!perNote.has(r.note.id)) perNote.set(r.note.id, { note: r.note, values: new Set(), rows: [] });
          const x = perNote.get(r.note.id);
          r.values.forEach((v) => x.values.add(v));
          x.rows.push(r);
        });
        const list = [...perNote.values()];
        if (list.length < 2) return;
        let clash = false;
        for (let a = 0; a < list.length && !clash; a++) for (let b = a + 1; b < list.length && !clash; b++) if (![...list[a].values].some((v) => list[b].values.has(v))) clash = true;
        if (!clash) return;
        const sig = `${subject}|${factId}|${list.map((x) => `${x.note.id}:${[...x.values].sort().join(',')}`).sort().join(';')}`;
        if (ignored.has(sig)) return;
        out.push({ type: 'dato', subject, fact: PRO_FACTS.find((f) => f.id === factId), notes: list, sig });
      });
    });
    // Normas que alguna nota da por derogadas o reemplazadas y otra cita sin decirlo.
    // Solo «derogada»: «reemplazada» suele ser parcial o futura (la NIIF 18 reemplaza a la NIC 1 desde 2027).
    norms.forEach((e) => {
      const gone = (e.signals.get('derogada') || []).filter((g) => !proExcluded(g.note));
      if (!gone.length) return;
      const goneNotes = new Set(gone.map((g) => g.note.id));
      const plain = [];
      e.notes.forEach((lines, id) => {
        if (goneNotes.has(id)) return;
        const note = noteById(id);
        if (!note || proExcluded(note)) return;
        const quiet = lines.filter((l) => !/(derog|reemplaz|hasta|antes|histor|original|anterior|ex )/i.test(l.text));
        if (note && quiet.length) plain.push({ note, rows: quiet });
      });
      if (!plain.length) return;
      const sig = `gone|${e.key}|${plain.map((p) => p.note.id).sort().join(',')}`;
      if (ignored.has(sig)) return;
      out.push({ type: 'derogada', subject: e.key, gone, plain, sig });
    });
    return out.sort((a, b) => (a.type === b.type ? (b.notes?.length || b.plain.length) - (a.notes?.length || a.plain.length) : a.type === 'derogada' ? -1 : 1));
  });
}

// Nombre de la norma de un tema («art. 107 DL 824» → «Ley sobre Impuesto a la Renta»).
const proNormName = (subject) => {
  const key = subject.replace(/^art\. \S+(?: (?:bis|ter|qu[aá]ter|quinquies))? /i, '');
  return proProfile().abbr.find((a) => a.key === key && a.name)?.name || '';
};

// ---------- Vistas ----------
GV_VIEWS.push(
  { id: 'radar', title: 'Radar normativo', icon: 'scale', hint: 'Radar normativo: cada norma que citan tus notas, con sus artículos, señales de cambio y alertas' },
  { id: 'contradicciones', title: 'Contradicciones', icon: 'contra', hint: 'Contradicciones: el mismo artículo con datos distintos en notas distintas, y normas derogadas citadas sin decirlo' }
);
Object.assign(ICONS, {
  scale: '<path d="M12 3v18M7 21h10M5 7h14"/><path d="M5 7 2.5 13a3 3 0 0 0 5 0L5 7zM19 7l-2.5 6a3 3 0 0 0 5 0L19 7z"/>',
  contra: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.8-4.8M10.5 7.5v3.5M10.5 13.5v.01"/>',
  'pro-profile': '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/><path d="M17 4.5l1.5-1.5M19.5 7H21"/>',
});
['radar', 'contradicciones'].forEach((id) => {
  const v = GV_VIEWS.find((x) => x.id === id);
  VIEW_TITLES[id] = v.title;
  VIEW_ICONS[id] = v.icon;
  $('#views-pane main').append(el('section', { id: `view-${id}`, className: 'view gv-view' }));
});

const proState = { q: '', kind: '', signals: false, open: new Set() };
const proKindLabel = (k) => ({ ley: 'Ley', dl: 'DL', dfl: 'DFL', ds: 'DS', circ: 'Circular', res: 'Res. Ex.', ofi: 'Oficio', nic: 'NIC/NIIF/NIA' })[k] || k;
const proOpenAt = (note, line, e) => openNoteAtLine(note.id, line, { newTab: !!(e?.ctrlKey || e?.metaKey) });
// La ficha propia de la norma, si existe: una nota cuyo nombre empieza por la norma.
const proFicha = (key) => gvCached(`ficha:${key}`, () => gvLive().find((n) => fold(baseName(n.path)).startsWith(fold(key)) && /^(\s|-|–|:|$)/.test(baseName(n.path).slice(key.length))) || null);

function proLineList(rows, limit = 12) {
  const box = el('div', { className: 'pro-lines' });
  rows.slice(0, limit).forEach((r) => {
    const b = el('button', { className: 'pro-line', title: 'Abrir la nota en esta línea' }, [el('strong', {}, baseName(r.note.path)), el('span', { className: 'muted' }, r.text)]);
    b.addEventListener('click', (e) => proOpenAt(r.note, r.line, e));
    box.append(b);
  });
  if (rows.length > limit) box.append(el('p', { className: 'muted' }, `y ${rows.length - limit} más`));
  return box;
}

function renderRadar() {
  const box = $('#view-radar');
  if (!box) return;
  const { norms } = proIndex();
  const q = fold(proState.q.trim());
  const all = [...norms.values()].filter((e) => e.notes.size);
  let list = all.filter((e) => (!proState.kind || e.kind === proState.kind) && (!q || fold(`${e.key} ${e.name}`).includes(q)));
  if (proState.signals) list = list.filter((e) => e.signals.size || e.future.length || e.alerts.length);
  list.sort((a, b) => b.notes.size - a.notes.size || a.key.localeCompare(b.key, 'es', { numeric: true }));
  const kinds = [...new Set(all.map((e) => e.kind))];
  const search = el('input', { type: 'search', className: 'gv-search', placeholder: 'Buscar norma (p. ej. 21.713, LIR, Circular 53)…', value: proState.q, ariaLabel: 'Buscar norma' });
  let t = 0;
  search.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      proState.q = search.value;
      renderRadar();
      const s = $('#view-radar .gv-search');
      s?.focus();
      s?.setSelectionRange(s.value.length, s.value.length);
    }, 200);
  });
  const bar = el('div', { className: 'gv-bar' }, [
    search,
    gvSeg([['', 'Todas'], ...kinds.map((k) => [k, proKindLabel(k)])], proState.kind, (v) => { proState.kind = v; renderRadar(); }),
    gvBtn(proState.signals ? '☑ Solo con señales' : '☐ Solo con señales', () => { proState.signals = !proState.signals; renderRadar(); }, 'gv-chip', 'Solo normas derogadas, modificadas, con fecha futura o con alerta abierta'),
    el('span', { className: 'gv-spacer' }),
    el('span', { className: 'muted gv-count' }, `${plural(list.length, 'norma', 'normas')} de ${all.length}`),
    gvBtn('⚙ Perfil', proOpenProfile, 'gv-chip', 'Abrir el perfil de la especialidad (qué normas se reconocen y qué datos se vigilan)'),
  ]);
  const rows = list.slice(0, 300).map((e) => {
    const mentions = [...e.notes.values()].reduce((s, l) => s + l.length, 0);
    const badges = [
      ...PRO_SIGNALS.filter((s) => e.signals.has(s.id)).map((s) => el('span', { className: `pro-badge s-${s.id}`, title: `Alguna nota dice que está ${s.label}` }, `${s.icon} ${s.label} · ${e.signals.get(s.id).length}`)),
      e.future.length ? el('span', { className: 'pro-badge s-futura', title: 'Hay una fecha de vigencia futura' }, `🔜 ${e.future.map((f) => f.date).sort()[0].split('-').reverse().join('-')}`) : '',
      e.alerts.length ? el('span', { className: 'pro-badge s-alerta', title: 'Alerta abierta en ⏰ Alertas Normativas' }, `⚠️ alerta · ${e.alerts.length}`) : '',
    ];
    const arts = [...e.arts].sort((a, b) => b[1].size - a[1].size).slice(0, 8);
    const ficha = proFicha(e.key);
    const head = el('summary', { className: 'pro-row' }, [
      el('span', { className: 'pro-key' }, [el('strong', {}, e.key), e.name ? el('span', { className: 'muted' }, ` · ${e.name}`) : '']),
      el('span', { className: 'pro-num', title: 'Notas que la citan' }, `${e.notes.size} notas`),
      el('span', { className: 'pro-num muted', title: 'Menciones' }, `${mentions}×`),
      el('span', { className: 'pro-badges' }, badges),
    ]);
    const det = el('details', { className: 'pro-item', open: proState.open.has(e.key) });
    det.addEventListener('toggle', () => (det.open ? proState.open.add(e.key) : proState.open.delete(e.key)));
    const lines = [...e.notes].flatMap(([id, ls]) => ls.map((l) => ({ note: noteById(id), ...l }))).filter((r) => r.note);
    det.append(head, el('div', { className: 'pro-detail' }, [
      ficha ? gvBtn(`📄 Ficha: ${baseName(ficha.path)}`, (ev) => gvOpen(ficha, ev), 'gv-chip') : '',
      arts.length ? el('div', { className: 'pro-arts' }, [el('span', { className: 'muted' }, 'Artículos: '), ...arts.map(([a, ids]) => el('span', { className: 'pro-art' }, `art. ${a} · ${ids.size}`))]) : '',
      ...[...e.signals].map(([sig, rs]) => el('div', {}, [el('p', { className: 'pro-sub' }, `${PRO_SIGNALS.find((s) => s.id === sig).icon} Dicen que está ${sig}:`), proLineList(rs, 6)])),
      e.future.length ? el('div', {}, [el('p', { className: 'pro-sub' }, '🔜 Fechas de vigencia futuras:'), proLineList(e.future, 6)]) : '',
      e.alerts.length ? el('div', {}, [el('p', { className: 'pro-sub' }, '⚠️ Alertas abiertas:'), proLineList(e.alerts, 6)]) : '',
      el('p', { className: 'pro-sub' }, `Dónde se cita (${lines.length}):`),
      proLineList(lines, 25),
    ]));
    return det;
  });
  box.replaceChildren(
    gvHead('radar', 'Todas las normas que citan tus notas (leyes, DL, circulares, resoluciones, oficios, NIC/NIIF/NIA). Las señales salen del propio texto: «derogada», «modificada», fechas futuras de vigencia y alertas abiertas. Abre una norma para ver sus artículos y cada línea donde aparece.'),
    bar,
    list.length ? el('div', { className: 'pro-list gv-fill' }, rows) : el('p', { className: 'empty' }, all.length ? 'Ninguna norma coincide.' : 'Tus notas aún no citan normas reconocidas por el perfil.')
  );
}

function renderContradicciones() {
  const box = $('#view-contradicciones');
  if (!box) return;
  const list = proContradictions();
  const gone = list.filter((x) => x.type === 'derogada');
  const data = list.filter((x) => x.type === 'dato');
  const bar = el('div', { className: 'gv-bar' }, [
    el('span', { className: 'pro-badge s-derogada' }, `⛔ ${plural(gone.length, 'norma derogada citada sin decirlo', 'normas derogadas citadas sin decirlo')}`),
    el('span', { className: 'pro-badge s-modificada' }, `≠ ${plural(data.length, 'dato distinto entre notas', 'datos distintos entre notas')}`),
    el('span', { className: 'gv-spacer' }),
    proCfg().ignored.length ? gvBtn(`Mostrar ${plural(proCfg().ignored.length, 'revisada', 'revisadas')}`, () => { proCfg().ignored = []; save(); gvMemo.delete('pro-contra'); renderContradicciones(); }, 'gv-chip', 'Volver a mostrar las que marcaste como revisadas') : '',
    gvBtn('⚙ Perfil', proOpenProfile, 'gv-chip', 'Qué normas se reconocen y qué datos se comparan'),
  ]);
  const done = (sig) => {
    proCfg().ignored.push(sig);
    save();
    gvMemo.delete('pro-contra'); // recalcula la lista
    renderContradicciones();
    showToastMessage('Marcada como revisada. Vuelve a aparecer si cambian los datos.');
  };
  const cards = list.slice(0, 150).map((c) => {
    const ok = gvBtn('✓ Revisado', () => done(c.sig), 'gv-chip', 'Ocultarla (vuelve si cambian los datos)');
    if (c.type === 'derogada') {
      return el('article', { className: 'card pro-card k-gone' }, [
        el('header', { className: 'pro-card-head' }, [el('strong', {}, `⛔ ${c.subject}`), el('span', { className: 'muted' }, ' · una nota dice que está derogada o reemplazada; otras la citan sin decirlo'), el('span', { className: 'gv-spacer' }), ok]),
        el('p', { className: 'pro-sub' }, 'Dicen que está derogada o reemplazada:'),
        proLineList(c.gone, 4),
        el('p', { className: 'pro-sub' }, 'La citan sin aclararlo (revisar si debe ir como historial):'),
        proLineList(c.plain.flatMap((p) => p.rows.map((r) => ({ note: p.note, ...r }))), 8),
      ]);
    }
    return el('article', { className: 'card pro-card' }, [
      el('header', { className: 'pro-card-head' }, [el('strong', {}, `≠ ${c.subject}`), el('span', { className: 'muted' }, `${proNormName(c.subject) ? ` (${proNormName(c.subject)})` : ''} · ${c.fact.label.toLowerCase()}`), el('span', { className: 'gv-spacer' }), ok]),
      el('div', { className: 'pro-groups' }, c.notes.map((x) => el('div', { className: 'pro-group' }, [
        el('div', { className: 'pro-vals' }, [...x.values].map((v) => el('span', { className: 'pro-val' }, `${v}${c.fact.unit === '%' ? ' %' : ` ${c.fact.unit}`}`))),
        proLineList(x.rows.map((r) => ({ ...r, note: x.note })), 3),
      ]))),
    ]);
  });
  box.replaceChildren(
    gvHead('contradicciones', 'Compara tus notas entre sí: el mismo artículo con tasas, topes o plazos que no coinciden, y normas que una nota da por derogadas mientras otra las cita sin decirlo. Las líneas de historial (hasta, antes, derogada, original…) no cuentan. No todo es un error: revisa y marca «Revisado».'),
    bar,
    list.length ? el('div', { className: 'pro-list gv-fill' }, cards) : el('div', { className: 'card gvs-done' }, [el('p', { className: 'gvs-big' }, '✅ Sin contradicciones a la vista'), el('p', { className: 'muted' }, 'Ningún artículo tiene datos distintos entre notas y ninguna norma derogada se cita sin aclararlo.')])
  );
}

Object.assign(VIEW_RENDER, { radar: renderRadar, contradicciones: renderContradicciones });

// ---------- Sección «Contador» de la barra y ajuste ----------
(() => {
  const items = $('.ribbon [data-group="pro"] .rib-gitems');
  if (!items) return;
  ['radar', 'contradicciones'].forEach((id) => {
    const v = GV_VIEWS.find((x) => x.id === id);
    const b = el('button', { className: 'rib', title: v.hint, ariaLabel: v.title }, [ico(v.icon), el('span', { className: 'rib-label' }, v.title)]);
    b.dataset.view = id;
    b.addEventListener('click', (e) => showView(id, { newTab: e.ctrlKey || e.metaKey }));
    items.append(b);
  });
  const prof = el('button', { className: 'rib', id: 'rib-pro-profile', title: 'Perfil de la especialidad: qué normas se reconocen y qué datos se vigilan', ariaLabel: 'Perfil de la especialidad' }, [ico('pro-profile'), el('span', { className: 'rib-label' }, 'Perfil')]);
  prof.addEventListener('click', proOpenProfile);
  items.append(prof);
})();

function proApply() {
  const g = $('.ribbon [data-group="pro"]');
  if (g) g.hidden = !proOn();
}
proApply();

// Ajustes › Notas › Especialidad
(() => {
  const group = $('#set-g-notas');
  if (!group) return;
  const box = el('input', { type: 'checkbox', id: 'pro-on', checked: proOn() });
  box.addEventListener('change', () => {
    proCfg().on = box.checked;
    save();
    proApply();
  });
  const open = gvBtn('Abrir el perfil', proOpenProfile, 'link');
  group.append(
    el('h3', { className: 'section-title' }, 'Especialidad'),
    el('div', { className: 'card' }, [
      el('label', { className: 'set-row' }, [box, ' Contador (Chile): sección «Contador» con el Radar normativo y el Detector de contradicciones']),
      el('p', { className: 'muted' }, ['Las normas que se reconocen, sus abreviaturas y los datos que se comparan están en la nota «Perfil - Contador Chile» (carpeta Sistema). ', open]),
    ])
  );
})();
