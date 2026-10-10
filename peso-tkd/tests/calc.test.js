// =====================================================================
// Pruebas de la lógica pura. Abrir tests/index.html con el servidor local.
// =====================================================================

import {
  kcalDeMacros, revisarMacros, serieTendencia, tendenciaEn, mifflin, pendiente, ritmoActual,
  estimarMantenimiento, proyectarCompetencia, estadoRango, calcularAlertas, sugerirMetas,
  bloqueEn, resolverRango, ajusteSugerido,
} from '../js/calc.js';
import { reporteSemanal, textoResumen, semanasConDatos } from '../js/report.js';
import { migrar, validarRespaldo, defaultSettings, defaultBlocks, defaultCompetitions } from '../js/db.js';
import { generarEjemplo } from '../js/sample.js';
import { addDays, diaSemana, lunesDe, parseNum, fmtSigned } from '../js/util.js';

const resultados = [];
function test(nombre, fn) {
  try { fn(); resultados.push({ nombre, ok: true }); }
  catch (e) { resultados.push({ nombre, ok: false, error: e.message }); }
}
function igual(a, b, msg = '') {
  if (a !== b) throw new Error(`${msg} esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)}`);
}
function cerca(a, b, tol = 1e-6, msg = '') {
  if (a == null || Math.abs(a - b) > tol) throw new Error(`${msg} esperado ≈${b}, obtenido ${a}`);
}
function verdad(c, msg = 'condición falsa') { if (!c) throw new Error(msg); }

/** Días sintéticos: peso lineal y kcal constantes. */
function sinteticos({ inicio = '2026-09-01', n, peso0 = 70, kgDia = -0.05, kcal = 2300, extra = {} }) {
  return Array.from({ length: n }, (_, i) => ({
    date: addDays(inicio, i), weight: peso0 + kgDia * i, kcal, protein: 140, carbs: 250, fat: 65,
    dayType: 'rest', sessions: [], ...extra,
  }));
}

// ---------- Utilidades ----------
test('parseNum acepta coma decimal', () => {
  igual(parseNum('67,8'), 67.8);
  igual(parseNum(''), null);
  verdad(Number.isNaN(parseNum('abc')));
});
test('diaSemana: lunes = 0, domingo = 6', () => {
  igual(diaSemana('2026-10-12'), 0);
  igual(diaSemana('2026-10-11'), 6);
  igual(lunesDe('2026-10-10'), '2026-10-05');
});
test('addDays cruza fin de mes y año', () => {
  igual(addDays('2026-10-31', 1), '2026-11-01');
  igual(addDays('2026-12-31', 1), '2027-01-01');
});
test('fmtSigned', () => { igual(fmtSigned(-0.34, 1), '−0.3'); igual(fmtSigned(0.5, 1), '+0.5'); });

// ---------- Macros ----------
test('kcal de macros 4/4/9', () => igual(kcalDeMacros(150, 250, 70), 2230));
test('descuadre de macros > 5 %', () => {
  verdad(revisarMacros(2000, 150, 250, 70).descuadre, 'debería descuadrar (11.5 %)');
  verdad(!revisarMacros(2230, 150, 250, 70).descuadre);
  verdad(!revisarMacros(2125, 150, 250, 70).descuadre, '4.9 % no descuadra');
  verdad(revisarMacros(2120, 150, 250, 70).descuadre, '5.2 % sí descuadra');
});

// ---------- Tendencia ----------
test('media móvil de 7 días', () => {
  const s = serieTendencia([
    { date: '2026-10-01', weight: 70 }, { date: '2026-10-02', weight: 71 }, { date: '2026-10-03', weight: 72 },
  ]);
  cerca(s.get('2026-10-03'), 71);
  cerca(s.get('2026-10-01'), 70);
});
test('media móvil descarta pesajes de hace más de 7 días', () => {
  const s = serieTendencia([{ date: '2026-10-01', weight: 80 }, { date: '2026-10-08', weight: 70 }]);
  cerca(s.get('2026-10-08'), 70);
  cerca(s.get('2026-10-07'), 80);
});
test('tendenciaEn usa el último valor anterior', () => {
  const s = serieTendencia([{ date: '2026-10-01', weight: 70 }]);
  cerca(tendenciaEn(s, '2026-10-20'), 70);
  igual(tendenciaEn(s, '2026-09-01'), null);
});

