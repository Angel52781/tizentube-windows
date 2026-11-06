# TizenTube Windows — Notas de Release Candidato (v0.1.0-preview.28)

**Versión Candidata:** `v0.1.0-preview.28-candidate` (Objetivo: `v0.1.0-preview.28`)  
**Fecha:** 2026-11-06  
**Licencia:** GNU General Public License v3.0 ([GPL-3.0-only](../LICENSE))  
**Base Commit de Rollback:** [`885245d`](https://github.com/Angel52781/tizentube-windows/commit/885245d812a4eac796969635fbeb4089d44c8949) (`v0.1.0-preview.27`)  
**Estado:** Candidato local integrado y probado. Pendiente de compilación nativa en Windows CI y auditoría de release independiente.

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
| **Bundles Inyectados** | [`src/mods/tizentube.bundle.js`](../src/mods/tizentube.bundle.js)<br>[`src/extension/tizentube.bundle.js`](../src/extension/tizentube.bundle.js) | Regeneración determinista del bundle JS (185.258 bytes / 185.220 caracteres) |
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
- **Bundle JS Autónomo:** `src/mods/tizentube.bundle.js` (185.258 bytes / 185.220 caracteres, SHA-256: `4d5ecdb763e9201f622410862b4660b8968266732383d392fd3b326911dde7fd`).

### 3.2 Ausencia Explícita de Binarios Nativos Windows
- **`TizenTubeHost.exe` (.NET 8 Publish) y `TizenTube-Setup-x64.exe` (Inno Setup):**  
  **NO GENERADOS LOCALMENTE.** La compilación del host nativo requiere .NET SDK 8.0 para Windows (`net8.0-windows` con WinForms/WPF) e Inno Setup 6 (`ISCC.exe`), los cuales no están disponibles en el entorno Linux de la VPS y están programados para ejecutarse en runners de GitHub Actions (`windows-latest`).
- **Publicación Externa:** Ningún tag ni release ha sido creado en GitHub. `external-verification-contract-conflict` permanece abierto; no se ha ejecutado `git push` remoto.
- **Integridad de Enlaces Públicos:** Los enlaces de descarga en [`README.md`](../README.md) se mantienen apuntando a la versión estable verificada [`v0.1.0-preview.27`](../README.md#L3-L5) para evitar enlaces rotos o inexistentes.

---

## 4. Plan de Rollback a Preview.27

Si surgiera cualquier problema durante la validación o el lanzamiento:
1. El código base puede revertirse inmediatamente a preview.27 mediante el commit [`885245d`](https://github.com/Angel52781/tizentube-windows/commit/885245d812a4eac796969635fbeb4089d44c8949).
2. Los instaladores y ejecutables de `v0.1.0-preview.27` permanecen accesibles en GitHub Releases sin alteración.
3. El actualizador dinámico (`PortableUpdater.cs`) mantiene soporte para versiones anteriores mediante comprobación de `CurrentPreview` y descarga atómica con respaldo.
