# Criterios de producto y UX de Excluvas Inteligentes

## Regla obligatoria de despliegue

- Para esta instalación prevalece el servidor propio del miniPC y el repositorio `desarrolladormadrid2/exclusivas-inteligentes`. El workflow `.github/workflows/deploy-main.yml` despliega automáticamente después de un `push` autorizado a `main`; no usar Vercel ni Netlify.
- El runner self-hosted debe ejecutar `npm ci`, `npm test`, `npm run build`, validar la versión, copiar sin tocar datos persistentes, reiniciar solo la aplicación y comprobar `/`, `/api/clients` y `/api/products`.

- La regla histórica de Vercel solo se conserva como referencia antigua y queda anulada para esta instalación del servidor propio.
- La URL de producción de referencia es `https://exclusivas-inteligentes.vercel.app`.
- No utilizar Sites de Codex ni generar una URL alternativa de Sites para un despliegue de este proyecto, salvo que el usuario lo solicite expresamente.
- Cada nuevo despliegue de producción debe incrementar la versión del proyecto. El incremento debe reflejarse de forma coherente en `package.json`, en la versión visible de la aplicación y en cualquier otra referencia equivalente. Los despliegues de prueba que no se publiquen en producción no requieren un incremento.

Estas reglas recogen las decisiones de diseño y funcionamiento acordadas con el usuario. Deben aplicarse a toda la aplicación, no solo a una sección.

## Excepción explícita: servidor propio y traspaso a otro OpenCode

- Si el usuario indica expresamente que esta instalación debe ejecutarse en un servidor propio o en otro ordenador, esa instrucción prevalece sobre el destino Vercel indicado arriba para ese despliegue concreto.
- En ese escenario no desplegar en Vercel ni Netlify salvo petición posterior y explícita. Usar `server-selfhost.mjs`, `OPENCODE-HANDOFF.md` y el proceso persistente del servidor.
- No crear un proyecto vacío si la ruta del repositorio no existe. Clonar o hacer accesible el repositorio real antes de continuar.
- Leer `OPENCODE-HANDOFF.md` para las rutas, variables, endpoints, comandos de arranque y reglas de OpenWA.
- El entorno objetivo es un miniPC con servidor propio y OpenCode abierto de forma permanente. OpenCode puede revisar la aplicación, ejecutar pruebas y desplegar en ese servidor; la conexión de WhatsApp debe mantenerse como proceso persistente independiente y no depender de la ventana de OpenCode.
- La siguiente ampliación prevista es integrar el agente de WhatsApp con interpretación de texto/audio y creación segura de borradores de pedidos. No implementar confirmaciones automáticas destructivas sin pruebas y confirmación del usuario.

## Directriz prioritaria: evidencias visuales visibles en el chat

- Cada vez que se realice una prueba visual, se descubra un error, aparezca un estado incorrecto o se compruebe un resultado, hay que guardar una captura y mostrarla inmediatamente como imagen renderizada dentro del chat.
- La imagen debe verse directamente en el mensaje mediante el mecanismo de imagen disponible en el entorno (imagen adjunta/renderizada o Markdown de imagen con ruta absoluta). No basta con escribir la ruta, enlazar el archivo, mencionar su nombre, decir que se ha guardado o esperar que el usuario vaya a buscarla.
- Esta obligación aplica por separado a: pruebas correctas, errores o problemas descubiertos, comprobaciones locales, comprobaciones de producción y resultado final.
- Si la imagen no puede renderizarse directamente en el chat, la prueba visual no se considera comunicada ni cerrada. Hay que indicarlo como bloqueo y no presentar esa evidencia como realizada.

## Principios visuales

