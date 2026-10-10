'use strict';

// ---------- Apariencia ----------
// Ajustes › Apariencia: tema, color de acento (o uno propio), fuentes, tamaños, interlineado, ancho de
// las notas, esquinas, densidad y animaciones, con estilos rápidos que combinan varias opciones.
// Se guarda en state.settings.look (así se sincroniza entre dispositivos) y se aplica al momento.
const THEMES = {
  system: { label: 'Según el sistema', group: 'basic', skin: 'classic', fonts: ['system', 'system'], colors: ['#f6f7f9', '#111317', '#6b7280'] },
  light: { label: 'Claro', group: 'basic', skin: 'classic', fonts: ['system', 'system'], tone: 'light', colors: ['#f6f7f9', '#ffffff', '#1c1f24'] },
  dark: { label: 'Oscuro', group: 'basic', skin: 'classic', fonts: ['system', 'system'], tone: 'dark', colors: ['#111317', '#1b1e24', '#e8eaee'] },
  contrast: { label: 'Alto contraste', group: 'basic', skin: 'brutal', fonts: ['atkinson', 'atkinson'], tone: 'light', colors: ['#ffffff', '#000000', '#000000'] },
  sepia: { label: 'Sepia', group: 'warm', skin: 'paper', fonts: ['serif', 'merriweather'], tone: 'light', accent: 'orange', colors: ['#f4ecd8', '#fbf6ea', '#3b3024'] },
  midnight: { label: 'Medianoche', group: 'dark', skin: 'flat', fonts: ['inter', 'inter'], tone: 'dark', accent: 'teal', colors: ['#000000', '#0d0d0f', '#e6e6e6'] },
  nord: { label: 'Nórdico', group: 'blue', skin: 'flat', fonts: ['inter', 'inter'], tone: 'dark', accent: 'blue', colors: ['#2e3440', '#3b4252', '#eceff4'] },
  cream: { label: 'Crema', group: 'soft', skin: 'paper', fonts: ['system', 'lora'], tone: 'light', accent: 'orange', colors: ['#faf6ef', '#fffdf8', '#3a3229'] },
  rose: { label: 'Rosa empolvado', group: 'soft', skin: 'soft', fonts: ['nunito', 'nunito'], tone: 'light', accent: 'fuchsia', colors: ['#faf1f3', '#fffafb', '#3d2a30'] },
  lavender: { label: 'Lavanda', group: 'soft', skin: 'glass', fonts: ['inter', 'inter'], tone: 'light', accent: 'indigo', colors: ['#f4f2fb', '#fbfaff', '#2e2a3d'] },
  mint: { label: 'Menta', group: 'soft', skin: 'soft', fonts: ['nunito', 'nunito'], tone: 'light', accent: 'teal', colors: ['#eff7f3', '#f9fdfb', '#21372d'] },
  sage: { label: 'Salvia', group: 'soft', skin: 'flat', fonts: ['atkinson', 'atkinson'], tone: 'light', accent: 'teal', colors: ['#eef1ea', '#f8faf5', '#2c3327'] },
  fog: { label: 'Niebla', group: 'soft', skin: 'flat', fonts: ['inter', 'inter'], tone: 'light', accent: 'slate', colors: ['#eef0f3', '#f8f9fb', '#2a2f38'] },
  sand: { label: 'Arena', group: 'warm', skin: 'float', fonts: ['system', 'lora'], tone: 'light', accent: 'orange', colors: ['#f3ebe0', '#faf5ee', '#3d3226'] },
  peach: { label: 'Melocotón', group: 'warm', skin: 'soft', fonts: ['nunito', 'lora'], tone: 'light', accent: 'orange', colors: ['#fdf1ea', '#fffaf6', '#40302a'] },
  solarlight: { label: 'Solarizado claro', group: 'warm', skin: 'term', fonts: ['mono', 'mono'], tone: 'light', accent: 'blue', colors: ['#fdf6e3', '#fffbef', '#3f5259'] },
  dusk: { label: 'Atardecer', group: 'warm', skin: 'float', fonts: ['inter', 'merriweather'], tone: 'dark', accent: 'orange', colors: ['#1f1a17', '#29221e', '#f1e6dc'] },
  coffee: { label: 'Café', group: 'warm', skin: 'paper', fonts: ['serif', 'lora'], tone: 'dark', accent: 'orange', colors: ['#1c1714', '#262019', '#eee2d3'] },
  gruvbox: { label: 'Gruvbox', group: 'warm', skin: 'term', fonts: ['mono', 'mono'], tone: 'dark', accent: 'orange', colors: ['#282828', '#32302f', '#ebdbb2'] },
  sky: { label: 'Cielo', group: 'blue', skin: 'brutal', fonts: ['inter', 'inter'], tone: 'light', accent: 'blue', colors: ['#eef5fc', '#f9fcff', '#1d2f45'] },
  ocean: { label: 'Océano', group: 'blue', skin: 'glass', fonts: ['inter', 'inter'], tone: 'light', accent: 'blue', colors: ['#e6eef8', '#f5f8fd', '#132840'] },
  navy: { label: 'Azul marino', group: 'blue', skin: 'float', fonts: ['inter', 'inter'], tone: 'dark', accent: 'blue', colors: ['#0f1a2b', '#16233a', '#e3ebf6'] },
  deepsea: { label: 'Mar profundo', group: 'blue', skin: 'glass', fonts: ['inter', 'inter'], tone: 'dark', accent: 'teal', colors: ['#0b1f2a', '#102a38', '#dceef5'] },
  solardark: { label: 'Solarizado oscuro', group: 'blue', skin: 'term', fonts: ['mono', 'mono'], tone: 'dark', accent: 'teal', colors: ['#002b36', '#073642', '#d3dcdc'] },
  plum: { label: 'Ciruela', group: 'dark', skin: 'glass', fonts: ['nunito', 'nunito'], tone: 'dark', accent: 'fuchsia', colors: ['#1e1724', '#281f30', '#ece4f3'] },
  forest: { label: 'Bosque', group: 'dark', skin: 'float', fonts: ['atkinson', 'lora'], tone: 'dark', accent: 'teal', colors: ['#121b16', '#18241d', '#e2eee6'] },
  dracula: { label: 'Drácula', group: 'dark', skin: 'float', fonts: ['inter', 'inter'], tone: 'dark', accent: 'fuchsia', colors: ['#282a36', '#303341', '#f8f8f2'] },
};
const THEME_GROUPS = { basic: 'Básicos', soft: 'Suaves', warm: 'Cálidos', blue: 'Azules y fríos', dark: 'Oscuros' };

