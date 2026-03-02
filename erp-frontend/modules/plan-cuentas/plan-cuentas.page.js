import { getCuentas } from '../../services/contabilidad.service.js';
import { showToast } from '../../components/ui-helpers.js';

export async function renderPlanCuentas(container) {
  container.innerHTML = `<div class="skeleton-loader" style="padding:40px; color:white;">🔄 Sincronizando Plan de Cuentas Profesional...</div>`;

  try {
    const cuentas = await getCuentas();

    if (!cuentas || cuentas.length === 0) {
      container.innerHTML = `<div class="empty-state"><h3>Plan de Cuentas Vacío</h3><p>No se encontraron registros en la nueva base de datos.</p></div>`;
      return;
    }

    // Ordenar de forma natural por el código de cuenta
    const ordered = [...cuentas].sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));

    container.innerHTML = `
      <style>
        .pc-container { background: #1e293b; border-radius: 12px; padding: 20px; margin-top: 20px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.5); }
        .tree-root { list-style: none !important; padding: 0 !important; margin: 0 !important; }
        .tree-list { list-style: none !important; padding: 0 !important; margin: 0 !important; }
        .tree-item { list-style: none !important; margin: 0; padding: 0; position: relative; }
        .tree-row { 
            display: flex; align-items: center; padding: 11px 16px; 
            border-bottom: 1px solid rgba(255,255,255,0.05); 
            cursor: pointer; transition: background 0.2s;
            border-radius: 8px;
        }
        .tree-row:hover { background: rgba(255,255,255,0.1); }
        .tree-toggle { width: 30px; display: flex; justify-content: center; color: #60a5fa; }
        .account-code { font-family: 'JetBrains Mono', monospace; font-weight: bold; color: #34d399; width: 110px; font-size: 14px; }
        .account-name { flex: 1; font-weight: 500; font-size: 15px; }
        .badge-tipo { font-size: 9px; padding: 2px 10px; border-radius: 4px; text-transform: uppercase; font-weight: bold; background: rgba(255,255,255,0.05); color: #94a3b8; border: 1px solid rgba(255,255,255,0.1); }
        .has-children-row { font-weight: 700; color: #fff; background: rgba(255,255,255,0.02); }
        .chevron-icon { transition: transform 0.2s; font-size: 10px; }
        .chevron-expanded { transform: rotate(90deg); }
      </style>

      <div class="section-header">
        <div>
          <h2 class="section-title">Estructura de Cuentas Profesional</h2>
          <p style="color:#94a3b8; font-size: 13px;">Plan de Cuentas Chile — ${cuentas.length} cuentas cargadas</p>
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
    console.error(err);
  }
}

// Función recursiva que ahora usa el CODIGO como referencia de jerarquía
function renderNode(allCuentas, parentCode) {
  // Filtramos las cuentas cuyo padre_id coincida con el código del nodo actual
  const children = allCuentas.filter(c => {
    const pid = c.padre_id ? String(c.padre_id).trim() : null;
    const search = parentCode ? String(parentCode).trim() : null;
    return pid === search;
  });

  if (children.length === 0) return '';

  return `
    <ul class="tree-list" style="${parentCode ? 'display:none; margin-left:25px; border-left: 1px solid rgba(255,255,255,0.05);' : 'display:block;'}">
      ${children.map(c => {
    // Buscamos si hay cuentas que tengan como padre el código de esta cuenta
    const hasChildren = allCuentas.some(h => String(h.padre_id || '').trim() === String(c.codigo).trim());
    return `
          <li class="tree-item">
            <div class="tree-row ${hasChildren ? 'has-children-row' : ''}" data-codigo="${c.codigo}">
              <span class="tree-toggle">
                ${hasChildren ? '<i class="fas fa-chevron-right chevron-icon"></i>' : '<i class="fas fa-circle" style="font-size:4px; opacity:0.2;"></i>'}
              </span>
              <span class="account-code">${c.codigo}</span>
              <span class="account-name">${c.nombre}</span>
              <span class="badge-tipo">${c.tipo}</span>
            </div>
            ${hasChildren ? renderNode(allCuentas, c.codigo) : ''}
          </li>
        `;
  }).join('')}
    </ul>
  `;
}

function initTreeEvents(container) {
  let isAllOpen = false;

  // Click para expandir/contraer grupos
  container.querySelectorAll('.tree-row').forEach(row => {
    row.onclick = () => {
      const nextUl = row.nextElementSibling;
      const icon = row.querySelector('.chevron-icon');
      if (nextUl && nextUl.tagName === 'UL') {
        const isHidden = nextUl.style.display === 'none';
        nextUl.style.display = isHidden ? 'block' : 'none';
        if (icon) {
          if (isHidden) icon.classList.add('chevron-expanded');
          else icon.classList.remove('chevron-expanded');
        }
      }
    };
  });

  // Botón Expandir/Contraer Todo
  const masterBtn = container.querySelector('#master-toggle');
  if (masterBtn) {
    masterBtn.onclick = () => {
      isAllOpen = !isAllOpen;
      const allUls = container.querySelectorAll('.tree-list');
      const allIcons = container.querySelectorAll('.chevron-icon');

      allUls.forEach((ul, i) => { if (i > 0) ul.style.display = isAllOpen ? 'block' : 'none'; });
      allIcons.forEach(icon => {
        if (isAllOpen) icon.classList.add('chevron-expanded');
        else icon.classList.remove('chevron-expanded');
      });

      masterBtn.textContent = isAllOpen ? 'Contraer Todo' : 'Expandir Todo';
    };
  }

  // Notificación de nueva cuenta
  container.querySelector('#btn-nueva-cuenta')?.addEventListener('click', () => {
    showToast('Función disponible en la próxima actualización de seguridad', 'info');
  });
}