- Priorizar los listados y la información operativa; las cabeceras deben ser simples, compactas y no ocupar espacio innecesario.
- Aprovechar el ancho disponible: título, contexto, filtros y acciones deben compartir una sola fila cuando quepan; evitar filas vacías y saltos innecesarios en todas las secciones.
- Mantener una interfaz profesional, sobria, cuadrada y homogénea: sin bordes redondeados, sin efectos llamativos y con controles alineados.
- Usar el rojo corporativo para acciones principales y estados de atención; usar verde para correcto/completado y naranja para avisos o estados próximos al mínimo.
- No mezclar alineaciones sin motivo: etiquetas, datos y acciones deben seguir una retícula clara, preferentemente alineada a la izquierda.
- Eliminar duplicidades: si existe un botón principal de crear, no repetir debajo una acción equivalente.
- Los nombres deben describir la acción real: “Crear pedido”, “Crear cliente”, “Crear nota”, etc.; evitar textos genéricos como “Crear registro”.
- Las fechas visibles se muestran en formato español `dd/mm/aaaa` y, cuando proceda, con hora.
- Los campos obligatorios se marcan con asterisco rojo. Los campos no obligatorios no deben parecer obligatorios.

## Formularios, modales y tablas

- Unificar todas las creaciones y ediciones en modales coherentes, con título específico, campos bien agrupados y botón de guardar abajo a la derecha.
- En modales largas, bloquear el scroll de la página de fondo y permitir el scroll dentro de la modal; cerrar al pulsar fuera cuando no haya cambios sin guardar.
- Las tablas anchas de una modal solo pueden imponer un `min-width` en escritorio. En tablet y móvil deben tener una adaptación explícita (tarjetas, columnas apiladas o scroll interno justificado); nunca se debe aceptar un scroll horizontal accidental que oculte campos o acciones.
- Una modal debe aprovechar su anchura real: no puede conservar huecos grandes, contenido desplazado fuera de la pantalla ni una zona vacía causada por reglas de escritorio heredadas. La comprobación debe hacerse con la modal abierta, no solo mirando la pantalla anterior.
- En formularios largos usar acordeones para datos generales y mostrar en la cabecera un resumen y un indicador de completitud.
- Los pedidos, presupuestos, facturas y albaranes deben admitir líneas de productos claras, con buscador, tipo de unidad, cantidad, unidades totales y suma visible.
- Los selectores de clientes y productos deben permitir búsqueda incremental y borrar la selección correctamente.
- Las tablas deben ofrecer búsqueda en columnas principales, contadores de registros, columnas configurables y ordenación al pulsar en cabeceras cuando sea aplicable.
- Los listados deben priorizar información visible: texto de datos mínimo de 12 px, padding vertical moderado y filas compactas, manteniendo salto de línea, contraste y objetivos táctiles suficientes. La densidad debe verificarse en más de un listado representativo y en tablet.
- La edición inline solo debe afectar a la fila seleccionada, nunca a todas las filas.
- Al cargar datos mostrar un loading real; no mostrar “no hay registros” hasta recibir respuesta.
- Al abrir un registro desde una tarjeta, notificación o listado, abrir el detalle en modal sin cambiar la sección que queda detrás.
- La impresión o descarga PDF de cualquier nota de carga o documento debe mostrar el contenido del documento activo, no la pantalla vacía ni la interfaz del CRM. La prueba debe abrir la modal, activar impresión, comprobar que el documento sigue visible y validar que el PDF generado no está vacío.

## Pedidos, almacén y stock

