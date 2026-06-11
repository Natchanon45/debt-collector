import { num, today } from './utils.js';

export function calc(d) {
    const paid = {};
    d.payments.forEach(p => paid[p.debtId] = (paid[p.debtId] || 0) + num(p.amount));
    const debtors = Object.fromEntries(d.debtors.map(x => [x.id, x]));
    const debts = d.debts.map(x => {
        const p = paid[x.id] || 0;
        const remaining = Math.max(0, num(x.principal) - p);
        const days = Math.max(0, Math.floor((new Date(today()) - new Date(x.dueDate || today())) / 86400000));
        return {
            ...x,
            paid: p,
            remaining,
            isDue: remaining > 0 && String(x.dueDate || '') <= today(),
            isDueToday: remaining > 0 && String(x.dueDate || '') === today(),
            daysOverdue: days,
            debtor: debtors[x.debtorId]
        };
    });
    return { debtors, debts, debtsById: Object.fromEntries(debts.map(x => [x.id, x])) };
}

export function calcAgeYears(birthValue, atValue = today()) {
    if (!birthValue) return '';
    const b = new Date(String(birthValue).includes('T') ? birthValue : String(birthValue) + 'T00:00:00');
    const at = new Date(String(atValue || today()).includes('T') ? atValue : String(atValue || today()) + 'T00:00:00');
    if (isNaN(b) || isNaN(at)) return '';
    let age = at.getFullYear() - b.getFullYear();
    const m = at.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && at.getDate() < b.getDate())) age--;
    return age >= 0 && age < 130 ? String(age) : '';
}

export function addMonthsSafe(dateStr, months) {
    const base = new Date((dateStr || today()) + 'T00:00:00');
    if (Number.isNaN(base.getTime())) return today();
    const d = new Date(base);
    const day = d.getDate();
    d.setMonth(d.getMonth() + months);
    if (d.getDate() < day) d.setDate(0);
    return d.toISOString().slice(0, 10);
}

export function countContractMonths(startDate, dueDate) {
    const s = new Date((startDate || today()) + 'T00:00:00');
    const e = new Date((dueDate || startDate || today()) + 'T00:00:00');
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e <= s) return 1;
    let months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
    if (e.getDate() > s.getDate()) months += 1;
    return Math.max(1, months);
}

export function roundMoney(v) {
    return Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100;
}
