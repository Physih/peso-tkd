// =====================================================================
// ui/ajustes.js — Pantalla Ajustes: perfil, horario, bloques con metas,
// competencias, alertas, respaldo y datos de ejemplo.
// =====================================================================

import {
  state, saveSettings, saveBlocks, saveCompetitions, addSampleDays, removeSampleDays, SCHEMA_VERSION,
} from '../db.js';
import { esc, val, parseNum, fmt, round, uid, toast, hoyISO, DIAS, fmtFechaLarga } from '../util.js';
import { TIPOS_SESION, TIPO_DIA, MACROS } from '../constantes.js';
import { bloqueEn, sugerirMetas } from '../calc.js';
import { pesoRef, mantenimiento } from '../contexto.js';
import { exportarJSON, importarJSON, exportarCSV, diasSinRespaldo, actualizarAvisoRespaldo } from '../backup.js';
import { generarEjemplo } from '../sample.js';

let root;

export function render(cont) {
  root = cont;
  const sub = location.hash.split('/')[1];
  root.innerHTML = `
    ${seccion('perfil', '👤 Perfil', htmlPerfil())}
    ${seccion('horario', '📅 Horario semanal', htmlHorario())}
    ${seccion('bloques', '🎯 Bloques y metas', `<div id="lista-bloques"></div>
        <button class="grande" data-acc="nuevo-bloque">＋ Añadir bloque</button>
        <div class="sub-card" style="margin-top:12px">
          <h3 style="margin-bottom:6px">Metas fuera de bloques</h3>
          <p class="muted small">Se usan en fechas que no caen en ningún bloque.</p>
          <div id="metas-default">${editorMetas(state.settings.defaultTargets)}</div>
        </div>
        <button class="primario grande" data-acc="guardar-bloques">Guardar bloques y metas</button>`)}
    ${seccion('competencias', '🏆 Competencias', `<div id="lista-comps"></div>
        <div class="botones"><button data-acc="nueva-comp">＋ Añadir competencia</button></div>
        <button class="primario grande" data-acc="guardar-comps" style="margin-top:8px">Guardar competencias</button>`)}
    ${seccion('alertas', '🔔 Alertas', htmlAlertas())}
    ${seccion('respaldo', '💾 Respaldo', htmlRespaldo())}
    ${seccion('ejemplo', '🧪 Datos de ejemplo', htmlEjemplo())}
    <p class="muted small centro">Peso TKD · modelo de datos v${SCHEMA_VERSION} · datos guardados solo en este dispositivo</p>
  `;

  pintarBloques(structuredClone(state.blocks));
  pintarComps(structuredClone(state.competitions));
  actualizarEquivalencias(root.querySelector('#metas-default'));

  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);

  if (sub) {
    const sec = root.querySelector(`#sec-${sub}`);
    if (sec) {
      sec.open = true;
      setTimeout(() => sec.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }
  }
}

function seccion(id, titulo, cuerpo) {
  return `<details class="card" id="sec-${id}"><summary>${titulo}</summary>${cuerpo}</details>`;
}

// ---------------------------------------------------------------------
// Perfil
// ---------------------------------------------------------------------

function htmlPerfil() {
  const p = state.settings.profile;
  return `
    <div class="grid2">
      <div class="campo"><label for="p-height">Estatura (cm)</label><input id="p-height" inputmode="decimal" value="${val(p.height)}"></div>
      <div class="campo"><label for="p-age">Edad</label><input id="p-age" inputmode="numeric" value="${val(p.age)}"></div>
      <div class="campo"><label for="p-sex">Sexo</label>
        <select id="p-sex"><option value="M" ${p.sex === 'M' ? 'selected' : ''}>Hombre</option><option value="F" ${p.sex === 'F' ? 'selected' : ''}>Mujer</option></select></div>
      <div class="campo"><label for="p-weight">Peso (kg)</label><input id="p-weight" inputmode="decimal" value="${val(p.weight)}"></div>
    </div>
    <p class="muted small">El peso del perfil solo se usa mientras no haya pesajes; después se usa tu peso de tendencia.</p>
    <button class="primario grande" data-acc="guardar-perfil">Guardar perfil</button>`;
}

