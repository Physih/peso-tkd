// =====================================================================
// calc.js — Lógica de cálculo PURA (sin DOM ni base de datos).
// Así se puede probar de forma aislada en tests/index.html.
// =====================================================================

import { addDays, diffDays, avg, clamp, fmt, round } from './util.js';

export const KCAL_POR_KG = 7700;          // 1 kg de peso corporal ≈ 7700 kcal
export const TOLERANCIA = { kcal: 0.05, macro: 0.10 }; // margen para el estado "cerca"

// ---------- Macros ----------

/** kcal calculadas a partir de los macros (4/4/9). null si falta alguno. */
export function kcalDeMacros(p, c, f) {
  if ([p, c, f].some(x => x == null || Number.isNaN(x))) return null;
  return 4 * p + 4 * c + 9 * f;
}

/** Compara las kcal escritas con las calculadas. descuadre = diferencia > 5 %. */
export function revisarMacros(kcal, p, c, f) {
  const calc = kcalDeMacros(p, c, f);
  if (calc == null || kcal == null || kcal <= 0) return { calc, difPct: null, descuadre: false };
  const difPct = ((calc - kcal) / kcal) * 100;
  return { calc, difPct, descuadre: Math.abs(difPct) > 5 };
}

// ---------- Peso de tendencia ----------

/**
 * Media móvil de 7 días (calendario) de los pesajes.
 * Devuelve Map fecha→tendencia para cada día entre el primer y el último pesaje.
 * Los días sin pesaje usan los pesajes disponibles de la ventana.
 */
export function serieTendencia(days, ventana = 7) {
  const pesos = new Map();
  for (const d of days) if (d.weight != null) pesos.set(d.date, d.weight);
  const out = new Map();
  if (!pesos.size) return out;
  const fechas = [...pesos.keys()].sort();
  const fin = fechas[fechas.length - 1];
  for (let f = fechas[0]; f <= fin; f = addDays(f, 1)) {
    const vals = [];
    for (let i = 0; i < ventana; i++) {
      const w = pesos.get(addDays(f, -i));
      if (w != null) vals.push(w);
    }
    if (vals.length) out.set(f, avg(vals));
  }
  return out;
}

/** Tendencia en la fecha o, si no hay, la última anterior. */
export function tendenciaEn(serie, fecha) {
  if (serie.has(fecha)) return serie.get(fecha);
  let mejor = null, mejorF = null;
  for (const [f, v] of serie) {
    if (f <= fecha && (mejorF === null || f > mejorF)) { mejor = v; mejorF = f; }
  }
  return mejor;
}

/** Pendiente por mínimos cuadrados de puntos {x, y}. */
export function pendiente(puntos) {
  const n = puntos.length;
  if (n < 2) return null;
  const mx = avg(puntos.map(p => p.x));
  const my = avg(puntos.map(p => p.y));
  let num = 0, den = 0;
  for (const p of puntos) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  return den === 0 ? null : num / den;
}

/**
 * Ritmo actual en kg/semana (negativo = bajando), según la pendiente
 * del peso de tendencia en los últimos `dias` días hasta `fecha`.
 */
export function ritmoActual(serie, fecha, dias = 14) {
  const desde = addDays(fecha, -(dias - 1));
  const pts = [];
  for (const [f, v] of serie) {
    if (f >= desde && f <= fecha) pts.push({ x: diffDays(desde, f), y: v });
  }
  if (pts.length < 7) return null;
  const m = pendiente(pts);
  return m == null ? null : m * 7;
}

// ---------- Metas y rangos ----------

/** Convierte un rango (g o g/kg) a gramos con el peso dado. */
export function resolverRango(def, peso) {
  if (!def) return null;
  if (def.mode === 'gkg') {
    if (peso == null) return null;
    return { min: def.min * peso, max: def.max * peso };
  }
  return { min: def.min, max: def.max };
}

/** Bloque activo en una fecha (si se solapan, gana el que empezó más tarde). */
export function bloqueEn(blocks, fecha) {
  return blocks
    .filter(b => b.start && b.end && b.start <= fecha && fecha <= b.end)
    .sort((a, b) => (a.start < b.start ? 1 : -1))[0] || null;
}

/** Rangos del día en kcal y gramos, según bloque, tipo de día y peso de tendencia. */
export function metasDelDia({ fecha, tipoDia, blocks, defaultTargets, peso }) {
  const bloque = bloqueEn(blocks, fecha);
  const t = (bloque ? bloque.targets : defaultTargets)[tipoDia || 'rest'];
  return {
    bloque,
    kcal: resolverRango(t.kcal, peso),
    protein: resolverRango(t.protein, peso),
    carbs: resolverRango(t.carbs, peso),
    fat: resolverRango(t.fat, peso),
  };
}

