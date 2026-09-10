# Traspaso para OpenCode · Exclusivas Inteligentes

Este documento está escrito para una nueva instancia de OpenCode que trabaje en otro ordenador y despliegue en un servidor propio. Debe leerse junto con `AGENTS.md`.

## Prompt inicial para la nueva instancia

Pega este bloque como primer mensaje de contexto:

> Estás trabajando en el repositorio existente de Exclusivas Inteligentes. No crees un proyecto vacío ni reconstruyas la aplicación desde cero.
>
> Repositorio GitHub: `https://github.com/desarrolladormadrid2/exclusivas-inteligentes.git`
>
> Ruta habitual en Windows: `C:\codex_desarrollos\Excluvas Inteligentes`.
>
> Si esa ruta no existe en este ordenador, usa la carpeta en la que hayas clonado este repositorio. Si el repositorio no está accesible, detente y solicita que se clone o se haga accesible; no crees una copia vacía con el mismo nombre.
>
> El objetivo de este ordenador es ejecutar y desplegar la aplicación en un servidor propio. La instrucción de usar Vercel que aparece en algunas directrices antiguas queda anulada para este escenario: no despliegues en Vercel ni Netlify salvo que el usuario lo pida expresamente. La producción se despliega mediante `.github/workflows/deploy-main.yml` después de un `push` autorizado a `main`; OpenCode debe trabajar y probar en local, no iniciar despliegues manuales paralelos.
>
> Lee completamente `AGENTS.md` y `OPENCODE-HANDOFF.md` antes de modificar nada. Respeta los cambios locales existentes. Usa `apply_patch` para editar archivos y no subas secretos.
>
> Antes de cualquier publicación: ejecuta las pruebas, revisa el diff completo y confirma si el estado es “solo local”, “preview” o “producción”. Cada despliegue de producción debe incrementar la versión de forma coherente en `package.json`, en la versión visible de la aplicación y en las referencias equivalentes.

## Entorno objetivo: miniPC con servidor propio y OpenCode

El entorno objetivo es un miniPC que cumple simultáneamente estas funciones:

1. Servidor propio donde se ejecuta la aplicación.
2. Ordenador donde está clonado el repositorio.
3. Equipo donde OpenCode permanece abierto para trabajar sobre el código, revisar la aplicación, ejecutar pruebas y preparar/desplegar nuevas versiones en ese servidor.

La ruta exacta del clon en el miniPC todavía debe comprobarse. No se debe inventar una ruta ni crear otro proyecto si la carpeta no existe. Una vez localizada, debe guardarse como la ruta de trabajo del proyecto en ese equipo. La ruta de referencia del repositorio original es `C:\codex_desarrollos\Excluvas Inteligentes`.

OpenCode puede interactuar con la aplicación mediante su URL local o privada, lanzar el proceso self-hosted, revisar logs y ejecutar el protocolo de pruebas. La conexión de WhatsApp, sin embargo, debe ejecutarse como un proceso persistente independiente (`whatsapp-gateway`), gestionado por PM2, NSSM, systemd o el mecanismo de servicios del miniPC. OpenCode puede mantener ese proceso y modificar su código, pero no se debe asumir que una ventana abierta de OpenCode sustituye a un servicio.

Flujo de trabajo previsto en el miniPC:

```text
OpenCode modifica y revisa
        ↓
npm test + pruebas visuales/locales
        ↓
npm run build
        ↓
reinicio controlado de start:selfhost
        ↓
comprobación de la URL privada/pública del servidor propio
        ↓
whatsapp-gateway independiente recibe mensajes
```

La producción de Vercel y Netlify queda fuera de este flujo por el límite de uso indicado por el usuario. No consumir despliegues allí salvo autorización posterior.

## Fuente de verdad y estado actual

- Rama principal: `main`.
- Proyecto: `exclusivas-inteligentes`.
- Versión actual: `2.0.66`.
- El código funcional actual está sincronizado con GitHub.
- El nuevo gateway local de WhatsApp está en `whatsapp-gateway/`.
- Producción Netlify/Vercel no debe tocarse durante esta fase porque queda poco uso disponible.
- El gateway actual recibe textos y audios, identifica clientes por teléfono y los deja como pendientes en la bandeja del CRM. Todavía no crea pedidos definitivos ni envía respuestas automáticas.
- El siguiente bloque funcional debe añadir un agente con herramientas cerradas: buscar cliente, buscar producto, consultar stock, preparar borrador de pedido, pedir confirmación y solo después crear el pedido.

## Mapa del repositorio

Ruta raíz:

```text
C:\codex_desarrollos\Excluvas Inteligentes
```

Componentes principales:

