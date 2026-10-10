# Peso TKD 🥋

Mini app web personal para registrar **peso, nutrición y entrenamiento** y ver **reportes semanales**, pensada para dar peso en competencias de taekwondo.

- HTML + CSS + JavaScript puro, sin frameworks ni paso de build.
- Se instala en el iPhone como app (PWA) y funciona **sin conexión**.
- Los datos se guardan **solo en tu dispositivo** (IndexedDB). Nadie más los ve.
- Gráficas con Chart.js (incluido en `lib/`, no depende de internet).

## Estructura

```
peso-tkd/
├── index.html              Shell de la app + barra de pestañas
├── manifest.webmanifest    Datos para instalarla como app
├── sw.js                   Service worker (modo offline)
├── css/styles.css          Estilos (mobile-first, modo oscuro)
├── icons/                  Iconos de la app
├── lib/chart.umd.min.js    Chart.js 4.4.1
├── js/
│   ├── app.js              Arranque y navegación
│   ├── db.js               IndexedDB, modelo de datos y migraciones
│   ├── calc.js             Lógica pura: tendencia, mantenimiento, proyecciones, alertas, metas
│   ├── contexto.js         Une los datos guardados con calc.js
│   ├── report.js           Reporte semanal y resumen para WhatsApp
│   ├── backup.js           Respaldo JSON/CSV y aviso de 7 días
│   ├── sample.js           Datos de ejemplo
│   ├── constantes.js       Tipos de sesión, lugares, límites de validación
│   ├── util.js             Fechas, números y utilidades
│   └── ui/                 Pantallas: registro, reporte, progreso, ajustes, charts
└── tests/                  Pruebas de la lógica (abrir tests/index.html)
```

## Cómo correrla localmente (en la laptop)

Hace falta un servidor local; abrir `index.html` con doble clic no funciona, porque los módulos JS y el service worker necesitan `http://`.

Con Python (ya lo tienes instalado):

```bash
cd peso-tkd
py -m http.server 8080
```

Abre <http://localhost:8080> en Chrome o Edge. Para verla como en el iPhone, pulsa F12 y activa la vista de dispositivo móvil (Ctrl+Shift+M).

**Pruebas:** abre <http://localhost:8080/tests/>. Deben salir todas en verde.

> Mientras desarrollas, si un cambio no aparece, recarga con Ctrl+Shift+R. Si sigue sin aparecer, ve a F12 → Application → Service Workers → *Unregister*.

## Publicarla gratis en GitHub Pages

1. Crea una cuenta en <https://github.com> si no tienes.
2. Crea un repositorio nuevo: botón **New**, nombre `peso-tkd`, **Public** (Pages gratis requiere repo público en cuentas gratuitas). No marques "Add README".
3. Sube los archivos. Elige una de estas dos opciones:
   - **Desde el navegador (más fácil):** en el repo vacío, pulsa *uploading an existing file* y arrastra **el contenido** de la carpeta `peso-tkd` (no la carpeta en sí: `index.html` debe quedar en la raíz del repo). Luego pulsa **Commit changes**.
   - **Con Git** (desde la carpeta `peso-tkd`):
     ```bash
     git init
     git add .
     git commit -m "Primera versión"
     git branch -M main
     git remote add origin https://github.com/TU_USUARIO/peso-tkd.git
     git push -u origin main
     ```
4. En el repo ve a **Settings → Pages**. En *Source* elige **Deploy from a branch**, en *Branch* elige **main** y **/ (root)**, y pulsa **Save**.
5. Espera 1–2 minutos. Tu app quedará en `https://TU_USUARIO.github.io/peso-tkd/`.

> Tus **datos no se suben** a GitHub: solo se publica el código. Los datos viven en el iPhone.

### Abrirla e instalarla en el iPhone

1. Abre la URL en **Safari**. Tiene que ser Safari: en iOS solo Safari instala bien las PWA.
2. Pulsa el botón **Compartir** (cuadro con flecha) → **Agregar a pantalla de inicio** → **Agregar**.
3. Ábrela siempre desde el icono 🔴🔵 de la pantalla de inicio. Así funciona offline y a pantalla completa, e iOS no borra sus datos por inactividad.

> Ojo: la app instalada y Safari tienen **almacenamientos separados**. Registra siempre desde el icono.

### Actualizar la app después de cambios

Sube los archivos modificados al repo (o haz `git push`). El iPhone toma la versión nueva la próxima vez que abras la app con internet; si no la ves, ciérrala y vuelve a abrirla. Si agregas archivos **nuevos**, añádelos a la lista `ARCHIVOS` en `sw.js` y cambia `VERSION` (por ejemplo, `peso-tkd-v2`).

## Respaldo (¡importante!)

Los datos están solo en el teléfono. Si borras la app, los datos de Safari o cambias de iPhone, **se pierden** si no tienes respaldo. La app te avisa arriba cuando pasan más de 7 días sin respaldar.

- **Exportar respaldo:** Ajustes → 💾 Respaldo → *Exportar respaldo (JSON)*. En el iPhone se abre el menú Compartir: elige **Guardar en Archivos** (iCloud Drive) o mándatelo por correo o WhatsApp.
- **Importar:** Ajustes → 💾 Respaldo → *Importar respaldo* y elige el `.json`. **Reemplaza** todos los datos actuales.
- **CSV:** *Exportar CSV* genera una tabla (un día por fila) para abrirla en Excel o Google Sheets.
- Los respaldos llevan número de versión (`schemaVersion`). Si en el futuro cambia el modelo de datos, la app migra los respaldos viejos automáticamente al importarlos.

## Datos de ejemplo

Ajustes → 🧪 Datos de ejemplo → *Cargar*: crea 3 semanas ficticias (las 3 anteriores a la actual) para ver los reportes. *Borrar* elimina solo esos días; tus registros reales nunca se tocan.

## Cómo calcula las cosas

| Concepto | Cálculo |
|---|---|
| Peso de tendencia | Media de los pesajes de los últimos 7 días. Todos los cálculos usan este valor, no el peso del día. |
| Ritmo actual | Pendiente (regresión lineal) de la tendencia en los últimos 14 días, en kg/semana. |
| Mantenimiento real | kcal promedio − (cambio de tendencia por día × 7700). Ventana de hasta 28 días, mínimo 14. La confianza depende de cuántos días tienen kcal y peso. |
| Kcal de macros | 4 × proteína + 4 × carbohidratos + 9 × grasa. Avisa si difieren más de 5 % de las kcal escritas. |
| Semáforo | 🟢 dentro del rango · 🟡 fuera por menos de 5 % (kcal) o 10 % (macros) · 🔴 más lejos. |
| Proyección | kg que faltan ÷ semanas hasta el pesaje = ritmo necesario. "Demasiado agresivo" si bajas más del % configurado (1 % por defecto) del peso por semana; "vas lento" si tu ritmo es menor al 90 % del necesario. |
| Sugerir metas | Mifflin-St Jeor × factor de actividad (o tu mantenimiento real si hay confianza), más el déficit para llegar a la meta del bloque, con un tope del 1 %/semana. |

*Esta app es una herramienta de registro, no consejo médico. Para cortes de peso importantes, consúltalo con tu entrenador o un nutricionista deportivo.*
