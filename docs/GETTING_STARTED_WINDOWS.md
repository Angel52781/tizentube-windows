# TizenTube Windows — prueba personal (v0.1.0-preview.13)

## Preview.15 — corrección de regresiones reportadas

- Retira el estilo nativo WS_THICKFRAME y la intervención en WM_NCCALCSIZE que podían producir una barra nativa clara y duplicada sobre el encabezado oscuro. Conserva las áreas de redimensionamiento implementadas mediante hit tests personalizados.
- La prueba CI inspecciona un píxel del **marco visible de la ventana en pantalla**, además del componente interno y la extensión real del cliente al maximizar; no basta con que el código de la barra dibuje colores correctos.
- SponsorBlock sincroniza la identidad del vídeo cada 1,5 segundos para cambios de URL de YouTube que no emiten eventos SPA habituales. También comprueba el tiempo de reproducción como respaldo si el listener de eventos está conectado a un elemento antiguo; evita repetir saltos mediante UUID.
- El botón **Protecciones** distingue activación, vídeo detectado, reproductor conectado, segmentos recibidos, fallos/límites de consulta y saltos realizados. **«Activo» no equivale a «segmentos detectados».**
- Para una prueba controlada de SponsorBlock, un vídeo con segmentos conocidos es https://www.youtube.com/watch?v=ifI_fwg55k8. La API devolvió segmentos de introducción [0,2.811777] y [24.182026,39.86125] en la comprobación del 25 de octubre de 2026; esos datos comunitarios pueden cambiar.
- Todavía falta comprobar visualmente las dos correcciones en una sesión física del usuario. No se autoriza release oficial solo por CI verde.

## Cambios de preview.14 (rama de pruebas, todavía sin release)

- **Actualizaciones**: botón nativo `Actualizar` en la parte superior; búsqueda automática silenciosa al iniciar. Solo consulta versiones publicadas en `Angel52781/tizentube-windows`. Solicita permiso antes de descargar, verifica `SHA256SUMS.txt` y el SHA-256 real, y puede reemplazar la carpeta portable `TizenTube-Windows-x64` tras cerrar la app. El ejecutable se actualiza desde una copia temporal independiente, conservando una carpeta de respaldo para revertir. Las preferencias y el perfil permanecen en `%LOCALAPPDATA%\TizenTube`. Un EXE suelto fuera de la carpeta portable abre la descarga oficial, sin sobrescribir otras carpetas.
- **Protecciones**: botón nativo `Protecciones` muestra el estado real de SponsorBlock, salto automático, cantidad de segmentos del vídeo y AdBlock. Permite abrir la configuración. Si la UI personalizada de YouTube no se monta, el cargador intenta igualmente consultar SponsorBlock y saltar segmentos.
- **Bordes de pantalla**: corrección de `WM_NCCALCSIZE` al maximizar o entrar en fullscreen para eliminar el borde invisible de `WS_THICKFRAME`. La validación de Windows mide que el rectángulo cliente maximizado coincida con el área de trabajo. La apariencia real en el equipo del usuario queda por verificar.
- **Limitaciones**: no se garantiza que todos los anuncios ni todos los segmentos comunitarios sean bloqueados; la API SponsorBlock y la estructura de YouTube pueden cambiar. El autoactualizador todavía necesita prueba de instalación/reemplazo en Windows antes de afirmar que funciona completamente. Este build **no** aparece en la búsqueda de actualizaciones hasta que exista una release oficial más reciente.

Este es un **prototipo de escritorio no oficial**, todavía en pruebas. Abre YouTube mediante Microsoft Edge WebView2 en una ventana propia; **no reproduce exactamente la interfaz de la aplicación Android/Chromecast**. La integración real de bloqueo de anuncios, SponsorBlock y DeArrow puede presentar fallos por cambios de YouTube. No se garantiza su funcionamiento en todos los vídeos.

## Instalación en Windows 10/11 (x64)

