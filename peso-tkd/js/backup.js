// =====================================================================
// backup.js — Respaldo: exportar/importar JSON, exportar CSV y aviso
// cuando pasan más de 7 días sin respaldar.
// =====================================================================

import { state, exportSnapshot, importData, saveMeta, daysSorted } from './db.js';
import { hoyISO, sum } from './util.js';
import { tipoSesion, nombreLugar, TIPO_DIA } from './constantes.js';

const DIAS_AVISO = 7;
const MS_DIA = 86400000;

/** Descarga (o comparte en iPhone) un archivo generado en memoria. */
async function entregarArchivo(contenido, nombre, tipo) {
  const blob = new Blob([contenido], { type: tipo });
  const esIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  // En el iPhone (sobre todo como app instalada) es más fiable el menú Compartir → "Guardar en Archivos".
  if (esIOS && navigator.canShare) {
    const file = new File([blob], nombre, { type: tipo });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: nombre });
        return true;
      } catch (err) {
        if (err.name === 'AbortError') return false; // el usuario canceló
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return true;
}

/** Exporta todo a JSON y registra la fecha del respaldo. */
export async function exportarJSON() {
  const json = JSON.stringify(exportSnapshot(), null, 2);
  const ok = await entregarArchivo(json, `peso-tkd-respaldo-${hoyISO()}.json`, 'application/json');
  if (ok) {
    await saveMeta({ lastBackupAt: Date.now() });
    actualizarAvisoRespaldo();
  }
  return ok;
}

/** Lee un archivo JSON y reemplaza todos los datos. */
export async function importarJSON(file) {
  const texto = await file.text();
  let data;
  try {
    data = JSON.parse(texto);
  } catch {
    throw new Error('El archivo no es un JSON válido.');
  }
  await importData(data);
  // Importar un respaldo cuenta como tener respaldo
  await saveMeta({ lastBackupAt: Date.now() });
  return state.days.size;
}

/** Escapa un valor para CSV. */
function celda(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Genera el texto CSV (una fila por día). */
export function generarCSV() {
  const cab = ['fecha', 'peso_kg', 'tipo_dia', 'kcal', 'proteina_g', 'carbohidratos_g', 'grasa_g',
    'sesiones', 'minutos', 'rounds', 'carga', 'detalle_sesiones', 'sueno_h', 'energia', 'nota'];
  const filas = daysSorted().map(d => {
    const ses = d.sessions || [];
    const detalle = ses.map(s =>
      `${tipoSesion(s.type).corto} ${s.minutes ?? '?'}' RPE${s.rpe ?? '?'}${s.rounds ? ` ${s.rounds}r` : ''} (${nombreLugar(s.place)})${s.notes ? ` - ${s.notes}` : ''}`
    ).join(' | ');
    return [
      d.date, d.weight, TIPO_DIA[d.dayType] || '', d.kcal, d.protein, d.carbs, d.fat,
      ses.length, sum(ses.map(s => s.minutes)), sum(ses.map(s => s.rounds)),
      sum(ses.map(s => (s.minutes || 0) * (s.rpe || 0))), detalle, d.sleep, d.energy, d.note,
    ].map(celda).join(',');
  });
  // BOM para que Excel reconozca los acentos
  return '﻿' + [cab.join(','), ...filas].join('\n');
}

export function exportarCSV() {
  return entregarArchivo(generarCSV(), `peso-tkd-${hoyISO()}.csv`, 'text/csv');
}

/**
 * ¿Hace falta respaldo? Cuenta desde el último respaldo o, si nunca se hizo,
 * desde el primer día registrado a mano.
 */
export function diasSinRespaldo() {
  const reales = daysSorted().filter(d => !d.sample);
  if (!reales.length) return null;
  const ref = state.meta?.lastBackupAt
    ?? Math.min(...reales.map(d => d.updatedAt || Date.now()));
  return Math.floor((Date.now() - ref) / MS_DIA);
}

/** Muestra u oculta el aviso de respaldo en la parte superior. */
export function actualizarAvisoRespaldo() {
  const el = document.getElementById('aviso-respaldo');
  if (!el) return;
  const dias = diasSinRespaldo();
  if (dias != null && dias > DIAS_AVISO) {
    const txt = state.meta?.lastBackupAt ? `Llevas ${dias} días sin hacer respaldo.` : `Aún no has hecho ningún respaldo (${dias} días de datos).`;
    el.innerHTML = `💾 ${txt} <a href="#ajustes/respaldo">Hacer respaldo</a>`;
    el.hidden = false;
  } else {
    el.hidden = true;
  }
}
