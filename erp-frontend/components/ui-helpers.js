/* ============================================
   TOAST HELPER
   ============================================ */

export function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle',
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
    <i class="fas ${icons[type] || icons.info}"></i>
    <span>${message}</span>
  `;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

/* ============================================
   MODAL HELPER
   ============================================ */

export function openModal(title, bodyHtml, footerHtml = '', size = '') {
    const overlay = document.getElementById('modal-overlay');
    const container = document.getElementById('modal-container');
    const titleEl = document.getElementById('modal-title');
    const bodyEl = document.getElementById('modal-body');
    const footerEl = document.getElementById('modal-footer');

    titleEl.textContent = title;
    bodyEl.innerHTML = bodyHtml;
    footerEl.innerHTML = footerHtml;

    container.className = `modal-container ${size}`;
    overlay.classList.remove('hidden');

    // Close handlers
    const close = () => overlay.classList.add('hidden');
    document.getElementById('modal-close').onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };

    return { close, bodyEl, footerEl };
}

export function closeModal() {
    document.getElementById('modal-overlay')?.classList.add('hidden');
}

export function getSelectedPeriodo() {
    const mes = document.getElementById('periodo-mes')?.value || (new Date().getMonth() + 1);
    const anio = document.getElementById('periodo-anio')?.value || new Date().getFullYear();
    return {
        mes: parseInt(mes),
        anio: parseInt(anio),
        string: `${anio}-${String(mes).padStart(2, '0')}`
    };
}
