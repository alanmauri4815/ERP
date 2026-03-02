import { getCuentas } from '../../services/contabilidad.service.js';
import { showToast } from '../../components/ui-helpers.js';

export async function renderPlanCuentas(container) {
  container.innerHTML = `<div class="skeleton-loader" style="padding:40px; color:white;">🔄 Sincronizando Plan de Cuentas desde Supabase...</div>`;

  try {
    const cuentas = await getCuentas();

    if (!cuentas || cuentas.length === 0) {
      container.innerHTML = `<div class="empty-state"><h3>Plan de Cuentas Vacío</h3><p>Usa el botón "+ Nueva Cuenta" para empezar o carga un archivo.</p></div>`;
      return;
    }

    // Ordenar por código para que la visualización sea lógica
    const ordered = [...cuentas].sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));

    container.innerHTML = `
      <style>
        .pc-container { background: #1e293b; border-radius: 12px; padding: 15px; margin-top: 20px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.5); }
        .tree-root { list-style: none !important; padding: 0 !important; margin: 0 !important; }
        .tree-list { list-style: none !important; padding: 0 !important; margin: 0 !important; }
        .tree-item { list-style: none !important; margin: 0; padding: 0; position: relative; }
        .tree-row { 
            display: flex; align-items: center; padding: 10px 16px; 
            border-bottom: 1px solid rgba(255,255,255,0.05); 
            cursor: pointer; transition: background 0.2s;
            border-radius: 6px;
        }
        .tree-row:hover { background: rgba(255,255,255,0.07); }
        .tree-toggle { width: 30px; display: flex; justify-content: center; color: #60a5fa; cursor: pointer; }
        .account-code { font-family: monospace; font-weight: bold; color: #34d399; width: 120px; font-size: 14px; }
        .account-name { flex: 1; font-weight: 500; }
        .badge-tipo { font-size: 10px; padding: 2px 10px; border-radius: 4px; text-transform: uppercase; font-weight: bold; background: rgba(255,255,255,0.1); width: 80px; text-align: center; }
        .has-children-row { font-weight: 700; color: #fff; }
        .chevron-icon { transition: transform 0.2s; }
        .chevron-expanded { transform: rotate(90deg); }
      </style>

      <div class="section-header">
        <div>
          <h2 class="section-title">Estructura de Cuentas</h2>
          <p style="color:#94a3b8; font-size: 13px;">${cuentas.length} registros cargados correctamente</p>
        </div>
        <div class="section-actions">
          <button class="btn btn-secondary" id="master-toggle">Expandir Todo</button>
          <button class="btn btn-primary" id="btn-nueva-cuenta" style="margin-left:8px;">+ Nueva Cuenta</button>
        </div>
      </div>

      <div class="pc-container">
        <div class="tree-root">
            ${renderNode(ordered, null)}
        </div>
      </div>
    `;

    initTreeEvents(container);

  } catch (err) {
    container.innerHTML = `<div class="error-msg">Error: ${err.message}</div>`;
  }
}

// Función recursiva para construir el árbol usando IDs reales
function renderNode(allCuentas, parentId) {
  // Encontramos los hijos directos del parentId actual
  const children = allCuentas.filter(c => {
    const pid = c.padre_id ? String(c.padre_id) : null;
    const search = parentId ? String(parentId) : null;
    return pid === search;
  });

  if (children.length === 0) return '';

  return `
    <ul class="tree-list" style="${parentId ? 'display:none; margin-left:25px; border-left: 1px dotted rgba(255,255,255,0.1);' : 'display:block;'}">
      ${children.map(c => {
    // Un nodo tiene hijos si existe alguna cuenta cuyo padre_id sea el ID de esta cuenta
    const hasChildren = allCuentas.some(h => String(h.padre_id) === String(c.id));
    return `
          <li class="tree-item">
            <div class="tree-row ${hasChildren ? 'has-children-row' : ''}" data-id="${c.id}">
              <span class="tree-toggle">
                ${hasChildren ? '<i class="fas fa-chevron-right chevron-icon"></i>' : '<i class="fas fa-caret-right" style="opacity:0.2;"></i>'}
              </span>
              <span class="account-code">${c.codigo}</span>
              <span class="account-name">${c.nombre}</span>
              <span class="badge-tipo">${c.tipo}</span>
            </div>
            ${hasChildren ? renderNode(allCuentas, c.id) : ''}
          </li>
        `;
  }).join('')}
    </ul>
  `;
}

function initTreeEvents(container) {
  let isAllOpen = false;

  // Toggle individual por ID
  container.querySelectorAll('.tree-row').forEach(row => {
    row.onclick = (e) => {
      const nextUl = row.nextElementSibling;
      const icon = row.querySelector('.chevron-icon');
      if (nextUl && nextUl.tagName === 'UL') {
        const isHidden = nextUl.style.display === 'none';
        nextUl.style.display = isHidden ? 'block' : 'none';
        if (icon) icon.classList.toggle('chevron-expanded', isHidden);
      }
    };
  });

  // Toggle Maestro
  const masterBtn = container.querySelector('#master-toggle');
  if (masterBtn) {
    masterBtn.onclick = () => {
      isAllOpen = !isAllOpen;
      const allUls = container.querySelectorAll('.tree-list');
      const allIcons = container.querySelectorAll('.chevron-icon');

      allUls.forEach((ul, i) => { if (i > 0) ul.style.display = isAllOpen ? 'block' : 'none'; });
      allIcons.forEach(icon => icon.classList.toggle('chevron-expanded', isAllOpen));

      masterBtn.textContent = isAllOpen ? 'Contraer Todo' : 'Expandir Todo';
    };
  }
}
