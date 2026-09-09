# Exclusivas Inteligentes

CRM local para una distribuidora de bebidas.

## Inicio

Usa el acceso directo del escritorio **Exclusivas Inteligentes**. El lanzador ejecuta la migración SQLite, levanta la API local y abre el CRM.

### Mover a otro equipo

1. Instala Node.js 22 o superior en el nuevo equipo.
2. Descomprime esta carpeta completa en una ruta sin permisos especiales, por ejemplo `C:\Excluvas Inteligentes`.
3. Ejecuta `Excluvas Inteligentes.bat`.
4. Opcionalmente ejecuta `crear-acceso-directo.ps1` para crear el acceso directo en el Escritorio.
5. Para cerrar la aplicación ejecuta `cerrar-excluvas.bat`.

El paquete incluye la base SQLite y los datos de prueba. No incluye claves de IA ni contraseñas externas.

Usuarios iniciales:

- Luis / `Temporal2026` — administrador
- Jose / `Temporal2026` — usuario

## Datos

La base se guarda en `data/excluvas.sqlite`. El lanzador ejecuta `migrate.mjs` antes de arrancar para actualizar bases creadas por versiones anteriores.

## Asistente

Desde ⚙ se configura el proveedor, modelo, endpoint y API key. La clave se guarda en las preferencias locales del equipo; no se incluye en el código fuente.

## Rutas y copias

En `Rutas` se seleccionan los envíos geolocalizados de una fecha, se ordenan por proximidad con un radio operativo de 150 metros y se puede abrir el recorrido en Google Maps. Cada cliente puede tener varias direcciones en `Lugares de recogida`.

En `Copias de seguridad` se puede crear y descargar un snapshot, consultar su histórico y restaurarlo con confirmación explícita. En producción la tarea automática se ejecuta una vez al día por la limitación del plan Hobby de Vercel.