// ---------- Mifflin, pendiente y ritmo ----------
test('Mifflin-St Jeor', () => {
  cerca(mifflin({ peso: 67.8, estatura: 170, edad: 19, sexo: 'M' }), 1650.5);
  cerca(mifflin({ peso: 67.8, estatura: 170, edad: 19, sexo: 'F' }), 1484.5);
});
test('pendiente por mínimos cuadrados', () => cerca(pendiente([0, 1, 2, 3].map(x => ({ x, y: 2 * x + 1 }))), 2));
test('ritmo actual kg/semana', () => {
  const dias = sinteticos({ n: 20, kgDia: -0.1 });
  cerca(ritmoActual(serieTendencia(dias), dias[19].date), -0.7, 1e-6);
});
test('ritmo actual sin datos suficientes', () => {
  igual(ritmoActual(serieTendencia(sinteticos({ n: 3 })), '2026-09-03'), null);
});

// ---------- Mantenimiento ----------
test('mantenimiento real = kcal − Δpeso × 7700', () => {
  const dias = sinteticos({ n: 40, kgDia: -0.05, kcal: 2300 });
  const m = estimarMantenimiento(dias, serieTendencia(dias), dias[39].date);
  verdad(m.suficiente);
  igual(m.mantenimiento, 2690); // 2300 + 0.05×7700 = 2685 → redondeo a 10
  igual(m.confianza, 'alta');
  cerca(m.kgSemana, -0.35, 1e-6);
});
test('mantenimiento requiere 14 días', () => {
  const dias = sinteticos({ n: 10 });
  verdad(!estimarMantenimiento(dias, serieTendencia(dias), dias[9].date).suficiente);
});
test('mantenimiento con pocos registros = confianza baja', () => {
  const dias = sinteticos({ n: 21 }).filter((_, i) => i % 2 === 0); // ~50 % de los días
  const m = estimarMantenimiento(dias, serieTendencia(dias), '2026-09-21');
  verdad(m.suficiente);
  igual(m.confianza, 'baja');
});

// ---------- Proyección ----------
const comp = { name: 'Nacional', date: '2026-11-20', limitKg: 64, weighIn: '' };
const base = { comp, tendencia: 66, fecha: '2026-10-23' }; // 28 días → 4 semanas, faltan 2 kg
test('proyección: en camino', () => {
  const p = proyectarCompetencia({ ...base, ritmo: -0.5 });
  cerca(p.faltan, 2); cerca(p.necesario, 0.5);
  igual(p.estado, 'enCamino');
  igual(p.llegada, '2026-11-20');
});
test('proyección: vas lento', () => igual(proyectarCompetencia({ ...base, ritmo: -0.3 }).estado, 'lento'));
test('proyección: ritmo demasiado agresivo (>1 %/sem)', () => igual(proyectarCompetencia({ ...base, ritmo: -0.9 }).estado, 'agresivo'));
test('proyección: ya en peso', () => igual(proyectarCompetencia({ ...base, tendencia: 62.5, ritmo: -0.1 }).estado, 'enPeso'));
test('proyección: sin ritmo = faltan datos', () => igual(proyectarCompetencia({ ...base, ritmo: null }).estado, 'sinDatos'));
test('proyección usa la fecha del pesaje', () => {
  const p = proyectarCompetencia({ ...base, comp: { ...comp, weighIn: '2026-11-19T18:00' }, ritmo: -0.5 });
  igual(p.dias, 27);
});
test('proyección: meta exigente', () => {
  verdad(proyectarCompetencia({ ...base, tendencia: 67.8, ritmo: -0.5 }).exigente, '3.8 kg en 4 sem es > 1 %/sem');
  verdad(!proyectarCompetencia({ ...base, ritmo: -0.5 }).exigente);
});
test('ajuste sugerido tiene texto para cada estado', () => {
  for (const r of [-0.75, -0.3, -0.9, null]) verdad(ajusteSugerido(proyectarCompetencia({ ...base, ritmo: r }), 2400).length > 10);
});

