// =====================================================================
// charts.js — Gráficas con Chart.js (tema oscuro).
// =====================================================================

const COLOR = {
  texto: '#9aa3b2',
  rejilla: 'rgba(255,255,255,.07)',
  peso: '#9aa3b2',
  tendencia: '#4f8cff',
  meta: '#e5484d',
  ok: '#3fb950',
  cerca: '#d29922',
  fuera: '#f85149',
  rango: 'rgba(63,185,80,.16)',
  neutro: '#5b6475',
};
export { COLOR };

const instancias = new Map();

/** Hay Chart.js disponible (si el archivo no cargó, las gráficas se omiten). */
export const hayCharts = () => typeof window.Chart !== 'undefined';

export function configurarTema() {
  if (!hayCharts()) return;
  const C = window.Chart;
  C.defaults.color = COLOR.texto;
  C.defaults.borderColor = COLOR.rejilla;
  C.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  C.defaults.font.size = 12;
  C.defaults.maintainAspectRatio = false;
  C.defaults.animation = { duration: 300 };
  C.defaults.plugins.legend.labels.boxWidth = 12;
  C.defaults.plugins.legend.labels.usePointStyle = true;
}

/** Crea (o recrea) una gráfica en el canvas indicado. */
function crear(canvas, config) {
  if (!hayCharts() || !canvas) return null;
  instancias.get(canvas.id)?.destroy();
  const g = new window.Chart(canvas, config);
  instancias.set(canvas.id, g);
  return g;
}

/**
 * Peso: pesajes diarios (puntos), tendencia (línea) y meta (línea discontinua).
 * metas: [{ valor, etiqueta }]
 */
export function graficaPeso(canvas, { labels, pesos, tendencia, metas = [] }) {
  const todos = [...pesos, ...tendencia, ...metas.map(m => m.valor)].filter(v => v != null);
  const min = Math.floor(Math.min(...todos) - 0.5);
  const max = Math.ceil(Math.max(...todos) + 0.5);
  return crear(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Pesaje', data: pesos, showLine: false, pointRadius: 4, pointBackgroundColor: COLOR.peso, borderColor: COLOR.peso },
        { label: 'Tendencia (7 d)', data: tendencia, borderColor: COLOR.tendencia, backgroundColor: COLOR.tendencia, pointRadius: 0, borderWidth: 2.5, tension: 0.3, spanGaps: true },
        ...metas.map(m => ({
          label: m.etiqueta, data: labels.map(() => m.valor),
          borderColor: m.tipo === 'bloque' ? COLOR.cerca : COLOR.meta, borderDash: [6, 4],
          borderWidth: 1.5, pointRadius: 0,
        })),
      ],
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: { min, max, ticks: { callback: v => `${v} kg` } },
        x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
      },
      plugins: { tooltip: { callbacks: { label: c => c.raw == null ? null : `${c.dataset.label}: ${Number(c.raw).toFixed(1)} kg` } } },
    },
  });
}

/** Mínimo del eje: 250 por debajo del menor valor, redondeado a 100. */
function minimoEje(valores) {
  const v = valores.filter(x => x != null && Number.isFinite(x));
  return v.length ? Math.max(0, Math.floor((Math.min(...v) - 250) / 100) * 100) : 0;
}

/**
 * kcal diarias en barras de colores, con la franja del rango sombreada detrás.
 * rangos: [{min,max}|null] · colores: color de cada barra.
 */
export function graficaKcal(canvas, { labels, kcal, rangos, colores }) {
  return crear(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'kcal', data: kcal, backgroundColor: colores, borderRadius: 6,
          barPercentage: 0.55, categoryPercentage: 1, grouped: false, order: 1,
        },
        {
          label: 'Rango', data: rangos.map(r => (r ? [r.min, r.max] : null)), backgroundColor: COLOR.rango,
          borderColor: 'rgba(63,185,80,.5)', borderWidth: { top: 1, bottom: 1, left: 0, right: 0 }, borderSkipped: false,
          barPercentage: 1, categoryPercentage: 1, grouped: false, order: 2,
        },
      ],
    },
    options: {
      scales: {
        y: {
          // Eje recortado cerca de los datos para que se note la franja del rango
          beginAtZero: false,
          min: minimoEje([...kcal, ...rangos.map(r => r?.min)]),
          ticks: { callback: v => v.toLocaleString('es-MX') },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: c => Array.isArray(c.raw)
              ? `Rango: ${Math.round(c.raw[0])}–${Math.round(c.raw[1])}`
              : c.raw == null ? null : `kcal: ${Math.round(c.raw).toLocaleString('es-MX')}`,
          },
        },
      },
    },
  });
}

/** Carga semanal (minutos × RPE) por semana. */
export function graficaCarga(canvas, { labels, cargas }) {
  return crear(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Carga', data: cargas, borderRadius: 6,
        backgroundColor: cargas.map((_, i) => (i === cargas.length - 1 ? COLOR.tendencia : COLOR.neutro)),
      }],
    },
    options: { plugins: { legend: { display: false } } },
  });
}