async function guardarPerfil() {
  const campos = { height: [120, 230], age: [10, 100], weight: [40, 120] };
  const p = { sex: root.querySelector('#p-sex').value };
  let ok = true;
  for (const [k, [min, max]] of Object.entries(campos)) {
    const input = root.querySelector(`#p-${k}`);
    const n = parseNum(input.value);
    const valido = n != null && !Number.isNaN(n) && n >= min && n <= max;
    input.classList.toggle('error', !valido);
    if (!valido) ok = false;
    p[k] = k === 'weight' ? round(n, 1) : n;
  }
  if (!ok) return toast('Revisa los campos marcados (estatura 120–230, edad 10–100, peso 40–120).', 'error');
  await saveSettings({ ...state.settings, profile: p });
  toast('Perfil guardado', 'ok');
}

// ---------------------------------------------------------------------
// Horario semanal
// ---------------------------------------------------------------------

function htmlHorario() {
  const filas = state.settings.schedule.map((d, i) => `
    <div class="horario-fila" data-dia="${i}">
      <div class="cab">
        <strong>${DIAS[i]}</strong>
        <div class="segmentado">
          <button data-acc="tipo-dia" data-v="train" class="${d.dayType === 'train' ? 'activo' : ''}">Entreno</button>
          <button data-acc="tipo-dia" data-v="rest" class="${d.dayType === 'rest' ? 'activo' : ''}">Descanso</button>
        </div>
      </div>
      <div class="chips" ${d.dayType === 'rest' ? 'hidden' : ''}>
        ${TIPOS_SESION.map(t => `<button data-acc="plantilla" data-v="${t.id}" class="${d.plantilla.includes(t.id) ? 'activo' : ''}">${t.icono} ${t.corto}</button>`).join('')}
      </div>
    </div>`).join('');
  return `<p class="muted small">Marca qué días entrenas y qué sesiones haces normalmente. El registro diario usa esto para rellenar el tipo de día y ofrecer "Sesiones del horario".</p>
    ${filas}
    <button class="primario grande" data-acc="guardar-horario">Guardar horario</button>`;
}

async function guardarHorario() {
  const schedule = [...root.querySelectorAll('.horario-fila')].map(f => ({
    dayType: f.querySelector('[data-acc="tipo-dia"].activo').dataset.v,
    plantilla: f.querySelector('.chips').hidden ? []
      : [...f.querySelectorAll('[data-acc="plantilla"].activo')].map(b => b.dataset.v),
  }));
  await saveSettings({ ...state.settings, schedule });
  toast('Horario guardado', 'ok');
}

// ---------------------------------------------------------------------
// Editor de metas (rangos min–max por tipo de día)
// ---------------------------------------------------------------------

function editorMetas(t) {
  return ['train', 'rest'].map(tipo => `
    <div class="metas-dia" data-tipo="${tipo}">
      <h3 style="margin:6px 0">${tipo === 'train' ? '🥋' : '😴'} Días de ${TIPO_DIA[tipo].toLowerCase()}</h3>
      <div class="metas-fila"><span></span><span class="muted small">mínimo</span><span class="muted small">máximo</span><span></span></div>
      ${filaMeta('kcal', 'Kcal', t[tipo].kcal)}
      ${MACROS.map(m => filaMeta(m.id, m.nombre, t[tipo][m.id])).join('')}
    </div>`).join('');
}

function filaMeta(id, nombre, r) {
  const unidad = id === 'kcal'
    ? '<span class="unidad">kcal</span>'
    : `<select data-k="mode" aria-label="Unidad de ${nombre}">
         <option value="g" ${r.mode === 'g' ? 'selected' : ''}>g</option>
         <option value="gkg" ${r.mode === 'gkg' ? 'selected' : ''}>g/kg</option>
       </select>`;
  return `<div class="metas-fila" data-macro="${id}">
      <span class="nombre">${nombre}</span>
      <input data-k="min" inputmode="decimal" value="${val(r.min)}" aria-label="${nombre} mínimo">
      <input data-k="max" inputmode="decimal" value="${val(r.max)}" aria-label="${nombre} máximo">
      ${unidad}
      ${id === 'kcal' ? '' : '<span class="equiv"></span>'}
    </div>`;
}