- El pedido nuevo empieza en estado “Nuevo” y el código se autogenera.
- Los campos esenciales del pedido son cliente, lugar de envío y fechas necesarias; el usuario solicitante se rellena automáticamente con el usuario actual.
- El lugar de envío se selecciona entre las ubicaciones del cliente y debe poder crearse una nueva ubicación desde el pedido.
- La preparación usa hojas de carga y debe ser la fuente común de los contadores y acordeones del inicio.
- Preparación de pedidos debe mostrar por defecto el día seleccionado/hoy, con tarjetas tipo comanda y estados claros: pendiente, en preparación, completado y con incidencia.
- Las líneas de preparación muestran producto, ubicación de almacén destacada, tipo de unidad, cantidad solicitada, cantidad preparada editable y estado.
- Si la cantidad preparada coincide con la solicitada, la línea es “Completo”; si es menor, “Incompleto” y debe poder registrar incidencia con producto y unidades faltantes.
- Las incidencias deben crear nota y notificación, incluir fecha, cliente, dirección de envío y persona que la registra, y permitir resolver/autorizarlas desde su detalle.
- Stock debe distinguir claramente: stock en almacén, requerido por pedidos, saldo para cubrir pedidos, stock mínimo y estado. Los saldos negativos se muestran en rojo solo en el número; estado al final, antes de acciones.
- El estado de stock debe poder ordenarse y priorizar “Sin stock”, seguido de “Bajo mínimo” y después “Disponible”.
- Las ubicaciones de producto siguen la nomenclatura letra-número, por ejemplo `B-126`, y las notas de carga se ordenan por ubicación.
- En una nota de carga la ubicación de picking es editable para corregir errores del almacén; el cambio se valida con formato letra-número, se guarda en la ficha del producto y deja historial con usuario, fecha y origen “Nota de carga”. Debe mostrarse como columna independiente y sin badges decorativos que oculten el dato.
- Los cambios operativos editables en una nota de carga deben agruparse en un único botón rojo “Guardar cambios” abajo a la derecha, con estado visible de “Guardando…”; no depender de guardar por fila ni únicamente al perder el foco.
- Las direcciones de clientes y ubicaciones de entrega deben abrir Google Maps: con coordenadas se ofrece mapa y navegación; sin coordenadas se busca usando dirección completa, ciudad y nombre disponible, nunca una consulta genérica como “España”. En móvil y tablet el enlace debe poder abrir la aplicación de mapas del dispositivo.
- En la nota de carga la dirección y ciudad de entrega deben poder corregirse antes del reparto. Guardar debe actualizar el envío, el pedido y la ubicación de entrega vinculada; la ficha maestra del cliente solo se actualiza con una casilla de confirmación explícita. Tras guardar, la dirección visible, el enlace de Google Maps y el documento imprimible deben usar el dato nuevo, y el cambio debe quedar auditado con usuario y fecha.

## Coherencia de datos

- Un mismo concepto debe usar la misma fuente en todas las secciones. En particular, el inicio y Preparación de pedidos deben coincidir en número, fechas y estados.
- No presentar datos de prueba, objetos JavaScript (`[object Object]`) o valores vacíos como si fueran información real.
- Las relaciones visibles para personas (cliente, proveedor, proveedor principal, producto, almacén, pedido y documentos relacionados) deben mostrar nombre o código legible; los IDs numéricos quedan solo para lógica interna, búsquedas o auditoría técnica.
- Los documentos deben mostrar sus líneas, cantidades, importes, base imponible, IVA y total cuando corresponda.
- Las acciones deben respetar el flujo: un pedido puede editarse mientras no esté enviado; una incidencia debe dejar trazabilidad de la resolución.

## Archivos e imágenes externas

