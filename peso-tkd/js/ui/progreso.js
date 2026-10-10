// =====================================================================
// ui/progreso.js — Competencias (proyección), mantenimiento real,
// alertas activas y gráfica de tendencia.
// =====================================================================

import { state, daysSorted } from '../db.js';
import { hoyISO, addDays, fmt, fmtFecha, fmtFechaLarga, esc } from '../util.js';
import { ESTADOS_PROY, fechaPesaje, tendenciaEn, ritmoActual, bloqueEn } from '../calc.js';
import { serie, proyecciones, mantenimiento, alertas } from '../contexto.js';
import { graficaPeso } from './charts.js';

const DIAS_GRAFICA = 56;

export function render(root) {
  const hoy = hoyISO();
  const s = serie();
  const tend = tendenciaEn(s, hoy);
  const ritmo = ritmoActual(s, hoy);
  const proys = proyecciones(hoy, s).filter(p => p.estado !== 'pasada');
  const mant = mantenimiento(hoy, s);
  const alts = alertas(hoy, s);
  const bloque = bloqueEn(state.blocks, hoy);

  root.innerHTML = `
    <section class="card">
      <div class="kpis" style="margin:0">
        <div class="kpi"><div class="v">${tend ? `${fmt(tend, 1)} kg` : '—'}</div><div class="l">Peso de tendencia (7 días)</div></div>
        <div class="kpi"><div class="v">${ritmo != null ? `${ritmo > 0 ? '+' : ''}${fmt(ritmo, 2)}` : '—'}</div><div class="l">kg/semana (últimos 14 días)</div></div>
      </div>
      ${bloque ? `<p class="small muted" style="margin-top:8px">Bloque actual: <b style="color:var(--text)">${esc(bloque.name)}</b> (${fmtFecha(bloque.start)} – ${fmtFecha(bloque.end)}${bloque.goalWeight ? ` · meta ${fmt(bloque.goalWeight, 1)} kg` : ''})</p>` : ''}
    </section>

    <section class="card">
      <h2>🔔 Alertas</h2>
      ${alts.length ? alts.map(a => `<div class="alerta">${esc(a.texto)}</div>`).join('') : '<p class="ok">✓ Sin alertas activas</p>'}
    </section>

    ${proys.length ? proys.map(tarjetaCompetencia).join('') : '<section class="card"><p class="muted">No hay competencias próximas. Agrégalas en <a href="#ajustes/competencias">Ajustes</a>.</p></section>'}

    <section class="card">
      <h2>🔥 Mantenimiento real</h2>
      ${mant.suficiente ? `
        <div class="kpis">
          <div class="kpi"><div class="v">${fmt(mant.mantenimiento)}</div><div class="l">kcal/día estimadas</div></div>
          <div class="kpi"><div class="v"><span class="badge ${{ alta: 'ok', media: 'cerca', baja: 'fuera' }[mant.confianza]}">Confianza ${mant.confianza}</span></div>
            <div class="l">${mant.dias} días · ${fmt(mant.cobertura * 100)} % con kcal · ${fmt(mant.pesajes * 100)} % con peso</div></div>
        </div>
        <p class="small muted">Comiste en promedio ${fmt(mant.kcalProm)} kcal y tu tendencia cambió ${fmt(mant.kgSemana, 2)} kg/sem
          (${fmtFecha(mant.desde)} – ${fmtFecha(mant.hasta)}). ${fmt(mant.kcalProm)} − (${fmt(mant.kgSemana / 7, 3)} × 7700) ≈ ${fmt(mant.mantenimiento)} kcal.
          ${mant.confianza !== 'baja' ? 'Se usa en "Sugerir metas".' : 'Registra más días seguidos para subir la confianza.'}</p>`
        : `<p class="muted">Necesito al menos 14 días con kcal y peso para estimarlo. Llevas ${mant.dias || 0}.</p>`}
    </section>

    <section class="card">
      <h2>📉 Tendencia (${DIAS_GRAFICA / 7} semanas)</h2>
      <div class="grafica" style="height:260px"><canvas id="g-tendencia"></canvas></div>
    </section>
  `;

  // Gráfica de tendencia con los límites de las próximas competencias
  const dias = daysSorted();
  if (dias.some(d => d.weight != null)) {
    const desde = addDays(hoy, -(DIAS_GRAFICA - 1));
    const fechas = Array.from({ length: DIAS_GRAFICA }, (_, i) => addDays(desde, i));
    const map = new Map(dias.map(d => [d.date, d]));
    graficaPeso(root.querySelector('#g-tendencia'), {
      labels: fechas.map(f => fmtFecha(f)),
      pesos: fechas.map(f => map.get(f)?.weight ?? null),
      tendencia: fechas.map(f => s.get(f) ?? null),
      metas: proys.slice(0, 2).map(p => ({ valor: p.comp.limitKg, etiqueta: `-${p.comp.limitKg} ${p.comp.name}` })),
    });
  }
}

function tarjetaCompetencia(p) {
  const est = ESTADOS_PROY[p.estado];
  const c = p.comp;
  return `
    <section class="card">
      <div class="card-head">
        <h2>🏆 ${esc(c.name)}</h2>
        <span class="badge ${est.clase}">${est.texto}</span>
      </div>
      <p class="small muted">Categoría -${c.limitKg} kg · competencia ${fmtFechaLarga(c.date)}
        · pesaje ${c.weighIn ? `${fmtFecha(fechaPesaje(c))} ${c.weighIn.slice(11, 16)}` : 'sin definir (se usa el día de la competencia)'}
        · <b style="color:var(--text)">faltan ${p.dias} días</b></p>
      <div class="kpis">
        <div class="kpi"><div class="v">${p.faltan == null ? '—' : p.faltan > 0 ? `${fmt(p.faltan, 1)} kg` : `✓ ${fmt(-p.faltan, 1)} kg`}</div>
          <div class="l">${p.faltan != null && p.faltan <= 0 ? 'de margen bajo el límite' : 'por bajar'}</div></div>
        <div class="kpi"><div class="v">${p.necesario != null ? fmt(p.necesario, 2) : '—'}</div>
          <div class="l">kg/sem necesarios${p.pctNecesario != null ? ` (${fmt(p.pctNecesario, 1)} %)` : ''}</div></div>
        <div class="kpi"><div class="v">${p.actual != null ? fmt(p.actual, 2) : '—'}</div>
          <div class="l">kg/sem ritmo actual${p.pctActual != null ? ` (${fmt(p.pctActual, 1)} %)` : ''}</div></div>
        <div class="kpi"><div class="v">${p.llegada ? fmtFecha(p.llegada) : p.faltan != null && p.faltan <= 0 ? 'Ya' : '—'}</div>
          <div class="l">llegada estimada${p.llegada ? (p.llegaATiempo ? ' ✓ a tiempo' : ' ⚠️ tarde') : ''}</div></div>
      </div>
      ${p.exigente ? `<div class="alerta">⚠️ Llegar exige más del ${fmt(state.settings.alerts.loss.pct, 1)} % de tu peso por semana. Coméntalo con tu entrenador o un nutricionista antes de recortar más.</div>` : ''}
      ${p.estado === 'sinDatos' ? '<p class="muted small">Necesito al menos 7 días de pesajes para calcular tu ritmo.</p>' : ''}
    </section>`;
}
