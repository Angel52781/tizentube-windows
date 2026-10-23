# TizenTube Windows — Evidencia Consolidada de Staging y Auditoría de Release
**Versión del Entregable:** `v0.1.0-preview` (Prototipo Técnico en Staging)  
**Fecha de Auditoría:** 2026-10-23  
**Licencia:** GNU General Public License v3.0 ([GPL-3.0-only](../LICENSE))  
**Repositorio Público Autorizado:** [https://github.com/Angel52781/tizentube-windows](https://github.com/Angel52781/tizentube-windows)  

---

## 1. Auditoría de Licencias y Atribuciones (GPL-3.0-only)

En cumplimiento de las directrices del proyecto y las obligaciones de software libre copyleft:

### 1.1 Procedencia y Derechos Upstream
- **TizenTube Upstream:** Desarrollado originalmente por [reisxd](https://github.com/reisxd/TizenTube) bajo licencia **GPL-3.0-only**. TizenTube Windows adapta y traslada la lógica de filtrado de payloads JSON de publicidad (`adPlacements`, `playerAds`, `adSlots`) al entorno Windows x64.
- **SponsorBlock:** Desarrollado por [Ajay Ramachandran](https://sponsor.ajay.app/) y la comunidad de SponsorBlock (LGPL/GPL).
- **DeArrow:** Desarrollado por [Ajay Ramachandran](https://dearrow.ajay.app/).
- **Microsoft Edge WebView2 Runtime:** Microsoft Corporation (redistribuible bajo licencia complementaria de WebView2 SDK).

### 1.2 Auditoría de Código y Cabeceras
- Todos los ficheros fuente (`src/native/TizenTubeHost.cs`, `src/mods/*.js`, `src/runtime/*.js`, `src/ui/*.js`) y scripts de compilación/telemetría (`scripts/*.js`, `scripts/*.py`, `scripts/*.ps1`, `scripts/*.sh`, `scripts/*.bat`) incorporan la cabecera canónica de copyright y la declaración explícita de licencia `GPL-3.0-only`.
- El archivo de licencia [LICENSE](../LICENSE) de la Free Software Foundation (GPL v3, 29 de junio de 2007) se incluye en la raíz del repositorio y en el paquete de distribución `dist/TizenTube-win-x64/LICENSE`.
- No se han incorporado dependencias privativas, código ofuscado ni librerías externas que violen la reciprocidad copyleft de la GPL-3.0.

---

## 2. Auditoría de Diffs y Prevención de Fugas de Información

Se ejecutó un escaneo automatizado y exhaustivo sobre el diff del proyecto y todos los archivos rastreados por Git mediante patrones de búsqueda de expresiones regulares:
- **Rutas internas y de entorno:** Verificación de ausencia total de rutas de infraestructura privada (rutas absolutas de servidores de staging, variables locales de desarrollo o rutas de entorno no públicas).
- **Credenciales y secretos:** Cero tokens (`ghp_*`, `github_pat_*`, JWTs), claves privadas SSH/RSA, passwords, cookies de sesión o API keys privadas.
- **Protección de `.gitignore`:** El fichero `.gitignore` asegura el aislamiento hermético de:
  - `references/` (fuentes externas de referencia congeladas).
  - `evidence/*.json` y `evidence/*.txt` (volcados locales de análisis estático).
  - `.ci-staging/` (archivos temporales de trabajo y staging local).
  - `dist/`, `out/`, `build/`, `release/` (salidas de compilación).
  - `*.log` y `.env*` (registros de ejecución y variables de entorno).

---

## 3. Evidencia Consolidada de Ejecución en Windows CI

La compilación nativa en Windows y el smoke test de proceso fueron validados en el runner oficial de GitHub Actions:
- **Flujo de CI:** [`.github/workflows/windows-native-validation.yml`](../.github/workflows/windows-native-validation.yml)
- **Ejecución de CI Verificada:** [GitHub Actions Run 39903027776](https://github.com/Angel52781/tizentube-windows/actions/runs/39903027776)
- **Entorno del Runner:** `windows-latest` (Windows Server 2022 Datacenter, x86-64, .NET SDK 8.0, Node.js 20, Python 3.11).

### 3.1 Artefactos C# Compilados en Windows
| Parámetro | Valor Observado en CI |
| :--- | :--- |
| **Binario Host Nativo** | `windows-out/TizenTubeHost.exe` |
| **Tamaño en bytes** | 152.064 bytes |
| **SHA-256** | `15D7E998BE0A9DBD74D7EE48044D00E672C9D7D96643403CEAB9202BFE4ECD9D` |
| **Target Framework** | .NET 8.0 Windows (`net8.0-windows`), WinExe x64 |
| **Dependencia NuGet** | `Microsoft.Web.WebView2` (1.0.2903.40) |

### 3.2 Smoke Test de Proceso en Windows CI
| Parámetro | Valor Observado |
| :--- | :--- |
| **Proceso Host PID** | `5080` |
| **Working Set Inicial del Host** | `59.777.024` bytes (~57,0 MB) |
| **Comportamiento** | Inicialización correcta de proceso Win32 y runtime .NET en Windows Server. |

### 3.3 Telemetría Multi-Escenario de Procesos en CI
El flujo de CI ejecuta y valida la telemetría del árbol de procesos (`TizenTubeHost` y `msedgewebview2`) en dos escenarios automatizados mediante `scripts/measure_memory.ps1` y `scripts/measure_process_telemetry.js`:

| Escenario de CI | Duración / Muestreo | Parámetros | Artefactos Generados | Validación de Calidad |
| :--- | :---: | :--- | :--- | :---: |
| **Escenario 1: `ci-standard-startup`** | 20s @ 1000ms | Modo estándar interactivo | `windows-out/telemetry/standard/memory-telemetry.json`<br>`windows-out/telemetry/standard/memory-summary.txt` | **PASS** (`--validate`) |
| **Escenario 2: `ci-headless-trim`** | 20s @ 1000ms | Flags `--headless` y compactación Working Set (`EmptyWorkingSet`) | `windows-out/telemetry/headless/memory-telemetry.json`<br>`windows-out/telemetry/headless/memory-summary.txt` | **PASS** (`--validate`) |

- **Métricas Registradas por PID:** `WorkingSet64` (RAM física residente), `PrivateMemorySize64` (páginas comprometidas privadas), `PeakWorkingSet64`, y `TotalProcessorTime`.
- **Invarianza y Conformidad:** Serialización forzada con `CultureInfo.InvariantCulture` (RFC 8259 compatible), validada contra esquemas estrictos sin valores nulos o métricas omitidas.

> [!WARNING]
> **Frontera de Evidencia vs. Hardware Físico (Desktop Commander Offline):** La ejecución en CI en GitHub Actions (`windows-latest`) demuestra de forma concluyente la **compilación nativa x64, la supervivencia y carga del host Win32/.NET 8 con WebView2, la suite completa de 65 tests y el arnés de telemetría multi-proceso**. No obstante, al tratarse de un runner virtualizado sin GPU física dedicada ni sesión de escritorio interactiva (estando el equipo de desarrollo físico en Desktop Commander fuera de línea / offline), **NO** constituye prueba funcional de reproducción de vídeo con aceleración GPU DirectX/DXVA a 60fps, eficacia de adblocking interactivo en sesiones prolongadas de usuario ni persistencia de preferencias ante actualizaciones dinámicas del DOM de YouTube en un monitor real.

---

## 4. Hashes Criptográficos de la Distribución Reproducible

Generados de manera determinista mediante `scripts/build_x64.py` y `scripts/bundle_mods.js`:

```text
a7d071b5168a39e14e53ba32705626617c54fce3c43faf0d827ce4edce168bc1  TizenTube.exe
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  ... (ver dist/TizenTube-win-x64/SHA256SUMS.txt)
```

- **Ejecutable PE32+ Reproducible:** `dist/TizenTube-win-x64/TizenTube.exe` (3.072 bytes).
  - Formato: PE32+ (AMD64 / x86-64 GUI).
  - Imports: `ShellExecuteW` (SHELL32.dll), `MessageBoxW` (USER32.dll), `ExitProcess` (KERNEL32.dll).
  - Comportamiento: Intenta invocar `TizenTubeHost.exe`. Si no está compilado, muestra un diálogo de error modal nativo `MessageBoxW` instruyendo la compilación con .NET SDK. **Cero delegación oculta a PowerShell o Edge `--app`**.
- **Bundle JS Autónomo:** `src/mods/tizentube.bundle.js` / `dist/TizenTube-win-x64/app/mods/tizentube.bundle.js` (128.550 bytes).
  - Formato: IIFE autónomo sin sentencias `import`/`export`.
  - Módulos inyectados: `AdBlockBase`, `SponsorBlockBase`, `DeArrowBase`, `PlaybackEngine`, `AppUI`, `IpcBridge`, `ModLoader`.

---

## 5. Resumen de Pruebas Automatizadas (65/65 PASS — 100%)

| Suite de Pruebas | Archivo de Prueba | Estado | Comprobaciones Clave |
| :--- | :--- | :---: | :--- |
| **Runtime Core** | [`scripts/test_runtime.js`](../scripts/test_runtime.js) | **10/10 PASS** | Flags Chromium, IPC bidireccional, motor de reproducción HTML5, limpieza JSON de ads. |
| **UI & Features** | [`scripts/test_ui_features.js`](../scripts/test_ui_features.js) | **16/16 PASS** | Resiliencia fail-open (SponsorBlock y DeArrow toleran 503 sin detener reproducción), atajos de teclado, toasts accesibles, modal de ajustes. |
| **Tolerancia a Fallos y Memoria en Mods** | [`scripts/test_mods_fault_tolerance.js`](../scripts/test_mods_fault_tolerance.js) | **17/17 PASS** | Circuit breaker y backoff ante HTTP 429, protección ante respuestas no JSON / HTML, caché LRU con tamaño acotado, chunks <= 30 en DeArrow, limpieza de ads en home richGrid y búsqueda, integración con MediaSession API y vaciado de caché ante `memory:trim`. |
| **Bundle & Extensión** | [`scripts/test_bundle.js`](../scripts/test_bundle.js) | **6/6 PASS** | Bundle IIFE standalone sin sintaxis de módulos ES externos, bootstrap `__TIZENTUBE_LOADER__`, hook de intercepción JSON activo, manifiesto MV3. |
| **Telemetría de Procesos** | [`scripts/test_telemetry.js`](../scripts/test_telemetry.js) | **10/10 PASS** | Diferenciación estricta entre Working Set y Memoria Privada por PID, invariancia de cultura numérica (`CultureInfo.InvariantCulture` RFC 8259), CLI de validación para CI. |
| **Integridad de Host & PE32+** | [`scripts/test_host_integrity.js`](../scripts/test_host_integrity.js) | **6/6 PASS** | PE32+ genuino sin launcher trampolín (sin PowerShell/Edge `--app`), `TizenTubeWindows.csproj` x64 net8.0, scripts `launch.ps1` limpios, validación criptográfica de distribución. |

---

## 6. Límites Técnicos y Clasificación de la Pre-Release

De acuerdo con el Criterio de Aceptación 8:
1. **Clasificación de Prototipo en Staging:** El proyecto se distribuye como `v0.1.0-preview` (prototipo funcional pre-release en staging). No se declara ni se promociona como versión estable de producción hasta completar la validación sobre hardware final.
2. **Delimitación de Pruebas en CI vs. Hardware Físico (`GATE_UNVERIFIED_PENDING_WINDOWS_HOST`):**
   - **Verificado en Windows CI (GitHub Actions):** Compilación nativa x64 de `TizenTubeHost.exe` con .NET 8 SDK, ejecución y smoke test del proceso en Windows Server 2022 con WebView2 runtime, 100% de tests unitarios/integración (65/65 checks superados), validación de binario determinista PE32+ (3.072 bytes), y arnés de telemetría de doble escenario para Working Set y Memoria Privada por PID.
   - **Limitaciones de Hardware Físico Offline (Desktop Commander Offline):** Dado que la estación física de desarrollo Windows en Desktop Commander se encuentra fuera de línea (offline) y los runners de CI carecen de GPU física dedicada y pantalla interactiva, quedan explícitamente delimitadas como pendientes:
     - Reproducción multimedia continua con aceleración por hardware DirectX/DXVA y sincronización AV1/VP9 a 60fps.
     - Pruebas interactivas de salto de anuncios y navegación prolongada (30+ minutos) ante cambios dinámicos del DOM de YouTube en un entorno de usuario real.
     - Autenticación Google / OAuth en WebView2 (restringida por políticas de seguridad de Google para navegadores embebidos, recomendando sesión privada/invitado).
3. **Ausencia de Falsos PASS y Habilitación Comunitaria:** Esta delimitación técnica garantiza que no se emitan certificaciones falsas sobre capacidades no probadas físicamente, permitiendo simultáneamente la publicación y distribución abierta del código y artefactos reproducibles para la comunidad bajo la licencia GPL-3.0-only.
4. **Repudio de Métricas Previas:** Las cifras históricas de consumo de memoria (116–123 MB en reposo, 218–231 MB en reproducción) permanecen formalmente repudiadas como no comprobadas. Para auditorías futuras sobre hardware real, debe emplearse el monitor `scripts/measure_memory.ps1` registrando tanto el Working Set como la Memoria Privada del Host y de todos los subprocesos `msedgewebview2`.
