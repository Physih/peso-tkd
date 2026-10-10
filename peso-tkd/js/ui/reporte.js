// =====================================================================
// ui/reporte.js — Reporte semanal (lunes a domingo) + historial.
// =====================================================================

import { state, daysSorted } from '../db.js';
import { hoyISO, lunesDe, addDays, diaSemana, fmt, fmtSigned, fmtFecha, esc, toast, DIAS_CORTOS } from '../util.js';
import { TIPOS_SESION } from '../constantes.js';
import { ESTADOS_PROY, fechaPesaje } from '../calc.js';
import { reporteSemanal, textoResumen, semanasConDatos } from '../report.js';
import { graficaPeso, graficaKcal, graficaCarga, COLOR } from './charts.js';

let root;
let lunes = lunesDe(hoyISO());

const datos = () => ({ days: daysSorted(), settings: state.settings, blocks: state.blocks, competitions: state.competitions });

export function render(cont) {
  root = cont;
  pintar();
  root.addEventListener('click', onClick);
}

function pintar() {
  const hoy = hoyISO();
  const d = datos();
  const r = reporteSemanal(lunes, d, hoy);
  const esActual = lunes >= lunesDe(hoy);

  root.innerHTML = `
    <div class="nav-fecha">
      <button class="icono" data-acc="sem-ant" aria-label="Semana anterior">◀</button>
      <div class="centro"><b>${fmtFecha(r.lunes)} – ${fmtFecha(r.domingo)}</b><div class="muted small">${r.enCurso ? 'Semana en curso' : `${r.diasRegistrados} de 7 días registrados`}</div></div>
      <button class="icono" data-acc="sem-sig" aria-label="Semana siguiente" ${esActual ? 'disabled' : ''}>▶</button>
    </div>
    ${r.diasRegistrados ? cuerpo(r) : `
      <div class="card centro">
        <p>No hay registros en esta semana.</p>
        ${d.days.length ? '' : '<p class="muted small">¿Quieres ver un ejemplo? Carga datos de prueba en <a href="#ajustes/ejemplo">Ajustes → Datos de ejemplo</a>.</p>'}
      </div>`}
    ${historial(d.days)}
  `;
  if (r.diasRegistrados) graficas(r, d);
}

function kpi(valor, etiqueta, extra = '') {
  return `<div class="kpi"><div class="v">${valor}</div><div class="l">${etiqueta}</div>${extra ? `<div class="d">${extra}</div>` : ''}</div>`;
}

/** Clase de color para un cambio: bajar peso es "bueno" si hay que bajar. */
function claseCambio(delta) {
  if (delta == null) return 'muted';
  return delta <= 0 ? 'ok' : 'cerca';
}

