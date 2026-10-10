// =====================================================================
// constantes.js — Catálogos fijos de la app (tipos de sesión, lugares…).
// =====================================================================

export const TIPOS_SESION = [
  { id: 'combate', nombre: 'Combate/sparring', corto: 'Combate', icono: '🥋', lugar: 'club_uni' },
  { id: 'gym', nombre: 'Gym', corto: 'Gym', icono: '🏋️', lugar: 'gimnasio' },
  { id: 'tecnica', nombre: 'Técnica en casa', corto: 'Técnica', icono: '🦵', lugar: 'casa' },
  { id: 'fisico', nombre: 'Físico/cardio', corto: 'Físico', icono: '🏃', lugar: 'casa' },
  { id: 'otro', nombre: 'Otro', corto: 'Otro', icono: '➕', lugar: 'otro' },
];

export const LUGARES = [
  { id: 'club_uni', nombre: 'Club universidad' },
  { id: 'otro_club', nombre: 'Otro club' },
  { id: 'casa', nombre: 'Casa' },
  { id: 'gimnasio', nombre: 'Gimnasio' },
  { id: 'otro', nombre: 'Otro' },
];

export const TIPO_DIA = {
  train: 'Entrenamiento',
  rest: 'Descanso',
};

export const MACROS = [
  { id: 'protein', nombre: 'Proteína', corto: 'P' },
  { id: 'carbs', nombre: 'Carbohidratos', corto: 'C' },
  { id: 'fat', nombre: 'Grasa', corto: 'G' },
];

export function tipoSesion(id) {
  return TIPOS_SESION.find(t => t.id === id) || TIPOS_SESION[TIPOS_SESION.length - 1];
}

export function nombreLugar(id) {
  return (LUGARES.find(l => l.id === id) || { nombre: '—' }).nombre;
}

// Límites de validación de entradas
export const LIMITES = {
  weight: [40, 120],
  kcal: [0, 8000],
  macro: [0, 1000],
  minutes: [1, 600],
  rounds: [0, 50],
  rpe: [1, 10],
  sleep: [0, 24],
  energy: [1, 5],
};
