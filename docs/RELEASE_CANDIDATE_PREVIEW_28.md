# TizenTube Windows — Registro técnico de preview.28

**Versión publicada:** [`v0.1.0-preview.28`](https://github.com/Angel52781/tizentube-windows/releases/tag/v0.1.0-preview.28), pre-release experimental del 2026-11-07 01:57:54 UTC.

**Commit distribuido:** `e8664a32109cbfd2c3a4864e9d5b27461992e269`.

**Licencia:** GNU General Public License v3.0 ([GPL-3.0-only](../LICENSE)).

**Base de rollback:** [`v0.1.0-preview.27`](https://github.com/Angel52781/tizentube-windows/releases/tag/v0.1.0-preview.27), código base `885245d`.

**Estado de QA:** pruebas locales, compilación/instalación y validaciones nativas Windows CI aprobadas; reproducción de vídeos reales en runner y PC de usuario **no verificada**. Véanse las limitaciones en la release pública.

---

## 1. Resumen y Causa Raíz Corregida

Esta entrega resuelve el problema reportado de duplicación y pérdida de acciones de teclado en TizenTube Windows, centrado en la tecla `Space` y los atajos de reproducción:

- **Causa Raíz:** En Microsoft Edge WebView2 (Chromium), cuando un botón del reproductor de YouTube (`.ytp-play-button`, `.ytp-button`, `.tt-btn`) retenía el foco del teclado, pulsar `Space` sin ejecutar `e.preventDefault()` en la fase de captura provocaba que el navegador sintetizara un evento nativo secundario `click` al soltar la tecla (`keyup`). Esto conmutaba el reproductor a pausa y reanudaba inmediatamente (doble toggle en milisegundos).
- **Corrección Causal:**
  - `PlaybackEngine._onKeyDown` intercepta `Space` y `K` en fase de captura sobre controles del reproductor, ejecutando `claim()` (`preventDefault()` + `stopImmediatePropagation()`).
  - Se excluyen tempranamente los campos de texto editables (`input`, `textarea`, `select`, `[contenteditable]`, `[role="textbox"]`).
  - Se excluyen menús de YouTube (`.ytp-menuitem`, `[role="menuitem"]`), diálogos modales (`.tt-modal`, `[role="dialog"]`) y atajos nativos reservados de YouTube (`C` subtítulos, `T` modo cine, `I` miniplayer).
  - Se asegura la gestión de volumen mediante flechas arriba/abajo/izquierda/derecha sobre el slider `.ytp-volume-slider`.
  - Resistencia de ciclo de vida: reconexión dinámica a elementos de vídeo desconectados tras navegación SPA de YouTube y prevención de listeners duplicados vía `window.__tt_playback_keydown__` y método `dispose()`.

---

## 2. Inventario de Archivos Modificados

| Componente | Archivo | Modificación |
| :--- | :--- | :--- |
| **Runtime de Reproducción** | [`src/runtime/playback_engine.js`](../src/runtime/playback_engine.js) | Manejo en captura de Space/K/flechas, exclusiones tempranas y reconexión SPA |
| **Cargador de Módulos** | [`src/mods/mod_loader.js`](../src/mods/mod_loader.js) | Lifecycle attach/dispose seguro |
| **Bundles Inyectados** | [`src/mods/tizentube.bundle.js`](../src/mods/tizentube.bundle.js) y [`src/extension/tizentube.bundle.js`](../src/extension/tizentube.bundle.js) | Bundle JS actualizado (186.042 bytes en Git; Windows CI normaliza saltos de línea) |
| **Reproductor flotante** | [`src/native/floating_player.js`](../src/native/floating_player.js), [`src/native/TizenTubeHost.cs`](../src/native/TizenTubeHost.cs) | Controles ±10 s, reproducción/pausa, regreso y cierre diferenciados |
| **Suites de Pruebas** | [`scripts/test_keyboard_shortcuts.js`](../scripts/test_keyboard_shortcuts.js) | Nueva suite determinista de fases DOM, foco y ciclo de vida (PASS) |
| **Pruebas de Telemetría** | [`scripts/test_telemetry.js`](../scripts/test_telemetry.js) | Aislamiento de ficheros temporales en `os.tmpdir()` |
| **Configuración y Scripts** | [`package.json`](../package.json) | Integración de `test_keyboard_shortcuts.js` en `npm test` y bump a `0.1.0-preview.28` |
| **Host C# y Actualizador** | [`src/native/TizenTubeWindows.csproj`](../src/native/TizenTubeWindows.csproj)<br>[`src/native/PortableUpdater.cs`](../src/native/PortableUpdater.cs) | Sincronización de versión a `0.1.0-preview.28` |
| **Instalador y CI** | [`scripts/installer.iss`](../scripts/installer.iss)<br>[`.github/workflows/windows-native-validation.yml`](../.github/workflows/windows-native-validation.yml) | Sincronización de artefactos para `v0.1.0-preview.28` |

---

## 3. Estado de Compilación y Artefactos

### 3.1 Artefactos Producidos Localmente (Entorno VPS Linux)
- **Ejecutable PE32+ Reproducible:** `dist/TizenTube-win-x64/TizenTube.exe` (3.072 bytes)
  - SHA-256: `a7d071b5168a39e14e53ba32705626617c54fce3c43faf0d827ce4edce168bc1`
  - Verificado por `scripts/verify_pe.py` y `scripts/test_host_integrity.js`.
- **Manifiesto de Checksums de Distribución:** `dist/TizenTube-win-x64/SHA256SUMS.txt` (38 archivos empaquetados).
- **Bundle JS Autónomo:** `src/mods/tizentube.bundle.js` (186.042 bytes en Git, SHA-256: `447ef7d4dc1e003541d7ab7fcb677a234b883ed8e4262deab9de3fd174d8a8ac`). El archivo en el ZIP Windows tiene la misma secuencia de líneas, con finales CRLF de ese entorno.

### 3.2 Binarios nativos y distribución en GitHub
- **Windows CI:** [run 42166734712](https://github.com/Angel52781/tizentube-windows/actions/runs/42166734712) aprobó build .NET 8, pruebas nativas, instalador Inno Setup, smoke tests y empaquetado portable para el commit distribuido.
- **Instalador público:** `TizenTube-Setup-x64.exe`, SHA-256 `7d7e4b4770831a8709425ffb8e4504b076ee107f716348b50f341690c4b22176`.
- **ZIP público:** `TizenTube-Windows-x64-v0.1.0-preview.28.zip`, SHA-256 `5c792b6ba8d828769628fcd5327e324b7ed45390d69f8bd8957cf028b4af850c`.
- **Publicación:** etiqueta Git y release pública apuntan a `e8664a3`. El [README](../README.md) dirige a la pre-release 28.
- **Límite de prueba:** Windows Experience E2E [run 42326261703](https://github.com/Angel52781/tizentube-windows/actions/runs/42326261703) no pudo cargar los medios de YouTube (`readyState=0`). La prueba con WebView2 sin modificaciones [run 42326445215](https://github.com/Angel52781/tizentube-windows/actions/runs/42326445215) tampoco pudo reproducirlos (`Video unavailable`). La falla no demuestra un defecto causado por los mods ni garantiza reproducción en una PC real, que continúa sin verificar.

---

## 4. Plan de Rollback a Preview.27

Si surgiera cualquier problema durante la validación o el lanzamiento:
1. El código base puede revertirse inmediatamente a preview.27 mediante el commit [`885245d`](https://github.com/Angel52781/tizentube-windows/commit/885245d812a4eac796969635fbeb4089d44c8949).
2. Los instaladores y ejecutables de `v0.1.0-preview.27` permanecen accesibles en GitHub Releases sin alteración.
3. El actualizador dinámico (`PortableUpdater.cs`) mantiene soporte para versiones anteriores mediante comprobación de `CurrentPreview` y descarga atómica con respaldo.
