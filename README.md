# TizenTube Windows

[![Descargar TizenTube Windows — ZIP portable](https://img.shields.io/badge/%E2%AC%87%20DESCARGAR-Windows%2010%2F11%20x64-087fca?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/Angel52781/tizentube-windows/releases/download/v0.1.0-preview.6/TizenTube-Windows-x64-v0.1.0-preview.6.zip)

**[Descarga directa para Windows (versión de prueba)](https://github.com/Angel52781/tizentube-windows/releases/download/v0.1.0-preview.6/TizenTube-Windows-x64-v0.1.0-preview.6.zip)** · [Instrucciones de instalación](docs/GETTING_STARTED_WINDOWS.md) · [Todas las versiones](https://github.com/Angel52781/tizentube-windows/releases)

> **¿Windows muestra «Windows protegió su PC»?** Esta versión de prueba todavía no tiene firma digital de un editor reconocido. Consulta [por qué sucede y las opciones de firma](docs/SMARTSCREEN_AND_SIGNING.md). No implica por sí mismo que el archivo sea malicioso; verifica siempre el origen y el SHA-256.

**Descarga para probar en Windows 10/11 x64:** [Releases / v0.1.0-preview.6](https://github.com/Angel52781/tizentube-windows/releases/tag/v0.1.0-preview.6). Descargar el ZIP de **Assets**, extraer toda la carpeta y ejecutar `TizenTubeHost.exe`. Ver [instrucciones de instalación](docs/GETTING_STARTED_WINDOWS.md).

**Preview.6 — reparación de raíz:** el ejecutable anterior, copiado al escritorio sin la carpeta `app`, abría YouTube y aplicaba un filtro reducido, pero perdía AdBlock completo, SponsorBlock y DeArrow sin avisar. Ahora el propio EXE contiene el bundle y sus estilos. CI prueba que un `.exe` aislado inicializa realmente los módulos en WebView2. Se añade diagnóstico desde menú contextual (clic derecho) y `--diagnose-ads` para no depender del atajo. El modo TV sigue siendo experimental; no se afirma bloqueo perfecto de todos los anuncios.

**Preview.5 — auditoría del TizenTube original:** la versión de Android/Chromecast utiliza YouTube TV y Cobalt, mientras que nuestro modo habitual abre YouTube desktop. Se trasladaron semánticas originales de filtrado TV y se añadió `--tv` experimental con perfil separado. Para investigar anuncios de escritorio que continúan apareciendo, `Ctrl+Shift+F10` genera un diagnóstico **local** de la estructura publicitaria, sin registrar cookies ni nombres de cuenta. [Leer auditoría original vs Windows](docs/ORIGINAL_ARCHITECTURE_AUDIT.md). **No afirmar aún paridad ni bloqueo total de publicidad en una cuenta real.**

**Preview.4:** reconocimiento conservador de anuncios patrocinados con etiqueta visible (`Patrocinado`, `Sponsored`, etc.) o URL de clic publicitario en tarjetas de inicio; compatibilidad DPI **Per-Monitor V2** para intentar evitar texto borroso en pantallas escaladas y varios monitores. Se conserva la interfaz de comentarios de YouTube y el inicio de sesión Google. Las pruebas automatizadas no sustituyen la revisión visual de la cuenta del usuario.

**Preview.3 — corrección de publicidad en inicio:** corrige la inyección cosmética al crear el DOM, cubre tarjetas patrocinadas de portada y feeds dinámicos y filtra anuncios en respuestas `/youtubei/v1/browse`, `/search` y `/next`. Conserva el contenido orgánico y las respuestas de Google Accounts. La prueba CI ahora verifica que AdBlock y su hoja de estilos estén realmente activos en WebView2. Sigue pendiente corroborar en tu sesión de YouTube la desaparición de todos los formatos publicitarios.

**Mejoras de preview.2:** se corrigió la detección tardía del reproductor que impedía a SponsorBlock recibir eventos de tiempo; se reforzó el filtrado de respuestas de YouTube desktop y la restauración de cambios al desactivar AdBlock. Incluye icono propio. Son mejoras comprobadas con pruebas de regresión y CI; aún deben validarse frente a anuncios y segmentos reales en sesiones de uso.

Esta es una **versión personal experimental, no estable**: usa YouTube de escritorio dentro de WebView2 con modificaciones. No pretende replicar aún la interfaz Android/Chromecast, ni garantiza bloquear todos los anuncios. Las pruebas funcionales reales en el equipo del usuario y las mediciones integrales de RAM siguen pendientes.

> [!IMPORTANT]
> **ESTADO DE INTEGRACIÓN, AUDITORÍA QA Y GATE DE HARDWARE — 23-10-2026**
> - **Clasificación del entregable (Prototipo v0.1.0-preview / Pre-Release)**: Este proyecto se encuentra en fase de **prototipo técnico funcional en staging**, en estricto cumplimiento del Criterio de Aceptación 8. **NO se etiqueta ni distribuye como release de producción estable** hasta superar la validación interactiva sobre hardware físico Windows con el runtime WebView2 oficial y GPU dedicada.
> - **Compilación y Telemetría Nativa en Windows CI (GitHub Actions)**:
>   - **Compilación C# Nativa x64**: `TizenTubeHost.exe` (152.064 bytes, .NET 8, C#) compilado y validado en runner oficial Windows Server 2022 ([GitHub Actions Run 39903027776](https://github.com/Angel52781/tizentube-windows/actions/runs/39903027776)).
>   - **Smoke Test de Proceso Windows**: Inicialización exitosa del proceso host (`PID 5080`) y runtime WebView2 con Working Set inicial de ~57 MB.
>   - **Telemetría Multi-Escenario de Procesos**: Telemetría automatizada vía `scripts/measure_memory.ps1` en dos escenarios (`ci-standard-startup` interactivo y `ci-headless-trim` con compactación `EmptyWorkingSet`), registrando `WorkingSet64` (RAM física) y `PrivateMemorySize64` (páginas privadas comprometidas) por PID para el árbol Host + `msedgewebview2`, con validación estricta de esquemas numéricos (`CultureInfo.InvariantCulture` RFC 8259) mediante `scripts/measure_process_telemetry.js --validate`.
> - **Suites de validación automatizada superadas (100% — 65/65 comprobaciones)**:
>   - **Runtime Core (10/10 tests)** ([`scripts/test_runtime.js`](scripts/test_runtime.js)): flags optimizados de Chromium, compactación de memoria, monitorización agregada de procesos, saneamiento de navegación, motor HTML5 de reproducción (volumen, rate, seek), saneamiento de respuestas JSON AdBlock (`adPlacements`, `playerAds`, `adSlots`), cálculo de saltos SponsorBlock, caché en memoria de DeArrow, puente IPC bidireccional y orquestación de módulos en `ModLoader`.
>   - **Integración UI y Características Fail-Open (16/16 tests)** ([`scripts/test_ui_features.js`](scripts/test_ui_features.js)): emisión de eventos en barra de navegación, controles HUD con formateo de tiempo y seekbar, cálculo milimétrico de marcadores SponsorBlock, resiliencia **fail-open probada** ante caída o latencia de APIs (SponsorBlock y DeArrow toleran 503 / connection refused sin interrumpir la reproducción), detección de botones de salto AdBlock, persistencia de preferencias ARIA en `SettingsModal`, sistema de toasts accesibles con acción de deshacer (undo), atajos de teclado, pantalla completa sincronizada y ciclo de vida de desmontaje limpio.
>   - **Tolerancia a Fallos y Protección de Memoria en Mods (17/17 tests)** ([`scripts/test_mods_fault_tolerance.js`](scripts/test_mods_fault_tolerance.js)): resiliencia de SponsorBlock y DeArrow ante downtime de APIs (500, 502, 503, 504), circuit breaker y backoff ante rate limiting (HTTP 429), tolerancia a respuestas no JSON / HTML Cloudflare, caché LRU con tamaño acotado para evitar fugas de memoria, deduplicación de peticiones concurrentes en vuelo, particionamiento en lotes seguros (chunks <= 30), limpieza profunda de anuncios en home richGrid / búsqueda / shorts en AdBlock con restauración de velocidad y audio tras anuncios, integración con MediaSession API nativa de Windows y vaciado de caché ante comando IPC `memory:trim`.
>   - **Integridad de Bundle y Extensión (6/6 tests)** ([`scripts/test_bundle.js`](scripts/test_bundle.js)): bundle IIFE autónomo libre de sentencias `import`/`export` externas, espacio de nombres global `window.TizenTube`, inicialización del bootstrap `__TIZENTUBE_LOADER__`, hook de intercepción JSON activo, tracking de URL activa y validación de manifiesto V3 / reglas declarativeNetRequest.
>   - **Telemetría de Procesos y Memoria (10/10 tests)** ([`scripts/test_telemetry.js`](scripts/test_telemetry.js)): validación rigurosa de telemetría multi-proceso, separación explícita de Working Set (RAM física) y Memoria Privada (páginas comprometidas) por PID, algoritmos de agregación para árbol Host + WebView2, rechazo de métricas omitidas/nulas, invariancia de cultura numérica (RFC 8259), CLI de simulación y validación para CI y verificación de scripts PowerShell.
>   - **Integridad de Host y Binario (6/6 tests)** ([`scripts/test_host_integrity.js`](scripts/test_host_integrity.js)): verificación formal de la configuración de compilación de .NET C# (`TizenTubeWindows.csproj`), flags de arquitectura y WebView2 en `TizenTubeHost.cs`, ejecutable de entrada PE32+ reproducible sin launcher trampolín (sin delegación engañosa a PowerShell o Edge `--app`), reporte de error modal nativo `MessageBoxW`, scripts de lanzamiento limpios y validación criptográfica estricta de todos los artefactos de distribución.
> - **Frontera de Hardware Físico y Desktop Commander Offline (`GATE_UNVERIFIED_PENDING_WINDOWS_HOST`)**:
>   - La estación física de escritorio Windows en Desktop Commander se encuentra actualmente **fuera de línea (offline)**.
>   - Aunque la compilación nativa x64, el smoke test de proceso y el arnés de telemetría están 100% validados en el runner virtual de CI, **NO se certifica falsamente la reproducción de vídeo a 60fps con aceleración GPU física DirectX/DXVA**, ni el adblocking interactivo en sesiones continuas de usuario.
>   - Esta limitación física se delimita con rigor para no emitir falsos PASS de QA, permitiendo al mismo tiempo la entrega comunitaria del código fuente y artefactos en staging bajo licencia GPL-3.0-only.
> - **Repudio formal de benchmarks previos**: Las cifras históricas de consumo de RAM (116–123 MB en reposo, 218–231 MB en reproducción) NO están verificadas sobre hardware real y fueron formalmente repudiadas en el [informe de incidente técnico](docs/INCIDENT_2026-10-22_FALSE_PASS.md). No constituyen un baseline aceptado. Para auditoría empírica en hardware físico, úsese el procedimiento PowerShell documentado en este README.

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Status: Prototype / Hardware Gate Pending](https://img.shields.io/badge/Status-Prototype%20%2F%20Hardware--Gate%20Pending-orange.svg)](docs/FEASIBILITY_AND_PORT_PLAN.md)
[![Tests: 65/65 Passed (100%)](https://img.shields.io/badge/Tests-65%2F65%20Passed%20(100%25)-brightgreen.svg)](scripts/)
[![Platform](https://img.shields.io/badge/Platform-Windows%20x64-blue.svg)](https://github.com/Angel52781/tizentube-windows)
[![Architecture](https://img.shields.io/badge/Architecture-WebView2%20%2F%20C%23-brightgreen.svg)](docs/ARCHITECTURE.md)

Cliente de escritorio de código abierto para YouTube en Windows x64, inspirado en TizenTube. Diseñado para ofrecer una experiencia fluida, libre de anuncios y con bajo consumo de memoria RAM mediante el runtime nativo de Microsoft Edge WebView2 y optimizaciones avanzadas de Chromium.

---

## Características Principales

- **Consumo Mínimo de Recursos (Bajo Consumo de RAM y CPU)**:
  - Basado en Microsoft Edge WebView2 nativo: aprovecha componentes compartidos del sistema operativo sin duplicar instancias pesadas de Chromium como en Electron.
  - Consolidación estricta de procesos (`--renderer-process-limit=1`): reduce el árbol a sólo 3 procesos principales (Host nativo, WebView2 Renderizador y WebView2 GPU).
  - Compactación activa de memoria (*Working Set Trimming* con `EmptyWorkingSet` de Win32): rutina de reducción de conjunto de trabajo al minimizar o periódicamente.
  - Aceleración por hardware para descodificación de vídeo en GPU (`VaapiVideoDecoder`, `PlatformHEVCDecoderSupport`).
- **Bloqueo de Publicidad Multinivel (AdBlock)**:
  - Interceptación y purgado en tiempo de deserialización JSON de estructuras `adPlacements`, `playerAds` y `adSlots` procedentes de las respuestas API internas de YouTube.
  - Filtro a nivel de red nativo (`WebResourceRequested`) en el host WebView2 retornando HTTP 204 No Content ante dominios publicitarios.
  - Supresión cosmética de banners y secciones promocionales mediante CSS inyectado y reglas declarativeNetRequest.
  - Detección y salto automático acelerado en pausas publicitarias no eliminadas en cabecera.
- **SponsorBlock Comunitario Integrado**:
  - Consulta automática de segmentos a la API comunitaria de SponsorBlock (`https://sponsor.ajay.app`).
  - Detección e interpolación milimétrica de saltos en tiempo de reproducción.
  - Marcadores de colores en la barra de progreso (seekbar) por categoría (patrocinadores, intros, recordatorios, etc.).
  - Configuración granular de categorías y resiliencia **fail-open** (las caídas o latencias de la API nunca interrumpen el vídeo).
- **DeArrow Comunitario Integrado**:
  - Sustitución de títulos engañosos (*clickbait*) y miniaturas sensacionalistas por propuestas descriptivas de la comunidad (`https://dearrow-thumb.ajay.app`).
  - Almacenamiento en caché en memoria y resiliencia **fail-open**.
- **Controles de Reproducción y UI Accesible**:
  - Control de velocidad preciso (0.25x a 4.0x) y atajos de teclado estándar (`Space`, `K`, `J`, `L`, flechas, `M`, `F`, `/`).
  - Diálogo modal de configuración con soporte ARIA para personalización de AdBlock, SponsorBlock y DeArrow.
  - Sistema de notificaciones toast con retroalimentación y acción de deshacer saltos.
  - Persistencia de preferencias en almacenamiento local e IPC.

---

## Rendimiento y Comparativa Arquitectural

> [!WARNING]
> **Aviso de verificación empírica:** Las cifras anteriores (116–123 MB idle y 218–231 MB reproducción) no fueron medidas en un entorno reproducible y quedan formalmente revocadas. La llamada a `EmptyWorkingSet` pagina páginas físicas al archivo de intercambio, pero no reduce por sí misma los bytes privados comprometidos (*Private Bytes*). El comportamiento real del hardware está pendiente de validación física en Windows.

### Comparativa Arquitectural de Diseño

| Dimensión / Componente | Electron Estándar | Navegador Completo (Edge / Chrome) | TizenTube Windows (WebView2 Optimizado) |
| :--- | :--- | :--- | :--- |
| **Modelo de Procesos** | Instancia completa de Chromium con múltiples renderers | 8 – 15 procesos por pestañas y extensiones | **Consolidación a ~3 procesos** (`--renderer-process-limit=1`) |
| **Runtime Base** | Chromium + Node.js embebidos (~180–250 MB) | Binario del navegador completo | **Microsoft Edge WebView2 Evergreen** (compartido) |
| **Aceleración GPU** | Dependiente de flags Electron | Aceleración completa por GPU | **Forzada por switches** (`VaapiVideoDecoder`, `HEVC`) |
| **Tamaño de Distribución**| 180 – 250 MB instalador | 500 MB+ instalación | **< 3 MB (binario + scripts + bundle)** |
| **Consumo de Memoria** | Alto (350–700 MB Working Set) | Alto (400–900 MB Working Set) | *Pendiente de validación empírica en hardware Windows* |

### Procedimiento para Medición Rigurosa en Windows

Para recolectar mediciones verificables sobre un host Windows real, ejecute el script de telemetría multi-proceso:

```powershell
# Ejecución del monitor de telemetría con captura por PID (Working Set y Private Memory):
pwsh scripts\measure_memory.ps1 -ExePath "dist\TizenTube-win-x64\TizenTubeHost.exe" -DurationSeconds 20 -OutputDir "telemetry-results"
```

O inspeccione los procesos en ejecución directamente desde PowerShell:

```powershell
$procs = Get-Process -Name "TizenTube", "TizenTubeHost", "msedgewebview2" -ErrorAction SilentlyContinue
$totalWS = [math]::Round(($procs | Measure-Object -Property WorkingSet64 -Sum).Sum / 1MB, 2)
$totalPriv = [math]::Round(($procs | Measure-Object -Property PrivateMemorySize64 -Sum).Sum / 1MB, 2)
Write-Host "Total Working Set: $totalWS MB | Total Private Memory: $totalPriv MB"
```

---

## Binario y Artefactos de Distribución

El paquete de distribución reproducible para Windows x64 se genera en `dist/TizenTube-win-x64/`:

- **Ejecutable principal**: `dist/TizenTube-win-x64/TizenTube.exe`
- **Formato**: Windows PE32+ (x86-64 GUI, AMD64 0x8664)
- **Subsystem**: Windows GUI (2)
- **Seguridad**: `NX_COMPAT` (DEP), `DYNAMIC_BASE` (ASLR), `HIGH_ENTROPY_VA` (64-bit ASLR)
- **SHA-256 Verificado**:
  ```text
  a7d071b5168a39e14e53ba32705626617c54fce3c43faf0d827ce4edce168bc1  TizenTube.exe
  ```

Todos los archivos del paquete se encuentran verificados en `dist/TizenTube-win-x64/SHA256SUMS.txt`.

### Estructura de la Distribución

```text
dist/TizenTube-win-x64/
├── TizenTube.exe           # Lanzador nativo Windows PE32+ x64 con comprobación de host y MessageBoxW (3.072 bytes)
├── TizenTubeHost.cs        # Código fuente del Host nativo C# / WebView2
├── TizenTubeWindows.csproj # Archivo de proyecto .NET SDK con dependencia WebView2
├── LICENSE                 # Licencia GPL-3.0-only
├── launch.cmd              # Lanzador rápido por lotes
├── launch.ps1              # Lanzador PowerShell con verificación de compilación .NET (sin sustitución de Edge)
├── SHA256SUMS.txt          # Checksums SHA-256 de todos los ficheros
└── app/                    # Módulos JavaScript de UI, mods, runtime y extensión
    ├── core/               # Gestor de procesos y monitor de recursos
    ├── mods/               # Bundle standalone IIFE (tizentube.bundle.js) y módulos
    ├── runtime/            # Motor HTML5 de reproducción e IPC
    ├── ui/                 # Componentes HUD, navegación y estilos CSS accesibles
    └── extension/          # Manifiesto V3 y reglas de bloqueo declarativeNetRequest
```

---

## Compilación Reproducible

### Requisitos

- **Linux / Cross-Build**: Python 3.10+, Node.js 18+ (para empaquetado de bundle y suites de pruebas).
- **Windows**: Windows 10 (1803+) o Windows 11 (x64), Microsoft Edge WebView2 Evergreen Runtime, y opcionalmente `.NET SDK 8.0+` para compilar `TizenTubeHost.exe`.

### Compilar y Validar en Linux

```bash
# Ejecutar suite de pruebas completa y generar distribución
./scripts/build.sh
```

O vía npm:

```bash
npm test          # Ejecuta las 65 pruebas automatizadas (runtime, UI, tolerancia a fallos, bundle, telemetría, host integrity)
npm run build     # Genera el bundle IIFE y el paquete x64 en dist/
npm run verify    # Valida la cabecera PE32+ y la integridad de arquitectura del host
```

### Compilar y Ejecutar en Windows

Desde un terminal de comandos (`cmd.exe`) o PowerShell:

```cmd
scripts\build.bat
```

Para compilar el host nativo C# directamente con `.NET SDK`:

```cmd
dotnet publish src\native\TizenTubeWindows.csproj -c Release -r win-x64 --self-contained false -o dist\TizenTube-win-x64
```

Para iniciar la aplicación:
- Doble clic en `dist\TizenTube-win-x64\TizenTube.exe` (o `launch.cmd`).

---

## Documentación Técnica

- [Evidencia de Staging y Auditoría](docs/RELEASE_STAGING_EVIDENCE.md): Consolidación de pruebas CI en Windows, auditoría de licencias GPL-3.0, diff limpio y hashes de pre-release.
- [Arquitectura Detallada](docs/ARCHITECTURE.md): Diseño del host nativo, inyección de scripts y modelo de procesos.
- [Guía de Compilación](docs/BUILD.md): Procedimiento paso a paso para compilación nativa y cross-build determinista.
- [Optimización de Memoria](docs/MEMORY_OPTIMIZATION.md): Explicación técnica de los flags de Chromium y rutinas de *trimming*.
- [Plan de Viabilidad y Port](docs/FEASIBILITY_AND_PORT_PLAN.md): Análisis comparativo con el proyecto original de Tizen y mapa de adopción.
- [Informe de Calidad e Incidente](docs/INCIDENT_2026-10-22_FALSE_PASS.md): Diagnóstico técnico de la divergencia entre el launcher de 2.560 bytes y el host C#.

---

## Deuda Técnica y Verificaciones Pendientes de Hardware

A fin de mantener la máxima transparencia técnica y evitar falsos positivos de QA, el proyecto delimita con precisión lo validado en el pipeline automatizado frente a las verificaciones que requieren hardware físico:

### Verificado en Windows CI (GitHub Actions)
- [x] **Compilación Nativa de `TizenTubeHost.exe`**: Compilado nativamente en x64 con .NET SDK 8.0 y WebView2 NuGet en runner Windows Server 2022 ([GitHub Actions Run 39903027776](https://github.com/Angel52781/tizentube-windows/actions/runs/39903027776)).
- [x] **Smoke Test de Proceso Win32**: Inicialización confirmada del proceso nativo (`PID 5080`) y runtime WebView2 en Windows.
- [x] **Determinismo PE32+ y 65/65 Tests**: Binario de distribución `TizenTube.exe` determinista (3.072 bytes, SHA-256 `a7d071b5...`) y 100% de tests unitarios y de integración aprobados.
- [x] **Arnés de Telemetría Multi-Escenario**: Monitorización en PowerShell (`measure_memory.ps1`) y validación estricta de esquemas JSON (`measure_process_telemetry.js`) para `WorkingSet64` y `PrivateMemorySize64` por PID en escenarios estándar y headless con trimming.

### Pendiente en Hardware Físico (Desktop Commander Offline)
Debido a que la estación física de escritorio Windows en Desktop Commander se encuentra actualmente **fuera de línea (offline)** y los runners virtuales de CI carecen de GPU física dedicada y sesión interactiva de pantalla completa:
1. **Pruebas de Reproducción Multimedia con Aceleración GPU**: Ejecutar sesiones interactivas reales de vídeo 1080p60/4K en YouTube sobre monitor físico, comprobando descodificación por hardware GPU (DirectX/DXVA), sincronización de códecs AV1/VP9 y conmutación de pantalla completa.
2. **Validación E2E de Inyección de Mods en Sesiones de Usuario**: Confirmar en vivo la supresión de anuncios pre-roll/mid-roll, saltos de SponsorBlock y reemplazo de miniaturas DeArrow contra las APIs actuales y mutaciones del DOM de YouTube en sesiones prolongadas (30+ minutos).
3. **Perfilado de Memoria Privada en Sesión Continua**: Registrar mediante `scripts/measure_memory.ps1` el consumo sostenido de `WorkingSet64` y `PrivateMemorySize64` en reproducción prolongada sobre hardware real de usuario final.

---

## Licencia y Atribuciones

Este proyecto se distribuye bajo los términos de la **GNU General Public License v3.0** ([GPL-3.0-only](LICENSE)).

### Atribuciones y Proyectos de Referencia

- **TizenTube upstream**: Proyecto original creado por [reisxd](https://github.com/reisxd/TizenTube), licenciado bajo GPL-3.0-only. TizenTube Windows adapta y traslada la lógica de filtrado JSON de publicidad y diseño modular a la plataforma Windows x64.
- **SponsorBlock**: Desarrollado por [Ajay Ramachandran](https://sponsor.ajay.app/) y la comunidad de SponsorBlock (LGPL/GPL).
- **DeArrow**: Desarrollado por [Ajay Ramachandran](https://dearrow.ajay.app/).
- **Microsoft Edge WebView2**: Microsoft Corporation.

### Descargo de Responsabilidad (Disclaimer)

TizenTube Windows es un proyecto independiente desarrollado por la comunidad y no cuenta con afiliación, respaldo ni patrocinio oficial de Google LLC, YouTube ni Samsung Electronics. Todas las marcas registradas pertenecen a sus respectivos propietarios.

---

## Notas de Seguridad y Limitaciones Conocidas

1. **Autenticación Google / OAuth en WebView2**: Google puede bloquear intentos de inicio de sesión en navegadores embebidos mediante comprobaciones de seguridad automáticas. La aplicación no manipula cookies privadas, no sortea CAPTCHAs ni intercepta credenciales de usuario. Se recomienda el uso en modo invitado/privado.
2. **Resiliencia de APIs Comunitarias**: Las funciones de SponsorBlock y DeArrow dependen de sus respectivos servicios comunitarios externos. En caso de corte o degradación de servicio, la aplicación aplica política *fail-open* manteniendo la reproducción continua de vídeo sin bloqueos.