// ---------- Rangos y bloques ----------
test('semáforo dentro / cerca / fuera', () => {
  const r = { min: 1900, max: 2100 };
  igual(estadoRango(2000, r, 0.05).nivel, 'ok');
  const c = estadoRango(1850, r, 0.05); igual(c.nivel, 'cerca'); igual(c.dir, -1);
  igual(estadoRango(1700, r, 0.05).nivel, 'fuera');
  igual(estadoRango(2300, r, 0.05).dir, 1);
  igual(estadoRango(null, r, 0.05), null);
});
test('rango en g/kg se ajusta al peso', () => {
  const r = resolverRango({ mode: 'gkg', min: 2, max: 2.4 }, 65);
  cerca(r.min, 130); cerca(r.max, 156);
});
test('bloque activo por fecha', () => {
  const b = defaultBlocks();
  igual(bloqueEn(b, '2026-10-10').id, 'b-68');
  igual(bloqueEn(b, '2026-11-01').id, 'b-63');
  igual(bloqueEn(b, '2026-12-25'), null);
});

// ---------- Alertas ----------
test('alerta: 3 días seguidos bajo el mínimo de kcal', () => {
  const dias = sinteticos({ n: 5, kgDia: 0, kcal: 1500 });
  const cfg = { loss: { on: false }, lowKcal: { on: true, days: 3 }, lowProtein: { on: true, days: 3 } };
  const metasFn = () => ({ kcal: { min: 2000, max: 2200 }, protein: { min: 120, max: 150 } });
  const a = calcularAlertas({ days: dias, serie: serieTendencia(dias), fecha: dias[4].date, cfg, metasFn });
  verdad(a.some(x => x.tipo === 'kcal'), 'falta alerta de kcal');
  verdad(!a.some(x => x.tipo === 'proteina'), 'no debería alertar proteína');
  // Si hoy aún no hay registro, cuenta desde ayer
  const a2 = calcularAlertas({ days: dias, serie: serieTendencia(dias), fecha: addDays(dias[4].date, 1), cfg, metasFn });
  verdad(a2.some(x => x.tipo === 'kcal'));
});
test('alerta: racha cortada por un día dentro del rango', () => {
  const dias = sinteticos({ n: 4, kgDia: 0, kcal: 1500 });
  dias[2].kcal = 2100;
  const cfg = { loss: { on: false }, lowKcal: { on: true, days: 3 }, lowProtein: { on: false } };
  const a = calcularAlertas({ days: dias, serie: serieTendencia(dias), fecha: dias[3].date, cfg, metasFn: () => ({ kcal: { min: 2000, max: 2200 } }) });
  igual(a.length, 0);
});
test('alerta: pérdida sostenida > 1 %/sem', () => {
  const dias = sinteticos({ n: 21, kgDia: -0.15 }); // ≈1.05 kg/sem sobre ~67 kg
  const cfg = { loss: { on: true, pct: 1 }, lowKcal: { on: false }, lowProtein: { on: false } };
  const a = calcularAlertas({ days: dias, serie: serieTendencia(dias), fecha: dias[20].date, cfg, metasFn: () => ({}) });
  verdad(a.some(x => x.tipo === 'perdida'));
});