// Fuentes del sistema (no se descargan nada) y algunas de Google Fonts, que se cargan solo al elegirlas.
const FONTS = {
  system: { label: 'Del sistema', stack: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  inter: { label: 'Inter', stack: '"Inter", system-ui, sans-serif', google: 'Inter:wght@400;500;600;700' },
  atkinson: { label: 'Atkinson (muy legible)', stack: '"Atkinson Hyperlegible", system-ui, sans-serif', google: 'Atkinson+Hyperlegible:wght@400;700' },
  nunito: { label: 'Nunito (redondeada)', stack: '"Nunito", ui-rounded, system-ui, sans-serif', google: 'Nunito:wght@400;600;700' },
  rounded: { label: 'Redondeada del sistema', stack: 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, sans-serif' },
  serif: { label: 'Serif del sistema', stack: 'Charter, "Iowan Old Style", Georgia, Cambria, "Times New Roman", serif' },
  lora: { label: 'Lora (serif)', stack: '"Lora", Georgia, serif', google: 'Lora:wght@400;600;700' },
  merriweather: { label: 'Merriweather (serif)', stack: '"Merriweather", Georgia, serif', google: 'Merriweather:wght@400;700' },
  mono: { label: 'Monoespaciada', stack: '"JetBrains Mono", ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace', google: 'JetBrains+Mono:wght@400;600' },
};

const NOTE_WIDTHS = { narrow: ['Estrecho', '620px'], normal: ['Normal', '720px'], wide: ['Ancho', '900px'], full: ['Todo el ancho', 'none'] };
const LINE_HEIGHTS = { compact: ['Compacto', '1.5'], normal: ['Normal', '1.75'], relaxed: ['Amplio', '2'] };
const RADII = { pill: ['Muy redondeadas', '20px'], round: ['Redondeadas', '12px'], soft: ['Suaves', '7px'], square: ['Rectas', '2px'] };

// Estilos de interfaz: cambian la forma de paneles, recuadros, bordes, pestañas, botones y títulos
// (los colores siguen saliendo del tema). Cada tema trae uno, que se puede cambiar.
const SKINS = {
  classic: { label: 'Clásico', hint: 'Paneles unidos y bordes finos, como Obsidian', radius: 'round' },
  float: { label: 'Flotante', hint: 'Paneles separados como tarjetas, con sombra', radius: 'round' },
  flat: { label: 'Plano', hint: 'Sin cajas: líneas finas y pestañas subrayadas', radius: 'soft' },
  paper: { label: 'Cuaderno', hint: 'Títulos con serif, hojas rayadas y líneas finas', radius: 'square' },
  soft: { label: 'Redondeado', hint: 'Pastillas, mucho aire y paneles con color', radius: 'pill' },
  glass: { label: 'Cristal', hint: 'Fondo con degradado y paneles translúcidos', radius: 'round' },
  term: { label: 'Terminal', hint: 'Monoespaciada, bordes discontinuos, todo recto', radius: 'square' },
  brutal: { label: 'Neobrutalista', hint: 'Bordes gruesos, sombras duras y negritas', radius: 'soft' },
};

const LOOK_DEFAULTS = { ribbonLabels: 'on', skin: 'classic', themeStyle: 'on', theme: 'system', customAccent: '', uiFont: 'system', noteFont: 'system', scale: 100, noteSize: 16, lineHeight: 'normal', noteWidth: 'full', radius: 'round', density: 'comfortable', motion: 'normal', wideV1: true };

const LOOK_PRESETS = {
  original: { label: 'Original', look: {}, accent: 'indigo' },
  obsidian: { label: 'Bóveda oscura', look: { skin: 'flat', theme: 'dark', uiFont: 'inter', noteFont: 'inter', radius: 'soft', density: 'compact', noteWidth: 'normal' }, accent: 'fuchsia' },
  paper: { label: 'Papel', look: { skin: 'paper', radius: 'square', theme: 'sepia', uiFont: 'system', noteFont: 'lora', noteSize: 18, lineHeight: 'relaxed', noteWidth: 'narrow' }, accent: 'orange' },
  minimal: { label: 'Minimalista', look: { skin: 'flat', theme: 'light', uiFont: 'inter', noteFont: 'inter', radius: 'square', density: 'compact', motion: 'reduce' }, accent: 'slate' },
  focus: { label: 'Lectura cómoda', look: { theme: 'system', uiFont: 'atkinson', noteFont: 'atkinson', scale: 110, noteSize: 18, lineHeight: 'relaxed' }, accent: 'blue' },
  night: { label: 'Noche', look: { skin: 'flat', theme: 'midnight', uiFont: 'system', noteFont: 'system', radius: 'soft' }, accent: 'teal' },
  nord: { label: 'Nórdico', look: { skin: 'flat', theme: 'nord', uiFont: 'inter', noteFont: 'inter', radius: 'soft' }, accent: 'blue' },
  warm: { label: 'Cálido', look: { skin: 'soft', radius: 'pill', theme: 'peach', uiFont: 'nunito', noteFont: 'lora', lineHeight: 'relaxed' }, accent: 'orange' },
  pastel: { label: 'Pastel', look: { skin: 'glass', theme: 'lavender', uiFont: 'nunito', noteFont: 'nunito', radius: 'round' }, accent: 'fuchsia' },
  ocean: { label: 'Océano', look: { skin: 'glass', theme: 'ocean', uiFont: 'inter', noteFont: 'inter' }, accent: 'blue' },
  calm: { label: 'Calma', look: { skin: 'flat', theme: 'sage', uiFont: 'atkinson', noteFont: 'atkinson', lineHeight: 'relaxed' }, accent: 'teal' },
  ember: { label: 'Brasas', look: { skin: 'float', theme: 'dusk', uiFont: 'system', noteFont: 'merriweather', radius: 'soft' }, accent: 'orange' },
  retro: { label: 'Terminal', look: { skin: 'term', radius: 'square', theme: 'gruvbox', uiFont: 'mono', noteFont: 'mono', density: 'compact' }, accent: 'orange' },
  pop: { label: 'Neobrutal', look: { skin: 'brutal', radius: 'soft', theme: 'sky', uiFont: 'inter', noteFont: 'inter' }, accent: 'fuchsia' },
  abyss: { label: 'Abismo', look: { skin: 'float', theme: 'navy', uiFont: 'inter', noteFont: 'inter', radius: 'soft' }, accent: 'teal' },
};

const look = () => ({ ...LOOK_DEFAULTS, ...(state.settings.look || {}) });

const loadedFonts = new Set();
function ensureFont(key) {
  const f = FONTS[key];
  if (!f?.google || loadedFonts.has(key)) return;
  loadedFonts.add(key);
  document.head.append(el('link', { rel: 'stylesheet', href: `https://fonts.googleapis.com/css2?family=${f.google}&display=swap` }));
}

function applyLook() {
  // Una vez: las notas pasan a usar todo el ancho (antes iban centradas a 720 px).
  const saved = state.settings.look;
  if (saved && !saved.wideV1) {
    if (!saved.noteWidth || saved.noteWidth === 'normal') saved.noteWidth = 'full';
    saved.wideV1 = true;
  }
  const L = look();
  const root = document.documentElement;
  if (L.theme === 'system' || !THEMES[L.theme]) delete root.dataset.theme;
  else root.dataset.theme = L.theme;
  // Tono del tema (claro u oscuro): lo comparten todos los temas de cada tipo (colores de estado, mapas, ideas…).
  const tone = THEMES[L.theme]?.tone;
  if (tone) root.dataset.tone = tone;
  else delete root.dataset.tone;
  ensureFont(L.uiFont);
  ensureFont(L.noteFont);
  const set = (k, v) => root.style.setProperty(k, v);
  set('--font-ui', (FONTS[L.uiFont] || FONTS.system).stack);
  set('--font-note', (FONTS[L.noteFont] || FONTS.system).stack);
  set('--ui-scale', `${Math.min(130, Math.max(80, Number(L.scale) || 100))}%`);
  set('--note-fs', `${Math.min(24, Math.max(13, Number(L.noteSize) || 16)) / 16}rem`);
  set('--note-lh', (LINE_HEIGHTS[L.lineHeight] || LINE_HEIGHTS.normal)[1]);
  set('--note-w', (NOTE_WIDTHS[L.noteWidth] || NOTE_WIDTHS.normal)[1]);
  renderWidthButton(L);
  set('--radius', (RADII[L.radius] || RADII.round)[1]);
  root.dataset.density = L.density === 'compact' ? 'compact' : 'comfortable';
  root.dataset.motion = L.motion === 'reduce' ? 'reduce' : 'normal';
  root.dataset.riblabels = L.ribbonLabels === 'off' ? 'off' : 'on';
  if (SKINS[L.skin] && L.skin !== 'classic') root.dataset.skin = L.skin;
  else delete root.dataset.skin;
  if (L.skin === 'term') ensureFont('mono');
  // Color propio: un tono para temas claros y otro más luminoso para los oscuros.
  if (/^#[0-9a-f]{6}$/i.test(L.customAccent || '')) {
    set('--accent-l', L.customAccent);
    set('--accent-d', `color-mix(in srgb, ${L.customAccent} 62%, white)`);
  } else {
    root.style.removeProperty('--accent-l');
    root.style.removeProperty('--accent-d');
  }
  // El grafo y los lienzos leen los colores al dibujar.
  if (typeof globalGraph !== 'undefined' && globalGraph) globalGraph.draw?.();
}

// Al cambiar de tema, el acento acompaña (naranja en los cálidos, azul en los azules…), salvo que
// se haya elegido otro a mano o un color propio.
function chooseTheme(k) {
  const L = look();
  const before = THEMES[L.theme]?.accent || 'indigo';
  if (!L.customAccent && (state.settings.accent || 'indigo') === before) state.settings.accent = THEMES[k]?.accent || 'indigo';
  const t = THEMES[k] || {};
  // El tema trae también su estilo de interfaz y sus letras (salvo que se haya desactivado).
  const extra = L.themeStyle === 'off' || !t.skin ? {} : { skin: t.skin, radius: SKINS[t.skin].radius, uiFont: t.fonts[0], noteFont: t.fonts[1] };
  setLook({ theme: k, ...extra });
  applySettings();
  renderAccents?.();
}

// Botón de la barra de la nota: alterna entre todo el ancho y el ancho de lectura elegido antes.
function renderWidthButton(L = look()) {
  const b = $('#note-width');
  if (!b) return;
  const full = L.noteWidth === 'full';
  b.ariaPressed = String(full);
  b.title = full ? 'Ancho de lectura (texto centrado)' : 'Usar todo el ancho';
  b.ariaLabel = b.title;
  b.querySelector('.ico').dataset.icon = full ? 'narrow' : 'widen';
  if (typeof paintIcons === 'function') paintIcons(b);
}
function toggleNoteWidth() {
  const L = look();
  if (L.noteWidth === 'full') setLook({ noteWidth: L.noteWidthPrev && L.noteWidthPrev !== 'full' ? L.noteWidthPrev : 'normal' });
  else setLook({ noteWidth: 'full', noteWidthPrev: L.noteWidth });
}
$('#note-width')?.addEventListener('click', toggleNoteWidth);
COMMANDS_EXTRA.push(() => [{ label: look().noteWidth === 'full' ? 'Notas con ancho de lectura' : 'Notas a todo el ancho', action: toggleNoteWidth }]);

function setLook(patch) {
  state.settings.look = { ...look(), ...patch };
  save();
  applyLook();
  renderAppearance();
}

const AP_CONTROLS = 'button, select, input';
function renderAppearance() {
  const box = $('#appearance');
  if (!box) return;
  // Se redibuja todo: el foco vuelve al mismo control (misma posición) para seguir con el teclado.
  const focusAt = box.contains(document.activeElement) ? [...box.querySelectorAll(AP_CONTROLS)].indexOf(document.activeElement) : -1;
  const L = look();
  const seg = (key, options, label) => {
    const group = el('div', { className: 'segmented', role: 'radiogroup', ariaLabel: label });
    Object.entries(options).forEach(([k, [text]]) => {
      const b = el('button', { className: `seg${L[key] === k ? ' active' : ''}`, role: 'radio', ariaChecked: String(L[key] === k) }, text);
      b.addEventListener('click', () => setLook({ [key]: k }));
      group.append(b);
    });
    return group;
  };
  const fontSelect = (key, label) => {
    const s = el('select', { ariaLabel: label });
    Object.entries(FONTS).forEach(([k, f]) => s.append(el('option', { value: k, selected: L[key] === k }, f.label)));
    s.addEventListener('change', () => setLook({ [key]: s.value }));
    return s;
  };
  const range = (key, min, max, step, fmt, label) => {
    const out = el('span', { className: 'ap-value' }, fmt(L[key]));
    const r = el('input', { type: 'range', min, max, step, value: L[key], ariaLabel: label });
    r.addEventListener('input', () => {
      out.textContent = fmt(Number(r.value));
      // Al arrastrar se aplica en vivo; se guarda al soltar.
      state.settings.look = { ...look(), [key]: Number(r.value) };
      applyLook();
    });
    r.addEventListener('change', () => setLook({ [key]: Number(r.value) }));
    return el('div', { className: 'ap-range' }, [r, out]);
  };
  const row = (label, control, hint) => el('div', { className: 'ap-row' }, [el('div', { className: 'ap-label' }, [el('span', {}, label), hint ? el('small', { className: 'muted' }, hint) : '']), control]);

  const themeButton = ([k, t]) => {
    const on = L.theme === k;
    const b = el('button', { className: `ap-theme${on ? ' on' : ''}`, role: 'radio', ariaChecked: String(on) }, [el('span', { className: 'ap-theme-preview', ariaHidden: 'true' }, el('i')), t.label]);
    const [a, c, ink] = t.colors;
    b.querySelector('.ap-theme-preview').style.background = `linear-gradient(135deg, ${a} 50%, ${c} 50%)`;
    b.querySelector('.ap-theme-preview i').style.background = ink;
    b.addEventListener('click', () => chooseTheme(k));
    return b;
  };
  const skins = el(
    'div',
    { className: 'ap-skins', role: 'radiogroup', ariaLabel: 'Estilo de la interfaz' },
    Object.entries(SKINS).map(([k, sk]) => {
      const on = (L.skin || 'classic') === k;
      const b = el('button', { className: `ap-skin${on ? ' on' : ''}`, role: 'radio', ariaChecked: String(on) }, [
        el('span', { className: `sk-prev ${k}`, ariaHidden: 'true' }, [el('i'), el('i'), el('b', {}, [el('span'), el('span'), el('span')])]),
        el('span', {}, sk.label),
        el('small', {}, sk.hint),
      ]);
      b.addEventListener('click', () => setLook({ skin: k, radius: SKINS[k].radius }));
      return b;
    })
  );
  const themes = el(
    'div',
    { role: 'radiogroup', ariaLabel: 'Tema' },
    Object.entries(THEME_GROUPS).map(([g, title]) =>
      el('div', { className: 'ap-theme-group' }, [el('h4', {}, title), el('div', { className: 'ap-themes' }, Object.entries(THEMES).filter(([, t]) => t.group === g).map(themeButton))])
    )
  );

  const presets = el('div', { className: 'ap-presets' }, Object.entries(LOOK_PRESETS).map(([k, p]) => {
    const b = el('button', { className: 'chip' }, p.label);
    b.addEventListener('click', () => {
      state.settings.accent = p.accent;
      // El estilo no cambia si la barra muestra nombres: eso lo decide cada persona.
      state.settings.look = { ...LOOK_DEFAULTS, ribbonLabels: look().ribbonLabels, ...p.look };
      save();
      applySettings();
      applyLook();
      renderAccents();
      renderAppearance();
      showToastMessage(`Estilo «${p.label}» aplicado`);
    });
    return b;
  }));

  const custom = el('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(L.customAccent) ? L.customAccent : '#4f46e5', ariaLabel: 'Color propio' });
  custom.addEventListener('change', () => setLook({ customAccent: custom.value }));
  const clearCustom = el('button', { className: 'link', hidden: !L.customAccent }, 'Quitar color propio');
  clearCustom.addEventListener('click', () => setLook({ customAccent: '' }));

  box.replaceChildren(
    el('h3', { className: 'ap-sub' }, 'Estilos rápidos'),
    presets,
    el('h3', { className: 'ap-sub' }, 'Estilo de la interfaz'),
    skins,
    el('h3', { className: 'ap-sub' }, 'Tema'),
    row('Al elegir un tema', seg('themeStyle', { on: ['Cambiar también estilo y letras'], off: ['Solo los colores'] }, 'Al elegir un tema'), 'Cada tema trae su estilo de interfaz y sus letras'),
    themes,
    el('h3', { className: 'ap-sub' }, 'Color de acento'),
    $('#accent-picker'),
    el('div', { className: 'ap-custom' }, [el('label', { className: 'row' }, ['Color propio', custom]), clearCustom]),
    el('h3', { className: 'ap-sub' }, 'Texto'),
    row('Fuente de la interfaz', fontSelect('uiFont', 'Fuente de la interfaz')),
    row('Fuente de las notas', fontSelect('noteFont', 'Fuente de las notas')),
    row('Tamaño general', range('scale', 85, 125, 5, (v) => `${v} %`, 'Tamaño general'), 'Agranda o reduce toda la app'),
    row('Tamaño del texto de las notas', range('noteSize', 13, 24, 1, (v) => `${v} px`, 'Tamaño del texto de las notas')),
    row('Interlineado de las notas', seg('lineHeight', LINE_HEIGHTS, 'Interlineado')),
    el('h3', { className: 'ap-sub' }, 'Diseño'),
    row('Barra de la izquierda', seg('ribbonLabels', { on: ['Iconos y nombres'], off: ['Solo iconos'] }, 'Barra de la izquierda'), 'Muestra el nombre de cada sección junto a su icono'),
    row('Ancho de las notas', seg('noteWidth', NOTE_WIDTHS, 'Ancho de las notas')),
    row('Esquinas', seg('radius', RADII, 'Esquinas')),
    row('Densidad', seg('density', { comfortable: ['Cómoda'], compact: ['Compacta'] }, 'Densidad'), 'Compacta muestra más cosas a la vez'),
    row('Animaciones', seg('motion', { normal: ['Normales'], reduce: ['Reducidas'] }, 'Animaciones')),
    (() => {
      const reset = el('button', {}, 'Restablecer la apariencia');
      reset.addEventListener('click', () => {
        delete state.settings.look;
        state.settings.accent = 'indigo';
        save();
        applySettings();
        applyLook();
        renderAccents();
        renderAppearance();
      });
      return el('div', { className: 'row ap-reset' }, [reset, el('span', { className: 'muted' }, 'La apariencia se sincroniza entre tus dispositivos.')]);
    })()
  );
  if (focusAt >= 0) box.querySelectorAll(AP_CONTROLS)[focusAt]?.focus({ preventScroll: true });
}

// Se aplica ya (con los datos cargados de este dispositivo) para que no haya un parpadeo al abrir.
applyLook();
