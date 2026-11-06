# Especificación y Contrato del Overlay Flotante (PiP) — TizenTube Windows

**GPL-3.0-only · TizenTube Windows Contributors**

---

## 1. Resumen Ejecutivo y Paridad con la Referencia Visual

El reproductor flotante (*Picture-in-Picture*) de TizenTube Windows implementa una interfaz limpia, accesible y táctil con un overlay oscuro semi-transparente que satisface fielmente la especificación y la imagen de referencia aportada por el Sponsor:

1. **Overlay Scrim Oscuro**: Fondo radial degradado (`radial-gradient(ellipse at center, rgba(0, 0, 0, 0.28) 0%, rgba(0, 0, 0, 0.65) 100%)`) con desenfoque de fondo (`backdrop-filter: blur(8px)`) que permite la visualización continua y sin oclusión del flujo de vídeo.
2. **Controles Centrales Prominentes**:
   - **Retroceso 10s (`#tt-floating-rewind-btn`)**: Botón circular táctil de 48px con distintivo `-10`, atajo `J` / `←`.
   - **Reproducir/Pausar (`#tt-floating-play-btn`)**: Botón circular central de 62px con símbolo dinámico `▶` / `❚❚`, atajo `Espacio` / `K`.
   - **Avance 10s (`#tt-floating-forward-btn`)**: Botón circular táctil de 48px con distintivo `+10`, atajo `L` / `→`.
3. **Barra de Progreso y Tiempo Accesibles (Inferior)**:
   - Scrubber deslizante continuo (`#tt-floating-progress-bar`) con `role="slider"`, `aria-label="Progreso de reproducción"`, relleno dinámico en acento rojo YouTube (`#ff0000`) y punto de arrastre visible al interactuar.
   - Indicador textual de tiempo (`#tt-floating-time-display`, e.g. `01:14 / 04:00`).
   - Control de volumen accesible (`#tt-floating-volume-btn` y `#tt-floating-volume-slider`) con conmutación de silencio y atajo `M`.
4. **Controles de Ventana Diferenciados (Superior Derecho)**:
   - **Volver a Ventana (`#tt-floating-restore-btn`)**: Símbolo `⤢`, `title="Restaurar ventana (F9)"`, `aria-label="Volver a ventana"`. Restaura la ventana sin alterar el estado de reproducción.
   - **Cerrar (`#tt-floating-close-btn`)**: Símbolo `✕`, `title="Cerrar reproductor flotante"`, `aria-label="Cerrar"`, fondo rojo al interactuar (`rgba(235, 50, 50, 0.88)`). Pausa inmediatamente el audio y minimiza a la barra de tareas.
5. **Cero Duplicación de Controles**: Se ocultan de forma terminante los elementos nativos de YouTube (`.ytp-chrome-bottom`, `.ytp-chrome-top`, `.ytp-gradient-bottom`, `.ytp-gradient-top`, etc.) para evitar controles en conflicto.

---

## 2. Métricas Geométricas Empíricas Observadas (Live Chromium CDP)

Medición obtenida mediante Chrome DevTools Protocol sobre la superficie renderizada real (`scripts/verify_floating_overlay_layout.js`):

| Componente | Selector | Ancho (px) | Alto (px) | Centrado / Simetría |
|---|---|---|---|---|
| **Contenedor Overlay** | `#tt-floating-overlay` | 540 | 177 (o 100% viewport) | Ajuste exacto al viewport |
| **Cabecera Drag/Título** | `#tt-floating-header` | 540 | 38 | `top: 0`, cursor `move` |
| **Botón Restaurar** | `#tt-floating-restore-btn` | 30 | 28 | `right: 494px`, padding 3px 9px |
| **Botón Cerrar** | `#tt-floating-close-btn` | 30 | 28 | `right: 530px` (a la derecha de Restaurar) |
| **Controles Centrales** | `#tt-floating-center-controls` | 540 | 78 | Centrado vertical y horizontal |
| **Retroceso (-10s)** | `#tt-floating-rewind-btn` | 48 | 48 | Gap de 22px hacia Play |
| **Play / Pause** | `#tt-floating-play-btn` | 62 | 62 | **Delta X: 0px (centro exacto)**, Delta Y: 6.5px |
| **Avance (+10s)** | `#tt-floating-forward-btn` | 48 | 48 | **Gap de 22px hacia Play (Simetría delta: 0px)** |
| **Barra de Progreso** | `#tt-floating-progress-bar` | 516 | 4 (hover: 6) | Margen simétrico de 12px a cada lado |
| **Display de Tiempo** | `#tt-floating-time-display` | 54 | 12 | Alineado a la izquierda del pie |
| **Grupo de Volumen** | `#tt-floating-volume-group` | 83 | 20 | Alineado a la derecha del pie |

