// =====================================================================
// db.js — Almacenamiento local con IndexedDB.
//
// Modelo de datos (SCHEMA_VERSION = 1):
//   days          clave "date" (YYYY-MM-DD)
//     { date, weight, dayType: 'train'|'rest', kcal, protein, carbs, fat,
//       sessions: [{ type, place, minutes, rounds, rpe, notes }],
//       sleep, energy, note, sample?: true, updatedAt }
//   settings      clave "id" = 'main'
//     { profile: { height, age, sex, weight },
//       schedule: [7 × { dayType, plantilla: [tipos de sesión] }]  (lunes = 0),
//       defaultTargets: Metas,   // se usan si ninguna fecha cae en un bloque
//       alerts: { loss: {on, pct}, lowKcal: {on, days}, lowProtein: {on, days} },
//       activityFactor }
//   blocks        clave "id"  { id, name, start, end, goalWeight, targets: Metas }
//   competitions  clave "id"  { id, name, date, limitKg, weighIn }
//   meta          clave "id" = 'main'  { schemaVersion, lastBackupAt, createdAt }
//
//   Metas = { train: RangosDia, rest: RangosDia }
//   RangosDia = { kcal: {min,max}, protein|carbs|fat: { mode: 'g'|'gkg', min, max } }
//
// Si cambias el modelo: sube SCHEMA_VERSION y agrega una función en MIGRACIONES.
// =====================================================================

const DB_NAME = 'pesoTKD';
const IDB_VERSION = 1;
export const SCHEMA_VERSION = 1;
export const APP_ID = 'peso-tkd';

// Migraciones: MIGRACIONES[n] convierte datos de la versión n a la n+1.
// Ejemplo futuro: 1: d => { d.days.forEach(x => x.water = null); return d; }
const MIGRACIONES = {};

// Estado en memoria (los datos son pequeños: se cargan todos al iniciar).
export const state = {
  days: new Map(),
  settings: null,
  blocks: [],
  competitions: [],
  meta: null,
};

// ---------- Acceso básico a IndexedDB ----------

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('days')) db.createObjectStore('days', { keyPath: 'date' });
      for (const s of ['settings', 'blocks', 'competitions', 'meta']) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/** Ejecuta fn(store) dentro de una transacción y resuelve con el resultado de la petición. */
