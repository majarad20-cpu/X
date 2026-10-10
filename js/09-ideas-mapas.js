'use strict';

// ---------- Ideas ----------
let ideaView = 'notes';
let ideaSearch = '';
let ideaTag = null;
let editingIdeaId = null;
let ideaColor = null; // filtro por color
let paletteFor = null; // idea con la paleta de colores abierta

// Colores de las tarjetas, como en Google Keep.
const IDEA_COLORS = [
  ['', 'Sin color'],
  ['red', 'Rojo'],
  ['orange', 'Naranja'],
  ['yellow', 'Amarillo'],
  ['green', 'Verde'],
  ['teal', 'Turquesa'],
  ['blue', 'Azul'],
  ['purple', 'Morado'],
  ['gray', 'Gris'],
];
const colorLabel = (c) => IDEA_COLORS.find(([k]) => k === (c || ''))?.[1] || 'Sin color';

// Texto de la idea: las líneas «- [ ]» son casillas que se marcan con un toque.
function ideaBody(idea) {
  const body = el('div', { className: 'idea-text' });
  idea.text.split('\n').forEach((line, i) => {
    const m = line.match(/^\s*[-*]\s+\[([ xX])\]\s*(.*)$/);
    if (!m) {
      body.append(el('div', { className: 'idea-line' }, line ? relTextNodes(line) : '\u00a0'));
      return;
    }
    const box = el('input', { type: 'checkbox', checked: m[1] !== ' ', ariaLabel: m[2] || 'Elemento' });
    box.addEventListener('change', () => {
      const lines = idea.text.split('\n');
      lines[i] = lines[i].replace(/\[[ xX]\]/, box.checked ? '[x]' : '[ ]');
      idea.text = lines.join('\n');
      idea.updatedAt = Date.now();
      save();
      renderIdeas();
    });
    body.append(el('label', { className: `idea-check${box.checked ? ' done' : ''}` }, [box, el('span', {}, relTextNodes(m[2]))]));
  });
  return body;
}

// Saca las #etiquetas de un texto conservando los saltos de línea.
function extractTags(text) {
  const tags = [];
  const clean = text
    .replace(/(^|[ \t])#([\p{L}\p{N}_-]+)/gu, (_, sp, tag) => {
      tag = tag.toLowerCase();
      if (!tags.includes(tag)) tags.push(tag);
      return sp;
    })
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .trim();
  return { text: clean || text.trim(), tags };
}

$$('[data-ideaview]').forEach((btn) =>
  btn.addEventListener('click', () => {
    ideaView = btn.dataset.ideaview;
    $$('[data-ideaview]').forEach((b) => {
      b.classList.toggle('active', b === btn);
      b.ariaPressed = String(b === btn);
    });
    renderIdeas();
  })
);

$('#idea-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const raw = $('#idea-text').value.trim();
  if (!raw) return;
  const idea = { id: uid(), ...extractTags(raw), pinned: false, createdAt: Date.now(), updatedAt: Date.now() };
  state.ideas.push(idea);
  logEvent('idea', idea.text.split('\n')[0], { ref: idea.id, detail: idea.tags.map((t) => `#${t}`).join(' ') });
  save();
  e.target.reset();
  renderIdeas();
  $('#idea-text').focus();
});
$('#idea-text').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    $('#idea-form').requestSubmit();
  }
});
$('#idea-search').addEventListener('input', (e) => {
  ideaSearch = e.target.value.trim().toLowerCase();
  renderIdeas();
});

