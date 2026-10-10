// =====================================================================
// ui/registro.js — Registro diario (pantalla principal).
// Pensado para llenarse en menos de 30 segundos desde el iPhone.
// =====================================================================

import { state, saveDay, deleteDay } from '../db.js';
import {
  hoyISO, addDays, diaSemana, fmtFechaLarga, parseNum, fmt, val, esc, round, toast, DIAS,
} from '../util.js';
import { TIPOS_SESION, LUGARES, TIPO_DIA, MACROS, LIMITES, tipoSesion } from '../constantes.js';
import { revisarMacros, estadoRango, TOLERANCIA, tendenciaEn } from '../calc.js';
import { serie, tipoSegunHorario, metasPara, alertas } from '../contexto.js';
import { actualizarAvisoRespaldo } from '../backup.js';

let root;
let fecha = hoyISO();
let b = null;        // borrador del día que se está editando
let sucio = false;   // hay cambios sin guardar
let hoyCargado = hoyISO();

const ENERGIA = ['😫', '😕', '😐', '🙂', '💪'];

export function render(cont) {
  root = cont;
  // Sin cambios pendientes se recarga desde lo guardado; si la app quedó
  // abierta desde ayer y estabas en "hoy", salta al nuevo día.
  if (!b || !sucio) cargar(fecha === hoyCargado ? hoyISO() : fecha);
  hoyCargado = hoyISO();
  pintar();
  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  root.addEventListener('change', onChange);
}

/** Carga el día guardado o crea uno vacío con el tipo según el horario. */
function cargar(f) {
  fecha = f;
  const d = state.days.get(f);
  b = d ? structuredClone(d) : {
    date: f, weight: null, dayType: tipoSegunHorario(f),
    kcal: null, protein: null, carbs: null, fat: null,
    sessions: [], sleep: null, energy: null, note: '',
  };
  b.sessions = b.sessions || [];
  sucio = false;
}

// ---------------------------------------------------------------------
// Pintado
// ---------------------------------------------------------------------

function pintar() {
  const hoy = hoyISO();
  const existe = state.days.has(fecha);
  const s = serie();
  const tend = tendenciaEn(s, fecha);
  const plantilla = state.settings.schedule[diaSemana(fecha)]?.plantilla || [];
  const opcionales = b.sleep != null || b.energy != null || b.note;

  root.innerHTML = `
    <div class="nav-fecha">
      <button class="icono" data-acc="dia-ant" aria-label="Día anterior">◀</button>
      <input type="date" id="f-fecha" value="${fecha}" max="${hoy}" aria-label="Fecha">
      <button class="icono" data-acc="dia-sig" aria-label="Día siguiente" ${fecha >= hoy ? 'disabled' : ''}>▶</button>
    </div>
    <div class="etiqueta-fecha">${fecha === hoy ? 'Hoy · ' : ''}${DIAS[diaSemana(fecha)]} ${fmtFechaLarga(fecha)}${existe ? ' · <span class="ok">✓ guardado</span>' : ''}${state.days.get(fecha)?.sample ? ' · <span class="cerca">ejemplo</span>' : ''}</div>

    <section class="card">
      <div class="campo">
        <label for="f-peso">⚖️ Peso en ayunas (kg)</label>
        <input id="f-peso" class="peso-input" inputmode="decimal" placeholder="${tend ? fmt(tend, 1) : '67.8'}" value="${val(b.weight)}" autocomplete="off">
        <div class="hint">${tend ? `Tendencia (media 7 días): ${fmt(tend, 1)} kg` : 'Aún no hay tendencia'}</div>
      </div>
      <label>Tipo de día</label>
      <div class="segmentado" id="f-tipo">
        ${['train', 'rest'].map(t => `<button data-acc="tipo" data-v="${t}" class="${b.dayType === t ? 'activo' : ''}">${t === 'train' ? '🥋' : '😴'} ${TIPO_DIA[t]}</button>`).join('')}
      </div>
      <div class="hint" id="h-tipo"></div>
    </section>

    <section class="card">
      <div class="card-head"><h2>🍽️ Nutrición del día</h2><span class="muted small" id="h-bloque"></span></div>
      <div class="campo">
        <label for="f-kcal">Kcal totales</label>
        <input id="f-kcal" inputmode="numeric" value="${val(b.kcal)}" autocomplete="off">
        <div class="hint" id="r-kcal"></div>
      </div>
      <div class="grid3">
        ${MACROS.map(m => `
          <div class="campo">
            <label for="f-${m.id}">${m.nombre === 'Carbohidratos' ? 'Carbos' : m.nombre} (g)</label>
            <input id="f-${m.id}" inputmode="decimal" value="${val(b[m.id])}" autocomplete="off">
            <div class="hint" id="r-${m.id}"></div>
          </div>`).join('')}
      </div>
      <div class="check-macros" id="chk-macros"></div>
    </section>

    <section class="card">
      <div class="card-head"><h2>🥋 Entrenamiento</h2><span class="muted small" id="h-carga"></span></div>
      <div id="sesiones"></div>
      <div class="botones">
        ${plantilla.length && !b.sessions.length ? `<button data-acc="add-plantilla">＋ Del horario: ${plantilla.map(t => tipoSesion(t).corto).join(' + ')}</button>` : ''}
        <button data-acc="add-ses">＋ Añadir sesión</button>
      </div>
    </section>

    <details class="card" ${opcionales ? 'open' : ''}>
      <summary>😴 Opcionales: sueño, energía y nota</summary>
      <div class="campo"><label for="f-sleep">Horas de sueño</label><input id="f-sleep" inputmode="decimal" value="${val(b.sleep)}"></div>
      <label>Nivel de energía</label>
      <div class="chips" id="f-energy" style="margin-bottom:12px">
        ${ENERGIA.map((e, i) => `<button data-acc="energia" data-v="${i + 1}" class="${b.energy === i + 1 ? 'activo' : ''}">${e} ${i + 1}</button>`).join('')}
      </div>
      <div class="campo"><label for="f-note">Nota libre</label><textarea id="f-note">${esc(b.note)}</textarea></div>
    </details>

    <div id="errores"></div>
    <button class="primario grande" data-acc="guardar">💾 Guardar</button>
    <div id="resultado" style="margin-top:12px"></div>
    ${existe ? '<div class="centro" style="margin-top:16px"><button class="peligro chico" data-acc="borrar-dia">Borrar este día</button></div>' : ''}
  `;
  pintarSesiones();
  actualizarVivo();
}