| Ruta | Responsabilidad |
|---|---|
| `app/page.tsx` | Aplicación React principal y módulos del CRM, reparto, almacén, portales y web pública. |
| `api/crm-api.mjs` | API y reglas de negocio CRM. Es la fuente principal de comportamiento de datos. |
| `api/index.mjs` | Adaptador que sirve la aplicación compilada y delega `/api/*` al CRM. |
| `server-selfhost.mjs` | Entrada para servidor propio: aplicación y API bajo el mismo puerto. |
| `server-local.mjs` | API local SQLite para desarrollo; no usarlo como entrada remota porque fuerza `DATABASE_MODE=local`. |
| `remote-db-sync.mjs` | Adaptación de acceso remoto a Turso/libSQL. |
| `netlify/` | Funciones y adaptadores Netlify. No son necesarios para el servidor propio. |
| `netlify.toml` | Configuración de build, funciones, redirecciones y cron Netlify. |
| `vercel.json` | Configuración histórica de Vercel. No usar en este escenario salvo petición expresa. |
| `whatsapp-gateway/` | Proceso local separado basado en OpenWA. No se ejecuta dentro de Netlify/Vercel. |
| `tests/` | Pruebas automatizadas y pruebas de integración/renderizado. |
| `AGENTS.md` | Directrices de producto, UX, pruebas visuales y despliegues. |
| `.env.example` | Plantilla de variables. Los valores reales se guardan solo en `.env.local` o en el gestor de secretos del servidor. |

## Preparación del servidor propio

Requisitos mínimos:

- Node.js `>=22.13.0`.
- Git.
- Un proceso persistente: `systemd`, PM2, NSSM o el gestor equivalente del sistema.
- HTTPS terminado en un proxy inverso, por ejemplo Nginx, Caddy o el proxy del proveedor.
- Base de datos Turso/libSQL para un servidor persistente, o SQLite local solo si existe una política clara de copias y persistencia del disco.

Clonar y preparar:

```powershell
git clone https://github.com/desarrolladormadrid/exclusivas-inteligentes.git "C:\codex_desarrollos\Excluvas Inteligentes"
Set-Location "C:\codex_desarrollos\Excluvas Inteligentes"
npm ci
Copy-Item .env.example .env.local
npm test
npm run build
```

En Linux, usar la ruta real del clon, no inventar la ruta Windows. El proceso debe ejecutarse siempre desde la raíz del repositorio para que `dist/`, `data/` y `.env.local` se resuelvan correctamente.

Variables mínimas para un servidor propio con Turso:

```dotenv
DATABASE_MODE=remote
TURSO_DATABASE_URL=libsql://NOMBRE.turso.io
TURSO_AUTH_TOKEN=TOKEN_REAL_SOLO_EN_EL_SERVIDOR
PORT=3000
HOST=127.0.0.1
ENABLE_BACKGROUND_SCHEDULER=0
PORTAL_SESSION_SECRET=VALOR_LARGO_ALEATORIO
```

Variables opcionales:

```dotenv
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_UPLOAD_PRESET=
RESEND_API_KEY=
RESEND_FROM_EMAIL=
```

Reglas para secretos:

- Nunca subir `.env.local`, tokens, contraseñas, claves Cloudinary, Resend o Turso.
- Nunca escribir secretos en `AGENTS.md`, este documento, capturas, logs o código cliente.
- `CLOUDINARY_API_SECRET` y `TURSO_AUTH_TOKEN` solo se usan en servidor.
- `PORTAL_SESSION_SECRET` debe ser único por instalación y no debe conservar el valor de ejemplo.
- Las contraseñas temporales de usuarios no se documentan en GitHub. Al instalar, cambiar las contraseñas y forzar el cambio inicial.

## Arranque self-hosted

La entrada añadida para este escenario es `server-selfhost.mjs`. Sirve la aplicación compilada y la API en el mismo origen:

```powershell
Set-Location "C:\codex_desarrollos\Excluvas Inteligentes"
$env:NODE_ENV="production"
npm run build
npm run start:selfhost
```

Por defecto escucha en `127.0.0.1:3000`. Se puede cambiar con `HOST` y `PORT`, pero se recomienda dejarlo privado y publicar solo el proxy HTTPS.

Comprobación mínima:

```powershell
Invoke-WebRequest http://127.0.0.1:3000/ -UseBasicParsing
Invoke-WebRequest http://127.0.0.1:3000/api/clients -UseBasicParsing
```

El proxy inverso debe enviar `/` y `/api/*` al mismo proceso en `127.0.0.1:3000`. No exponer directamente el puerto 3000 ni una API SQLite sin HTTPS, autenticación y firewall.

En producción mantener `ENABLE_BACKGROUND_SCHEDULER=0` y programar la tarea mediante el programador del servidor. La ruta de scheduler actual debe invocarse internamente, no publicarse sin protección:

```text
GET http://127.0.0.1:3000/api/scheduler/run
```

