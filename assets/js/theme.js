import { $ } from './utils.js';

const themeModes = ['light', 'dark', 'auto'];

export function getThemeMode() {
    return localStorage.getItem('themeMode') || 'auto';
}

export function applyTheme() {
    const mode = getThemeMode();
    const resolved = mode === 'auto'
        ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : mode;
    document.documentElement.setAttribute('data-theme', resolved);
    document.body.setAttribute('data-theme', resolved);
    const icon = $('themeIcon');
    if (icon) icon.className = mode === 'auto' ? 'bi bi-circle-half' : resolved === 'dark' ? 'bi bi-moon-stars' : 'bi bi-sun';
}

export function initTheme(toast = () => {}) {
    const btn = $('themeBtn');
    if (!btn || btn.dataset.themeBound === '1') return;
    btn.dataset.themeBound = '1';
    btn.onclick = () => {
        const cur = getThemeMode();
        const next = themeModes[(themeModes.indexOf(cur) + 1) % themeModes.length];
        localStorage.setItem('themeMode', next);
        applyTheme();
        toast(next === 'auto' ? 'โหมดอัตโนมัติ' : next === 'dark' ? 'โหมดกลางคืน' : 'โหมดกลางวัน');
    };
}