/** Lee un editor de metas. Devuelve { targets, errores }. */
function leerMetas(cont) {
  const targets = {};
  let errores = 0;
  for (const dia of cont.querySelectorAll('.metas-dia')) {
    const tipo = dia.dataset.tipo;
    targets[tipo] = {};
    for (const fila of dia.querySelectorAll('.metas-fila[data-macro]')) {
      const id = fila.dataset.macro;
      const iMin = fila.querySelector('[data-k="min"]');
      const iMax = fila.querySelector('[data-k="max"]');
      const min = parseNum(iMin.value), max = parseNum(iMax.value);
      const malMin = min == null || Number.isNaN(min) || min < 0;
      const malMax = max == null || Number.isNaN(max) || max < 0 || (!malMin && max < min);
      iMin.classList.toggle('error', malMin);
      iMax.classList.toggle('error', malMax);
      if (malMin || malMax) errores++;
      targets[tipo][id] = id === 'kcal' ? { min, max } : { mode: fila.querySelector('[data-k="mode"]').value, min, max };
    }
  }
  return { targets, errores };
}

/** Muestra la equivalencia g ↔ g/kg con el peso de tendencia actual. */
function actualizarEquivalencias(cont) {
  if (!cont) return;
  const peso = pesoRef(hoyISO());
  for (const fila of cont.querySelectorAll('.metas-fila[data-macro]:not([data-macro="kcal"])')) {
    const min = parseNum(fila.querySelector('[data-k="min"]').value);
    const max = parseNum(fila.querySelector('[data-k="max"]').value);
    const mode = fila.querySelector('[data-k="mode"]').value;
    const eq = fila.querySelector('.equiv');
    if (min == null || max == null || Number.isNaN(min) || Number.isNaN(max)) { eq.textContent = ''; continue; }
    eq.textContent = mode === 'gkg'
      ? `≈ ${fmt(min * peso)}–${fmt(max * peso)} g con ${fmt(peso, 1)} kg`
      : `≈ ${fmt(min / peso, 2)}–${fmt(max / peso, 2)} g/kg`;
  }
}

/** Al cambiar g ↔ g/kg, convierte los valores para no perder la meta. */
function convertirUnidad(select) {
  const fila = select.closest('.metas-fila');
  const peso = pesoRef(hoyISO());
  for (const k of ['min', 'max']) {
    const input = fila.querySelector(`[data-k="${k}"]`);
    const n = parseNum(input.value);
    if (n == null || Number.isNaN(n)) continue;
    input.value = select.value === 'gkg' ? round(n / peso, 1) : Math.round(n * peso);
  }
}

// ---------------------------------------------------------------------
// Bloques
// ---------------------------------------------------------------------

function pintarBloques(lista) {
  const activo = bloqueEn(lista, hoyISO());
  lista.sort((a, b) => (a.start < b.start ? -1 : 1));
  root.querySelector('#lista-bloques').innerHTML = lista.length ? lista.map(b => `
    <div class="sub-card bloque" data-id="${esc(b.id)}">
      <div class="card-head">
        <strong>${esc(b.name) || 'Bloque'}</strong>
        ${activo && activo.id === b.id ? '<span class="badge ok">Activo hoy</span>' : ''}
      </div>
      <div class="campo"><label>Nombre</label><input data-f="name" value="${esc(b.name)}"></div>
      <div class="grid2">
        <div class="campo"><label>Desde</label><input type="date" data-f="start" value="${esc(b.start)}"></div>
        <div class="campo"><label>Hasta</label><input type="date" data-f="end" value="${esc(b.end)}"></div>
      </div>
      <div class="campo"><label>Peso meta al final del bloque (kg)</label><input data-f="goalWeight" inputmode="decimal" value="${val(b.goalWeight)}"></div>
      <div class="editor">${editorMetas(b.targets)}</div>
      <div class="botones">
        <button data-acc="sugerir">🧮 Sugerir metas</button>
        <button class="peligro" data-acc="borrar-bloque">Borrar</button>
      </div>
      <div class="panel-sugerir" hidden></div>
    </div>`).join('') : '<p class="muted">No hay bloques. Se usan las metas fuera de bloques.</p>';
  root.querySelectorAll('.bloque .editor').forEach(actualizarEquivalencias);
}

