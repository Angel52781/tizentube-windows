# Experiencia de reproducción — v0.1.0-preview.7

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