function cuerpo(r) {
  const p = r.peso, n = r.nutricion, e = r.entreno;
  const fila = (nombre, k, dec = 0) => `<tr><td>${nombre}</td><td>${fmt(n.todos[k], dec)}</td><td>${fmt(n.train[k], dec)}</td><td>${fmt(n.rest[k], dec)}</td></tr>`;
  const pr = r.proy;
  const est = pr ? ESTADOS_PROY[pr.estado] : null;

  return `
    <section class="card">
      <h2>⚖️ Peso</h2>
      <div class="kpis">
        ${kpi(p.n ? `${fmt(p.prom, 1)} kg` : '—', `Promedio (${p.n} pesajes)`)}
        ${kpi(p.delta != null ? `${fmtSigned(p.delta, 2)} kg` : '—', 'vs semana anterior',
          p.deltaPct != null ? `<span class="${claseCambio(p.delta)}">${fmtSigned(p.deltaPct, 1)} %</span>` : '')}
        ${kpi(fmt(p.min, 1), 'Mínimo')}
        ${kpi(fmt(p.max, 1), 'Máximo')}
      </div>
      <div class="grafica"><canvas id="g-peso"></canvas></div>
    </section>

    <section class="card">
      <h2>🍽️ Nutrición</h2>
      <div class="kpis">
        ${kpi(fmt(n.todos.kcal), `kcal promedio (${n.diasConKcal} días)`)}
        ${kpi(n.pctEnRango != null ? `${fmt(n.pctEnRango)} %` : '—', `días en rango (${n.diasEnRango}/${n.diasConKcal})`)}
      </div>
      <table class="tabla">
        <thead><tr><th>Promedio</th><th>Todos</th><th>Entreno (${n.train.n})</th><th>Descanso (${n.rest.n})</th></tr></thead>
        <tbody>${fila('Kcal', 'kcal')}${fila('Proteína g', 'protein')}${fila('Carbos g', 'carbs')}${fila('Grasa g', 'fat')}</tbody>
      </table>
      <p class="small muted" style="margin-top:8px">Macros en rango: proteína ${n.macrosEnRango.protein.ok}/${n.macrosEnRango.protein.n} · carbos ${n.macrosEnRango.carbs.ok}/${n.macrosEnRango.carbs.n} · grasa ${n.macrosEnRango.fat.ok}/${n.macrosEnRango.fat.n} días</p>
      <div class="grafica"><canvas id="g-kcal"></canvas></div>
      <p class="small muted">Franja verde = rango de kcal de cada día. Barras: 🟢 dentro · 🟡 cerca · 🔴 fuera.</p>
    </section>

    <section class="card">
      <h2>🥋 Entrenamiento</h2>
      <div class="kpis">
        ${kpi(e.n, 'sesiones')}
        ${kpi(fmt(e.minutos), 'minutos totales')}
        ${kpi(fmt(e.rounds), 'rounds totales')}
        ${kpi(fmt(e.rpeProm, 1), 'RPE promedio')}
      </div>
      <div class="chips" style="margin-bottom:10px">
        ${TIPOS_SESION.filter(t => e.porTipo[t.id]).map(t => `<span class="badge">${t.icono} ${t.corto}: ${e.porTipo[t.id]}</span>`).join('') || '<span class="muted small">Sin sesiones</span>'}
      </div>
      <div class="kpi">
        <div class="v">${fmt(e.carga)}</div>
        <div class="l">Carga semanal (minutos × RPE)</div>
        <div class="d">${e.deltaCargaPct != null ? `${fmtSigned(e.deltaCargaPct, 0)} % vs semana anterior (${fmt(e.cargaPrev)})` : 'Sin datos de la semana anterior'}</div>
      </div>
      <div class="grafica" style="height:170px"><canvas id="g-carga"></canvas></div>
    </section>

    <section class="card">
      <h2>🎯 Proyección y ajuste</h2>
      ${pr ? `
        <div class="card-head"><strong>${esc(pr.comp.name)} · -${pr.comp.limitKg} kg</strong><span class="badge ${est.clase}">${est.texto}</span></div>
        <p class="small muted">Pesaje: ${fmtFecha(fechaPesaje(pr.comp))} · ${pr.dias} días desde ${fmtFecha(r.fechaRef)}</p>
        <div class="kpis">
          ${kpi(pr.faltan == null ? '—' : pr.faltan > 0 ? `${fmt(pr.faltan, 1)} kg` : `✓ ${fmt(-pr.faltan, 1)}`, pr.faltan > 0 ? 'por bajar (tendencia)' : 'kg de margen')}
          ${kpi(pr.necesario != null ? `${fmt(pr.necesario, 2)}` : '—', 'kg/sem necesarios')}
          ${kpi(pr.actual != null ? `${fmt(pr.actual, 2)}` : '—', 'kg/sem ritmo actual (bajando)')}
          ${kpi(pr.llegada ? fmtFecha(pr.llegada) : '—', 'llegada estimada')}
        </div>
        ${r.proyTodas.filter(o => o !== pr).map(o => `
          <p class="small">🏆 Después: <b>${esc(o.comp.name)} -${o.comp.limitKg}</b> (${fmtFecha(fechaPesaje(o.comp))}) ·
            ${o.faltan > 0 ? `faltan ${fmt(o.faltan, 1)} kg · necesitas ${fmt(o.necesario, 2)} kg/sem (${fmt(o.pctNecesario, 1)} %)` : 'en peso'}
            · <span class="badge ${ESTADOS_PROY[o.estado].clase}">${ESTADOS_PROY[o.estado].texto}</span></p>`).join('')}
        ` : '<p class="muted">No hay competencias próximas.</p>'}
      <div class="info">➡️ <b>Ajuste para la próxima semana:</b> ${esc(r.ajuste)}</div>
    </section>

    <section class="card">
      <h2>📲 Resumen para el entrenador</h2>
      <pre id="resumen" class="small" style="white-space:pre-wrap;background:var(--surface-2);padding:10px;border-radius:10px;margin:0 0 10px">${esc(textoResumen(r))}</pre>
      <button class="primario grande" data-acc="copiar">📋 Copiar resumen</button>
    </section>`;
}