/** Lee los bloques del formulario. Devuelve { lista, errores }. */
function leerBloques() {
  let errores = 0;
  const lista = [...root.querySelectorAll('.bloque')].map(card => {
    const f = k => card.querySelector(`[data-f="${k}"]`);
    const { targets, errores: e } = leerMetas(card.querySelector('.editor'));
    errores += e;
    const goal = parseNum(f('goalWeight').value);
    const goalMal = goal != null && (Number.isNaN(goal) || goal < 40 || goal > 120);
    f('goalWeight').classList.toggle('error', goalMal);
    const fechasMal = !f('start').value || !f('end').value || f('end').value < f('start').value;
    f('start').classList.toggle('error', fechasMal);
    f('end').classList.toggle('error', fechasMal);
    if (goalMal || fechasMal) errores++;
    return {
      id: card.dataset.id,
      name: f('name').value.trim() || 'Bloque',
      start: f('start').value,
      end: f('end').value,
      goalWeight: goalMal ? null : goal,
      targets,
    };
  });
  return { lista, errores };
}

async function guardarBloques() {
  const { lista, errores } = leerBloques();
  const def = leerMetas(root.querySelector('#metas-default'));
  if (errores || def.errores) {
    return toast('Revisa los campos marcados en rojo (fechas, peso meta o rangos con mínimo > máximo).', 'error');
  }
  await saveBlocks(lista);
  await saveSettings({ ...state.settings, defaultTargets: def.targets });
  pintarBloques(structuredClone(lista));
  toast('Bloques y metas guardados', 'ok');
}

function nuevoBloque() {
  const { lista } = leerBloques();
  const ultimo = lista[lista.length - 1];
  const hoy = hoyISO();
  lista.push({
    id: 'b-' + uid(),
    name: 'Nuevo bloque',
    start: hoy,
    end: hoy,
    goalWeight: ultimo?.goalWeight ?? null,
    targets: structuredClone(ultimo?.targets || state.settings.defaultTargets),
  });
  pintarBloques(lista);
}

function borrarBloque(card) {
  if (!confirm('¿Borrar este bloque? (Se aplica al pulsar Guardar)')) return;
  const { lista } = leerBloques();
  pintarBloques(lista.filter(b => b.id !== card.dataset.id));
}

// ----- Sugerir metas -----

function abrirSugerir(card) {
  const panel = card.querySelector('.panel-sugerir');
  if (!panel.hidden) { panel.hidden = true; return; }
  const m = mantenimiento();
  const factor = state.settings.activityFactor || 1.55;
  const opciones = [[1.2, 'Sedentario'], [1.375, 'Ligera (1–3 días/sem)'], [1.55, 'Moderada (3–5 días/sem)'], [1.725, 'Alta (6–7 días/sem)'], [1.9, 'Muy alta (2 veces al día)']];
  panel.innerHTML = `
    <div class="info" style="margin-top:10px">
      <div class="campo"><label>Factor de actividad</label>
        <select data-s="factor">${opciones.map(([v, t]) => `<option value="${v}" ${v === factor ? 'selected' : ''}>${v} — ${t}</option>`).join('')}</select></div>
      <label class="fila" style="color:var(--text)"><input type="checkbox" data-s="real" class="auto" ${m.suficiente ? 'checked' : 'disabled'}>
        <span>Usar mi mantenimiento real ${m.suficiente ? `(${fmt(m.mantenimiento)} kcal, confianza ${m.confianza})` : `(necesito 14 días de datos; llevas ${m.dias || 0})`}</span></label>
      <button class="primario grande" data-acc="calcular" style="margin-top:8px">Calcular</button>
      <div class="resultado"></div>
    </div>`;
  panel.hidden = false;
}

