'use strict';

// ---------- Apariencia ----------
// Ajustes › Apariencia: tema, color de acento (o uno propio), fuentes, tamaños, interlineado, ancho de
// las notas, esquinas, densidad y animaciones, con estilos rápidos que combinan varias opciones.
// Se guarda en state.settings.look (así se sincroniza entre dispositivos) y se aplica al momento.
const THEMES = {
  system: { label: 'Según el sistema', colors: ['#f6f7f9', '#111317'] },
  light: { label: 'Claro', colors: ['#f6f7f9', '#ffffff'] },
  dark: { label: 'Oscuro', colors: ['#111317', '#1b1e24'] },
  sepia: { label: 'Sepia', colors: ['#f4ecd8', '#fbf6ea'] },
  midnight: { label: 'Medianoche', colors: ['#000000', '#0d0d0f'] },
  nord: { label: 'Nórdico', colors: ['#2e3440', '#3b4252'] },
  contrast: { label: 'Alto contraste', colors: ['#ffffff', '#000000'] },
};

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
const RADII = { round: ['Redondeadas', '12px'], soft: ['Suaves', '7px'], square: ['Rectas', '2px'] };

const LOOK_DEFAULTS = { ribbonLabels: 'on', theme: 'system', customAccent: '', uiFont: 'system', noteFont: 'system', scale: 100, noteSize: 16, lineHeight: 'normal', noteWidth: 'normal', radius: 'round', density: 'comfortable', motion: 'normal' };

const LOOK_PRESETS = {
  original: { label: 'Original', look: {}, accent: 'indigo' },
  obsidian: { label: 'Bóveda oscura', look: { theme: 'dark', uiFont: 'inter', noteFont: 'inter', radius: 'soft', density: 'compact', noteWidth: 'normal' }, accent: 'fuchsia' },
  paper: { label: 'Papel', look: { theme: 'sepia', uiFont: 'system', noteFont: 'lora', noteSize: 18, lineHeight: 'relaxed', noteWidth: 'narrow' }, accent: 'orange' },
  minimal: { label: 'Minimalista', look: { theme: 'light', uiFont: 'inter', noteFont: 'inter', radius: 'square', density: 'compact', motion: 'reduce' }, accent: 'slate' },
  focus: { label: 'Lectura cómoda', look: { theme: 'system', uiFont: 'atkinson', noteFont: 'atkinson', scale: 110, noteSize: 18, lineHeight: 'relaxed' }, accent: 'blue' },
  night: { label: 'Noche', look: { theme: 'midnight', uiFont: 'system', noteFont: 'system', radius: 'soft' }, accent: 'teal' },
  nord: { label: 'Nórdico', look: { theme: 'nord', uiFont: 'inter', noteFont: 'inter', radius: 'soft' }, accent: 'blue' },
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
  const L = look();
  const root = document.documentElement;
  if (L.theme === 'system' || !THEMES[L.theme]) delete root.dataset.theme;
  else root.dataset.theme = L.theme;
  ensureFont(L.uiFont);
  ensureFont(L.noteFont);
  const set = (k, v) => root.style.setProperty(k, v);
  set('--font-ui', (FONTS[L.uiFont] || FONTS.system).stack);
  set('--font-note', (FONTS[L.noteFont] || FONTS.system).stack);
  set('--ui-scale', `${Math.min(130, Math.max(80, Number(L.scale) || 100))}%`);
  set('--note-fs', `${Math.min(24, Math.max(13, Number(L.noteSize) || 16)) / 16}rem`);
  set('--note-lh', (LINE_HEIGHTS[L.lineHeight] || LINE_HEIGHTS.normal)[1]);
  set('--note-w', (NOTE_WIDTHS[L.noteWidth] || NOTE_WIDTHS.normal)[1]);
  set('--radius', (RADII[L.radius] || RADII.round)[1]);
  root.dataset.density = L.density === 'compact' ? 'compact' : 'comfortable';
  root.dataset.motion = L.motion === 'reduce' ? 'reduce' : 'normal';
  root.dataset.riblabels = L.ribbonLabels === 'off' ? 'off' : 'on';
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

function setLook(patch) {
  state.settings.look = { ...look(), ...patch };
  save();
  applyLook();
  renderAppearance();
}

function renderAppearance() {
  const box = $('#appearance');
  if (!box) return;
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

  const themes = el('div', { className: 'ap-themes', role: 'radiogroup', ariaLabel: 'Tema' }, Object.entries(THEMES).map(([k, t]) => {
    const on = L.theme === k;
    const b = el('button', { className: `ap-theme${on ? ' on' : ''}`, role: 'radio', ariaChecked: String(on) }, [
      el('span', { className: 'ap-theme-preview', ariaHidden: 'true' }, [el('span', {}), el('span', {})]),
      t.label,
    ]);
    const [a, c] = t.colors;
    b.querySelector('.ap-theme-preview').style.background = `linear-gradient(135deg, ${a} 50%, ${c} 50%)`;
    b.addEventListener('click', () => setLook({ theme: k }));
    return b;
  }));

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
    el('h3', { className: 'ap-sub' }, 'Tema'),
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
}

// Se aplica ya (con los datos cargados de este dispositivo) para que no haya un parpadeo al abrir.
applyLook();