async function tx(storeName, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const req = fn(t.objectStore(storeName));
    t.oncomplete = () => resolve(req instanceof IDBRequest ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const getAll = s => tx(s, 'readonly', st => st.getAll());
const put = (s, obj) => tx(s, 'readwrite', st => st.put(obj));
const del = (s, key) => tx(s, 'readwrite', st => st.delete(key));
const clear = s => tx(s, 'readwrite', st => st.clear());

/** Escribe varios objetos en una sola transacción. */
async function putMany(storeName, objs) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, 'readwrite');
    const st = t.objectStore(storeName);
    objs.forEach(o => st.put(o));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

// ---------- Valores por defecto ----------

const gkg = (min, max) => ({ mode: 'gkg', min, max });

export function defaultSettings() {
  return {
    id: 'main',
    profile: { height: 170, age: 19, sex: 'M', weight: 67.8 },
    // Lunes gym + casa, miércoles casa, viernes combate en el club.
    schedule: [
      { dayType: 'train', plantilla: ['gym', 'tecnica'] },
      { dayType: 'rest', plantilla: [] },
      { dayType: 'train', plantilla: ['tecnica'] },
      { dayType: 'rest', plantilla: [] },
      { dayType: 'train', plantilla: ['combate'] },
      { dayType: 'rest', plantilla: [] },
      { dayType: 'rest', plantilla: [] },
    ],
    // Mantenimiento (se usa fuera de cualquier bloque)
    defaultTargets: {
      train: { kcal: { min: 2300, max: 2500 }, protein: gkg(1.8, 2.2), carbs: gkg(4.0, 5.0), fat: gkg(0.8, 1.1) },
      rest: { kcal: { min: 2200, max: 2300 }, protein: gkg(1.8, 2.2), carbs: gkg(3.5, 4.3), fat: gkg(0.8, 1.1) },
    },
    alerts: {
      loss: { on: true, pct: 1.0 },
      lowKcal: { on: true, days: 3 },
      lowProtein: { on: true, days: 3 },
    },
    activityFactor: 1.55,
  };
}

export function defaultBlocks() {
  return [
    {
      id: 'b-68',
      name: 'Mantener -68 (déficit suave)',
      start: '2026-10-01',
      end: '2026-10-25',
      goalWeight: 67.0,
      targets: {
        train: { kcal: { min: 2200, max: 2400 }, protein: gkg(1.9, 2.3), carbs: gkg(3.8, 4.6), fat: gkg(0.8, 1.0) },
        rest: { kcal: { min: 2000, max: 2200 }, protein: gkg(1.9, 2.3), carbs: gkg(3.0, 3.8), fat: gkg(0.8, 1.0) },
      },
    },
    {
      id: 'b-63',
      name: 'Bajar a -63',
      start: '2026-10-26',
      end: '2026-11-20',
      goalWeight: 62.8,
      targets: {
        train: { kcal: { min: 1950, max: 2150 }, protein: gkg(2.0, 2.4), carbs: gkg(3.2, 4.0), fat: gkg(0.7, 0.9) },
        rest: { kcal: { min: 1750, max: 1950 }, protein: gkg(2.0, 2.4), carbs: gkg(2.4, 3.2), fat: gkg(0.7, 0.9) },
      },
    },
  ];
}

export function defaultCompetitions() {
  return [
    { id: 'c-local', name: 'Torneo local', date: '2026-10-25', limitKg: 68, weighIn: '' },
    { id: 'c-nacional', name: 'Campeonato nacional', date: '2026-11-20', limitKg: 63, weighIn: '' },
  ];
}

// ---------- Carga y guardado ----------

/** Carga todo a memoria; la primera vez crea los valores por defecto. */
export async function loadAll() {
  const [days, settings, blocks, comps, meta] = await Promise.all([
    getAll('days'), getAll('settings'), getAll('blocks'), getAll('competitions'), getAll('meta'),
  ]);

  if (!settings.length) {
    // Primera vez que se abre la app
    state.settings = defaultSettings();
    state.blocks = defaultBlocks();
    state.competitions = defaultCompetitions();
    state.meta = { id: 'main', schemaVersion: SCHEMA_VERSION, lastBackupAt: null, createdAt: Date.now() };
    await put('settings', state.settings);
    await putMany('blocks', state.blocks);
    await putMany('competitions', state.competitions);
    await put('meta', state.meta);
  } else {
    state.settings = { ...defaultSettings(), ...settings[0] };
    state.blocks = blocks;
    state.competitions = comps;
    state.meta = meta[0] || { id: 'main', schemaVersion: SCHEMA_VERSION, lastBackupAt: null, createdAt: Date.now() };
  }
  state.days = new Map(days.map(d => [d.date, d]));

  // Si los datos guardados son de una versión anterior, migrarlos
  if ((state.meta.schemaVersion || 1) < SCHEMA_VERSION) {
    const migrados = migrar(exportSnapshot());
    await importData(migrados, { yaMigrado: true });
  }
}

export async function saveDay(day) {
  day.updatedAt = Date.now();
  delete day.sample; // un día editado a mano ya no es de ejemplo
  await put('days', day);
  state.days.set(day.date, day);
}

export async function deleteDay(date) {
  await del('days', date);
  state.days.delete(date);
}

export async function saveSettings(s) {
  state.settings = s;
  await put('settings', s);
}

export async function saveBlocks(list) {
  await clear('blocks');
  await putMany('blocks', list);
  state.blocks = list;
}

export async function saveCompetitions(list) {
  await clear('competitions');
  await putMany('competitions', list);
  state.competitions = list;
}

export async function saveMeta(patch) {
  state.meta = { ...state.meta, ...patch };
  await put('meta', state.meta);
}

/** Días ordenados por fecha ascendente. */
export function daysSorted() {
  return [...state.days.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

// ---------- Datos de ejemplo ----------

export async function addSampleDays(lista) {
  const nuevos = lista.filter(d => !state.days.has(d.date)); // nunca pisa datos reales
  await putMany('days', nuevos);
  nuevos.forEach(d => state.days.set(d.date, d));
  return nuevos.length;
}

export async function removeSampleDays() {
  const ejemplos = [...state.days.values()].filter(d => d.sample);
  for (const d of ejemplos) await del('days', d.date);
  ejemplos.forEach(d => state.days.delete(d.date));
  return ejemplos.length;
}

// ---------- Respaldo / migraciones ----------

/** Copia completa de los datos (para exportar a JSON). */
export function exportSnapshot() {
  return {
    app: APP_ID,
    schemaVersion: state.meta?.schemaVersion || SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    settings: state.settings,
    blocks: state.blocks,
    competitions: state.competitions,
    days: daysSorted(),
  };
}

/** Aplica las migraciones necesarias hasta SCHEMA_VERSION. */
export function migrar(data) {
  let v = data.schemaVersion || 1;
  if (v > SCHEMA_VERSION) {
    throw new Error(`El respaldo es de una versión más nueva de la app (v${v}). Actualiza la app primero.`);
  }
  while (v < SCHEMA_VERSION) {
    const fn = MIGRACIONES[v];
    if (!fn) throw new Error(`Falta la migración de la versión ${v}.`);
    data = fn(data);
    v++;
    data.schemaVersion = v;
  }
  return data;
}

/** Valida la forma básica de un respaldo. Lanza Error con mensaje en español. */
export function validarRespaldo(data) {
  if (!data || typeof data !== 'object') throw new Error('El archivo no es un JSON válido.');
  if (data.app !== APP_ID) throw new Error('Este archivo no es un respaldo de esta app.');
  if (!Array.isArray(data.days)) throw new Error('El respaldo no contiene días.');
  if (!data.settings) throw new Error('El respaldo no contiene ajustes.');
}

/** Reemplaza TODOS los datos por los del respaldo. */
export async function importData(data, { yaMigrado = false } = {}) {
  if (!yaMigrado) {
    validarRespaldo(data);
    data = migrar(data);
  }
  for (const s of ['days', 'settings', 'blocks', 'competitions']) await clear(s);
  await putMany('days', data.days.filter(d => d && /^\d{4}-\d{2}-\d{2}$/.test(d.date)));
  await put('settings', { ...data.settings, id: 'main' });
  await putMany('blocks', data.blocks || []);
  await putMany('competitions', data.competitions || []);
  await saveMeta({ schemaVersion: SCHEMA_VERSION });
  await loadAll();
}