function pintarSesiones() {
  const cont = root.querySelector('#sesiones');
  if (!b.sessions.length) {
    cont.innerHTML = `<p class="muted small">Sin sesiones${b.dayType === 'rest' ? ' (día de descanso)' : ''}.</p>`;
  } else {
    cont.innerHTML = b.sessions.map((s, i) => `
      <div class="sesion" data-i="${i}">
        <div class="sesion-head">
          <strong>${tipoSesion(s.type).icono} Sesión ${i + 1}</strong>
          <button class="chico peligro" data-acc="quitar-ses" aria-label="Quitar sesión">✕ Quitar</button>
        </div>
        <div class="chips">
          ${TIPOS_SESION.map(t => `<button data-acc="ses-tipo" data-v="${t.id}" class="${s.type === t.id ? 'activo' : ''}">${t.icono} ${t.corto}</button>`).join('')}
        </div>
        <div class="grid2" style="margin-top:10px">
          <div class="campo"><label>Lugar</label>
            <select data-c="place">${LUGARES.map(l => `<option value="${l.id}" ${s.place === l.id ? 'selected' : ''}>${l.nombre}</option>`).join('')}</select></div>
          <div class="campo"><label>Minutos</label><input data-c="minutes" inputmode="numeric" value="${val(s.minutes)}"></div>
          <div class="campo"><label>Rounds</label><input data-c="rounds" inputmode="numeric" value="${val(s.rounds)}" placeholder="0"></div>
          <div class="campo"><label>Intensidad RPE <span class="rpe-valor">${s.rpe ?? 6}</span>/10</label>
            <input type="range" data-c="rpe" min="1" max="10" step="1" value="${s.rpe ?? 6}"></div>
        </div>
        <div class="campo"><label>Notas</label><input data-c="notes" value="${esc(s.notes)}" placeholder="Opcional"></div>
      </div>`).join('');
  }
  actualizarCarga();
}

