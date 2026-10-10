// =====================================================================
// util.js — Utilidades generales: fechas, números, HTML y avisos.
// Todas las fechas se manejan como texto "YYYY-MM-DD" en hora local.
// =====================================================================

export const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// ---------- Fechas ----------

/** Convierte un Date a "YYYY-MM-DD" (hora local). */
export function toISO(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

/** Convierte "YYYY-MM-DD" a Date a medianoche local. */
export function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function hoyISO() {
  return toISO(new Date());
}

/** Suma n días a una fecha ISO. */
export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** Días entre a y b (b - a). Redondea para evitar problemas con horario de verano. */
export function diffDays(a, b) {
  return Math.round((parseISO(b) - parseISO(a)) / 86400000);
}

/** Día de la semana con lunes = 0 … domingo = 6. */
export function diaSemana(iso) {
  return (parseISO(iso).getDay() + 6) % 7;
}

/** Lunes de la semana que contiene la fecha. */
export function lunesDe(iso) {
  return addDays(iso, -diaSemana(iso));
}

/** "12 oct" o "Lun 12 oct". */
export function fmtFecha(iso, conDia = false) {
  if (!iso) return '—';
  const d = parseISO(iso);
  const s = `${d.getDate()} ${MESES[d.getMonth()]}`;
  return conDia ? `${DIAS_CORTOS[diaSemana(iso)]} ${s}` : s;
}

/** "12 oct 2026". */
export function fmtFechaLarga(iso) {
  if (!iso) return '—';
  return `${fmtFecha(iso)} ${parseISO(iso).getFullYear()}`;
}

// ---------- Números ----------

/**
 * Lee un número escrito por el usuario. Acepta coma o punto decimal
 * (el teclado del iPhone en español usa coma).
 * Devuelve null si está vacío y NaN si no es un número válido.
 */
export function parseNum(v) {
  if (v == null) return null;
  const s = String(v).trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** Formatea con separador de miles y n decimales; "—" si no hay valor. */
export function fmt(n, dec = 0) {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('es-MX', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

/** Igual que fmt pero con signo explícito (+ / −). */
export function fmtSigned(n, dec = 1) {
  if (n == null || !Number.isFinite(n)) return '—';
  const r = Number(n.toFixed(dec));
  if (r === 0) return fmt(0, dec);
  return (r > 0 ? '+' : '−') + fmt(Math.abs(r), dec);
}

export function round(n, dec = 1) {
  if (n == null || !Number.isFinite(n)) return n;
  const f = 10 ** dec;
  return Math.round(n * f) / f;
}

/** Promedio ignorando null/NaN; null si no hay valores. */
export function avg(arr) {
  const v = arr.filter(x => x != null && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function sum(arr) {
  return arr.filter(x => x != null && Number.isFinite(x)).reduce((a, b) => a + b, 0);
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/** Identificador corto único. */
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ---------- HTML ----------

/** Escapa texto para insertarlo en HTML sin riesgos. */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Valor para un atributo value="" (número o vacío). */
export function val(n) {
  return n == null || Number.isNaN(n) ? '' : esc(n);
}

/** Muestra un aviso flotante breve. tipo: '', 'ok', 'error'. */
export function toast(msg, tipo = '') {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = `toast visible ${tipo}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast'; }, 2600);
}
