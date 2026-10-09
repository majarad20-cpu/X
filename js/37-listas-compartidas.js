'use strict';

// ---------- Listas compartidas ----------
// Listas (la compra, un viaje, una mudanza…) que ven y editan en vivo las personas con quienes
// compartas la app desde el botón «Compartir» de Claude. Viven en el almacén compartido de la app
// (colección «lists», con sus elementos en «lists/<id>/items»), aparte de tus datos privados.
const shared = { db: null, user: null, me: null, owner: false, canWrite: true, lists: [], listId: null, items: [], unsubLists: null, unsubItems: null, names: {}, error: '' };

async function startShared() {
  if (!window.claude?.use) return renderShared();
  try {
    [shared.db, shared.user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
  } catch {
    shared.db = null;
  }
  if (!shared.db) return renderShared();
  // Cada dato del usuario se pide por separado y su ausencia no impide usar las listas.
  const ask = async (fn, fallback) => {
    try {
      return (await fn()) ?? fallback;
    } catch {
      return fallback;
    }
  };
  shared.me = await ask(() => shared.user?.id?.(), null);
  shared.owner = await ask(() => shared.user?.isOwner?.(), false);
  shared.canWrite = (await ask(() => shared.user?.can?.('data.write'), null)) !== false;
  // Se ordena aquí (más nuevas primero), así la consulta no depende de ningún índice.
  try {
    shared.unsubLists = shared.db.collection('lists').onSnapshot(
      (snap) => {
        shared.lists = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        if (shared.listId && !shared.lists.some((l) => l.id === shared.listId)) closeSharedList();
        resolveNames(shared.lists.map((l) => l.createdBy));
        renderShared();
      },
      (e) => sharedError(e)
    );
  } catch (e) {
    sharedError(e);
  }
  renderShared();
}

function sharedError(e) {
  shared.error = e?.code === 'quota_exceeded' ? 'El almacén compartido está lleno: borra listas o elementos que ya no uses.' : e?.code === 'invalid_argument' ? 'No tienes permiso para cambiar estas listas (pide acceso de edición a quien te compartió la app).' : 'No se pudo conectar con las listas compartidas.';
  if (e?.code === 'invalid_argument') shared.canWrite = false;
  renderShared();
}

async function resolveNames(ids) {
  const missing = [...new Set(ids.filter((id) => id && !(id in shared.names)))];
  if (!missing.length || !shared.user?.profiles) return;
  try {
    const ps = await shared.user.profiles(missing);
    missing.forEach((id) => (shared.names[id] = ps?.[id]?.name || ''));
    renderShared();
  } catch {
    // Sin nombres: se muestra «alguien».
  }
}
const whoName = (id) => (!id ? 'alguien' : id === shared.me ? 'tú' : shared.names[id] || 'alguien');

function openSharedList(id) {
  closeSharedList();
  shared.listId = id;
  shared.items = [];
  shared.unsubItems = shared.db
    .collection(`lists/${id}/items`)
    .onSnapshot(
      (snap) => {
        shared.items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        resolveNames(shared.items.flatMap((i) => [i.by, i.doneBy]));
        renderShared();
      },
      (e) => sharedError(e)
    );
  renderShared();
  setTimeout(() => $('#shared-item-text')?.focus());
}

function closeSharedList() {
  shared.unsubItems?.();
  shared.unsubItems = null;
  shared.listId = null;
  shared.items = [];
}

async function sharedWrite(fn) {
  try {
    shared.error = '';
    await fn();
  } catch (e) {
    sharedError(e);
  }
}

function renderShared() {
  const view = $('#view-shared');
  if (!view) return;
  const ok = !!shared.db;
  $('#shared-off').hidden = ok;
  $('#shared-on').hidden = !ok;
  $('#shared-error').textContent = shared.error;
  if (!ok) return;
  const list = shared.lists.find((l) => l.id === shared.listId);
  $('#shared-lists-pane').hidden = !!list;
  $('#shared-list-pane').hidden = !list;
  $('#shared-new').hidden = !shared.canWrite;
  if (!list) {
    $('#shared-lists').replaceChildren(
      ...shared.lists.map((l) => {
        const b = el('button', { className: 'card canvas-tile' }, [el('strong', {}, l.title || 'Lista'), el('span', { className: 'muted' }, `Creada por ${whoName(l.createdBy)}`)]);
        b.addEventListener('click', () => openSharedList(l.id));
        return b;
      })
    );
    $('#shared-empty').hidden = shared.lists.length > 0;
    return;
  }
  $('#shared-title').textContent = list.title || 'Lista';
  $('#shared-meta').textContent = `Creada por ${whoName(list.createdBy)} · ${plural(shared.items.filter((i) => !i.done).length, 'pendiente', 'pendientes')} de ${shared.items.length}`;
  $('#shared-delete-list').hidden = !(shared.canWrite && (list.createdBy === shared.me || shared.owner));
  $('#shared-add').hidden = !shared.canWrite;
  $('#shared-clear').hidden = !shared.canWrite || !shared.items.some((i) => i.done);
  const items = shared.items.slice().sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || (a.at || 0) - (b.at || 0));
  $('#shared-items').replaceChildren(
    ...items.map((it) => {
      const box = el('input', { type: 'checkbox', checked: !!it.done, disabled: !shared.canWrite, ariaLabel: it.text });
      box.addEventListener('change', () =>
        sharedWrite(() => shared.db.doc(`lists/${list.id}/items/${it.id}`).update({ done: box.checked, doneBy: box.checked ? shared.me : null }))
      );
      const meta = it.done ? `✓ ${whoName(it.doneBy)}` : `añadido por ${whoName(it.by)}`;
      const row = el('li', { className: `shared-item${it.done ? ' done' : ''}` }, [box, el('div', { className: 'si-body' }, [el('span', { className: 'si-text' }, it.text), el('span', { className: 'muted si-meta' }, meta)])]);
      const mine = el('button', { className: 'side-btn', title: 'Copiar a mis tareas', ariaLabel: `Copiar «${it.text}» a mis tareas` }, '＋');
      mine.addEventListener('click', () => {
        addTask(it.text, { raw: true });
        showToastMessage('Copiada a tus tareas');
      });
      row.append(mine);
      if (shared.canWrite) {
        const del = el('button', { className: 'side-btn', title: 'Quitar', ariaLabel: `Quitar «${it.text}»` }, '✕');
        del.addEventListener('click', () => sharedWrite(() => shared.db.doc(`lists/${list.id}/items/${it.id}`).delete()));
        row.append(del);
      }
      return row;
    })
  );
  $('#shared-items-empty').hidden = shared.items.length > 0;
}

