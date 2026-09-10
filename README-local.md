# Exclusivas Inteligentes

CRM self-hosted de producción para una distribuidora de bebidas.

## Inicio

El miniPC ejecuta el CRM mediante un runner de GitHub Actions self-hosted y la tarea persistente de Windows `ExclusivasInteligentes\CRM self-hosted`.

### Mover a otro equipo

1. Instala Node.js 22 o superior en el nuevo equipo.
2. Configura las variables fuera de Git en `.env.local`.
3. Ejecuta `scripts\install-production-task.ps1` como administrador.
4. Configura el runner self-hosted fuera del directorio del proyecto.

El proyecto no usa SQLite local en producción. La base de datos es Turso y las credenciales permanecen en `.env.local`, fuera del control de versiones.

Usuarios iniciales:

- Luis / `Temporal2026` — administrador
- Jose / `Temporal2026` — usuario

## Producción en miniPC

- Proyecto persistente: `C:\Users\luism\Desktop\exclusivas-inteligentes`
- Runner: `C:\Users\luism\actions-runner\exclusivas-inteligentes`
- Servicio/tarea: `ExclusivasInteligentes\CRM self-hosted`
- Puerto: `3000`
- URL local: `http://127.0.0.1:3000`
- URL pública: `https://crm.desarrolladormadrid.com`
- Entorno: `C:\Users\luism\Desktop\exclusivas-inteligentes\.env.local`
- Base de datos: Turso remoto, configurada mediante `.env.local`
- Logs del self-hosted: `C:\ProgramData\ExclusivasInteligentes\logs`
- Sesiones de WhatsApp: `C:\Users\luism\Desktop\exclusivas-inteligentes\whatsapp-gateway\sessions`
- Copias: `C:\Users\luism\Desktop\exclusivas-inteligentes\backups` o la ruta configurada por el servicio
- Reinicio CRM: `Start-ScheduledTask -TaskName 'ExclusivasInteligentes\\CRM self-hosted'`
- Runner GitHub: `minipc-exclusivas-inteligentes` con etiqueta `exclusivas-inteligentes`
- Instalación inicial: PowerShell administrador ejecutando `scripts\install-minipc-services.ps1`

El gateway de WhatsApp es independiente y no se reinicia en despliegues del CRM.

## Asistente

Desde ⚙ se configura el proveedor, modelo, endpoint y API key. La clave se guarda en las preferencias locales del equipo; no se incluye en el código fuente.

## Rutas y copias

En `Rutas` se seleccionan los envíos geolocalizados de una fecha, se ordenan por proximidad con un radio operativo de 150 metros y se puede abrir el recorrido en Google Maps. Cada cliente puede tener varias direcciones en `Lugares de recogida`.

En `Copias de seguridad` se puede crear y descargar un snapshot, consultar su histórico y restaurarlo con confirmación explícita. En producción la tarea automática se ejecuta una vez al día por la limitación del plan Hobby de Vercel.