function ideaCard(idea) {
  if (idea.id === editingIdeaId) {
    const area = el('textarea', { className: 'notes', rows: 4, value: [idea.text, ...idea.tags.map((t) => `#${t}`)].join(' ').replace(/ (#)/, '\n$1'), ariaLabel: 'Editar idea' });
    const ok = el('button', { className: 'primary' }, 'Guardar');
    const cancel = el('button', {}, 'Cancelar');
    ok.addEventListener('click', () => {
      if (!area.value.trim()) return;
      Object.assign(idea, extractTags(area.value), { updatedAt: Date.now() });
      editingIdeaId = null;
      save();
      renderIdeas();
    });
    cancel.addEventListener('click', () => {
      editingIdeaId = null;
      renderIdeas();
    });
    setTimeout(() => area.focus());
    const box = el('article', { className: 'card idea editing' }, [area, el('div', { className: 'row' }, [ok, cancel]), relItemPanel('idea', idea)]);
    box.dataset.relType = 'idea';
    box.dataset.relId = idea.id;
    return box;
  }

  const pin = el('button', { className: `icon-link${idea.pinned ? ' on' : ''}`, title: idea.pinned ? 'Desfijar' : 'Fijar arriba', ariaPressed: String(!!idea.pinned) }, '📌');
  const paint = el('button', { className: 'icon-link', title: `Color: ${colorLabel(idea.color)}`, ariaLabel: `Color de la idea: ${colorLabel(idea.color)}`, ariaExpanded: String(paletteFor === idea.id) }, '🎨');
  paint.addEventListener('click', () => {
    paletteFor = paletteFor === idea.id ? null : idea.id;
    renderIdeas();
  });
  pin.addEventListener('click', () => {
    idea.pinned = !idea.pinned;
    save();
    renderIdeas();
  });
  const edit = el('button', { className: 'link' }, 'Editar');
  edit.addEventListener('click', () => {
    editingIdeaId = idea.id;
    renderIdeas();
  });
  const toTask = el('button', { className: 'link' }, '→ Tarea');
  toTask.addEventListener('click', () => {
    // La idea queda enlazada con la tarea que sale de ella (se ve en «Relacionado»).
    const t = addTask(idea.text.split('\n')[0]);
    if (t) {
      idea.links = (idea.links || []).concat({ type: 'task', id: t.id });
      save();
    }
    showToastMessage('Tarea creada en Tareas');
  });
  const toMap = el('button', { className: 'link' }, '→ Mapa');
  toMap.addEventListener('click', () => {
    // La primera línea es el tema central; las demás, sus ramas.
    const [first, ...rest] = idea.text.split('\n').map((l) => l.replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, '').trim()).filter(Boolean);
    const map = newMap(first.slice(0, 80));
    rest.forEach((line) => map.nodes.push({ id: uid(), parent: 'root', text: line.slice(0, 120) }));
    save();
    openMap(map.id);
  });
  const del = el('button', { className: 'link danger-link' }, 'Borrar');
  del.addEventListener('click', () =>
    withUndo('Idea borrada', () => {
      state.ideas = state.ideas.filter((x) => x.id !== idea.id);
    })
  );
  const date = new Date(idea.createdAt).toLocaleDateString('es', { day: 'numeric', month: 'short' });
  const card = el('article', { className: `card idea${idea.pinned ? ' pinned' : ''}${idea.color ? ` ic-${idea.color}` : ''}` }, [
    el('header', { className: 'idea-head' }, [el('span', { className: 'muted' }, date), el('span', { className: 'idea-head-actions' }, [paint, pin])]),
    ideaBody(idea),
  ]);
  if (paletteFor === idea.id) {
    card.append(el('div', { className: 'idea-palette', role: 'group', ariaLabel: 'Color' }, IDEA_COLORS.map(([c, label]) => {
      const sw = el('button', { className: `color-dot${c ? ` ic-${c}` : ''}${(idea.color || '') === c ? ' on' : ''}`, title: label, ariaLabel: label, ariaPressed: String((idea.color || '') === c) });
      sw.addEventListener('click', () => {
        if (c) idea.color = c;
        else delete idea.color;
        idea.updatedAt = Date.now();
        paletteFor = null;
        save();
        renderIdeas();
      });
      return sw;
    })));
  }
  if (idea.tags.length) {
    card.append(el('div', { className: 'tags' }, idea.tags.map((t) => {
      const chip = el('button', { className: `tag${t === ideaTag ? ' active' : ''}` }, `#${t}`);
      chip.addEventListener('click', () => {
        ideaTag = ideaTag === t ? null : t;
        renderIdeas();
      });
      return chip;
    })));
  }
  card.append(el('footer', { className: 'entry-actions' }, [edit, toTask, toMap, del]));
  card.dataset.relType = 'idea';
  card.dataset.relId = idea.id;
  return card;
}

function renderIdeas() {
  $('#ideas-notes-pane').hidden = ideaView !== 'notes';
  $('#ideas-maps-pane').hidden = ideaView !== 'maps';
  if (ideaView === 'maps') return renderMaps();

  const tags = [...new Set(state.ideas.flatMap((i) => i.tags))].sort((a, b) => a.localeCompare(b, 'es'));
  if (ideaTag && !tags.includes(ideaTag)) ideaTag = null;
  const all = el('button', { className: `tag${ideaTag ? '' : ' active'}` }, 'Todas');
  all.addEventListener('click', () => {
    ideaTag = null;
    renderIdeas();
  });
  $('#idea-tags').replaceChildren(...(tags.length ? [all, ...tags.map((t) => {
    const b = el('button', { className: `tag${t === ideaTag ? ' active' : ''}` }, `#${t}`);
    b.addEventListener('click', () => {
      ideaTag = ideaTag === t ? null : t;
      renderIdeas();
    });
    return b;
  })] : []));
  $('#idea-tags').hidden = !tags.length;

  // Filtro por color: solo los colores que se usan.
  const colors = IDEA_COLORS.filter(([c]) => c && state.ideas.some((i) => i.color === c));
  if (ideaColor && !colors.some(([c]) => c === ideaColor)) ideaColor = null;
  $('#idea-colors').replaceChildren(
    ...colors.map(([c, label]) => {
      const b = el('button', { className: `color-dot ic-${c}${ideaColor === c ? ' on' : ''}`, title: `Solo ${label.toLowerCase()}`, ariaLabel: `Filtrar por ${label.toLowerCase()}`, ariaPressed: String(ideaColor === c) });
      b.addEventListener('click', () => {
        ideaColor = ideaColor === c ? null : c;
        renderIdeas();
      });
      return b;
    })
  );
  $('#idea-colors').hidden = !colors.length;

  const list = state.ideas
    .filter((i) => !ideaTag || i.tags.includes(ideaTag))
    .filter((i) => !ideaColor || i.color === ideaColor)
    .filter((i) => !ideaSearch || `${i.text} ${i.tags.join(' ')}`.toLowerCase().includes(ideaSearch))
    .sort((a, b) => b.createdAt - a.createdAt);
  const pinned = list.filter((i) => i.pinned);
  const others = list.filter((i) => !i.pinned);
  const section = (title, items) => el('section', { className: 'idea-section' }, [title ? el('h3', { className: 'idea-section-title' }, title) : '', el('div', { className: 'idea-grid' }, items.map(ideaCard))]);
  $('#idea-list').replaceChildren(
    ...(pinned.length ? [section('Fijadas', pinned)] : []),
    ...(others.length ? [section(pinned.length ? 'Otras' : '', others)] : [])
  );
  $('#idea-empty').hidden = list.length > 0;
  $('#idea-empty').textContent = state.ideas.length ? 'Ninguna idea coincide.' : 'Sin ideas todavía. Las buenas ideas llegan en cualquier momento: apúntalas aquí.';
}

// ---------- Mapas mentales ----------
let openMapId = null;
let selectedNode = 'root';
let editingNode = null;
let mapZoom = 1;
let mapLayout = null; // última disposición calculada (para navegar con flechas y exportar)
const BRANCH_COUNT = 6;

function newMap(title) {
  const map = { id: uid(), title, createdAt: Date.now(), updatedAt: Date.now(), nodes: [{ id: 'root', parent: null, text: title }] };
  state.maps.push(map);
  logEvent('map', `Nuevo mapa: ${title}`, { ref: map.id });
  return map;
}

const currentMap = () => state.maps.find((m) => m.id === openMapId);

function openMap(id) {
  openMapId = id;
  selectedNode = 'root';
  editingNode = null;
  mapZoom = 1;
  ideaView = 'maps';
  $$('[data-ideaview]').forEach((b) => {
    b.classList.toggle('active', b.dataset.ideaview === 'maps');
    b.ariaPressed = String(b.dataset.ideaview === 'maps');
  });
  showView('ideas');
  renderIdeas();
  fitMap();
  $('#map-canvas').focus({ preventScroll: true });
}

function touchMap(map) {
  map.title = map.nodes.find((n) => !n.parent).text;
  map.updatedAt = Date.now();
  save();
}

$('#map-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const title = $('#map-title').value.trim();
  if (!title) return;
  const map = newMap(title);
  save();
  e.target.reset();
  openMap(map.id);
});
$('#map-back').addEventListener('click', () => {
  openMapId = null;
  renderIdeas();
});
$('#map-name').addEventListener('input', (e) => {
  const map = currentMap();
  if (!map || !e.target.value.trim()) return;
  map.nodes.find((n) => !n.parent).text = e.target.value.trim();
  touchMap(map);
  renderMap();
});

function renderMaps() {
  const open = !!currentMap();
  if (!open) openMapId = null;
  $('#maps-list-pane').hidden = open;
  $('#map-editor').hidden = !open;
  if (open) {
    if (!editingNode) renderMap();
    return;
  }
  const list = state.maps.slice().sort((a, b) => b.updatedAt - a.updatedAt);
  $('#map-list').replaceChildren(
    ...list.map((m) => {
      const card = el('div', { className: 'card map-card' });
      const openBtn = el('button', { className: 'map-open' }, [
        el('span', { className: 'map-card-title' }, m.title),
        el('span', { className: 'muted' }, `${m.nodes.length - 1} ${m.nodes.length === 2 ? 'idea' : 'ideas'} · ${new Date(m.updatedAt).toLocaleDateString('es', { day: 'numeric', month: 'short' })}`),
        miniMap(m),
      ]);
      openBtn.addEventListener('click', () => openMap(m.id));
      const del = el('button', { className: 'del', title: 'Borrar mapa', ariaLabel: `Borrar mapa ${m.title}` }, '✕');
      del.addEventListener('click', () =>
        withUndo(`Mapa "${m.title}" borrado`, () => {
          state.maps = state.maps.filter((x) => x.id !== m.id);
        })
      );
      card.append(openBtn, del);
      return card;
    })
  );
  $('#map-empty').hidden = list.length > 0;
}

// Miniatura: el tema central y sus primeras ramas.
function miniMap(m) {
  const kids = m.nodes.filter((n) => n.parent === 'root').slice(0, 6);
  return el('span', { className: 'mini-branches' }, kids.map((k, i) => el('span', { className: `mini b${i % BRANCH_COUNT}` }, k.text)));
}

const childrenOf = (map, id) => map.nodes.filter((n) => n.parent === id);

function branchIndex(map, node) {
  if (!node.parent) return -1;
  let n = node;
  while (n.parent && n.parent !== 'root') n = map.nodes.find((x) => x.id === n.parent);
  return childrenOf(map, 'root').indexOf(n) % BRANCH_COUNT;
}

function depthOf(map, node) {
  let d = 0;
  let n = node;
  while (n.parent) {
    n = map.nodes.find((x) => x.id === n.parent);
    d++;
  }
  return d;
}

// Disposición en árbol horizontal: el tema en el centro y las ramas repartidas a derecha e izquierda.
function computeLayout(map, sizes) {
  const GAP_X = 48;
  const GAP_Y = 12;
  const kidsOf = (n) => (n.collapsed ? [] : childrenOf(map, n.id));
  const subH = {};
  const measure = (n) => {
    const kids = kidsOf(n);
    const own = sizes[n.id].h;
    if (!kids.length) return (subH[n.id] = own);
    const sum = kids.reduce((a, k) => a + measure(k), 0) + GAP_Y * (kids.length - 1);
    return (subH[n.id] = Math.max(own, sum));
  };
  const root = map.nodes.find((n) => !n.parent);
  const top = kidsOf(root);
  top.forEach(measure);
  const total = top.reduce((a, k) => a + subH[k.id], 0);
  const right = [];
  const left = [];
  let acc = 0;
  top.forEach((k) => {
    if (acc < total / 2 || !right.length) {
      right.push(k);
      acc += subH[k.id];
    } else left.push(k);
  });

  const pos = {};
  const side = {};
  const place = (n, edge, cy, dir) => {
    const { w, h } = sizes[n.id];
    pos[n.id] = { x: dir > 0 ? edge : edge - w, y: cy - h / 2, w, h };
    side[n.id] = dir;
    const kids = kidsOf(n);
    const sum = kids.reduce((a, k) => a + subH[k.id], 0) + GAP_Y * Math.max(0, kids.length - 1);
    let y = cy - sum / 2;
    kids.forEach((k) => {
      place(k, dir > 0 ? edge + w + GAP_X : edge - w - GAP_X, y + subH[k.id] / 2, dir);
      y += subH[k.id] + GAP_Y;
    });
  };
  const rs = sizes[root.id];
  pos[root.id] = { x: -rs.w / 2, y: -rs.h / 2, w: rs.w, h: rs.h };
  side[root.id] = 0;
  const column = (list, dir) => {
    const sum = list.reduce((a, k) => a + subH[k.id], 0) + GAP_Y * Math.max(0, list.length - 1);
    let y = -sum / 2;
    list.forEach((k) => {
      place(k, dir > 0 ? rs.w / 2 + GAP_X : -rs.w / 2 - GAP_X, y + subH[k.id] / 2, dir);
      y += subH[k.id] + GAP_Y;
    });
  };
  column(right, 1);
  column(left, -1);

  const PAD = 40;
  const xs = Object.values(pos);
  const minX = Math.min(...xs.map((p) => p.x)) - PAD;
  const minY = Math.min(...xs.map((p) => p.y)) - PAD;
  const maxX = Math.max(...xs.map((p) => p.x + p.w)) + PAD;
  const maxY = Math.max(...xs.map((p) => p.y + p.h)) + PAD;
  Object.values(pos).forEach((p) => {
    p.x -= minX;
    p.y -= minY;
  });
  return { pos, side, width: maxX - minX, height: maxY - minY };
}

function edgePath(a, b, dir) {
  const x1 = dir > 0 ? a.x + a.w : a.x;
  const y1 = a.y + a.h / 2;
  const x2 = dir > 0 ? b.x : b.x + b.w;
  const y2 = b.y + b.h / 2;
  const mx = (x1 + x2) / 2;
  return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
}

function renderMap() {
  const map = currentMap();
  if (!map || !$('#map-editor').offsetParent) return;
  if (!map.nodes.some((n) => n.id === selectedNode)) selectedNode = 'root';
  const root = map.nodes.find((n) => !n.parent);
  if (document.activeElement !== $('#map-name')) $('#map-name').value = root.text;
  const fromNote = map.sourceNoteId && noteById(map.sourceNoteId);
  $('#map-source').hidden = !fromNote;
  $('#map-refresh').hidden = !fromNote;

  // Nodos ocultos por una rama plegada.
  const hidden = new Set();
  const hide = (id) => childrenOf(map, id).forEach((c) => {
    hidden.add(c.id);
    hide(c.id);
  });
  map.nodes.filter((n) => n.collapsed).forEach((n) => hide(n.id));
  const visible = map.nodes.filter((n) => !hidden.has(n.id));

  const nodesEl = $('#map-nodes');
  const els = {};
  nodesEl.replaceChildren(
    ...visible.map((n) => {
      const depth = depthOf(map, n);
      const b = branchIndex(map, n);
      const kids = childrenOf(map, n.id).length;
      const node = el('div', {
        className: `mm-node depth-${Math.min(depth, 2)}${b >= 0 ? ` b${b}` : ''}${n.id === selectedNode ? ' selected' : ''}`,
        role: 'treeitem',
        ariaSelected: String(n.id === selectedNode),
        ariaLabel: n.text,
      });
      node.dataset.id = n.id;
      if (n.id === editingNode) {
        const input = el('textarea', { className: 'mm-input', value: n.text, rows: 1, maxLength: 120, ariaLabel: 'Texto del nodo' });
        const commit = (keep) => {
          if (editingNode !== n.id) return;
          editingNode = null;
          const v = input.value.trim();
          if (keep && v) n.text = v;
          touchMap(map);
          renderMap();
          $('#map-canvas').focus({ preventScroll: true });
        };
        input.addEventListener('keydown', (e) => {
          e.stopPropagation();
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            commit(true);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            commit(false);
          } else if (e.key === 'Tab') {
            e.preventDefault();
            commit(true);
            addNode('child');
          }
        });
        input.addEventListener('input', () => {
          input.style.height = 'auto';
          input.style.height = `${input.scrollHeight}px`;
        });
        input.addEventListener('blur', () => commit(true));
        node.append(input);
      } else {
        node.append(el('span', { className: 'mm-text' }, n.text));
      }
      if (kids && n.parent) {
        const fold = el('button', { className: 'mm-fold', title: n.collapsed ? 'Desplegar' : 'Plegar', ariaLabel: n.collapsed ? `Desplegar ${kids} ramas` : 'Plegar rama' }, n.collapsed ? `+${kids}` : '−');
        fold.addEventListener('click', (e) => {
          e.stopPropagation();
          n.collapsed = !n.collapsed;
          touchMap(map);
          renderMap();
        });
        node.append(fold);
      }
      node.addEventListener('click', (e) => {
        e.stopPropagation();
        if (editingNode === n.id) return;
        selectedNode = n.id;
        renderMap();
        $('#map-canvas').focus({ preventScroll: true });
      });
      node.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        selectedNode = n.id;
        startNodeEdit();
      });
      els[n.id] = node;
      return node;
    })
  );

  // Medir, colocar y dibujar las conexiones.
  const sizes = {};
  visible.forEach((n) => (sizes[n.id] = { w: els[n.id].offsetWidth, h: els[n.id].offsetHeight }));
  const layout = computeLayout({ ...map, nodes: visible.map((n) => (hidden.has(n.id) ? null : n)).filter(Boolean) }, sizes);
  mapLayout = layout;
  visible.forEach((n) => {
    const p = layout.pos[n.id];
    els[n.id].style.transform = `translate(${p.x}px, ${p.y}px)`;
    els[n.id].classList.toggle('left', layout.side[n.id] < 0);
  });
  const svg = $('#map-edges');
  svg.setAttribute('width', layout.width);
  svg.setAttribute('height', layout.height);
  svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
  const NS = 'http://www.w3.org/2000/svg';
  svg.replaceChildren(
    ...visible.filter((n) => n.parent).map((n) => {
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', edgePath(layout.pos[n.parent], layout.pos[n.id], layout.side[n.id]));
      path.setAttribute('class', `mm-edge b${branchIndex(map, n)}`);
      return path;
    })
  );
  const stage = $('#map-stage');
  stage.style.width = `${layout.width}px`;
  stage.style.height = `${layout.height}px`;
  stage.style.transform = `scale(${mapZoom})`;
  $('#map-sizer')?.remove();
  stage.after(el('div', { id: 'map-sizer', style: `width:${layout.width * mapZoom}px;height:${layout.height * mapZoom}px` }));

  const hasSel = selectedNode !== 'root';
  $('#mm-sibling').disabled = !hasSel;
  $('#mm-delete').disabled = !hasSel;

  if (editingNode) {
    const input = nodesEl.querySelector('.mm-input');
    input.style.height = `${input.scrollHeight}px`;
    input.focus({ preventScroll: true });
    input.select();
  }
  revealNode(selectedNode);
}

