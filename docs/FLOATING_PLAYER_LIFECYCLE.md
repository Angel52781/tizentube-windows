# Ciclo de Vida y Contratos del Reproductor Flotante (PiP) — TizenTube Windows

**GPL-3.0-only · TizenTube Windows Contributors**

---

## 1. Arquitectura de Reproductor Flotante en Formulario Único

### 1.1 Razón de diseño
En Windows con WebView2, crear una segunda ventana Win32 para Picture-in-Picture obligaría a:
1. Instanciar un segundo entorno o control WebView2, duplicando los procesos `msedgewebview2.exe` y elevando el consumo de memoria privada en más de 120–180 MB.
2. Iniciar un segundo flujo de red hacia YouTube para el mismo vídeo, consumiendo ancho de banda redundante y provocando problemas de buffer o desincronización de sesión/cookies.
3. Riesgo de fallo de composición gráfica (pantalla negra en el vídeo) debido a restricciones de aceleración de hardware multi-ventana en Chromium.

Por ello, TizenTube Windows implementa la técnica de **reproductor flotante sobre la misma instancia**:
- La misma ventana nativa WinForms (`TizenTubeHost`) conmuta sus estilos a `FormBorderStyle.None`, activa `TopMost = true` y ajusta su geometría a proporciones de vídeo compacto (330–500px de ancho).
- En el DOM de YouTube, el elemento `#movie_player` existente se traslada temporalmente a `document.body` mediante `moveBefore` (o `insertBefore`), saliendo de los contenedores padre con estilos transformados/recortados de la página de watch.
- **Misma instancia de vídeo, mismo buffer, misma sesión y cero recarga**.

---

## 2. Semántica Diferenciada: Restaurar vs Cerrar

En versiones anteriores a v0.1.0-preview.28, presionar la `X` en modo flotante invocaba internamente `ToggleFloatingWindowAsync(true)`, haciendo que el botón de cierre se comportara idéntico a restaurar (dejaba la ventana visible y el vídeo reproduciendo).

A partir de esta corrección, los comandos quedan formalmente diferenciados:

| Dimensión | Restaurar (`Volver a ventana` / F9) | Cerrar (`✕` / Alt+F4 / Dismiss) |
|---|---|---|
| **Canal IPC** | `window:restore-floating` | `window:close-floating` |
| **Comando JS** | `window.__ttFloating.restore()` | `window.__ttFloating.close()` |
| **Estado de vídeo** | **Continúa reproduciendo** (o pausado si ya lo estaba). No altera `paused`. | **Pausa inmediata** (`video.pause()`) para silenciar el audio. |
| **Tiempo de vídeo** | Conserva exactamente `currentTime` actual. | Conserva `currentTime` en el punto de pausa para reanudación. |
| **Ventana nativa** | Restaura tamaño y bordes normales en pantalla (`WindowState.Normal` o `Maximized`). | Restaura bordes normales y **minimiza a la barra de tareas** (`WindowState.Minimized`). |
| **Recuperabilidad** | La ventana permanece visible en primer plano. | La ventana desaparece de la vista del usuario pero la aplicación permanece viva; 1 clic en la barra de tareas la recupera. |
| **Identidad WebView2** | Misma instancia WebView2; `#movie_player` retorna al contenedor de watch. | Misma instancia WebView2; `#movie_player` retorna al contenedor de watch. |

### 2.1 Semántica de `OnFormClosing`
Cuando el usuario presiona `Alt+F4` o el botón de cierre nativo mientras `nativeFloatingActive == true`:
- Si `e.CloseReason == CloseReason.UserClosing`: `OnFormClosing` cancela el cierre destructivo del proceso (`e.Cancel = true`) y ejecuta `DismissFloatingWindowAsync()`. Esto pausa el audio y minimiza la ventana a la barra de tareas, evitando la pérdida accidental de la sesión de navegación del usuario.
- Si el cierre proviene del sistema operativo (`CloseReason.WindowsShutDown` o terminación externa): el formulario se cierra limpiamente sin bloquear el apagado.

### 2.2 Límite arquitectónico documentado
Al residir en un único formulario WinForms, no es posible "cerrar la ventana flotante y dejar otra ventana de TizenTube abierta en el escritorio" sin incurrir en una segunda instancia de WebView2. Minimizar a la barra de tareas con audio pausado es la semántica canónica y óptima para aplicaciones de formulario único.