- Las imágenes de productos, incidencias y documentos deben alojarse preferentemente en Cloudinary y guardar en la base de datos solo la URL segura, el `public_id`, nombre y MIME cuando exista integración configurada.
- Las imágenes antiguas almacenadas como Base64 deben seguir siendo legibles durante la migración; no borrar el contenido anterior hasta comprobar la URL nueva y la recuperación desde el detalle.
- Las credenciales de Cloudinary (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` y, si procede, `CLOUDINARY_UPLOAD_PRESET`) solo viven en `.env.local` ignorado por Git y en las variables de entorno de Vercel. Nunca deben escribirse en este archivo, en documentación pública, en el navegador ni en commits.
- El `API Secret` solo puede utilizarse en el servidor para firmar subidas o transformaciones. Si se usa un preset sin firma, debe limitarse a la carpeta y tipos de recurso permitidos.
- Las pruebas deben comprobar subida, URL accesible, imagen visible en CRM y web cuando corresponda, error de configuración sin bloqueo de la ficha y compatibilidad con el fallback Base64.

## Asistente

- El asistente solo debe afirmar que puede ejecutar una operación si existe un ejecutor real para ella.
- Debe entender lenguaje natural, consultar primero los datos necesarios, usar nombres visibles en vez de pedir IDs al usuario y pedir confirmación antes de acciones sensibles.
- Sus respuestas deben ser claras y centradas en el CRM; no inventar conversaciones, nombres, estados ni capacidades.
- Si no puede realizar algo, debe explicar el motivo concreto y ofrecer el siguiente paso útil.

## Responsive y tablet

- El responsive móvil y tablet es prioritario: el sidebar debe seguir siendo accesible, el contenido no puede quedar cortado y las modales deben poder desplazarse internamente.
- Al abrir el menú tablet debe mostrarse en modo compacto: solo se expande el acordeón de la sección activa (o ninguno si está en Inicio), el panel debe caber sin una barra vertical innecesaria y nunca debe aparecer scroll horizontal. Si el usuario abre más contenido del que cabe, el desplazamiento será interno, discreto y no alterará el ancho del diseño.
- En cualquier viewport no escritorio, incluido móvil horizontal, el número de versión debe permanecer dentro del menú de hamburguesa y ocultarse cuando el menú está cerrado; nunca debe aparecer flotando bajo la cabecera.
- “Pedido desde tablet” debe compartir campos, validaciones y comportamiento con “Nuevo pedido”, adaptado a una experiencia de ruta comercial.
- En tablet, los datos generales del pedido deben poder colapsarse para dejar visible y cómoda la lista de productos.
- La creación de líneas debe tener una maquetación estable en tablet, sin solapamientos ni campos huérfanos.
- La nota de carga debe probarse abierta con varias líneas en móvil y tablet: todas las ubicaciones, productos, cantidades, estados y acciones deben quedar visibles y utilizables sin scroll horizontal; en móvil las líneas pueden convertirse en tarjetas compactas.
- La auditoría de tablet de Logística y almacén debe recorrer siempre Productos, Stock, Almacenes, Preparación de pedidos, Lugares de recogida, Rutas, Entradas, Salidas y Devoluciones. Los listados deben priorizar por defecto los datos operativos y reservar la información secundaria para el detalle o “Columnas visibles”; no aceptar tarjetas interminables con todas las columnas maestras.
- La ficha/modal de una entrada de mercancía también debe probarse abierta con varias líneas e incidencias en tablet: el encabezado del modal nunca puede quedar oculto bajo la cabecera del CRM, cada línea debe conservar separación vertical entre producto, cantidades, resultado y validación de ubicación, y las tarjetas de lectura opcional no pueden solaparse entre sí. En tablet se acepta desplazamiento vertical interno, pero nunca contenido superpuesto, cortado o scroll horizontal.

## Verificación y despliegue

- Después de cada cambio relevante ejecutar `npm test` y comprobar carga, consola e interacciones principales cuando sea posible.
- Política de despliegues: no desplegar después de cada cambio aislado. Trabajar, probar y revisar primero en local, agrupar normalmente tres o cuatro cambios relacionados en un bloque coherente y hacer un único despliegue de ese bloque. Solo desplegar antes si el usuario lo indica expresamente o si existe una incidencia urgente que requiera corrección inmediata en producción.
- Antes de publicar un bloque, revisar el diff completo, ejecutar las pruebas automatizadas y realizar las comprobaciones visuales y funcionales locales que correspondan. No gastar despliegues para probar ajustes intermedios que todavía estén en revisión.
- Protocolo obligatorio de cierre para cualquier cambio entregable: (1) implementar el arreglo, (2) ejecutar las pruebas automatizadas, (3) recorrer con Playwright la interacción real de principio a fin, (4) guardar capturas de las pruebas relevantes y mostrarlas explícitamente en el chat, incluyendo una captura de cualquier estado incorrecto, fallo visual o problema descubierto, (5) guardar una captura que demuestre el resultado funcional y mostrarla explícitamente en el chat, (6) desplegar en producción, (7) comprobar de nuevo la URL estable, endpoints y flujo afectado en producción, y (8) guardar una segunda captura de la comprobación en producción y mostrarla explícitamente en el chat. DIRECTRIZ OBLIGATORIA DE IMÁGENES: cada captura generada durante una prueba, cada fallo o problema descubierto y cada resultado final debe insertarse como imagen renderizada dentro del mensaje del chat mediante el mecanismo de imagen del entorno (por ejemplo, una imagen adjunta/renderizada o Markdown de imagen con ruta absoluta). Es obligatorio hacerlo en el mismo mensaje en que se informa de esa evidencia. Una ruta escrita, un enlace descargable, un nombre de archivo o la frase “captura guardada” sin la imagen visible no cuenta y debe considerarse incumplimiento del protocolo. No declarar una tarea terminada si falta cualquiera de estos pasos; indicar expresamente qué paso queda pendiente.
- Antes de desplegar comprobar que la información mostrada coincide entre secciones y que no hay estados de carga engañosos.
- Publicar los cambios agrupados cuando Vercel permita el despliegue; si el límite diario bloquea Vercel, dejar el código probado localmente y comunicarlo claramente.
- Después de cada cambio comunicar claramente su estado: “solo en local”, “desplegado en producción” o “pendiente de despliegue”. Si está en producción, incluir la URL estable y las comprobaciones realizadas.

## Revisión proactiva antes de entregar cambios

La revisión debe evaluar dos cosas por separado: que la funcionalidad sea técnicamente correcta y que una persona real pueda usarla cómodamente. No se considera terminado un cambio que funciona en código pero obliga a adivinar, leer textos cortados, desplazarse innecesariamente, repetir datos o entender estados ambiguos.

Antes de dar por terminada una sección o una mejora, revisar también estos puntos aunque el usuario no los mencione expresamente:

- Detectar y eliminar títulos, subtítulos, paneles, filtros o acciones duplicadas que expresen lo mismo. La cabecera debe ser compacta y el contenido operativo debe tener prioridad.
- Optimizar el espacio de cada cabecera: si un texto repite el valor que ya muestran un selector, una fecha o un botón (por ejemplo, “Hoy · fecha”), eliminar la repetición y colocar los controles en una única línea compacta y bien alineada.
- Revisar siempre la densidad visual antes de entregar una vista: aprovechar el ancho disponible, reducir alturas vacías y reservar el espacio principal para listados, tarjetas y acciones de trabajo.
- Comprobar que al plegar un sidebar, acordeón o panel el espacio liberado lo ocupa realmente el contenido; nunca debe quedar una franja vacía ni mantenerse un margen antiguo.
- Revisar todas las vistas en escritorio, tablet horizontal, tablet vertical y móvil. No basta con que el contenido quepa: debe poder usarse, leerse y desplazarse sin solapamientos ni recortes.
- Para cada modal que contenga tablas, listas densas o documentos, repetir la prueba con la modal realmente abierta en al menos `1440×900`, `768×1024`, `812×375` y `441×820`. Medir el contenedor y su contenido: un overflow horizontal inesperado o un hueco visual grande es un fallo aunque la ruta y el build pasen.
- No dar por válida una corrección responsive porque la vista principal cargue: hay que recorrer la acción que abre el detalle, modal o documento afectado y revisar el estado final en captura. Las reglas de escritorio con `min-width`, `width`, `height` u `overflow` deben tener una revisión específica en cada breakpoint.
- En tablet, abrir el menú con el icono de hamburguesa y comprobar visualmente que no aparece una barra de scroll innecesaria; verificar también el caso con varias secciones abiertas y que el desplazamiento, si resulta imprescindible, se mantiene dentro del panel sin scroll horizontal.
- Repetir la comprobación del menú en móvil horizontal: pie de versión oculto con el menú cerrado y como último elemento del panel cuando se abre.
- Verificar que las tarjetas, tablas, modales, notas y mensajes largos hacen salto de línea y que las acciones importantes siguen visibles.
- En cada listado, revisar la barra de herramientas completa y no solo la tabla: búsqueda y contador deben formar el primer bloque; las vistas guardadas y filtros deben quedar alineados en una fila secundaria coherente, sin una columna aislada de “Vistas”, controles huérfanos, huecos verticales grandes ni saltos causados por anchos mínimos heredados. Repetir esta comprobación al menos en `1440×900`, `1024×768`, `768×1024`, `812×375` y `441×820`.
- Comprobar que cada botón, enlace, notificación y tarjeta abre el detalle correcto sin cambiar innecesariamente de sección ni perder el contexto.
- Revisar que los nombres de títulos, botones, estados, columnas y campos describen exactamente la acción o el dato real; evitar textos genéricos, ambiguos o redundantes.
- Validar la semántica de los datos: unidades, cantidades, importes, fechas, estados, stock, reservas e incidencias deben ser comprensibles y coherentes entre listados, detalles y panel de inicio.
- En cada listado con relaciones, revisar explícitamente que las columnas de nombres no muestran IDs crudos. Comprobar al menos proveedor principal en Productos y cliente/proveedor en documentos, incluyendo registros con relación válida y sin relación.
- Probar los enlaces de mapa desde el detalle de un pedido y una nota de carga, tanto con coordenadas como sin ellas: comprobar que el `href` apunta a Google Maps y contiene las coordenadas o la dirección completa visible, y que no se abre un mapa genérico.
- Cada cliente puede tener varias direcciones de entrega mediante `Lugares de recogida`; probar alta, edición, selección en pedido, geolocalización y persistencia sin sobrescribir la dirección fiscal.
- La planificación de rutas debe permitir seleccionar varios envíos, exigir coordenadas válidas, usar un radio visible por defecto de 150 metros, ordenar las paradas y abrir una navegación completa en Google Maps.
- Los clientes y sus lugares de entrega deben admitir hora de apertura y cierre opcionales; la preparación debe permitir ajustar la franja concreta del envío y las rutas deben priorizar las paradas con apertura más temprana, usando la distancia para desempatar.
- El mapa integrado debe mostrar estado vacío, ubicación geolocalizada, radio operativo, nombres legibles y comportamiento correcto en las cuatro resoluciones responsive; no aceptar un iframe recortado, genérico o con scroll innecesario.
- Las copias de seguridad deben tener histórico, fecha, tamaño, tablas incluidas, descarga y restauración con confirmación explícita; probar también una copia inválida y conservar acceso de usuarios e historial al restaurar.
- Las tareas automáticas deben ejecutar una copia real y registrar resultado, fecha y error; comprobar la limitación del proveedor de hosting y documentar la frecuencia efectiva.
- En Pedidos debe existir un control visible y sencillo de facturación con al menos los estados “Sin facturar” y “Facturados”. La prevención de duplicados debe apoyarse en la relación persistente pedido–factura, también cuando la factura agrupa varios pedidos del mismo cliente.
- La revisión mensual debe poder partir del listado de Pedidos filtrando por “Sin facturar”; no se considera suficiente bloquear duplicados si no se puede localizar rápidamente lo pendiente de facturar.
- Buscar valores imposibles o engañosos antes de mostrar la interfaz, como `NaN`, `[object Object]`, ceros por defecto que no significan nada, fechas en formato incorrecto o registros vacíos presentados como resultado definitivo.
- En cualquier carga asíncrona mostrar un estado de carga claro y no mostrar “sin registros” hasta recibir una respuesta válida. Las acciones rápidas no deben bloquear toda la pantalla si no es necesario.
- Comprobar que los controles tienen un comportamiento evidente: búsquedas incrementales, borrado de selección, ordenación desde cabeceras, filtros persistentes cuando proceda y botones activos claramente diferenciados.
- Revisar que los estados visuales usan una convención única: rojo para atención o error, naranja para aviso, verde para correcto y gris para neutral; no usar colores que parezcan error para acciones normales.
- Probar recorridos completos y no solo pantallas aisladas: crear, abrir, editar, guardar, cancelar, eliminar/restaurar, filtrar, descargar y resolver incidencias cuando existan.
- En cada recorrido, comprobar la experiencia de la persona usuaria: identificar claramente qué pantalla está viendo, qué acción puede realizar, qué campos son necesarios, qué resultado se ha producido y cuál es el siguiente paso. Los controles deben ser cómodos para ratón, teclado y tacto, con objetivos táctiles suficientes y sin exigir precisión innecesaria.
- Hacer una revisión visual deliberada después de cada cambio: comprobar jerarquía, legibilidad, contraste, espaciado, alineación, densidad, textos completos, estados vacíos/cargando/error, foco y feedback tras pulsar. Si algo parece confuso, cortado, redundante o incómodo, corregirlo antes de entregar aunque la prueba automática pase.
- En esa revisión buscar expresamente cuatro defectos que las pruebas funcionales suelen no detectar: scroll horizontal no solicitado, contenido cortado, huecos sin función y controles fuera del área visible. Revisar la primera, una intermedia y la última línea cuando el listado tenga varias filas.
- Validar la tarea desde la perspectiva del usuario final y del rol que la ejecuta: una persona de almacén debe poder preparar un pedido rápidamente; administración debe poder revisar y resolver incidencias; un comercial debe poder crear pedidos sin entender IDs técnicos. Priorizar siempre claridad y velocidad operativa.
- Probar también el peor caso razonable: muchos registros, nombres largos, varias líneas de producto, incidencias, datos faltantes, pantalla estrecha, teclado virtual y respuestas lentas. La interfaz debe conservar el contexto y seguir siendo utilizable.
- En cada revisión visual de listados comprobar simultáneamente legibilidad y densidad: no aceptar filas con demasiado espacio vacío ni reducir tanto la altura que se pierdan textos, estados o acciones.
- Los textos largos nunca pueden invadir otra columna ni quedar cortados: en tablet usar salto de línea dentro de tarjetas, `overflow-wrap:anywhere` y acciones en bloque independiente; si una tabla no mantiene columnas legibles, convertirla en tarjetas o mostrar etiquetas por campo. Probar nombres, emails, referencias, notas y estados largos.
- En filtros de periodo y formularios operativos de tablet, agrupar primero los campos de entrada en una línea y colocar debajo el grupo de botones; no intercalar inputs y acciones si dificulta la lectura, el tacto o la identificación del flujo.
- Si una acción puede fallar por datos o configuración, mostrar un mensaje útil dentro de la interfaz y conservar el contexto; no depender de `alert()` del navegador ni dejar botones que parezcan no hacer nada.
- Revisar el ciclo de vida completo de avisos y notificaciones: deben distinguir pendientes de leídas, desaparecer de la bandeja al leerse sin borrarse del historial, permitir marcar una individual o todas, y abrir siempre el registro contextual correcto.
- Evitar acumulaciones infinitas de elementos temporales: definir siempre qué ocurre al leer, completar, resolver, archivar o eliminar un aviso y reflejar ese estado en contadores y filtros.
- Comparar siempre secciones relacionadas después de un cambio. En especial, los contadores y estados del inicio deben coincidir con Preparación de pedidos, Pedidos, Stock, Notas y Notificaciones.
- Probar siempre el destino final de cada interacción, no solo el cambio de sección: una notificación de pedido debe abrir directamente el pedido concreto en su modal; una de incidencia debe abrir su detalle y acciones, sin llevar innecesariamente al listado.
- Cuando el usuario autorice pruebas funcionales completas, se pueden crear registros de prueba en el entorno indicado como parte normal de la verificación, sin solicitar permiso adicional para cada paso. La prueba debe recorrer la interacción real de principio a fin y guardar una captura de evidencia del resultado, no solo comprobar que la página carga.