// Desplaza el lienzo para que el nodo quede a la vista.
function revealNode(id) {
  const p = mapLayout?.pos[id];
  if (!p) return;
  const c = $('#map-canvas');
  const x = p.x * mapZoom;
  const y = p.y * mapZoom;
  const w = p.w * mapZoom;
  const h = p.h * mapZoom;
  if (x < c.scrollLeft + 16) c.scrollLeft = x - 16;
  else if (x + w > c.scrollLeft + c.clientWidth - 16) c.scrollLeft = x + w - c.clientWidth + 16;
  if (y < c.scrollTop + 16) c.scrollTop = y - 16;
  else if (y + h > c.scrollTop + c.clientHeight - 16) c.scrollTop = y + h - c.clientHeight + 16;
}

// Ajusta el zoom para ver el mapa entero, sin bajar de un tamaño legible (en pantallas
// estrechas el resto se recorre deslizando), y centra el tema principal.
function fitMap() {
  if (!mapLayout) return;
  const c = $('#map-canvas');
  mapZoom = Math.max(0.6, Math.min(1.1, (c.clientWidth - 8) / mapLayout.width, (c.clientHeight - 8) / mapLayout.height));
  renderMap();
  const root = mapLayout.pos.root;
  c.scrollLeft = (root.x + root.w / 2) * mapZoom - c.clientWidth / 2;
  c.scrollTop = (root.y + root.h / 2) * mapZoom - c.clientHeight / 2;
}

