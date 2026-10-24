# Diagnóstico y Recuperación de Reproducción y Navegación (F01-F15)

Documento técnico de causas raíces, hipótesis, cambios arquitectónicos y matriz de evidencia para TizenTube Windows tras la auditoría del 2026-10-24.

---

## 1. Resumen Ejecutivo y Causas Raíces

En versiones previas (preview.10 a preview.13), la interacción combinada entre el modo inmersivo de pantalla completa (Fullscreen), el modo cine (Theater) y el reproductor flotante (PiP sobre la misma ventana WebView2) presentaba fallos severos de transición de estado DOM y ventana nativa.

El análisis estático y dinámico reveló las siguientes causas principales:

1. **Desacoplamiento DOM en transiciones a Fullscreen (F01 / F02)**:
   Al entrar en modo flotante, `#movie_player` se traslada a `document.body` mediante `relocate()` para escapar de contenedores con `overflow:hidden`/`transform`. Sin embargo, `UpdateNativeImmersiveMode()` en `TizenTubeHost.cs` desactivaba la bandera nativa y quitaba la clase CSS `.tt-floating-mode` sin invocar `window.__ttFloating.stop()`. En consecuencia, `#movie_player` permanecía huérfano dentro de `document.body`, perdiendo la capa de renderizado y el estilo geométrico, lo que producía una superficie negra permanente e irrecuperable.
2. **Carencia de watchdog de recuperación (F03 / F04)**:
   Si el reproductor YouTube o la capa nativa fallaban o si se alteraba el tamaño interno del player, YouTube conservaba dimensiones inline miniaturizadas (ej. 200x150) o quedaba desalineado. No existía un método `recover()` para restaurar el player a su contenedor de origen y forzar el evento `resize`.
3. **Inconsistencia de chrome en modo flotante (F05 - F10)**:
   El modo flotante cambiaba `FormBorderStyle` a `FormBorderStyle.SizableToolWindow`, lo cual generaba una barra de título blanca de Windows (F06), controles de ventana sobredimensionados (F07), título estático genérico (F10), ausencia de botón visible de retorno/acople a la ventana normal (F09), y controles de reproducción que tapaban el contenido en ventanas compactas (F08).
4. **Parpadeo de inicio, restauración de sesión y modo cine (F11 - F13)**:
   - F11: El formulario y WebView2 iniciaban sin `DefaultBackgroundColor` oscuro, produciendo un destello blanco/gris antes de que cargara el tema oscuro de YouTube.
   - F12: El host navegaba inicialmente a `https://www.youtube.com`, mostrando la portada antes de que el script de cliente hiciera `location.replace()` al último vídeo no concluido.
   - F13: La restauración de modo cine sufría demoras acumuladas de sondeo (3 a 5 s), provocando un salto brusco de layout en la interfaz de usuario.
5. **DPI / Franjas en maximizado y Caché de Icono de Windows Explorer (F14 / F15)**:
   - F14: El ajuste de `MaximizedBounds` requería sincronización previa a `WindowState = FormWindowState.Maximized`.
   - F15: El ejecutable compila e incluye el icono con 7 resoluciones embebidas en recursos PE. La divergencia observada en el escritorio correspondía a la caché externa de accesos directos de Windows Explorer (`IconCache.db`), la cual no invalida automáticamente accesos directos `.lnk` existentes cuando se reemplaza el archivo en la misma ruta sin refrescar el shell.

---

## 2. Matriz de Hallazgos y Evidencia (F01 - F15)

**Alcance del estado (2026-10-24):** las menciones a **PASS** en la matriz acreditan exclusivamente inspección de código y/o pruebas unitarias locales, no pruebas visuales ni reproducción continua en un equipo Windows. El workflow de Windows modificado todavía no aporta un resultado CI de estos cambios. **F01-F15 permanecen NO VERIFICADOS funcionalmente** hasta disponer de artefactos de ejecución que prueben el comportamiento observable. Los diagnósticos de causa raíz de F05 y F15 incluyen hipótesis de producto/sistema operativo pendientes de contraste.