---

## 3. Contratos IPC y Métodos Entregados al Nodo Visual (`floating-visual-parity`)

El script `src/native/floating_player.js` expone la interfaz completa en `window.__ttFloating` para que el nodo visual implemente los controles táctiles/overlay (-10s, play/pause, +10s, scrubber, etc.):

### 3.1 Métodos de `window.__ttFloating`
```javascript
// Activa el modo flotante trasladando #movie_player al body
window.__ttFloating.start();

// Desactiva el modo flotante devolviendo #movie_player a su contenedor
// Si pause === true, pausa el elemento de vídeo antes de restaurar
window.__ttFloating.stop(pause = false);

// Envía IPC 'window:restore-floating' (o stop() en offline)
window.__ttFloating.restore();

// Pausa el vídeo y envía IPC 'window:close-floating' (o stop(true) en offline)
window.__ttFloating.close();

// Salto relativo en segundos, acotado entre 0 y video.duration
// Retorna el nuevo video.currentTime
window.__ttFloating.seek(deltaSeconds); // ej. seek(-10) o seek(10)

// Alterna reproducción / pausa; retorna { paused: boolean, currentTime: number }
window.__ttFloating.togglePlay();

// Watchdog de recuperación si el reproductor queda huérfano en el body
window.__ttFloating.recover();

// Diagnóstico detallado del estado de vídeo y controles
window.__ttFloating.diagnostics();
```

### 3.2 Identificadores DOM y Clases Garantizadas
El contenedor de cabecera `#tt-floating-header` inyecta los siguientes elementos listos para estilización y accesibilidad:

- `#tt-floating-restore-btn`:
  - Clases: `tt-float-btn tt-float-btn-restore`
  - Texto: `⤢`
  - `title`: `Restaurar ventana (F9)`
  - `aria-label`: `Volver a ventana`
  - Evento `click`: invoca `window.__ttFloating.restore()`
- `#tt-floating-close-btn`:
  - Clases: `tt-float-btn tt-float-btn-close`
  - Texto: `✕`
  - `title`: `Cerrar reproductor flotante`
  - `aria-label`: `Cerrar`
  - Evento `click`: invoca `window.__ttFloating.close()`
  - Estilo hover: fondo rojo de acento (`rgba(235, 50, 50, 0.85)`)

### 3.3 Mensajes IPC recibidos por `TizenTubeHost.cs`
- `{"channel":"window:restore-floating"}`: Desencadena `ToggleFloatingWindowAsync(true)`.
- `{"channel":"window:close-floating"}`: Desencadena `DismissFloatingWindowAsync()`.
- `{"channel":"window:drag"}`: Invoca `DragNativeWindow()` para arrastrar la ventana sin bordes.
- `{"channel":"window:scale-floating","delta":0.15}`: Escala la ventana con Ctrl + Rueda.
- `{"channel":"window:resize-start","direction":"..."}`: Inicio de redimensionamiento por bordes.
- `{"channel":"window:resize-step","direction":"...","deltaX":...,"deltaY":...}`: Paso de redimensionamiento.
- `{"channel":"window:resize-end"}`: Fin de redimensionamiento.

---

## 4. Evidencia de Validación Local y Rail CI

1. **Suite unitaria local (`scripts/test_floating_player.js`)**:
   - 70/70 aserciones pasadas sin regresiones.
   - Valida identidad del elemento de vídeo, preservación de tiempo, ausencia de pausas indeseadas en Restore, pausa inmediata en Close, seeks relativos (+10s / -20s / límites 0 y duration), y recuperación ante estados huérfanos.
2. **Rail CI Windows (`scripts/ci_windows_floating_cycle.ps1`)**:
   - P0 Surface Cycle: `Normal -> Theater -> Floating -> Fullscreen -> Return`.
   - Pasos 6 a 9:
     - `step6_floating_seek`: Verificación de seek en flotante.
     - `step7_restore`: Verificación de restauración conservando reproducción activa.
     - `step8_dismiss`: Verificación de cierre pausando reproducción y minimizando.
     - `step9_recovered`: Recuperación de ventana normal desde estado minimizado.