function zoomBy(f) {
  const c = $('#map-canvas');
  const cx = (c.scrollLeft + c.clientWidth / 2) / mapZoom;
  const cy = (c.scrollTop + c.clientHeight / 2) / mapZoom;
  mapZoom = Math.max(0.3, Math.min(2, mapZoom * f));
  renderMap();
  c.scrollLeft = cx * mapZoom - c.clientWidth / 2;
  c.scrollTop = cy * mapZoom - c.clientHeight / 2;
}

function startNodeEdit() {
  editingNode = selectedNode;
  renderMap();
}

function addNode(kind) {
  const map = currentMap();
  const sel = map.nodes.find((n) => n.id === selectedNode);
  const parentId = kind === 'child' || !sel.parent ? sel.id : sel.parent;
  const parent = map.nodes.find((n) => n.id === parentId);
  parent.collapsed = false;
  const node = { id: uid(), parent: parentId, text: 'Nueva idea' };
  // Un hermano se inserta justo después del nodo seleccionado.
  const at = kind === 'sibling' && sel.parent ? map.nodes.indexOf(sel) + 1 : map.nodes.length;
  map.nodes.splice(at, 0, node);
  selectedNode = node.id;
  editingNode = node.id;
  touchMap(map);
  renderMap();
}

function deleteNode() {
  const map = currentMap();
  const sel = map.nodes.find((n) => n.id === selectedNode);
  if (!sel?.parent) return;
  const gone = new Set([sel.id]);
  let grew = true;
  while (grew) {
    grew = false;
    map.nodes.forEach((n) => {
      if (n.parent && gone.has(n.parent) && !gone.has(n.id)) {
        gone.add(n.id);
        grew = true;
      }
    });
  }
  withUndo(gone.size > 1 ? `Rama borrada (${gone.size} nodos)` : 'Nodo borrado', () => {
    map.nodes = map.nodes.filter((n) => !gone.has(n.id));
    map.updatedAt = Date.now();
    selectedNode = sel.parent;
  });
}

