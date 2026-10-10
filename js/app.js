// =====================================================================
// app.js — Arranque de la app, navegación por pestañas y service worker.
// =====================================================================

import { loadAll } from './db.js';
import { actualizarAvisoRespaldo } from './backup.js';
import * as registro from './ui/registro.js';
import * as reporte from './ui/reporte.js';
import * as progreso from './ui/progreso.js';
import * as ajustes from './ui/ajustes.js';
import { configurarTema } from './ui/charts.js';
import { hoyISO, toast } from './util.js';

const VISTAS = {
  registro: { mod: registro, titulo: 'Registro' },
  reporte: { mod: reporte, titulo: 'Reporte semanal' },
  progreso: { mod: progreso, titulo: 'Progreso' },
  ajustes: { mod: ajustes, titulo: 'Ajustes' },
};

/** Muestra la pestaña indicada en el hash (#registro, #reporte…). */
function mostrar() {
  const id = location.hash.slice(1).split('/')[0] || 'registro';
  const vista = VISTAS[id] || VISTAS.registro;
  document.getElementById('titulo').textContent = vista.titulo;
  document.querySelectorAll('.tabbar a').forEach(a => a.classList.toggle('activa', a.dataset.tab === id));
  // Contenedor nuevo en cada cambio: así no se acumulan listeners de otras pantallas
  const viejo = document.getElementById('vista');
  const cont = viejo.cloneNode(false);
  viejo.replaceWith(cont);
  try {
    vista.mod.render(cont);
  } catch (err) {
    console.error(err);
    cont.innerHTML = `<div class="alerta">Error al mostrar la pantalla: ${err.message}</div>`;
  }
  window.scrollTo(0, 0);
  actualizarAvisoRespaldo();
}

// Muestra en pantalla cualquier error inesperado (en el iPhone no hay consola)
function avisarError(err) {
  console.error(err);
  toast(`Error: ${err?.message || err}`, 'error');
}
window.addEventListener('error', e => avisarError(e.error || e.message));
window.addEventListener('unhandledrejection', e => avisarError(e.reason));

async function iniciar() {
  try {
    await loadAll();
  } catch (err) {
    document.getElementById('vista').innerHTML =
      `<div class="alerta">No se pudo abrir la base de datos local: ${err.message}</div>`;
    return;
  }
  // Chart.js se carga con "defer"; los módulos también, así que ya está listo.
  configurarTema();
  window.addEventListener('hashchange', mostrar);
  mostrar();

  // Si la app instalada se reabre otro día, refresca la pantalla para mostrar "hoy"
  let dia = hoyISO();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && hoyISO() !== dia) {
      dia = hoyISO();
      mostrar();
    }
  });

  // Pide al navegador que no borre los datos locales por falta de espacio
  navigator.storage?.persist?.().catch(() => {});

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW no registrado', err));
  }
}

iniciar();