$('#shared-new').addEventListener('submit', (e) => {
  e.preventDefault();
  const title = $('#shared-new-title').value.trim().slice(0, 80);
  if (!title) return;
  $('#shared-new-title').value = '';
  sharedWrite(async () => {
    const ref = await shared.db.collection('lists').add({ title, createdBy: shared.me, createdAt: Date.now() });
    openSharedList(ref.id);
  });
});
$('#shared-add').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#shared-item-text');
  const text = input.value.trim().slice(0, 200);
  if (!text || !shared.listId) return;
  input.value = '';
  const listId = shared.listId;
  sharedWrite(() => shared.db.collection(`lists/${listId}/items`).add({ text, done: false, by: shared.me, doneBy: null, at: Date.now() }));
});
$('#shared-back').addEventListener('click', () => {
  closeSharedList();
  renderShared();
});
$('#shared-clear').addEventListener('click', () => {
  const listId = shared.listId;
  const done = shared.items.filter((i) => i.done);
  sharedWrite(async () => {
    for (const it of done) await shared.db.doc(`lists/${listId}/items/${it.id}`).delete();
  });
});
$('#shared-delete-list').addEventListener('click', () => {
  const list = shared.lists.find((l) => l.id === shared.listId);
  if (!list) return;
  const btn = $('#shared-delete-list');
  // Dos toques: borrar una lista compartida la quita para todos.
  if (btn.dataset.confirm !== '1') {
    btn.dataset.confirm = '1';
    btn.textContent = '¿Seguro? Se borra para todos';
    setTimeout(() => {
      btn.dataset.confirm = '';
      btn.textContent = 'Borrar lista';
    }, 4000);
    return;
  }
  btn.dataset.confirm = '';
  btn.textContent = 'Borrar lista';
  const items = shared.items.slice();
  closeSharedList();
  sharedWrite(async () => {
    for (const it of items) await shared.db.doc(`lists/${list.id}/items/${it.id}`).delete();
    await shared.db.doc(`lists/${list.id}`).delete();
  });
});