// Moverse con las flechas al nodo más cercano en esa dirección.
function moveSelection(key) {
  const from = mapLayout?.pos[selectedNode];
  if (!from) return;
  const fx = from.x + from.w / 2;
  const fy = from.y + from.h / 2;
  let best = null;
  let bestScore = Infinity;
  Object.entries(mapLayout.pos).forEach(([id, p]) => {
    if (id === selectedNode) return;
    const dx = p.x + p.w / 2 - fx;
    const dy = p.y + p.h / 2 - fy;
    const ok = { ArrowRight: dx > 4, ArrowLeft: dx < -4, ArrowDown: dy > 4, ArrowUp: dy < -4 }[key];
    if (!ok) return;
    const along = key === 'ArrowRight' || key === 'ArrowLeft' ? Math.abs(dx) : Math.abs(dy);
    const across = key === 'ArrowRight' || key === 'ArrowLeft' ? Math.abs(dy) : Math.abs(dx);
    const score = along + across * 2;
    if (score < bestScore) {
      bestScore = score;
      best = id;
    }
  });
  if (best) {
    selectedNode = best;
    renderMap();
  }
}

$('#map-canvas').addEventListener('keydown', (e) => {
  if (editingNode || e.target !== $('#map-canvas')) return;
  const keys = {
    Tab: () => addNode('child'),
    Enter: () => addNode(selectedNode === 'root' ? 'child' : 'sibling'),
    F2: startNodeEdit,
    ' ': startNodeEdit,
    Delete: deleteNode,
    Backspace: deleteNode,
    ArrowUp: () => moveSelection('ArrowUp'),
    ArrowDown: () => moveSelection('ArrowDown'),
    ArrowLeft: () => moveSelection('ArrowLeft'),
    ArrowRight: () => moveSelection('ArrowRight'),
    '+': () => zoomBy(1.2),
    '-': () => zoomBy(1 / 1.2),
  };
  if (keys[e.key]) {
    e.preventDefault();
    e.stopPropagation();
    keys[e.key]();
  }
});

