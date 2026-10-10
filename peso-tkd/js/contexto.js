// =====================================================================
// contexto.js — Une el estado guardado con la lógica de calc.js.
// Las pantallas usan estas funciones en lugar de repetir cálculos.
// =====================================================================

import { state, daysSorted } from './db.js';
import { diaSemana, hoyISO } from './util.js';
import {
  serieTendencia, tendenciaEn, metasDelDia, ritmoActual, estimarMantenimiento,
  proyectarCompetencia, proximaCompetencia, calcularAlertas, fechaPesaje,
} from './calc.js';

/** Serie de tendencia de todos los pesajes. */
export function serie() {
  return serieTendencia(daysSorted());
}

/** Tipo de día según el horario semanal. */
export function tipoSegunHorario(fecha) {
  return state.settings.schedule[diaSemana(fecha)]?.dayType || 'rest';
}

/** Tipo de día guardado o, si no hay registro, el del horario. */
export function tipoDia(fecha) {
  return state.days.get(fecha)?.dayType || tipoSegunHorario(fecha);
}

/** Peso de referencia para g/kg: tendencia o, si no hay pesajes, el del perfil. */
export function pesoRef(fecha, s = serie()) {
  return tendenciaEn(s, fecha) ?? state.settings.profile.weight;
}

/** Rangos (kcal y gramos) de una fecha y tipo de día. */
export function metasPara(fecha, tipo = tipoDia(fecha), s = serie()) {
  return metasDelDia({
    fecha,
    tipoDia: tipo,
    blocks: state.blocks,
    defaultTargets: state.settings.defaultTargets,
    peso: pesoRef(fecha, s),
  });
}

/** Mantenimiento real estimado hasta la fecha. */
export function mantenimiento(fecha = hoyISO(), s = serie()) {
  return estimarMantenimiento(daysSorted(), s, fecha);
}

/** Proyecciones a todas las competencias futuras, a la fecha dada. */
export function proyecciones(fecha = hoyISO(), s = serie()) {
  const t = tendenciaEn(s, fecha);
  const r = ritmoActual(s, fecha);
  const maxPct = state.settings.alerts.loss?.pct ?? 1;
  return [...state.competitions]
    .sort((a, b) => (fechaPesaje(a) < fechaPesaje(b) ? -1 : 1))
    .map(comp => proyectarCompetencia({ comp, tendencia: t, ritmo: r, fecha, maxPct }));
}

/** Proyección a la próxima competencia (o null). */
export function proyeccionProxima(fecha = hoyISO(), s = serie()) {
  const comp = proximaCompetencia(state.competitions, fecha);
  if (!comp) return null;
  return proyectarCompetencia({
    comp,
    tendencia: tendenciaEn(s, fecha),
    ritmo: ritmoActual(s, fecha),
    fecha,
    maxPct: state.settings.alerts.loss?.pct ?? 1,
  });
}

/** Alertas activas a la fecha. */
export function alertas(fecha = hoyISO(), s = serie()) {
  return calcularAlertas({
    days: daysSorted(),
    serie: s,
    fecha,
    cfg: state.settings.alerts,
    metasFn: d => metasPara(d.date, d.dayType || tipoSegunHorario(d.date), s),
  });
}