/**
 * Semáforo de un valor frente a un rango.
 * 'ok' dentro, 'cerca' fuera por menos de `tol` (fracción), 'fuera' más lejos.
 * dir: -1 por debajo, +1 por encima, 0 dentro.
 */
export function estadoRango(valor, rango, tol) {
  if (valor == null || !rango) return null;
  if (valor >= rango.min && valor <= rango.max) return { nivel: 'ok', dir: 0 };
  const dir = valor < rango.min ? -1 : 1;
  const borde = dir < 0 ? rango.min : rango.max;
  const lejos = Math.abs(valor - borde) / borde;
  return { nivel: lejos <= tol ? 'cerca' : 'fuera', dir };
}

// ---------- Mantenimiento ----------

/** Tasa metabólica basal (Mifflin-St Jeor). */
export function mifflin({ peso, estatura, edad, sexo }) {
  const base = 10 * peso + 6.25 * estatura - 5 * edad;
  return sexo === 'F' ? base - 161 : base + 5;
}

/**
 * Estima las kcal de mantenimiento reales: promedio de kcal comidas menos
 * el cambio del peso de tendencia × 7700 (por día). Ventana de hasta 28 días.
 * Requiere ≥14 días de datos.
 */
export function estimarMantenimiento(days, serie, fecha, maxDias = 28) {
  const conKcal = days
    .filter(d => d.kcal != null && d.kcal > 0 && d.date <= fecha)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!conKcal.length) return { suficiente: false, dias: 0 };

  const fin = conKcal[conKcal.length - 1].date;
  let ini = addDays(fin, -(maxDias - 1));
  if (conKcal[0].date > ini) ini = conKcal[0].date;
  const span = diffDays(ini, fin) + 1;
  if (span < 14) return { suficiente: false, dias: span };

  const enVentana = conKcal.filter(d => d.date >= ini);
  const pts = [];
  for (let f = ini; f <= fin; f = addDays(f, 1)) {
    if (serie.has(f)) pts.push({ x: diffDays(ini, f), y: serie.get(f) });
  }
  if (pts.length < 10) return { suficiente: false, dias: span };

  const kgDia = pendiente(pts);
  const kcalProm = avg(enVentana.map(d => d.kcal));
  const mantenimiento = kcalProm - kgDia * KCAL_POR_KG;

  const cobertura = enVentana.length / span;
  const pesajes = days.filter(d => d.weight != null && d.date >= ini && d.date <= fin).length / span;
  let confianza = 'baja';
  if (span >= 21 && cobertura >= 0.85 && pesajes >= 0.7) confianza = 'alta';
  else if (cobertura >= 0.7 && pesajes >= 0.5) confianza = 'media';

  return {
    suficiente: true,
    mantenimiento: Math.round(mantenimiento / 10) * 10,
    kcalProm,
    kgSemana: kgDia * 7,
    dias: span,
    cobertura,
    pesajes,
    confianza,
    desde: ini,
    hasta: fin,
  };
}

// ---------- Proyección a competencias ----------

export const ESTADOS_PROY = {
  enCamino: { texto: 'En camino', clase: 'ok' },
  lento: { texto: 'Vas lento', clase: 'cerca' },
  agresivo: { texto: 'Ritmo demasiado agresivo', clase: 'fuera' },
  enPeso: { texto: 'Ya estás en peso', clase: 'ok' },
  sinDatos: { texto: 'Faltan datos', clase: '' },
  pasada: { texto: 'Ya pasó', clase: '' },
};

/** Fecha del pesaje (o de la competencia si no hay pesaje). */
export function fechaPesaje(comp) {
  return comp.weighIn ? comp.weighIn.slice(0, 10) : comp.date;
}

/**
 * Proyección hacia una competencia.
 * tendencia: peso de tendencia actual · ritmo: kg/semana (negativo = bajando).
 * maxPct: % de peso por semana considerado agresivo.
 */
export function proyectarCompetencia({ comp, tendencia, ritmo, fecha, maxPct = 1 }) {
  const dias = diffDays(fecha, fechaPesaje(comp));
  const faltan = tendencia == null ? null : tendencia - comp.limitKg; // kg por bajar
  const necesario = faltan != null && dias > 0 ? Math.max(faltan, 0) / (dias / 7) : null; // kg/sem a perder
  const actual = ritmo == null ? null : -ritmo; // kg/sem que se pierden (positivo = bajando)
  const pctActual = actual != null && tendencia ? (actual / tendencia) * 100 : null;
  const pctNecesario = necesario != null && tendencia ? (necesario / tendencia) * 100 : null;

  let llegada = null;
  if (faltan != null && faltan > 0 && actual != null && actual > 0.02) {
    llegada = addDays(fecha, Math.ceil((faltan / actual) * 7));
  }

  let estado;
  if (dias < 0) estado = 'pasada';
  else if (faltan == null) estado = 'sinDatos';
  else if (pctActual != null && pctActual > maxPct) estado = 'agresivo';
  else if (faltan <= 0) estado = 'enPeso';
  else if (actual == null) estado = 'sinDatos';
  else if (actual < necesario * 0.9) estado = 'lento';
  else estado = 'enCamino';

  return {
    comp, dias, faltan, necesario, actual, pctActual, pctNecesario, llegada, estado,
    exigente: pctNecesario != null && pctNecesario > maxPct,
    llegaATiempo: llegada ? llegada <= fechaPesaje(comp) : faltan != null && faltan <= 0,
  };
}