// Arrastrar el fondo con el ratón mueve el mapa (en táctil se desplaza de forma nativa).
$('#map-canvas').addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'mouse' || e.target.closest('.mm-node')) return;
  const c = $('#map-canvas');
  const start = { x: e.clientX, y: e.clientY, l: c.scrollLeft, t: c.scrollTop };
  c.classList.add('panning');
  const move = (ev) => {
    c.scrollLeft = start.l - (ev.clientX - start.x);
    c.scrollTop = start.t - (ev.clientY - start.y);
  };
  const up = () => {
    c.classList.remove('panning');
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
});
$('#map-canvas').addEventListener('click', (e) => {
  if (!e.target.closest('.mm-node')) $('#map-canvas').focus({ preventScroll: true });
});

$('#mm-child').addEventListener('click', () => addNode('child'));
$('#mm-sibling').addEventListener('click', () => addNode('sibling'));
$('#mm-edit').addEventListener('click', startNodeEdit);
$('#mm-delete').addEventListener('click', deleteNode);
$('#mm-zoom-in').addEventListener('click', () => zoomBy(1.2));
$('#mm-zoom-out').addEventListener('click', () => zoomBy(1 / 1.2));
$('#mm-fit').addEventListener('click', fitMap);
$('#mm-task').addEventListener('click', () => {
  const node = currentMap()?.nodes.find((n) => n.id === selectedNode);
  if (!node) return;
  addTask(node.text);
  showToastMessage(`Tarea creada: ${node.text}`);
});