Si el servidor necesita varios procesos o varias réplicas, el agente debe añadir un mecanismo de bloqueo/autorización para evitar ejecutar dos veces la misma tarea.

## Desarrollo local

Para probar el CRM con SQLite local:

```powershell
Set-Location "C:\codex_desarrollos\Excluvas Inteligentes"
node server-local.mjs
```

Ese proceso escucha en `http://127.0.0.1:3001` y crea/usa `data/excluvas.sqlite`. La interfaz de desarrollo se ejecuta en otra terminal:

```powershell
npm run dev
```

No confundir `server-local.mjs` con el arranque self-hosted: el primero es API local SQLite; el segundo sirve aplicación y API juntas.

## Rutas visibles de la aplicación

Rutas de módulos:

```text
/
/crm
/comercial
/almacen
/reparto
/ocr
/web
/portal-pedidos
/portal-ofertas
/seguimiento/:token
```

Funciones que deben probarse en cada instalación:

- Login y permisos por rol.
- Clientes, proveedores, productos y ubicaciones.
- Pedidos, líneas, presupuestos, conversión a pedido e impresión.
- Almacenes, stock, entradas, incidencias, devoluciones y movimientos.
- Preparación de pedidos, notas de carga, rutas y reparto.
- Entrega con firma, fotos, QR, código de barras y seguimiento público.
- Facturación, pagos, PDF, enlace compartible y correo Resend si está configurado.
- Fotos Cloudinary y fallback local/Base64 cuando Cloudinary no está configurado.
- Portal de clientes/proveedores, promociones y registros web.
- OCR, notas, auditoría, papelera, copias y tareas programadas.
- Bandeja de WhatsApp y mensajes pendientes de interpretación.

## Contrato de API

La mayoría de recursos usan el contrato genérico:

```text
GET    /api/:recurso
GET    /api/:recurso/:id
POST   /api/:recurso
PUT    /api/:recurso/:id
DELETE /api/:recurso/:id
```

Recursos persistentes disponibles en `api/crm-api.mjs`:

```text
suppliers
purchase_orders
purchase_order_lines
goods_receipts
goods_receipt_lines
goods_receipt_incidents
notes
document_templates
returns
warehouses
delivery_notes
payments
clients
products
orders
quotes
invoices
order_lines
quote_lines
delivery_note_lines
invoice_lines
inventory_movements
shipments
audit_logs
scheduled_tasks
collection_points
expenses
ocr_documents
web_registrations
web_promotions
whatsapp_messages
product_price_history
product_suppliers
product_lots
product_equivalents
purchase_suggestions
purchase_requests
purchase_request_offers
import_batches
import_records
delivery_routes
delivery_route_stops
users
```

Consultas y rutas especiales:

```text
POST /api/login
POST /api/public_login
GET  /api/public_portal

GET  /api/public/shipments/:trackingToken

GET  /api/documents/:type/share/:token
POST /api/documents/:type/:id/pdf
GET  /api/invoices/share/:token
POST /api/invoices/:id/pdf
POST /api/invoices/:id/email

GET  /api/backups
POST /api/backups
GET  /api/backups/:id
POST /api/backups/:id/restore
GET  /api/backup
POST /api/backup

GET  /api/scheduler/run
POST /api/scheduled_tasks/:id/run

GET    /api/routes
POST   /api/routes
PUT    /api/routes/:id
DELETE /api/routes/:id
PUT    /api/routes/:id/stops/:stopId
PUT    /api/routes/:id/stops/reorder

GET  /api/public_promotions
POST /api/web_promotions/:id/publish
POST /api/web_promotions/:id/pause

POST /api/quotes/:id/convert-order
GET  /api/purchase_requests/:id/public
POST /api/purchase_requests
POST /api/purchase_requests/:id/apply-offer
POST /api/purchase_requests/:id/create-order

POST /api/assistant/adjust-order-line

GET  /api/shipments/:id/delivery-proof
POST /api/shipments/:id/delivery-confirmation
POST /api/shipments/:id/payment-receipt

POST /api/goods_receipt_incidents/:id/claim
PUT  /api/goods_receipt_lines/:id/location
GET  /api/goods_receipts
GET  /api/goods_receipts/detail/:id
POST /api/goods_receipts/:id/receive

GET  /api/stock
GET  /api/purchase_suggestions
PUT  /api/purchase_suggestions/:id
GET  /api/billing
POST /api/billing
GET  /api/summary
GET  /api/trash
POST /api/trash/restore
DELETE /api/trash/:table/:id
```

Parámetros frecuentes:

- `?view=lookup&limit=5000` para selectores y búsquedas ligeras.
- `?include_deleted=1` solo cuando la vista de auditoría lo necesita.
- `X-Actor` para identificar al usuario que realiza una mutación.
- `X-Audit-Query: true` para las consultas que deben quedar registradas.
- Los endpoints de sesión/portal usan tokens; no sustituirlos por IDs visibles.