/** Actualiza en vivo los rangos, el semáforo de cada campo y el chequeo de macros. */
function actualizarVivo() {
  const m = metasPara(fecha, b.dayType);
  const horario = tipoSegunHorario(fecha);
  root.querySelector('#h-tipo').textContent = b.dayType === horario
    ? 'Según tu horario semanal'
    : `Cambiado (tu horario dice ${TIPO_DIA[horario].toLowerCase()})`;
  root.querySelector('#h-bloque').textContent = m.bloque ? m.bloque.name : 'Metas generales';

  const kcal = numCampo('f-kcal');
  pintarRango('kcal', kcal, m.kcal, TOLERANCIA.kcal, 'kcal');
  for (const mac of MACROS) pintarRango(mac.id, numCampo(`f-${mac.id}`), m[mac.id], TOLERANCIA.macro, 'g');

  const chk = root.querySelector('#chk-macros');
  const r = revisarMacros(kcal, numCampo('f-protein'), numCampo('f-carbs'), numCampo('f-fat'));
  if (r.calc == null) {
    chk.className = 'check-macros';
    chk.textContent = 'Escribe los 3 macros para comprobar que cuadran con las kcal.';
  } else if (r.difPct == null) {
    chk.className = 'check-macros';
    chk.textContent = `Macros = ${fmt(r.calc)} kcal (4·P + 4·C + 9·G)`;
  } else {
    chk.className = `check-macros ${r.descuadre ? 'descuadre' : ''}`;
    chk.textContent = r.descuadre
      ? `⚠️ Los macros dan ${fmt(r.calc)} kcal: ${fmt(Math.abs(r.difPct), 1)} % ${r.difPct > 0 ? 'más' : 'menos'} que lo que pusiste. Revisa los números.`
      : `✓ Los macros dan ${fmt(r.calc)} kcal (diferencia ${fmt(Math.abs(r.difPct), 1)} %)`;
  }
}

function pintarRango(id, valor, rango, tol, unidad) {
  const el = root.querySelector(`#r-${id}`);
  if (!rango) { el.textContent = ''; return; }
  const e = estadoRango(valor, rango, tol);
  el.className = `hint ${e ? e.nivel : ''}`;
  el.textContent = `${unidad === 'kcal' ? 'Rango ' : ''}${fmt(rango.min)}–${fmt(rango.max)}${unidad === 'g' ? ' g' : ''}`;
}

function actualizarCarga() {
  const min = b.sessions.reduce((a, s) => a + (parseNum(s.minutes) || 0), 0);
  const carga = b.sessions.reduce((a, s) => a + (parseNum(s.minutes) || 0) * (parseNum(s.rpe) || 0), 0);
  const el = root.querySelector('#h-carga');
  if (el) el.textContent = b.sessions.length ? `${min} min · carga ${fmt(carga)}` : '';
}

function numCampo(id) {
  const n = parseNum(root.querySelector(`#${id}`)?.value);
  return Number.isNaN(n) ? null : n;
}

// ---------------------------------------------------------------------
// Sesiones
// ---------------------------------------------------------------------

/** Última sesión registrada del tipo dado (para copiar lugar, minutos, etc.). */
function ultimaSesion(tipo) {
  const dias = [...state.days.values()].filter(d => d.date < fecha).sort((a, c) => (a.date < c.date ? 1 : -1));
  for (const d of dias) {
    const s = (d.sessions || []).find(x => x.type === tipo);
    if (s) return s;
  }
  return null;
}

function nuevaSesion(tipo) {
  const prev = ultimaSesion(tipo);
  return {
    type: tipo,
    place: prev?.place || tipoSesion(tipo).lugar,
    minutes: prev?.minutes ?? (tipo === 'combate' ? 90 : 45),
    rounds: prev?.rounds ?? null,
    rpe: prev?.rpe ?? 6,
    notes: '',
  };
}

// ---------------------------------------------------------------------
// Guardar
// ---------------------------------------------------------------------

