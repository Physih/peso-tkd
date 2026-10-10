// =====================================================================
// sample.js — Genera 3 semanas de datos de ejemplo para probar reportes.
// Los días de ejemplo llevan sample: true y nunca reemplazan días reales.
// =====================================================================

import { addDays, hoyISO, lunesDe, diaSemana, round } from './util.js';

/** Generador pseudoaleatorio con semilla (resultados reproducibles). */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 21 días: las 3 semanas completas (lunes a domingo) anteriores a la actual.
 * Peso bajando ~0.35 kg/semana con ruido diario de ±0.3 kg.
 */
export function generarEjemplo(schedule) {
  const rnd = mulberry32(42);
  const r = (min, max) => min + rnd() * (max - min);
  const inicio = addDays(lunesDe(hoyISO()), -21);
  const dias = [];

  for (let i = 0; i < 21; i++) {
    const date = addDays(inicio, i);
    const dow = diaSemana(date);
    const dayType = schedule[dow]?.dayType || 'rest';
    const tendencia = 68.6 - i * 0.05;
    const weight = i === 9 ? null : round(tendencia + r(-0.3, 0.3), 1); // un día sin pesaje

    // Nutrición coherente con los macros (a veces un poco descuadrada)
    const kcalObj = dayType === 'train' ? r(2200, 2450) : r(1980, 2250);
    const protein = Math.round(r(125, 150));
    const fat = Math.round(r(55, 75));
    const carbs = Math.round((kcalObj - protein * 4 - fat * 9) / 4);
    let kcal = protein * 4 + carbs * 4 + fat * 9;
    if (i === 4) kcal += 180; // ejemplo de descuadre > 5 %

    // Sesiones según el horario
    const sessions = [];
    for (const tipo of schedule[dow]?.plantilla || []) {
      if (tipo === 'gym') sessions.push({ type: 'gym', place: 'gimnasio', minutes: 60, rounds: null, rpe: Math.round(r(6, 8)), notes: 'Pierna y core' });
      if (tipo === 'tecnica') sessions.push({ type: 'tecnica', place: 'casa', minutes: Math.round(r(35, 50)), rounds: Math.round(r(4, 8)), rpe: Math.round(r(5, 7)), notes: 'Patadas al saco' });
      if (tipo === 'combate') sessions.push({ type: 'combate', place: 'club_uni', minutes: 90, rounds: Math.round(r(5, 9)), rpe: Math.round(r(7, 9)), notes: 'Sparring' });
      if (tipo === 'fisico') sessions.push({ type: 'fisico', place: 'casa', minutes: 30, rounds: null, rpe: 6, notes: '' });
    }
    // Un sábado de cardio extra en la segunda semana
    if (i === 12) sessions.push({ type: 'fisico', place: 'otro', minutes: 35, rounds: null, rpe: 6, notes: 'Trote' });

    dias.push({
      date, weight, dayType, kcal, protein, carbs, fat, sessions,
      sleep: round(r(6.5, 8.5), 1),
      energy: Math.round(r(3, 5)),
      note: '',
      sample: true,
      updatedAt: Date.now(),
    });
  }
  return dias;
}