---

## 3. Matriz de Autoridad de Foco y Teclado

Siguiendo el estándar de desarrollo de Orbital y los lineamientos de accesibilidad:

| Entrada de Teclado | Foco en Botón del Overlay | Foco en Slider / Input | Foco General / Vídeo / Body |
|---|---|---|---|
| `Espacio` | Activa **únicamente** el botón enfocado (`button.click()`) sin alternar playback global | Espacio en control nativo | Alterna Play / Pause (`togglePlay()`) |
| `Enter` | Activa **únicamente** el botón enfocado | Enter nativo | Sin acción global conflictiva |
| `K` | Alterna Play / Pause (`togglePlay()`) | Alterna Play / Pause | Alterna Play / Pause (`togglePlay()`) |
| `J` / `L` | Seek relativo (-10s / +10s) | Seek relativo (-10s / +10s) | Seek relativo (-10s / +10s) |
| `←` / `→` | Seek relativo (-5s / +5s) | Desplaza el slider de progreso | Seek relativo (-5s / +5s) |
| `↑` / `↓` | Ajuste de volumen (+5% / -5%) | Ajuste de slider | Ajuste de volumen (+5% / -5%) |
| `M` | Conmuta silencio (`video.muted`) | Conmuta silencio | Conmuta silencio (`video.muted`) |
| `Escape` / `F9` | Restaura ventana normal (`restore()`) | Restaura ventana normal | Restaura ventana normal (`restore()`) |

---

## 4. Ocultación Automática y Control de Cursor

- **Inactividad de 2.5s en Reproducción**: Si el vídeo está reproduciéndose y transcurren 2500ms sin movimiento de ratón o pulsación de tecla, el overlay transiciona a `opacity: 0; pointer-events: none;` y el cursor se oculta (`cursor: none !important;`).
- **Persistencia en Pausa**: Cuando el vídeo está en pausa, el overlay permanece visible de forma continua (`opacity: 1; pointer-events: auto;`) para permitir reanudar o desplazar la barra con un solo clic.
- **Reaparición Inmediata**: Cualquier evento `mousemove`, `pointermove`, `keydown` o `focusin` restaura instantáneamente la visibilidad del overlay y el cursor (`cursor: default`).

---

## 5. Checklist de Verificación para el Rail Windows CI y Entorno Físico

- [ ] **Compilación de Host C#**: `TizenTube.exe` compila e incrusta el recurso `TizenTube.FloatingPlayer` sin advertencias (`python3 scripts/build_x64.py`).
- [ ] **Pruebas Automatizadas Unitarias**: `npm test` ejecuta las 18 suites (119/119 aserciones de floating player verdes).
- [ ] **Sonda de Ciclo de Superficie P0 en CI**: `scripts/ci_windows_floating_cycle.ps1` valida el ciclo completo:
  - Paso 1: Normal
  - Paso 2: Modo Teatro
  - Paso 3: Modo Flotante (verifica `#tt-floating-overlay`, `playerInBody == true`, botones `-10`, Play, `+10`, progreso, tiempo y volumen presentes)
  - Paso 4: Transición a Pantalla Completa (desactiva flotante y regresa reproductor al contenedor de watch)
  - Paso 5: Retorno a ventana normal (preserva tiempo y estado del vídeo)
  - Paso 6: Seek flotante (+10s comprobado por salto de `currentTime`)
  - Paso 7: Restaurar (`Volver a ventana` mantiene el vídeo reproduciendo)
  - Paso 8: Cerrar (`✕` pausa el audio inmediatamente y minimiza la ventana a la barra de tareas)
  - Paso 9: Recuperación desde minimizado con un clic
- [ ] **Captura Gráfica Visual en Runner Windows**: Archivos `cycle-03-floating.png` y `cycle-06-floating-seek.png` registran el overlay translúcido con el vídeo de fondo (comprobación `pixelChecks` centro no negro `R+G+B >= 30`).
- [ ] **Validación en PC Física (Windows 10/11 x64)**:
  - Foco visible `:focus-visible` con anillo azul claro (`#3ea6ff`) en navegación por teclado (`Tab`).
  - Redimensionamiento manual mediante grips perimetrales desde 320x180 hasta 800x450 sin desbordes de texto.
  - Hover rojo distintivo sobre el botón `✕`.