function calcularSugerencia(card) {
  const panel = card.querySelector('.panel-sugerir');
  const f = k => card.querySelector(`[data-f="${k}"]`);
  const hoy = hoyISO();
  const desde = f('start').value > hoy ? f('start').value : hoy;
  const hasta = f('end').value;
  if (!hasta || hasta <= desde) return toast('El bloque ya terminó o las fechas no son válidas.', 'error');
  const factor = Number(panel.querySelector('[data-s="factor"]').value);
  const usarReal = panel.querySelector('[data-s="real"]').checked;
  const metaPeso = parseNum(f('goalWeight').value);
  const peso = pesoRef(hoy);

  const r = sugerirMetas({
    perfil: state.settings.profile,
    peso,
    factor,
    metaPeso: Number.isNaN(metaPeso) ? null : metaPeso,
    desde,
    hasta,
    mantReal: usarReal ? mantenimiento() : null,
    diasEntreno: state.settings.schedule.filter(d => d.dayType === 'train').length,
    maxPct: state.settings.alerts.loss?.pct ?? 1,
  });
  card._sugerencia = r.targets;
  state.settings.activityFactor = factor; // se guarda con el próximo "Guardar"

  const t = r.targets;
  const linea = (tipo) => `${TIPO_DIA[tipo]}: <b>${t[tipo].kcal.min}–${t[tipo].kcal.max} kcal</b> · P ${t[tipo].protein.min}–${t[tipo].protein.max} · C ${t[tipo].carbs.min}–${t[tipo].carbs.max} · G ${t[tipo].fat.min}–${t[tipo].fat.max} g/kg`;
  panel.querySelector('.resultado').innerHTML = `
    <ol class="pasos">${r.pasos.map(p => `<li>${esc(p)}</li>`).join('')}</ol>
    <p class="small">${linea('train')}</p>
    <p class="small">${linea('rest')}</p>
    <button class="grande" data-acc="aplicar">Aplicar a este bloque</button>
    <p class="muted small">Es un punto de partida: puedes editar los números después y luego pulsar Guardar.</p>`;
}