1. Descarga `TizenTube-Windows-x64-v0.1.0-preview.13.zip` desde la sección **Assets** de la release de GitHub.
2. Haz clic derecho en el ZIP y elige **Extraer todo**. Es importante extraerlo: no ejecutes el `.exe` directamente dentro del ZIP.
3. Abre la carpeta `TizenTube-Windows-x64` y haz doble clic en **`TizenTubeHost.exe`**. Es el programa real, compilado en Windows con .NET 8 y WebView2. Desde preview.6 lleva AdBlock, SponsorBlock, DeArrow y el CSS dentro del propio EXE; incluso funciona sin `app`.
4. Si Windows SmartScreen avisa que la aplicación no tiene un editor reconocido, se debe a que este prototipo no está firmado digitalmente. Ejecuta únicamente el ZIP descargado de la release oficial del repositorio del proyecto y verifica el SHA-256 publicado antes de decidir si confiar en el archivo.
5. La versión portable incluye el runtime .NET necesario; requiere **Microsoft Edge WebView2 Runtime** instalado (habitual en Windows 11). Si falta, instálalo desde [Microsoft WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/).

No requiere permisos de administrador ni un instalador tradicional para extraer y usar el ZIP. Puedes crear manualmente un acceso directo a `TizenTubeHost.exe` en el escritorio.

## Primeras pruebas

### Probar la interfaz original de televisión (experimental)

La versión de Windows se inicia normalmente en **YouTube de escritorio**. Para contrastar la interfaz de TizenTube Cobalt/Chromecast, abre PowerShell dentro de la carpeta extraída y ejecuta `.\TizenTubeHost.exe --tv`. Esto solicita YouTube TV con un perfil separado de WebView2; el inicio de sesión y algunas funciones pueden no estar soportados. **No se ha probado todavía la reproducción completa del modo TV.** El modo es experimental y no modifica tu perfil habitual.

### Identificar un anuncio que todavía atraviesa el filtro

Si vuelve a aparecer una tarjeta «Patrocinado», haz **clic derecho en YouTube → `TizenTube: diagnosticar anuncios`**. También puedes utilizar `Ctrl+Shift+F10` o iniciar `TizenTubeHost.exe --diagnose-ads`. Guarda el archivo local `adblock-diagnostic.json`, que contiene estructuras de elementos y etiquetas publicitarias sin cookies, títulos, comentarios ni credenciales. El propietario decide si desea compartirlo.

- Comprueba que carga YouTube, busca un vídeo, inicia la reproducción, pausa, avanza, cambia volumen, ajusta velocidad y utiliza pantalla completa.
- Comprueba SponsorBlock con un vídeo que tenga segmentos comunitarios y DeArrow con uno que tenga título/miniatura alternativos. Revisa los interruptores de ajustes.
- Si aparecen anuncios, indica en qué vídeo ocurrió. **No asumimos que el bloqueador sea infalible**.
- Prueba cerrar y reabrir la aplicación; comprueba si recuerda los ajustes. El inicio de sesión con Google puede estar bloqueado por las políticas para navegadores integrados.

## Informar fallos

Anota la versión (`v0.1.0-preview.7`), edición de Windows, el enlace del vídeo, qué hiciste, qué esperabas y qué ocurrió. Para evaluar nitidez incluye resolución y escalado de Windows (100 %, 125 %, 150 %, etc.), si usas varios monitores y una captura de los comentarios borrosos sin datos privados. Puedes abrir un issue en [GitHub](https://github.com/Angel52781/tizentube-windows/issues) o describir el fallo directamente al equipo de desarrollo.

## Estado de validación

Esta versión se publica **solo para pruebas voluntarias**. La compilación y los tests automatizados de Windows pueden comprobar que el host arranca, pero no reemplazan una evaluación prolongada de YouTube, compatibilidad audiovisual ni mediciones integrales de RAM y CPU en tu equipo. El programa es software libre GPL-3.0; consulta `LICENSE` y el código fuente público.