// Exportar como imagen PNG: se dibuja el mapa en un lienzo con los colores del tema actual.
function wrapText(ctx, text, maxW) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  words.forEach((w) => {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = test;
  });
  if (line) lines.push(line);
  return lines;
}

async function exportMap() {
  const map = currentMap();
  if (!map || !mapLayout) return;
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  // Los navegadores no pintan lienzos muy grandes: se limita a 4096 px por lado.
  const scale = Math.min(2, 4096 / mapLayout.width, 4096 / mapLayout.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(mapLayout.width * scale);
  canvas.height = Math.ceil(mapLayout.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.fillStyle = v('--bg');
  ctx.fillRect(0, 0, mapLayout.width, mapLayout.height);

  const nodes = map.nodes.filter((n) => mapLayout.pos[n.id]);
  nodes.filter((n) => n.parent && mapLayout.pos[n.parent]).forEach((n) => {
    ctx.strokeStyle = v(`--b${branchIndex(map, n)}`);
    ctx.lineWidth = 2;
    ctx.stroke(new Path2D(edgePath(mapLayout.pos[n.parent], mapLayout.pos[n.id], mapLayout.side[n.id])));
  });
  nodes.forEach((n) => {
    const p = mapLayout.pos[n.id];
    const depth = depthOf(map, n);
    const color = depth === 0 ? v('--accent') : v(`--b${branchIndex(map, n)}`);
    ctx.beginPath();
    ctx.roundRect(p.x, p.y, p.w, p.h, 10);
    ctx.fillStyle = depth === 0 ? color : v('--surface');
    ctx.fill();
    ctx.lineWidth = depth === 1 ? 2 : 1;
    ctx.strokeStyle = depth === 0 ? color : depth === 1 ? color : v('--border');
    ctx.stroke();
    if (depth >= 2) {
      ctx.fillStyle = color;
      ctx.fillRect(mapLayout.side[n.id] < 0 ? p.x + p.w - 3 : p.x, p.y + 6, 3, p.h - 12);
    }
    // Mismos tamaños que en pantalla (1.05rem y .9rem).
    const size = depth === 0 ? 16.8 : 14.4;
    ctx.font = `${depth < 2 ? 600 : 400} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.fillStyle = depth === 0 ? v('--on-accent') : v('--text');
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    const lines = wrapText(ctx, n.text, p.w - (depth === 0 ? 30 : 20));
    const lh = size * 1.3;
    lines.forEach((l, i) => ctx.fillText(l, p.x + p.w / 2, p.y + p.h / 2 + (i - (lines.length - 1) / 2) * lh));
  });

  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) return showToastMessage('No se pudo exportar el mapa: es demasiado grande.');
  const filename = `${map.title.replace(/[\\/:*?"<>|]+/g, '').slice(0, 60) || 'mapa'}.png`;
  if (window.claude?.use) {
    const downloads = await window.claude.use('downloads');
    if (downloads) {
      try {
        await downloads.save({ filename, data: blob });
        showToastMessage('Imagen guardada');
      } catch (e) {
        if (e?.code !== 'declined') showToastMessage('No se pudo guardar la imagen aquí.');
      }
      return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('#mm-export').addEventListener('click', exportMap);