// ---------- Sugerir metas ----------
test('sugerir metas: reparto conserva el promedio semanal', () => {
  const r = sugerirMetas({
    perfil: { height: 170, age: 19, sex: 'M' }, peso: 67.8, factor: 1.55, metaPeso: 67,
    desde: '2026-10-10', hasta: '2026-10-25', mantReal: null, diasEntreno: 3,
  });
  cerca((3 * r.kcalEntreno + 4 * r.kcalDescanso) / 7, r.prom, 1e-6);
  verdad(r.kcalEntreno > r.kcalDescanso);
  verdad(!r.limitado);
});
test('sugerir metas: limita ritmos de más de 1 %/sem', () => {
  const r = sugerirMetas({
    perfil: { height: 170, age: 19, sex: 'M' }, peso: 67.8, factor: 1.55, metaPeso: 63,
    desde: '2026-10-26', hasta: '2026-11-20', mantReal: null, diasEntreno: 3,
  });
  verdad(r.limitado);
  cerca(r.ritmo, -0.678, 1e-3);
});
test('sugerir metas usa el mantenimiento real si hay confianza', () => {
  const r = sugerirMetas({
    perfil: { height: 170, age: 19, sex: 'M' }, peso: 67.8, factor: 1.55, metaPeso: 67.8,
    desde: '2026-10-10', hasta: '2026-10-25', mantReal: { suficiente: true, mantenimiento: 2400, confianza: 'media' }, diasEntreno: 3,
  });
  cerca(r.prom, 2400);
});

// ---------- Reporte semanal ----------
test('reporte semanal con datos de ejemplo', () => {
  const settings = defaultSettings();
  const days = generarEjemplo(settings.schedule);
  const lunes = days[14].date; // tercera semana
  igual(diaSemana(lunes), 0);
  const r = reporteSemanal(lunes, { days, settings, blocks: defaultBlocks(), competitions: defaultCompetitions() }, '2026-10-10');
  igual(r.diasRegistrados, 7);
  igual(r.peso.n, 7);
  verdad(r.peso.delta < 0, 'el peso de ejemplo baja');
  igual(r.entreno.porTipo.combate, 1);
  igual(r.entreno.porTipo.gym, 1);
  igual(r.entreno.porTipo.tecnica, 2);
  verdad(r.entreno.carga > 0 && r.entreno.cargaPrev > 0);
  igual(r.nutricion.train.n + r.nutricion.rest.n, 7);
  const txt = textoResumen(r);
  verdad(txt.includes('📊 Semana') && txt.includes('➡️'), txt);
  igual(semanasConDatos(days).length, 3);
});
test('reporte de semana vacía no falla', () => {
  const settings = defaultSettings();
  const r = reporteSemanal('2026-01-05', { days: [], settings, blocks: [], competitions: [] }, '2026-10-10');
  igual(r.diasRegistrados, 0);
  verdad(textoResumen(r).includes('Sin pesajes'));
});

// ---------- Respaldo y migraciones ----------
test('validar respaldo', () => {
  let err = null;
  try { validarRespaldo({ app: 'otra' }); } catch (e) { err = e; }
  verdad(err, 'debería rechazar archivos de otra app');
  validarRespaldo({ app: 'peso-tkd', days: [], settings: {} });
});
test('migrar: versión actual pasa; versión futura falla', () => {
  igual(migrar({ schemaVersion: 1, days: [] }).schemaVersion, 1);
  let err = null;
  try { migrar({ schemaVersion: 99 }); } catch (e) { err = e; }
  verdad(err);
});

// ---------- Salida ----------
const ok = resultados.filter(r => r.ok).length;
document.getElementById('resumen').innerHTML =
  `<b class="${ok === resultados.length ? 'ok' : 'fail'}">${ok} de ${resultados.length} pruebas correctas</b>`;
document.getElementById('salida').innerHTML = resultados
  .map(r => r.ok ? `<span class="ok">✔ ${r.nombre}</span>` : `<span class="fail">✘ ${r.nombre}\n    ${r.error}</span>`)
  .join('\n');
window.__resultados = { ok, total: resultados.length, fallos: resultados.filter(r => !r.ok) };