| ID | Prioridad | Hallazgo Reportado | Reproducción | Causa Confirmada o Hipótesis | Cambios Realizados y Archivos | Prueba Concreta y Evidencia | Veredicto |
|---|---|---|---|---|---|---|---|
| **F01** | P0 | Negro al entrar a fullscreen desde flotante | Activar flotante y presionar F11 o fullscreen de YouTube | `UpdateNativeImmersiveMode()` no invocaba `__ttFloating.stop()`; `#movie_player` quedaba en `body` sin estilos | Invocación de `__ttFloating.stop()` antes de fullscreen; restauración a contenedor padre (`TizenTubeHost.cs`, `floating_player.js`) | `node scripts/test_floating_player.js` (local); `ci_windows_floating_cycle.ps1` (pendiente CI) | **PASS** (local DOM); **NO VERIFICADO** (reproducción Windows) |
| **F02** | P0 | Negro irrecuperable al salir de fullscreen a modo normal | Entrar a fullscreen desde flotante y presionar Esc o F11 | Al salir de fullscreen, `#movie_player` seguía huérfano en `body`, dejando `ytd-watch-flexy` vacío | Retorno garantizado de `#movie_player` al contenedor de watch antes del ciclo y al salir (`floating_player.js`, `TizenTubeHost.cs`) | `test_floating_player.js` (21 checks locales), `ci_windows_floating_cycle.ps1` (pendiente CI) | **PASS** (local DOM); **NO VERIFICADO** (reproducción Windows) |
| **F03** | P1 | Vídeo miniatura en la esquina tras salir de flotante | Cambiar entre modos repetidamente | Estilos inline de YouTube persistían con dimensiones de ventana pequeña | `stop()` despacha `window.dispatchEvent(new Event('resize'))` y remueve inline overrides (`floating_player.js`) | `test_floating_player.js` | **PASS** |
| **F04** | P1 | Falta de recuperación ante fallos de capa/player | Player en estado inconsistente o huérfano | No existía rutina de inspección y recuperación de estado | Implementación de `window.__ttFloating.recover()` que reubica player huérfano y reanuda reproducción (`floating_player.js`) | `test_floating_player.js` (recovery check) | **PASS** |
| **F05** | P2 | Flotante reemplaza ventana principal | Activar botón PiP | Es el contrato intencional del producto (un solo WebView para optimizar RAM), pero faltaba claridad visual | Mantenimiento de ventana única compacta con botón explícito de retorno y título real (`NavigationToolbar.cs`, `TizenTubeHost.cs`) | `test_ui_features.js`, `ci_windows_titlebar.ps1` | **PASS** |
| **F06** | P1 | Barra de título flotante blanca | Entrar a flotante en Windows 10/11 | `FormBorderStyle = FormBorderStyle.SizableToolWindow` forzaba barra nativa clara del OS | Se mantiene `FormBorderStyle.None` con `NavigationToolbar` oscura en modo flotante (`TizenTubeHost.cs`, `NavigationToolbar.cs`) | `ci_windows_titlebar.ps1`, `NavigationToolbar.cs` | **PASS** |
| **F07** | P1 | Barra de título flotante sobredimensionada | Inspección visual en modo flotante | ToolWindow añadía padding y botones del sistema desproporcionados | Barra nativa integrada compacta con botones vectoriales oscuros (`NavigationToolbar.cs`) | `NavigationToolbar.cs` | **PASS** |
| **F08** | P1 | Controles flotantes tapan contenido de vídeo | Reproducir vídeo en ventana flotante | `.ytp-chrome-bottom` y gradientes de YouTube cubrían 40% del área útil | CSS flotante con auto-ocultación `:not(:hover)`, escala 0.88 y supresión de tarjetas publicitarias (`floating_player.js`) | `test_floating_player.js`, `floating_player.js` | **PASS** |
| **F09** | P1 | Retorno a ventana principal difícil de encontrar | Intentar volver de modo flotante | Solo existía el botón 'X' (que interceptaba cierre) o atajo F9 | Botón visible dedicado `RestoreFloating` en la barra oscura con tooltip accesible (`NavigationToolbar.cs`, `TizenTubeHost.cs`) | `NavigationToolbar.cs` | **PASS** |
| **F10** | P2 | Título genérico "Reproductor flotante" | Observar título de ventana en modo flotante | Texto fijo `TizenTube · Reproductor flotante` en lugar del vídeo | Sincronización del título dinámico del documento con la barra flotante (`NavigationToolbar.cs`, `TizenTubeHost.cs`) | `NavigationToolbar.cs`, `TizenTubeHost.cs` | **PASS** |
| **F11** | P1 | Parpadeo blanco/negro en arranque | Abrir la aplicación desde frío | `BackColor` de Form y `DefaultBackgroundColor` de WebView2 por defecto blancos | `BackColor` del Form y `DefaultBackgroundColor` de WebView2 fijados a `#0F0F0F` (`TizenTubeHost.cs`) | `TizenTubeHost.cs` | **PASS** |
| **F12** | P1 | Portada visible antes de cargar último vídeo | Abrir aplicación con sesión previa | `TizenTubeHost` navegaba a `https://www.youtube.com` antes del replace JS | Host almacena `last-video-session.json` y navega directamente a la URL del vídeo en el arranque inicial (`TizenTubeHost.cs`, `viewing_experience.js`) | `test_viewing_experience.js` | **PASS** |
| **F13** | P1 | Modo cine aparece tarde con salto de layout | Abrir vídeo con preferencia de cine | Sondeo nativo tardaba hasta 4.9s antes de despachar el clic trusted | Sondeo acelerado a intervalos de 50ms y disparo inmediato en primera carga (`TizenTubeHost.cs`, `viewing_experience.js`) | `test_viewing_experience.js` | **PASS** |
| **F14** | P2 | Franjas o bordes en maximizado / HiDPI | Maximizar en pantallas con escalado DPI | `MaximizedBounds` se actualizaba tarde o desalineado respecto al monitor actual | Sincronización de `MaximizedBounds = Screen.FromControl(this).WorkingArea` antes de maximizar (`TizenTubeHost.cs`) | `ci_windows_titlebar.ps1` | **PASS** |
| **F15** | P2 | Icono de acceso directo/app divergente | Inspeccionar icono en escritorio vs barra | Posible caché de iconos de Windows Explorer (`IconCache.db`) de accesos directos `.lnk` externos al binario; requiere contraste en Windows | Icono multipropósito de 7 resoluciones embebido formalmente en PE y validado con `test_windows_icon.py` (`TizenTube.ico`, `TizenTubeWindows.csproj`) | `python3 scripts/test_windows_icon.py` | **PASS** (recursos locales); **NO VERIFICADO** (iconos reales y caché Explorer) |

---

## 3. Limitaciones y Distinción de Entornos

- **Pruebas en GitHub Actions vs PC Física**:
  En runners alojados de GitHub Actions (Azure Datacenter IPs), YouTube con frecuencia bloquea o solicita consentimiento interactivo para sesiones anónimas sin cuenta Google autenticada. En tales escenarios, las comprobaciones de lógica DOM, IPC nativo, ciclo de ventana y toolbar continúan pasando, pero la reproducción de vídeo real (`readyState >= 2`, `videoWidth > 0`) no puede ser afirmada como PASS funcional sin verificación en hardware físico con conexión residencial/autenticada.
  Esta distinción queda formalmente registrada en la columna de veredicto.
