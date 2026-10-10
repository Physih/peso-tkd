// =====================================================================
// report.js — Reporte semanal (lunes a domingo) y resumen para WhatsApp.
// Función pura: recibe los datos y devuelve un objeto con todo calculado.
// =====================================================================

import { addDays, diaSemana, lunesDe, hoyISO, avg, sum, fmt, fmtSigned, fmtFecha } from './util.js';
import { TIPOS_SESION } from './constantes.js';
import {
  serieTendencia, tendenciaEn, metasDelDia, estadoRango, TOLERANCIA, bloqueEn, ritmoActual,
  estimarMantenimiento, proximaCompetencia, proyectarCompetencia, ajusteSugerido, ESTADOS_PROY, fechaPesaje,
} from './calc.js';

/**
 * Calcula el reporte de la semana que empieza en `lunes`.
 * datos = { days, settings, blocks, competitions }
 */
export function reporteSemanal(lunes, { days, settings, blocks, competitions }, hoy = hoyISO()) {
  const domingo = addDays(lunes, 6);
  const serie = serieTendencia(days);
  const map = new Map(days.map(d => [d.date, d]));
  const fechas = Array.from({ length: 7 }, (_, i) => addDays(lunes, i));
  const semana = fechas.map(f => map.get(f)).filter(Boolean);
  const anterior = fechas.map(f => map.get(addDays(f, -7))).filter(Boolean);

  const tipo = f => map.get(f)?.dayType || settings.schedule[diaSemana(f)]?.dayType || 'rest';
  const metas = f => metasDelDia({
    fecha: f, tipoDia: tipo(f), blocks, defaultTargets: settings.defaultTargets,
    peso: tendenciaEn(serie, f) ?? settings.profile.weight,
  });

  // ----- Peso -----
  const pesos = fechas.map(f => map.get(f)?.weight ?? null);
  const pesosVal = pesos.filter(v => v != null);
  const prom = avg(pesosVal);
  const promPrev = avg(anterior.map(d => d.weight));
  const delta = prom != null && promPrev != null ? prom - promPrev : null;

  const fechaRef = domingo < hoy ? domingo : hoy; // la semana en curso se evalúa a hoy
  const comp = proximaCompetencia(competitions, fechaRef);
  const bloque = bloqueEn(blocks, fechaRef) || bloqueEn(blocks, lunes);
  const lineasMeta = [];
  if (bloque?.goalWeight) lineasMeta.push({ valor: bloque.goalWeight, etiqueta: `Meta bloque ${fmt(bloque.goalWeight, 1)}`, tipo: 'bloque' });
  if (comp && comp.limitKg !== bloque?.goalWeight) lineasMeta.push({ valor: comp.limitKg, etiqueta: `Límite ${comp.limitKg} kg` });

  const peso = {
    pesos,
    tendencia: fechas.map(f => (serie.has(f) ? serie.get(f) : null)),
    prom, promPrev, delta,
    deltaPct: delta != null ? (delta / promPrev) * 100 : null,
    min: pesosVal.length ? Math.min(...pesosVal) : null,
    max: pesosVal.length ? Math.max(...pesosVal) : null,
    n: pesosVal.length,
    metas: lineasMeta,
  };

  // ----- Nutrición -----
  const promedios = lista => ({
    n: lista.length,
    kcal: avg(lista.map(d => d.kcal)),
    protein: avg(lista.map(d => d.protein)),
    carbs: avg(lista.map(d => d.carbs)),
    fat: avg(lista.map(d => d.fat)),
  });
  const conKcal = semana.filter(d => d.kcal != null);
  const porDia = fechas.map(f => {
    const d = map.get(f);
    const m = metas(f);
    const kcal = d?.kcal ?? null;
    return {
      fecha: f, tipo: tipo(f), kcal, rango: m.kcal,
      estado: estadoRango(kcal, m.kcal, TOLERANCIA.kcal),
      macros: Object.fromEntries(['protein', 'carbs', 'fat'].map(k => [k, estadoRango(d?.[k] ?? null, m[k], TOLERANCIA.macro)])),
    };
  });
  const diasEnRango = porDia.filter(p => p.estado?.nivel === 'ok').length;
  const macrosEnRango = Object.fromEntries(['protein', 'carbs', 'fat'].map(k => {
    const con = porDia.filter(p => p.macros[k]);
    return [k, { ok: con.filter(p => p.macros[k].nivel === 'ok').length, n: con.length }];
  }));

  const nutricion = {
    todos: promedios(conKcal),
    train: promedios(conKcal.filter(d => tipo(d.date) === 'train')),
    rest: promedios(conKcal.filter(d => tipo(d.date) === 'rest')),
    diasEnRango,
    diasConKcal: conKcal.length,
    pctEnRango: conKcal.length ? (diasEnRango / conKcal.length) * 100 : null,
    porDia,
    macrosEnRango,
  };

  // ----- Entrenamiento -----
  const resumenSesiones = lista => {
    const ses = lista.flatMap(d => d.sessions || []);
    return {
      n: ses.length,
      porTipo: Object.fromEntries(TIPOS_SESION.map(t => [t.id, ses.filter(s => s.type === t.id).length])),
      minutos: sum(ses.map(s => s.minutes)),
      rounds: sum(ses.map(s => s.rounds)),
      rpeProm: avg(ses.map(s => s.rpe)),
      carga: sum(ses.map(s => (s.minutes || 0) * (s.rpe || 0))),
    };
  };
  const entreno = resumenSesiones(semana);
  const entrenoPrev = resumenSesiones(anterior);
  entreno.cargaPrev = entrenoPrev.carga;
  entreno.deltaCargaPct = entrenoPrev.carga ? ((entreno.carga - entrenoPrev.carga) / entrenoPrev.carga) * 100 : null;

  // ----- Proyección y ajuste -----
  const tend = tendenciaEn(serie, fechaRef);
  const ritmo = ritmoActual(serie, fechaRef);
  const maxPct = settings.alerts?.loss?.pct ?? 1;
  const proyTodas = competitions
    .filter(c => fechaPesaje(c) >= fechaRef)
    .sort((a, b) => (fechaPesaje(a) < fechaPesaje(b) ? -1 : 1))
    .map(c => proyectarCompetencia({ comp: c, tendencia: tend, ritmo, fecha: fechaRef, maxPct }));
  const proy = comp ? proyTodas.find(p => p.comp === comp) : null;
  // El ajuste se basa en la competencia más exigente (p. ej. el nacional de -63
  // aunque el torneo de -68 esté antes y ya estés en peso).
  const proyMeta = proyTodas.reduce((a, p) => ((p.necesario ?? -1) > (a?.necesario ?? -1) ? p : a), proy);
  const mant = estimarMantenimiento(days, serie, fechaRef);
  let ajuste = ajusteSugerido(proyMeta ?? { estado: 'pasada' }, mant.suficiente ? mant.mantenimiento : null);
  if (proyMeta && proy && proyMeta !== proy) ajuste += ` (según ${proyMeta.comp.name})`;

  return {
    lunes, domingo, fechas, fechaRef,
    enCurso: hoy >= lunes && hoy <= domingo,
    diasRegistrados: semana.length,
    bloque, peso, nutricion, entreno, proy, proyTodas, proyMeta, mant, ajuste,
  };
}