function graficas(r, d) {
  const labels = r.fechas.map(f => `${DIAS_CORTOS[diaSemana(f)]} ${Number(f.slice(8))}`);
  if (r.peso.n) {
    graficaPeso(root.querySelector('#g-peso'), {
      labels, pesos: r.peso.pesos, tendencia: r.peso.tendencia, metas: r.peso.metas,
    });
  }
  const col = { ok: COLOR.ok, cerca: COLOR.cerca, fuera: COLOR.fuera };
  graficaKcal(root.querySelector('#g-kcal'), {
    labels,
    kcal: r.nutricion.porDia.map(x => x.kcal),
    rangos: r.nutricion.porDia.map(x => x.rango),
    colores: r.nutricion.porDia.map(x => col[x.estado?.nivel] || COLOR.neutro),
  });

  // Carga de las últimas 6 semanas
  const semanas = Array.from({ length: 6 }, (_, i) => addDays(r.lunes, -7 * (5 - i)));
  graficaCarga(root.querySelector('#g-carga'), {
    labels: semanas.map(l => fmtFecha(l)),
    cargas: semanas.map(l => reporteSemanal(l, d).entreno.carga),
  });
}

function historial(days) {
  const semanas = semanasConDatos(days).slice(0, 26);
  if (!semanas.length) return '';
  const d = datos();
  return `
    <details class="card">
      <summary>🗂️ Historial de semanas</summary>
      <div class="lista-semanas">
        ${semanas.map(l => {
          const r = reporteSemanal(l, d);
          return `<button data-acc="ir-semana" data-v="${l}" class="${l === lunes ? 'primario' : ''}">
            <span>${fmtFecha(l)} – ${fmtFecha(addDays(l, 6))}</span>
            <span class="muted small">${r.peso.n ? `${fmt(r.peso.prom, 1)} kg` : '—'} · ${r.nutricion.diasConKcal ? `${fmt(r.nutricion.todos.kcal)} kcal` : '—'} · ${r.entreno.n} ses.</span>
          </button>`;
        }).join('')}
      </div>
    </details>`;
}

async function copiar() {
  const texto = root.querySelector('#resumen').textContent;
  try {
    await navigator.clipboard.writeText(texto);
  } catch {
    // Plan B para navegadores sin permiso de portapapeles
    const ta = document.createElement('textarea');
    ta.value = texto;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('Resumen copiado. Pégalo en WhatsApp 📲', 'ok');
}

function onClick(e) {
  const btn = e.target.closest('[data-acc]');
  if (!btn) return;
  switch (btn.dataset.acc) {
    case 'sem-ant': lunes = addDays(lunes, -7); pintar(); break;
    case 'sem-sig': lunes = addDays(lunes, 7); pintar(); break;
    case 'ir-semana': lunes = btn.dataset.v; pintar(); window.scrollTo({ top: 0, behavior: 'smooth' }); break;
    case 'copiar': copiar(); break;
  }
}
