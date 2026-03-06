/* ============================================
   ERP API — Shared fetch helper for modules
   ============================================ */

const API_BASE = window.location.hostname === 'localhost'
    ? 'http://localhost:3001/api'
    : 'https://erp-universal-backend.onrender.com/api';

export async function erpFetch(endpoint, options = {}) {
    const token = localStorage.getItem('erp_token');
    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...options.headers
    };

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
        if (response.status === 401 || response.status === 403) return null;
        const data = await response.json();
        if (!response.ok) {
            console.error(`ERP API Error (${endpoint}):`, data);
            return null;
        }
        return data;
    } catch (err) {
        console.error(`ERP Fetch Error (${endpoint}):`, err);
        return null;
    }
}