/** Texto corto para mandar al entrenador por WhatsApp. */
export function textoResumen(r) {
  const L = [];
  L.push(`📊 Semana ${fmtFecha(r.lunes)} – ${fmtFecha(r.domingo)}${r.enCurso ? ' (en curso)' : ''}`);

  const p = r.peso;
  if (p.n) {
    L.push(`⚖️ Peso prom: ${fmt(p.prom, 1)} kg${p.delta != null ? ` (${fmtSigned(p.delta, 1)} kg, ${fmtSigned(p.deltaPct, 1)}%)` : ''} · mín ${fmt(p.min, 1)} · máx ${fmt(p.max, 1)}`);
  } else {
    L.push('⚖️ Sin pesajes esta semana');
  }

  const n = r.nutricion;
  if (n.diasConKcal) {
    const partes = [];
    if (n.train.n) partes.push(`entreno ${fmt(n.train.kcal)}`);
    if (n.rest.n) partes.push(`descanso ${fmt(n.rest.kcal)}`);
    L.push(`🍽️ Kcal prom: ${fmt(n.todos.kcal)} (${partes.join(' · ')}) · en rango ${n.diasEnRango}/${n.diasConKcal} días`);
    L.push(`🥩 P ${fmt(n.todos.protein)} g · C ${fmt(n.todos.carbs)} g · G ${fmt(n.todos.fat)} g`);
  }

  const e = r.entreno;
  if (e.n) {
    const tipos = TIPOS_SESION.filter(t => e.porTipo[t.id]).map(t => `${t.corto} ${e.porTipo[t.id]}`).join(', ');
    L.push(`🥋 ${e.n} sesiones (${tipos}) · ${fmt(e.minutos)} min${e.rounds ? ` · ${fmt(e.rounds)} rounds` : ''} · RPE ${fmt(e.rpeProm, 1)}`);
    L.push(`📈 Carga ${fmt(e.carga)}${e.deltaCargaPct != null ? ` (${fmtSigned(e.deltaCargaPct, 0)}% vs sem. ant.)` : ''}`);
  } else {
    L.push('🥋 Sin sesiones registradas');
  }

  for (const pr of r.proyTodas || []) {
    const falta = pr.faltan == null ? '' : pr.faltan > 0 ? `faltan ${fmt(pr.faltan, 1)} kg` : `margen ${fmt(-pr.faltan, 1)} kg`;
    L.push(`🎯 ${pr.comp.name} (-${pr.comp.limitKg} kg, ${fmtFecha(fechaPesaje(pr.comp))}): ${falta} · ${ESTADOS_PROY[pr.estado].texto.toLowerCase()}`);
  }
  L.push(`➡️ ${r.ajuste}`);
  return L.join('\n');
}

/** Lunes de todas las semanas con algún registro, de la más reciente a la más antigua. */
export function semanasConDatos(days) {
  return [...new Set(days.map(d => lunesDe(d.date)))].sort().reverse();
}