## OpenWA y WhatsApp

El gateway está separado de la aplicación:

```text
C:\codex_desarrollos\Excluvas Inteligentes\whatsapp-gateway
```

Instalación y diagnóstico:

```powershell
Set-Location "C:\codex_desarrollos\Excluvas Inteligentes\whatsapp-gateway"
npm ci
Copy-Item .env.example .env
```

Si aplicación, API y gateway están en el mismo servidor self-hosted:

```dotenv
CRM_API_BASE_URL=http://127.0.0.1:3000/api
OPENWA_SESSION_ID=exclusivas-inteligentes
OPENWA_HEADLESS=true
OPENWA_QR_TIMEOUT_SECONDS=120
CRM_ACTOR=WhatsApp · OpenWA
MAX_AUDIO_BYTES=8388608
```

Arranque:

```powershell
npm run doctor
npm start
```

El primer arranque requiere escanear el QR desde WhatsApp → Dispositivos vinculados. Usar un número de prueba separado del número personal o principal.

Si el gateway está en otro ordenador, no apuntar a `127.0.0.1` del ordenador equivocado. Usar una dirección privada protegida por VPN/firewall o colocar gateway y aplicación en el mismo servidor. No publicar la API CRM directamente a Internet.

Estado funcional actual del gateway:

1. Recibe mensajes privados de texto.
2. Recibe notas de voz y descarga el audio.
3. Busca el cliente por el teléfono del remitente.
4. Guarda `whatsapp_messages` con estado `Pendiente de interpretación`.
5. No crea pedidos y no responde automáticamente todavía.

El agente futuro debe trabajar con confirmación segura:

1. Transcribir audio y normalizar texto.
2. Identificar cliente.
3. Buscar productos por nombre/SKU y unidades.
4. Consultar stock y precios.
5. Construir un borrador.
6. Enviar resumen al cliente y pedir confirmación.
7. Crear el pedido solo tras confirmación inequívoca.
8. Registrar auditoría y devolver código del pedido.

No permitir que el modelo ejecute SQL libre, borre registros, cambie precios o confirme pedidos sin herramientas y validaciones específicas.

## Usuarios, roles y seguridad

- El CRM tiene usuarios y permisos por módulo.
- Los roles y permisos reales deben leerse desde `/api/users` y la interfaz, no inventarse en el agente.
- En instalaciones locales de datos vacíos pueden existir usuarios iniciales de desarrollo; deben cambiarse antes de exponer el servidor.
- No incluir contraseñas temporales en este documento ni en GitHub.
- Proteger login, sesiones de portal, endpoints de escritura, backups y subida de archivos.
- No exponer la base SQLite ni el directorio `data/` como archivos estáticos.
- Limitar tamaño y MIME de imágenes, audios, adjuntos y documentos.
- Mantener auditoría en operaciones sensibles.

## Pruebas obligatorias

Desde la raíz:

```powershell
npm test
```

Desde el gateway:

```powershell
Set-Location whatsapp-gateway
npm test
npm run doctor
```

Smoke test self-hosted:

```powershell
npm run build
npm run start:selfhost
# En otra terminal:
Invoke-WebRequest http://127.0.0.1:3000/ -UseBasicParsing
Invoke-WebRequest http://127.0.0.1:3000/api/clients -UseBasicParsing
```

La revisión visual debe recorrer escritorio, tablet horizontal/vertical y móvil. Abrir realmente menús, modales, documentos, notas de carga, firma, QR, código de barras, devoluciones y notificaciones. Guardar y mostrar las capturas según las reglas de `AGENTS.md`.

## Reglas de trabajo para la nueva instancia

- No borrar ni resetear cambios existentes sin autorización expresa.
- No usar `git reset --hard` ni `git checkout --` para limpiar el árbol.
- No subir capturas, logs, paquetes ni bases locales salvo petición expresa.
- No ejecutar `npm audit fix --force` sobre OpenWA: la dependencia estable arrastra paquetes antiguos y una corrección forzada puede cambiar la versión funcional.
- No desplegar en Vercel o Netlify en este escenario.
- No afirmar que WhatsApp crea pedidos automáticamente hasta que exista y se haya probado el agente de confirmación.
- Después de cada bloque comunicar: estado, pruebas, archivos modificados y si se ha publicado o no.

## Cierre de una tarea

Antes de entregar:

1. Revisar `git diff`.
2. Ejecutar pruebas automatizadas.
3. Probar el flujo real afectado.
4. Revisar consola, errores HTTP y responsive.
5. Mostrar evidencias visuales si se hizo una prueba visual.
6. Confirmar si queda solo local o si se publicó en el servidor propio.
7. Si se publica en producción, incrementar versión y guardar rollback.
