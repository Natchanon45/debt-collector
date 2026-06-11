export const $ = id => document.getElementById(id);
export const uid = () => String(Date.now()) + Math.random().toString(16).slice(2);
export const today = () => new Date().toISOString().slice(0, 10);

export const num = v => {
    const n = Number(String(v ?? '').replace(/,/g, '').replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : 0;
};

export const money = n => Number(n || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

export const maskId = id => {
    const s = String(id || '').replace(/\D/g, '');
    return s.length >= 13
        ? `${s.slice(0, 1)}-${s.slice(1, 5)}-xxxxx-${s.slice(10, 12)}-${s.slice(12, 13)}`
        : s.replace(/.(?=.{4})/g, 'x');
};

export const normalizeIdCard = id => String(id || '').replace(/\D/g, '');
export const fullNameOf = o => [o.prefix, o.firstName, o.lastName].filter(Boolean).join(' ').trim();

export function isoDate(d) {
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return today();
    return d.toISOString().slice(0, 10);
}

export function safeFileName(name) {
    return String(name || 'file').replace(/[^\w.\-\u0E00-\u0E7F]+/g, '_').slice(0, 120);
}

export function fileIcon(mime, name = '') {
    if (String(mime).startsWith('image/')) return 'bi-file-earmark-image';
    if (String(mime).includes('pdf') || String(name).toLowerCase().endsWith('.pdf')) return 'bi-file-earmark-pdf';
    return 'bi-file-earmark';
}

export function escapeHtml(v) {
    return String(v ?? '').replace(/[&<>"']/g, m => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[m]));
}