/** Lee y valida el formulario. Devuelve { day, errores }. */
function recoger() {
  const errores = [];
  const campo = (id, nombre, [min, max], dec = null) => {
    const input = root.querySelector(`#${id}`);
    const n = parseNum(input.value);
    let mal = false;
    if (n != null && (Number.isNaN(n) || n < min || n > max)) {
      errores.push(`${nombre}: debe estar entre ${min} y ${max}.`);
      mal = true;
    }
    input.classList.toggle('error', mal);
    if (n == null || mal) return null;
    return dec == null ? n : round(n, dec);
  };

  const day = {
    date: fecha,
    weight: campo('f-peso', 'Peso', LIMITES.weight, 1),
    dayType: b.dayType,
    kcal: campo('f-kcal', 'Kcal', LIMITES.kcal, 0),
    protein: campo('f-protein', 'Proteína', LIMITES.macro, 1),
    carbs: campo('f-carbs', 'Carbohidratos', LIMITES.macro, 1),
    fat: campo('f-fat', 'Grasa', LIMITES.macro, 1),
    sleep: campo('f-sleep', 'Sueño', LIMITES.sleep, 1),
    energy: b.energy ?? null,
    note: root.querySelector('#f-note').value.trim(),
    sessions: [],
  };

  root.querySelectorAll('.sesion').forEach((card, i) => {
    const s = b.sessions[i];
    const leer = (c, nombre, [min, max], requerido) => {
      const input = card.querySelector(`[data-c="${c}"]`);
      const n = parseNum(s[c]);
      const mal = (n == null && requerido) || (n != null && (Number.isNaN(n) || n < min || n > max));
      if (mal) errores.push(`Sesión ${i + 1} · ${nombre}: ${requerido ? 'obligatorio, ' : ''}entre ${min} y ${max}.`);
      input.classList.toggle('error', mal);
      return mal || n == null ? null : Math.round(n);
    };
    day.sessions.push({
      type: s.type,
      place: s.place,
      minutes: leer('minutes', 'Minutos', LIMITES.minutes, true),
      rounds: leer('rounds', 'Rounds', LIMITES.rounds, false),
      rpe: leer('rpe', 'RPE', LIMITES.rpe, true),
      notes: (s.notes || '').trim(),
    });
  });

  const vacio = day.weight == null && day.kcal == null && day.protein == null && day.carbs == null
    && day.fat == null && !day.sessions.length && day.sleep == null && day.energy == null && !day.note;
  if (vacio && !errores.length) errores.push('No hay nada que guardar todavía.');
  return { day, errores };
}

async function guardar() {
  const { day, errores } = recoger();
  const cajaErr = root.querySelector('#errores');
  if (errores.length) {
    cajaErr.innerHTML = `<div class="alerta">${errores.map(esc).join('<br>')}</div>`;
    toast('Revisa los campos marcados', 'error');
    return;
  }
  cajaErr.innerHTML = '';
  await saveDay(day);
  b = structuredClone(day);
  sucio = false;
  toast('Día guardado ✓', 'ok');
  pintar();
  mostrarResultado(day);
  actualizarAvisoRespaldo();
}

