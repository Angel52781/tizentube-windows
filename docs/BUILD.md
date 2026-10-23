# Guía de Compilación y Reproducibilidad

Esta guía describe cómo generar de forma reproducible el binario ejecutable Windows x64 (`TizenTube.exe`) y el paquete de distribución completo para TizenTube Windows.

---

## 1. Requisitos del Entorno

### Compilación desde Linux (Cross-Build Determinista)
- **Python 3.10+**: Sin dependencias externas adicionales (usa módulos de la biblioteca estándar: `struct`, `hashlib`, `shutil`, `pathlib`).
- **Node.js 18+**: Para la ejecución de las pruebas automatizadas del motor de reproducción (`scripts/test_runtime.js`).

### Compilación en Windows
- Windows 10 (versión 1803+) o Windows 11 (x64).
- Microsoft Edge WebView2 Runtime (preinstalado en Windows 11 y versiones modernas de Windows 10).
- Python 3.10+ para el generador PE32+, o `.NET Framework 4.8 / csc.exe` para compilación nativa directa.

---

## 2. Instrucciones de Compilación

### En Linux / Entorno CI
Ejecute el script de compilación maestro:
```bash
./scripts/build.sh
```
O mediante npm:
```bash
npm test
npm run build
npm run verify
```

El script ejecutará en secuencia:
1. `node scripts/bundle_mods.js`: Empaqueta todos los módulos ES6 (AdBlock, SponsorBlock, DeArrow, PlaybackEngine, UI) en un único bundle IIFE autocontenido (`tizentube.bundle.js`) sin declaraciones de importación/exportación externas, asegurando ejecución directa sin errores de sintaxis en `CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync`.
2. `node scripts/test_runtime.js`, `test_ui_features.js`, `test_bundle.js`: Ejecuta la suite de pruebas unitarias y de integración del runtime, UI y validación de bundle.
3. `python3 scripts/build_x64.py`: Ensambla el binario PE32+ (x86-64, 3.072 bytes) con cabeceras deterministas, tablas de importación y código máquina x86-64 que inicia `TizenTubeHost.exe` o muestra un diálogo de error Win32 `MessageBoxW` si el host no está compilado (sin trampolín hacia PowerShell ni Edge `--app`).
4. `python3 scripts/verify_pe.py` y `node scripts/test_host_integrity.js`: Valida formalmente la estructura PE/COFF, número de secciones, subsistema Windows GUI, flags de mitigación de seguridad (NX, ASLR, High-Entropy VA), configuración de C# / WebView2 y consistencia del manifiesto de distribución.
5. Generación de `dist/TizenTube-win-x64/SHA256SUMS.txt`.

### En Windows
Ejecute en símbolo del sistema (`cmd.exe`) o PowerShell:
```cmd
scripts\build.bat
```
Si dispone de `.NET SDK 8.0+`:
```cmd
dotnet publish src\native\TizenTubeWindows.csproj -c Release -f net8.0-windows -r win-x64 --self-contained false -o dist\TizenTube-win-x64
```

Para ejecutar pruebas de humo automatizadas y telemetría de memoria en Windows:
```powershell
# Ejecución no interactiva de smoke test y captura de telemetría de memoria por PID:
pwsh scripts\measure_memory.ps1 -ExePath "dist\TizenTube-win-x64\TizenTubeHost.exe" -DurationSeconds 20 -OutputDir "telemetry-results"
```

### Integración Continua (GitHub Actions)
El workflow `.github/workflows/windows-native-validation.yml` automatiza:
1. Ejecución de pruebas unitarias y de integración de módulos JS (`npm test`).
2. Validación de determinismo del generador binario PE32+ (doble compilación con verificación de coincidencia exacta de SHA-256).
3. Compilación real del host nativo C# x64 (`TizenTubeHost.exe`) con .NET 8 en runner Windows oficial (`windows-latest`).
4. Ejecución del smoke test en Windows con captura de telemetría multi-proceso (`scripts/measure_memory.ps1`).
5. Validación automatizada del esquema y umbrales de memoria (`scripts/measure_process_telemetry.js`).
6. Carga de evidencias criptográficas y reportes de telemetría como artefactos de CI.

---

## 3. Estructura del Paquete Generado (`dist/TizenTube-win-x64/`)

```
dist/TizenTube-win-x64/
├── TizenTube.exe           # Binario ejecutable Windows PE32+ (x86-64)
├── TizenTubeHost.cs        # Código fuente del host nativo C# / WebView2
├── TizenTubeWindows.csproj # Archivo de proyecto .NET SDK con dependencia WebView2
├── LICENSE                 # Licencia GNU General Public License v3.0
├── launch.cmd              # Lanzador rápido por lotes de Windows
├── launch.ps1              # Script PowerShell con verificación de compilación .NET (sin sustitución de Edge)
├── SHA256SUMS.txt          # Checksum criptográfico de todos los artefactos
└── app/
    ├── core/
    │   ├── config.json         # Configuración de memoria y características
    │   ├── process_manager.js  # Lógica de gestión de procesos y compactación
    │   └── resource_monitor.js # Monitor de Working Set y muestreador de CPU
    ├── runtime/
    │   ├── playback_engine.js  # Controlador HTML5 de vídeo y atajos
    │   ├── ipc_bridge.js       # Puente bidireccional host <-> web
    │   └── navigation.js       # Gestor de navegación y sanitización de URLs
    ├── mods/
    │   ├── tizentube.bundle.js # Bundle IIFE standalone inyectable en WebView2
    │   ├── mod_loader.js       # Bootstrap de inyección / copia bundle
    │   ├── adblock_base.js     # Interceptor de respuestas de publicidad
    │   ├── sponsorblock_base.js# Cliente SponsorBlock y saltador de segmentos
    │   └── dearrow_base.js     # Sustitución de títulos y miniaturas
    ├── ui/
    │   ├── app_ui.js           # Orquestador UI y sincronización de estado
    │   ├── navigation_bar.js   # Barra de navegación, búsqueda y atajos
    │   ├── player_controls.js  # Controles de reproducción interactivos y atajos
    │   ├── settings_modal.js   # Diálogo accesible de preferencias
    │   ├── styles.css          # Estilos CSS accesibles y optimizados
    │   └── toast_notification.js # Notificaciones accesibles con acción de deshacer
    ├── extension/
    │   ├── manifest.json       # Manifiesto V3 de inyección Chromium/Edge
    │   ├── rules.json          # Reglas declarativeNetRequest de bloqueo de anuncios
    │   ├── styles.css          # Copia de hoja de estilos HUD
    │   └── tizentube.bundle.js # Copia de bundle inyectable standalone
    └── native/
        ├── TizenTubeHost.cs
        └── TizenTubeWindows.csproj
```

---

## 4. Verificación y Huellas Criptográficas

Para verificar la integridad del ejecutable generado:
```bash
python3 scripts/verify_pe.py dist/TizenTube-win-x64/TizenTube.exe
```

Salida esperada:
```
PE32+ Verification SUCCESSFUL:
  File:       dist/TizenTube-win-x64/TizenTube.exe
  Format:     PE32+ (x86-64)
  Subsystem:  Windows GUI (2)
  SHA-256:    a7d071b5168a39e14e53ba32705626617c54fce3c43faf0d827ce4edce168bc1
  Sections:   3 sections verified
    .text    RVA=0x1000   RawSize=512    Flags=0x60000020
    .rdata   RVA=0x2000   RawSize=1024   Flags=0x40000040
    .data    RVA=0x3000   RawSize=1024   Flags=0xc0000040
```