function aplicarSugerencia(card) {
  if (!card._sugerencia) return;
  card.querySelector('.editor').innerHTML = editorMetas(card._sugerencia);
  actualizarEquivalencias(card.querySelector('.editor'));
  card.querySelector('.panel-sugerir').hidden = true;
  toast('Aplicado. Revisa y pulsa "Guardar bloques y metas".');
  card.querySelector('.editor').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ---------------------------------------------------------------------
// Competencias
// ---------------------------------------------------------------------

function pintarComps(lista) {
  lista.sort((a, b) => (a.date < b.date ? -1 : 1));
  root.querySelector('#lista-comps').innerHTML = lista.length ? lista.map(c => `
    <div class="sub-card comp" data-id="${esc(c.id)}">
      <div class="campo"><label>Nombre</label><input data-f="name" value="${esc(c.name)}"></div>
      <div class="grid2">
        <div class="campo"><label>Fecha</label><input type="date" data-f="date" value="${esc(c.date)}"></div>
        <div class="campo"><label>Categoría (kg límite)</label><input data-f="limitKg" inputmode="decimal" value="${val(c.limitKg)}"></div>
      </div>
      <div class="campo"><label>Pesaje (fecha y hora, opcional)</label><input type="datetime-local" data-f="weighIn" value="${esc(c.weighIn)}"></div>
      <button class="peligro chico" data-acc="borrar-comp">Borrar</button>
    </div>`).join('') : '<p class="muted">No hay competencias.</p>';
}

function leerComps() {
  let errores = 0;
  const lista = [...root.querySelectorAll('.comp')].map(card => {
    const f = k => card.querySelector(`[data-f="${k}"]`);
    const lim = parseNum(f('limitKg').value);
    const limMal = lim == null || Number.isNaN(lim) || lim < 40 || lim > 120;
    const fechaMal = !f('date').value;
    f('limitKg').classList.toggle('error', limMal);
    f('date').classList.toggle('error', fechaMal);
    if (limMal || fechaMal) errores++;
    return { id: card.dataset.id, name: f('name').value.trim() || 'Competencia', date: f('date').value, limitKg: lim, weighIn: f('weighIn').value };
  });
  return { lista, errores };
}

async function guardarComps() {
  const { lista, errores } = leerComps();
  if (errores) return toast('Revisa fecha y categoría (40–120 kg).', 'error');
  await saveCompetitions(lista);
  pintarComps(structuredClone(lista));
  toast('Competencias guardadas', 'ok');
}

// ---------------------------------------------------------------------
// Alertas
// ---------------------------------------------------------------------

function htmlAlertas() {
  const a = state.settings.alerts;
  const fila = (id, texto, campo, valor, unidad) => `
    <div class="sub-card">
      <label class="fila" style="color:var(--text)"><input type="checkbox" id="al-${id}" class="auto" ${a[id].on ? 'checked' : ''}><span>${texto}</span></label>
      <div class="fila" style="margin-top:6px"><input id="al-${id}-${campo}" inputmode="decimal" value="${val(valor)}"><span class="auto muted">${unidad}</span></div>
    </div>`;
  return `
    ${fila('loss', 'Pérdida sostenida de peso mayor a', 'pct', a.loss.pct, '% del peso por semana')}
    ${fila('lowKcal', 'Días seguidos por debajo del mínimo de kcal', 'days', a.lowKcal.days, 'días')}
    ${fila('lowProtein', 'Días seguidos con proteína baja', 'days', a.lowProtein.days, 'días')}
    <p class="muted small">El % de pérdida también se usa para decidir cuándo el ritmo es "demasiado agresivo".</p>
    <button class="primario grande" data-acc="guardar-alertas">Guardar alertas</button>`;
}

async function guardarAlertas() {
  const leer = (id, campo, min, max) => {
    const input = root.querySelector(`#al-${id}-${campo}`);
    const n = parseNum(input.value);
    const ok = n != null && !Number.isNaN(n) && n >= min && n <= max;
    input.classList.toggle('error', !ok);
    return ok ? n : null;
  };
  const pct = leer('loss', 'pct', 0.2, 3);
  const dk = leer('lowKcal', 'days', 1, 14);
  const dp = leer('lowProtein', 'days', 1, 14);
  if (pct == null || dk == null || dp == null) return toast('Valores fuera de rango (0.2–3 % y 1–14 días).', 'error');
  const on = id => root.querySelector(`#al-${id}`).checked;
  await saveSettings({
    ...state.settings,
    alerts: { loss: { on: on('loss'), pct }, lowKcal: { on: on('lowKcal'), days: Math.round(dk) }, lowProtein: { on: on('lowProtein'), days: Math.round(dp) } },
  });
  toast('Alertas guardadas', 'ok');
}

// ---------------------------------------------------------------------
// Respaldo y datos de ejemplo
// ---------------------------------------------------------------------

function htmlRespaldo() {
  const ult = state.meta?.lastBackupAt;
  const dias = diasSinRespaldo();
  return `
    <p>Último respaldo: <b>${ult ? fmtFechaLarga(new Date(ult).toISOString().slice(0, 10)) : 'nunca'}</b>${ult && dias != null ? ` (hace ${dias} días)` : ''}</p>
    <p class="muted small">Tus datos viven solo en este navegador. Si borras los datos de Safari o cambias de teléfono, se pierden. Haz un respaldo al menos cada semana y guárdalo en Archivos / iCloud Drive.</p>
    <div class="botones">
      <button class="primario" data-acc="exportar-json">⬇️ Exportar respaldo (JSON)</button>
      <button data-acc="importar-json">⬆️ Importar respaldo</button>
      <button data-acc="exportar-csv">📄 Exportar CSV</button>
    </div>
    <input type="file" id="archivo-importar" accept="application/json,.json" hidden>`;
}

function htmlEjemplo() {
  const n = [...state.days.values()].filter(d => d.sample).length;
  return `
    <p class="muted small">Carga 3 semanas completas de datos ficticios (las 3 anteriores a esta) para ver cómo se ven los reportes. Nunca reemplazan días que registraste tú.</p>
    <p>Días de ejemplo cargados: <b id="n-ejemplo">${n}</b></p>
    <div class="botones">
      <button data-acc="cargar-ejemplo">Cargar datos de ejemplo</button>
      <button class="peligro" data-acc="borrar-ejemplo">Borrar datos de ejemplo</button>
    </div>`;
}

function refrescarSeccion(id, html) {
  const sec = root.querySelector(`#sec-${id}`);
  const abierto = sec.open;
  sec.outerHTML = seccion(id, sec.querySelector('summary').textContent, html);
  root.querySelector(`#sec-${id}`).open = abierto;
}

// ---------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------

async function onClick(e) {
  const btn = e.target.closest('[data-acc]');
  if (!btn) return;
  const acc = btn.dataset.acc;
  const card = btn.closest('.bloque');
  try {
    switch (acc) {
      case 'guardar-perfil': await guardarPerfil(); break;
      case 'tipo-dia': {
        const fila = btn.closest('.horario-fila');
        fila.querySelectorAll('[data-acc="tipo-dia"]').forEach(b => b.classList.toggle('activo', b === btn));
        fila.querySelector('.chips').hidden = btn.dataset.v === 'rest';
        break;
      }
      case 'plantilla': btn.classList.toggle('activo'); break;
      case 'guardar-horario': await guardarHorario(); break;
      case 'nuevo-bloque': nuevoBloque(); break;
      case 'borrar-bloque': borrarBloque(card); break;
      case 'guardar-bloques': await guardarBloques(); break;
      case 'sugerir': abrirSugerir(card); break;
      case 'calcular': calcularSugerencia(card); break;
      case 'aplicar': aplicarSugerencia(card); break;
      case 'nueva-comp': {
        const { lista } = leerComps();
        lista.push({ id: 'c-' + uid(), name: 'Nueva competencia', date: hoyISO(), limitKg: 63, weighIn: '' });
        pintarComps(lista);
        break;
      }
      case 'borrar-comp': {
        if (!confirm('¿Borrar esta competencia? (Se aplica al pulsar Guardar)')) break;
        const id = btn.closest('.comp').dataset.id;
        pintarComps(leerComps().lista.filter(c => c.id !== id));
        break;
      }
      case 'guardar-comps': await guardarComps(); break;
      case 'guardar-alertas': await guardarAlertas(); break;
      case 'exportar-json':
        if (await exportarJSON()) { toast('Respaldo exportado', 'ok'); refrescarSeccion('respaldo', htmlRespaldo()); }
        break;
      case 'importar-json': root.querySelector('#archivo-importar').click(); break;
      case 'exportar-csv': await exportarCSV(); break;
      case 'cargar-ejemplo': {
        const n = await addSampleDays(generarEjemplo(state.settings.schedule));
        toast(n ? `Se cargaron ${n} días de ejemplo` : 'Ya hay datos en esas fechas; no se cargó nada', n ? 'ok' : '');
        refrescarSeccion('ejemplo', htmlEjemplo());
        break;
      }
      case 'borrar-ejemplo': {
        if (!confirm('¿Borrar todos los días de ejemplo? Tus registros reales no se tocan.')) break;
        const n = await removeSampleDays();
        toast(`Se borraron ${n} días de ejemplo`, 'ok');
        refrescarSeccion('ejemplo', htmlEjemplo());
        break;
      }
    }
  } catch (err) {
    console.error(err);
    toast(err.message || 'Ocurrió un error', 'error');
  }
}

async function onChange(e) {
  const t = e.target;
  if (t.matches('[data-k="mode"]')) {
    convertirUnidad(t);
    actualizarEquivalencias(t.closest('.metas-dia').parentElement);
  }
  if (t.id === 'archivo-importar' && t.files[0]) {
    if (!confirm('Importar REEMPLAZA todos los datos actuales por los del respaldo. ¿Continuar?')) { t.value = ''; return; }
    try {
      const n = await importarJSON(t.files[0]);
      toast(`Respaldo importado: ${n} días`, 'ok');
      actualizarAvisoRespaldo();
      render(rehacerRoot());
    } catch (err) {
      toast(err.message, 'error');
    }
    t.value = '';
  }
}

/** Reemplaza el contenedor para soltar los listeners viejos y volver a pintar. */
function rehacerRoot() {
  const nuevo = root.cloneNode(false);
  root.replaceWith(nuevo);
  return nuevo;
}

function onInput(e) {
  if (e.target.matches('.metas-fila input')) actualizarEquivalencias(e.target.closest('.metas-dia').parentElement);
}