/** Próxima competencia a partir de una fecha (incluida). */
export function proximaCompetencia(comps, fecha) {
  return comps
    .filter(c => fechaPesaje(c) >= fecha)
    .sort((a, b) => (fechaPesaje(a) < fechaPesaje(b) ? -1 : 1))[0] || null;
}

/** Ajuste sugerido para la semana siguiente, en una línea. */
export function ajusteSugerido(proy, mant) {
  const r50 = n => Math.round(n / 50) * 50;
  if (!proy || proy.estado === 'sinDatos') return 'Registra peso y kcal varios días seguidos para poder sugerir un ajuste.';
  if (proy.estado === 'pasada') return 'No hay competencia próxima: define la siguiente en Ajustes.';
  if (proy.estado === 'agresivo') {
    const exceso = proy.actual - Math.min(proy.necesario ?? 0, proy.actual);
    const sube = clamp(r50((exceso * KCAL_POR_KG) / 7), 100, 300);
    return `Bajas más rápido de lo recomendable: sube ~${sube} kcal/día (sobre todo carbohidratos en días de entreno).`;
  }
  if (proy.estado === 'enPeso') {
    return `Ya estás en peso: come en mantenimiento${mant ? ` (~${fmt(mant)} kcal)` : ''} y cuida no pasarte antes del pesaje.`;
  }
  if (proy.estado === 'lento') {
    const baja = clamp(r50(((proy.necesario - proy.actual) * KCAL_POR_KG) / 7), 100, 300);
    const extra = proy.exigente ? ' La meta exige más de 1 %/sem: coméntalo con tu entrenador.' : '';
    return `Vas lento: baja ~${baja} kcal/día (recorta carbohidratos o grasa en días de descanso).${extra}`;
  }
  return 'Vas en camino: mantén los rangos actuales.';
}

// ---------- Alertas ----------

/**
 * Cuenta días seguidos (hacia atrás desde `fecha`) que cumplen `cond`.
 * Un día sin registro corta la racha.
 */
function racha(diasMap, fecha, cond) {
  let n = 0;
  for (let f = fecha; ; f = addDays(f, -1)) {
    const d = diasMap.get(f);
    if (!d || !cond(d)) {
      // Si hoy aún no se ha registrado, empezar a contar desde ayer
      if (n === 0 && f === fecha && !d) continue;
      break;
    }
    n++;
  }
  return n;
}

/**
 * Alertas activas a la fecha.
 * metasFn(day) → { kcal:{min,max}, protein:{min,max} } del día.
 */
export function calcularAlertas({ days, serie, fecha, cfg, metasFn }) {
  const out = [];
  const map = new Map(days.map(d => [d.date, d]));

  if (cfg.loss?.on) {
    const r = ritmoActual(serie, fecha, 14);
    const t = tendenciaEn(serie, fecha);
    if (r != null && t) {
      const pct = (-r / t) * 100;
      if (pct > cfg.loss.pct) {
        out.push({
          tipo: 'perdida',
          texto: `Estás bajando ${fmt(-r, 2)} kg/sem (${fmt(pct, 1)} % de tu peso), más del ${fmt(cfg.loss.pct, 1)} %/sem. Riesgo de perder músculo y rendimiento.`,
        });
      }
    }
  }

  if (cfg.lowKcal?.on) {
    const n = racha(map, fecha, d => {
      const m = metasFn(d);
      return d.kcal != null && m.kcal && d.kcal < m.kcal.min;
    });
    if (n >= cfg.lowKcal.days) {
      out.push({ tipo: 'kcal', texto: `${n} días seguidos por debajo del mínimo de kcal. Revisa que estés comiendo suficiente.` });
    }
  }

  if (cfg.lowProtein?.on) {
    const n = racha(map, fecha, d => {
      const m = metasFn(d);
      return d.protein != null && m.protein && d.protein < m.protein.min;
    });
    if (n >= cfg.lowProtein.days) {
      out.push({ tipo: 'proteina', texto: `${n} días seguidos con proteína baja. Prioriza proteína para conservar músculo.` });
    }
  }
  return out;
}

// ---------- Sugerir metas ----------

