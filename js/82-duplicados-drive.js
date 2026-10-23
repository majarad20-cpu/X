'use strict';

// ---------- Revisar la bóveda: archivos repetidos en Drive ----------
// Una tarjeta que busca en las carpetas de la bóveda los .md repetidos (mismo nombre en la misma
// carpeta) y, tras confirmarlo, manda los sobrantes a la papelera de Drive (se recuperan 30 días).
const dz = { groups: null, busy: false, error: '', pick: new Set() };

function dzCard() {
  const total = dz.groups ? dz.groups.reduce((n, g) => n + g.extra.length, 0) : 0;
  const body = [];
  if (!vaultOn()) body.push(el('p', { className: 'muted' }, 'Disponible en el dispositivo que guarda tus notas en Google Drive (Ajustes › Bóveda en Drive).'));
  else {
    const search = el('button', { className: dz.groups ? '' : 'primary', disabled: dz.busy }, dz.busy ? 'Buscando…' : dz.groups ? 'Buscar otra vez' : 'Buscar repetidos en Drive');
    search.addEventListener('click', dzScan);
    body.push(el('p', { className: 'muted' }, 'Mismo nombre en la misma carpeta de Drive. De cada uno se queda la copia enlazada con tu nota (o la más reciente); las demás van a la papelera de Drive, donde se pueden recuperar durante 30 días.'), el('div', { className: 'row' }, [search]));
    if (dz.error) body.push(el('p', { className: 'ask-error' }, dz.error));
    if (dz.groups && !dz.groups.length) body.push(el('p', { className: 'muted' }, 'No hay archivos repetidos. 👍'));
    if (dz.groups?.length) {
      const when = (f) => (f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString('es', { dateStyle: 'medium' }) : '');
      body.push(el('ul', { className: 'rv-list lz-list' }, dz.groups.map((g) => {
        const c = el('input', { type: 'checkbox', checked: dz.pick.has(g.path), ariaLabel: `Marcar ${g.path}` });
        c.addEventListener('change', () => {
          c.checked ? dz.pick.add(g.path) : dz.pick.delete(g.path);
          renderVaultReview();
        });
        return el('li', {}, el('label', {}, [c, ' ', el('strong', {}, g.path), el('span', { className: 'muted' }, ` · se queda la del ${when(g.keep)}; ${g.extra.length === 1 ? 'sobra 1 copia' : `sobran ${g.extra.length} copias`} (${g.extra.map(when).join(', ')})`)]));
      })));
      const chosen = dz.groups.filter((g) => dz.pick.has(g.path));
      const n = chosen.reduce((k, g) => k + g.extra.length, 0);
      const go = el('button', { className: 'primary', disabled: !n || dz.busy }, `Mandar ${n} a la papelera de Drive`);
      go.addEventListener('click', () => askConfirm(`¿Mandar ${n} ${n === 1 ? 'archivo repetido' : 'archivos repetidos'} a la papelera de Drive? Tus notas en Enfoque no cambian.`, 'Mandar a la papelera', () => dzTrash(chosen)));
      body.push(el('div', { className: 'row' }, [go]));
    }
  }
  return el('details', { className: `card rv-card ${total ? 'warn' : ''}`, open: !!dz.groups || dz.busy }, [
    el('summary', {}, [el('strong', {}, '📄 Archivos repetidos en Drive'), el('span', { className: `rv-count ${dz.groups ? (total ? 'warn' : 'ok') : ''}` }, dz.groups ? String(total) : '?'), el('span', { className: 'muted rv-hint' }, 'Copias de una misma nota subidas más de una vez')]),
    ...body,
  ]);
}

async function dzScan() {
  dz.busy = true;
  dz.error = '';
  renderVaultReview();
  try {
    dz.groups = await scanVaultDuplicates();
    dz.pick = new Set(dz.groups.map((g) => g.path));
  } catch (e) {
    dz.error = `No se pudo revisar Drive. ${gErrorText(e, DRIVE)}`;
  } finally {
    dz.busy = false;
    renderVaultReview();
  }
}

async function dzTrash(groups) {
  dz.busy = true;
  renderVaultReview();
  try {
    const n = await trashVaultDuplicates(groups);
    const done = new Set(groups.map((g) => g.path));
    dz.groups = dz.groups.filter((g) => !done.has(g.path));
    showToastMessage(`${n} ${n === 1 ? 'archivo repetido enviado' : 'archivos repetidos enviados'} a la papelera de Drive`);
  } catch (e) {
    dz.error = `No se pudieron quitar todos. ${gErrorText(e, DRIVE)}`;
  } finally {
    dz.busy = false;
    renderVaultReview();
  }
}

const dzPrevRender = renderVaultReview;
renderVaultReview = function renderVaultReviewWithDuplicates() {
  dzPrevRender();
  const anchor = $('#view-revision .lz-card') || $('#view-revision .rv-stats');
  if (anchor) anchor.after(dzCard());
};