/** Semáforo de kcal y macros + chequeo + alertas activas. */
function mostrarResultado(day) {
  const m = metasPara(day.date, day.dayType);
  const filas = [
    ['Kcal', day.kcal, m.kcal, TOLERANCIA.kcal, ''],
    ...MACROS.map(mac => [mac.nombre, day[mac.id], m[mac.id], TOLERANCIA.macro, ' g']),
  ];
  const texto = e => !e ? 'sin dato' : e.nivel === 'ok' ? 'dentro' : `${e.nivel === 'cerca' ? 'un poco ' : ''}${e.dir < 0 ? 'bajo' : 'alto'}`;
  const items = filas.map(([nombre, v, r, tol, u]) => {
    const e = estadoRango(v, r, tol);
    return `<div class="item">
      <span class="punto ${e ? e.nivel : ''}"></span>
      <span>${nombre} <span class="muted small">${r ? `(${fmt(r.min)}–${fmt(r.max)}${u})` : ''}</span></span>
      <span><b class="num">${v == null ? '—' : fmt(v) + u}</b> <span class="small ${e ? e.nivel : 'muted'}">${texto(e)}</span></span>
    </div>`;
  }).join('');

  const chk = revisarMacros(day.kcal, day.protein, day.carbs, day.fat);
  const alts = fecha === hoyISO() ? alertas(fecha) : [];
  root.querySelector('#resultado').innerHTML = `
    <section class="card">
      <h2>Resultado · ${TIPO_DIA[day.dayType]}</h2>
      <div class="semaforo">${items}</div>
      ${chk.descuadre ? `<p class="cerca small">⚠️ Los macros (${fmt(chk.calc)} kcal) no cuadran con las kcal: ${fmt(Math.abs(chk.difPct), 1)} % de diferencia.</p>` : ''}
      ${alts.map(a => `<div class="alerta" style="margin-top:8px">🔔 ${esc(a.texto)}</div>`).join('')}
    </section>`;
  root.querySelector('#resultado').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------

function cambiarFecha(nueva) {
  if (!nueva || nueva > hoyISO()) return pintar();
  if (sucio && !confirm('Tienes cambios sin guardar. ¿Cambiar de día y descartarlos?')) {
    root.querySelector('#f-fecha').value = fecha;
    return;
  }
  cargar(nueva);
  pintar();
}

/** Copia los campos principales del formulario al borrador (para no perderlos al repintar). */
function sincronizarCampos() {
  for (const [id, k] of [['f-peso', 'weight'], ['f-kcal', 'kcal'], ['f-protein', 'protein'], ['f-carbs', 'carbs'], ['f-fat', 'fat'], ['f-sleep', 'sleep']]) {
    const v = root.querySelector(`#${id}`)?.value;
    b[k] = v === '' || v == null ? null : v;
  }
  b.note = root.querySelector('#f-note')?.value ?? b.note;
}

async function onClick(e) {
  const btn = e.target.closest('[data-acc]');
  if (!btn) return;
  const sesCard = btn.closest('.sesion');
  const i = sesCard ? Number(sesCard.dataset.i) : null;

  switch (btn.dataset.acc) {
    case 'dia-ant': cambiarFecha(addDays(fecha, -1)); break;
    case 'dia-sig': cambiarFecha(addDays(fecha, 1)); break;
    case 'tipo':
      b.dayType = btn.dataset.v;
      sucio = true;
      root.querySelectorAll('[data-acc="tipo"]').forEach(x => x.classList.toggle('activo', x === btn));
      actualizarVivo();
      break;
    case 'add-ses':
    case 'add-plantilla': {
      sincronizarCampos();
      const plantilla = state.settings.schedule[diaSemana(fecha)]?.plantilla || [];
      if (btn.dataset.acc === 'add-plantilla') {
        plantilla.forEach(t => b.sessions.push(nuevaSesion(t)));
      } else {
        const usados = b.sessions.map(s => s.type);
        b.sessions.push(nuevaSesion(plantilla.find(t => !usados.includes(t)) || 'tecnica'));
      }
      if (b.dayType === 'rest' && b.sessions.length) toast('Tip: si entrenaste, cambia el tipo de día a Entrenamiento');
      sucio = true;
      pintar();
      root.querySelector('.sesion:last-child')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      break;
    }
    case 'quitar-ses':
      sincronizarCampos();
      b.sessions.splice(i, 1);
      sucio = true;
      pintar();
      break;
    case 'ses-tipo':
      b.sessions[i].type = btn.dataset.v;
      b.sessions[i].place = tipoSesion(btn.dataset.v).lugar;
      sesCard.querySelectorAll('[data-acc="ses-tipo"]').forEach(x => x.classList.toggle('activo', x === btn));
      sesCard.querySelector('[data-c="place"]').value = b.sessions[i].place;
      sesCard.querySelector('.sesion-head strong').textContent = `${tipoSesion(btn.dataset.v).icono} Sesión ${i + 1}`;
      sucio = true;
      break;
    case 'energia': {
      const v = Number(btn.dataset.v);
      b.energy = b.energy === v ? null : v;
      root.querySelectorAll('[data-acc="energia"]').forEach(x => x.classList.toggle('activo', Number(x.dataset.v) === b.energy));
      sucio = true;
      break;
    }
    case 'guardar': await guardar(); break;
    case 'borrar-dia':
      if (!confirm(`¿Borrar el registro del ${fmtFechaLarga(fecha)}?`)) break;
      await deleteDay(fecha);
      cargar(fecha);
      pintar();
      toast('Día borrado');
      break;
  }
}

function onInput(e) {
  const t = e.target;
  sucio = true;
  const sesCard = t.closest('.sesion');
  if (sesCard && t.dataset.c) {
    const s = b.sessions[Number(sesCard.dataset.i)];
    s[t.dataset.c] = t.value;
    if (t.dataset.c === 'rpe') sesCard.querySelector('.rpe-valor').textContent = t.value;
    actualizarCarga();
    return;
  }
  if (['f-kcal', 'f-protein', 'f-carbs', 'f-fat'].includes(t.id)) actualizarVivo();
}

function onChange(e) {
  const t = e.target;
  if (t.id === 'f-fecha') cambiarFecha(t.value);
  else if (t.dataset.c === 'place') b.sessions[Number(t.closest('.sesion').dataset.i)].place = t.value;
}