/**
 * Punto de partida de metas para un bloque.
 * Usa Mifflin-St Jeor × factor de actividad, o el mantenimiento real si hay
 * suficiente confianza. Ajusta al ritmo necesario para llegar a metaPeso,
 * limitado a maxPct del peso por semana.
 */
export function sugerirMetas({ perfil, peso, factor, metaPeso, desde, hasta, mantReal, diasEntreno, maxPct = 1 }) {
  const pasos = [];
  const bmr = mifflin({ peso, estatura: perfil.height, edad: perfil.age, sexo: perfil.sex });
  const tdeeMifflin = bmr * factor;
  pasos.push(`TMB (Mifflin-St Jeor) = 10×${fmt(peso, 1)} + 6.25×${perfil.height} − 5×${perfil.age} ${perfil.sex === 'F' ? '− 161' : '+ 5'} = ${fmt(bmr)} kcal`);
  pasos.push(`Gasto estimado = ${fmt(bmr)} × ${factor} (actividad) = ${fmt(tdeeMifflin)} kcal`);

  const usaReal = !!(mantReal && mantReal.suficiente && mantReal.confianza !== 'baja');
  const tdee = usaReal ? mantReal.mantenimiento : tdeeMifflin;
  if (usaReal) pasos.push(`Se usa tu mantenimiento real medido: ${fmt(tdee)} kcal (confianza ${mantReal.confianza})`);

  const semanas = Math.max(diffDays(desde, hasta), 1) / 7;
  const kgCambio = metaPeso != null ? metaPeso - peso : 0;
  let ritmo = kgCambio / semanas; // kg/sem (negativo = bajar)
  const ritmoMax = (-peso * maxPct) / 100;
  const limitado = ritmo < ritmoMax;
  pasos.push(`Meta: ${fmt(peso, 1)} → ${fmt(metaPeso ?? peso, 1)} kg en ${fmt(semanas, 1)} semanas = ${fmt(ritmo, 2)} kg/sem`);
  if (limitado) {
    ritmo = ritmoMax;
    pasos.push(`⚠️ Ese ritmo supera el ${maxPct} % del peso por semana; se limita a ${fmt(ritmo, 2)} kg/sem (no llegarías solo con dieta).`);
  }
  if (ritmo > 0.25) ritmo = 0.25; // no proponer superávit grande

  const ajuste = (ritmo * KCAL_POR_KG) / 7;
  let prom = tdee + ajuste;
  pasos.push(`Ajuste diario = ${fmt(ritmo, 2)} × 7700 / 7 = ${fmt(ajuste)} kcal → promedio ${fmt(prom)} kcal/día`);

  const piso = Math.max(bmr, perfil.sex === 'F' ? 1400 : 1600);
  let enPiso = false;
  if (prom < piso) {
    prom = piso;
    enPiso = true;
    pasos.push(`⚠️ Se sube al mínimo seguro de ${fmt(piso)} kcal/día.`);
  }

  // Más kcal en días de entreno, manteniendo el promedio semanal
  const DIF = 200;
  const nT = clamp(diasEntreno, 0, 7);
  const kcalEntreno = prom + (DIF * (7 - nT)) / 7;
  const kcalDescanso = prom - (DIF * nT) / 7;
  pasos.push(`Reparto (${nT} días de entreno): entreno ≈ ${fmt(kcalEntreno)} · descanso ≈ ${fmt(kcalDescanso)} kcal`);

  const enDeficit = ajuste < -100;
  const prot = enDeficit ? [2.0, 2.4] : [1.8, 2.2];
  const grasa = [0.8, 1.0];
  pasos.push(`Proteína ${prot[0]}–${prot[1]} g/kg${enDeficit ? ' (más alta en déficit para cuidar músculo)' : ''}, grasa ${grasa[0]}–${grasa[1]} g/kg, carbohidratos = el resto.`);

  const r10 = n => Math.round(n / 10) * 10;
  const diaMetas = kcal => {
    const pMid = (prot[0] + prot[1]) / 2, gMid = (grasa[0] + grasa[1]) / 2;
    const carbKg = Math.max((kcal - pMid * peso * 4 - gMid * peso * 9) / 4 / peso, 1);
    return {
      kcal: { min: r10(kcal - 100), max: r10(kcal + 100) },
      protein: { mode: 'gkg', min: prot[0], max: prot[1] },
      carbs: { mode: 'gkg', min: round(Math.max(carbKg - 0.4, 0.5), 1), max: round(carbKg + 0.4, 1) },
      fat: { mode: 'gkg', min: grasa[0], max: grasa[1] },
    };
  };

  return {
    bmr, tdeeMifflin, tdee, usaReal, semanas, kgCambio, ritmo, limitado, enPiso, ajuste, prom,
    kcalEntreno, kcalDescanso, pasos,
    targets: { train: diaMetas(kcalEntreno), rest: diaMetas(kcalDescanso) },
  };
}
