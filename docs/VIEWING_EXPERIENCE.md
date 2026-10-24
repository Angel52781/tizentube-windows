# Experiencia de reproducción — v0.1.0-preview.11

## Corrección basada en pruebas físicas (preview.11)

Tras preview.10, el vídeo del reproductor flotante quedaba negro, el botón PiP no aparecía entre subtítulos y configuración, y modo cine perdía su preferencia tras cerrar la aplicación. La revisión de `ViewingExperience` en WebView2 real mostró que el módulo existía pero `mounted=false`: la inicialización estaba acoplada a una interfaz opcional y a un evento de `DOMContentLoaded` que a veces ya había ocurrido. Se independizó el montaje, se añadieron reintentos acotados y una prueba de recuperación.

En modo flotante, el player de YouTube se mueve temporalmente al `body` para salir de los ancestros transformados/recortados, usando el mismo vídeo y perfil. Se restaura a su ubicación al volver; no se abre un stream duplicado. Una prueba física validó imagen real y progreso de 16 a 19 segundos, no solo que una ventana tuviera dimensiones correctas.

Los controles de YouTube ahora anidan el nuevo botón en el grupo `.ytp-right-controls-left`, *directamente* entre `.ytp-subtitles-button` y `.ytp-settings-button`. La comprobación física confirmó posiciones consecutivas de 48 píxeles.

La preferencia de modo cine se guarda solo tras interacción real del usuario y en `%LOCALAPPDATA%/TizenTube/theater-preference.json` además del almacenamiento web. En reinicios posteriores, se restaura usando la transición de YouTube mediante un clic al botón original **solo si hit-testing confirma que el botón es visible y está debajo del puntero**. No se manipula el atributo `theater` directamente ni se usa un clic durante carga temprana: ambos enfoques produjeron problemas de vídeo o pantalla completa. En la prueba final de Windows se observó `theater=true`, imagen visible, `fullscreen=false` tras 11 y 23 segundos de reinicio. Los ensayos locales de vídeo no contienen tokens ni cookies exportados.

## Reparación del atajo en el sistema operativo (preview.10)

La prueba en el Windows físico del usuario demostró que `WebView2.KeyDown` **no recibe Ctrl+Shift+P antes que el diálogo de impresión**; la medición devolvió `floatingAcceleratorHandled=0` y apareció la ventana «Impresión de Windows». El test anterior solo verificaba las dimensiones del PiP, no la pulsación de tecla. En preview.10 se registra `Ctrl+Shift+P` con `RegisterHotKey`/`WM_HOTKEY` de Win32 mientras la aplicación es la ventana activa. Se libera al desactivar/cerrar TizenTube para evitar capturar combinaciones en otras aplicaciones. Se incluye un escenario en Windows CI que envía la tecla real y exige `floatingHotKeyWindowsTriggered >= 1` antes de permitir publicar.

## Reparación tras reproducción física (preview.9)

El usuario reprodujo dos fallos reales de preview.8: `Ctrl+Shift+P` abría el diálogo de impresión de WebView2 y la primera selección del modo cine no persistía tras reiniciar. El modo cine fallaba porque `syncTheaterMode()` retornaba cuando la preferencia aún era `null`, dejando `isNavigating=true` y bloqueando el observador. Ahora se restablece el seguimiento y se escucha la selección manual sobre el botón original, sin regrabar el estado durante restauraciones automáticas. Se añadieron regresiones para cambiar a cine y volver al modo normal.

La ventana se restaura con un estado **independiente de Google/YouTube** en `%LOCALAPPDATA%/TizenTube/window-placement.json`: tamaño, posición y maximización normales. Se excluyen estados minimizados, flotantes y pantalla completa. CI valida la persistencia con dos arranques independientes del host. El archivo no contiene credenciales.

Los atajos `Ctrl+Shift+P` y `F9` ahora se procesan en el control WinForms de WebView2 antes de su comportamiento de impresión, sin depender de `keydown` dentro de YouTube. El botón de reproductor flotante sigue disponible. La comprobación visual del diálogo de impresión debe hacerse sobre un vídeo real.

## Reproductor flotante nativo (nuevo en preview.8)

`preview.7` escondía el botón PiP cuando `document.pictureInPictureEnabled` era `false`, caso común en WebView2. Ese comportamiento impedía usar la función. Ahora se muestra siempre que exista el reproductor de YouTube en `/watch`. En el host Windows el botón envía IPC `window:toggle-floating`: el **mismo formulario y WebView2** pasan a una ventana compacta de aproximadamente 500 × 317 px, con `TopMost`, marco redimensionable y vídeo ocupando el área visible mediante CSS local. No se inicia un nuevo flujo, pestaña ni navegador, por lo que se conserva la sesión de Google, SponsorBlock y la posición del vídeo. `Ctrl+Shift+P`, el botón original o cerrar la ventana flotante restauran el estado del formulario principal. Fuera del host, el botón utiliza la API Picture-in-Picture de Chromium cuando está disponible.

**Limitación:** la ventana de TizenTube se convierte temporalmente en el reproductor flotante; se pueden usar otras aplicaciones de Windows, pero no navegar al mismo tiempo por TizenTube en otra ventana. Esta solución evita el coste y la fragilidad de un segundo WebView y no depende de `pictureInPictureEnabled`. El CI comprueba apertura, ventana superior y restauración del formulario; la visualización de un vídeo concreto debe probarse en un Windows de usuario.

## Resultado implementado

1. **Marco y barra de tareas:** `F11` alterna un modo inmersivo nativo WinForms que ocupa `Screen.Bounds`, encima de la barra de tareas, sin barra de título. Al volver, restaura posición, tamaño, maximización y estilo anteriores. Cuando el usuario activa pantalla completa en el reproductor de YouTube, **solo** `CoreWebView2.ContainsFullScreenElementChanged` decide el estado nativo: el IPC de JavaScript ya no compite con ese evento. `Esc` sale de pantalla completa del vídeo; `F11` sale del modo inmersivo manual.
2. **Modo cine:** se guarda `tizentube.theater.v1` en `localStorage` del perfil existente y se reaplica mediante el botón de tamaño de YouTube en vídeos siguientes. Se siguen cambios que el usuario haga en el control original. El observador se limita al atributo `theater`, sin escanear el DOM completo permanentemente.
3. **Reanudar último vídeo:** guarda únicamente `videoId`, segundo actual, duración y fecha (`tizentube.lastVideo.v1`). Persiste como máximo cada 8 segundos y en cambio de vídeo, cierre u ocultación. Solo se guardan vídeos de YouTube con duración finita, no anuncios, lives o vídeos terminados. Al arrancar de nuevo en la portada se intenta **una sola vez por sesión** abrir la URL `/watch?v=...&t=...s`; los enlaces externos y estados inválidos se rechazan. El último punto de reproducción permanece guardado hasta completar el vídeo, ver otro, o borrar los datos de la aplicación. Los datos no se envían a ningún servidor ajeno a YouTube y se almacenan localmente en el perfil WebView2.
4. **Imagen en imagen (PiP):** botón pequeño añadido a `.ytp-right-controls`, al lado de los botones de configuración del reproductor de YouTube. Usa `HTMLVideoElement.requestPictureInPicture()` y `document.exitPictureInPicture()`. **No crea una segunda instancia WebView2**, no emula un reproductor y no puede forzar PiP si el runtime o el vídeo lo prohíben.
5. **Rendimiento:** se reactivó la optimización nativa de throttling de Chromium en segundo plano; el recorte de working set se limita al proceso del host cuando está minimizado y ya no toca indiscriminadamente otras aplicaciones WebView2. Se mantienen límites de caché y la medición de uso real por procesos de la aplicación.

## Evidencia y límites

- Regresiones unitarias (`scripts/test_viewing_experience.js`, `scripts/test_ui_features.js`) para modo cine, vídeo y reanudación, PiP y eventos de fullscreen no duplicados.
- Pipeline Windows compila el `.exe` con recursos embebidos, prueba arranque, AdBlock y CSS; `--window-cycle-test` prueba que el host cubre el monitor y restaura exactamente el tamaño anterior. Los tests de proceso siguen midiendo CPU/memoria.
- Sin acceso actual a Remote Desktop Commander (dispositivo desconectado al desarrollar esta versión); se requiere verificación visual en el PC del usuario de la barra de tareas, la retención del modo cine, el PiP en un vídeo compatible y la reanudación tras reinicio. Las pruebas de Windows runner no sustituyen esa comprobación.
- El logo, rediseño general, firma Authenticode y resolver formatos futuros de publicidad no son objetivos de esta actualización.

## Verificación rápida en Windows

1. Pulsar `F11` en Inicio para ocultar completamente el marco y la barra de tareas; `F11` de nuevo debe restaurar la ventana al mismo tamaño/ubicación.
2. Abrir un vídeo, entrar a pantalla completa con YouTube (`F` o el botón), comprobar que se oculta la barra de tareas. Pulsar `Esc`: debe recuperarse la ventana sin minimizarla.
3. Activar modo cine en YouTube, abrir otro vídeo y reiniciar TizenTube. Debería conservar la selección.
4. Reproducir más de 10 segundos de un vídeo no terminado, cerrar la aplicación y volver a abrir. Debe reanudarse desde el último punto guardado (margen de hasta aproximadamente 8 segundos en cierres repentinos).
5. Junto a los controles habituales del reproductor deberá aparecer «Imagen en imagen» si Chromium lo soporta. Al pulsarlo se abre la ventana PiP nativa; al salir, no queda otro navegador abierto.
