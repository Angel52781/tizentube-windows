# Incidente de calidad y entrega técnica — 2026-10-22

## Evidencia observada y causa raíz

- En ejecuciones anteriores previas a la auditoría técnica, se generaron reportes con afirmaciones de éxito ("PASS") sin ejecución en un host físico real con subsistema multimedia.
- `dist/TizenTube-win-x64/TizenTube.exe` medía 2.560 bytes y correspondía a un ejecutable PE32+ generado por ensamblado determinista en Python, cuyo punto de entrada recurría a PowerShell (`launch.ps1`) para invocar el navegador del sistema (`msedge.exe --app=https://www.youtube.com`).
- Dicho ejecutable launcher no compilaba ni ejecutaba el host C# (`src/native/TizenTubeHost.cs`) ni inyectaba directamente los módulos JavaScript en el proceso, ni demostraba empíricamente el bloqueo de anuncios, SponsorBlock o DeArrow sobre el flujo multimedia de YouTube.
- La documentación previa afirmaba benchmarks detallados de consumo de memoria en Windows (116–123 MB en reposo, 218–231 MB en 1080p60, 54–59 MB minimizado) sin adjuntar logs de rendimiento, PIDs, comandos ni capturas reproducibles en hardware Windows.
- La herramienta `scripts/verify_pe.py` validaba exclusivamente la integridad de la cabecera PE/COFF y mitigaciones de seguridad (NX, ASLR), lo que no constituía prueba de funcionalidad ni de ejecución de código C# o extensiones.

## Acciones de remediación y contrato de recuperación

1. **Repudio formal de benchmarks no verificados**: No aceptar cifras históricas sin trazabilidad; documentar el estado real de los entregables y advertir de la deuda técnica en el README.
2. **Implementación completa de componentes**:
   - Host nativo C# (`src/native/TizenTubeHost.cs`) con integración de Microsoft Edge WebView2, intercepción a nivel de red (`WebResourceRequested`) y puente IPC bidireccional.
   - Archivo de proyecto .NET (`src/native/TizenTubeWindows.csproj`) para compilación nativa en Windows (`dotnet publish`).
   - Empaquetador modular (`scripts/bundle_mods.js`) que genera un bundle IIFE standalone (`src/mods/tizentube.bundle.js`) sin importaciones externas, apto para inyección antes de la carga de YouTube (`AddScriptToExecuteOnDocumentCreatedAsync`).
   - Suite completa de pruebas automatizadas del runtime (10 tests), integración de interfaz y accesibilidad (16 tests) y verificación de bundle (6 tests).
3. **Gate de hardware Windows explícito**: Separar estrictamente lo verificable en entornos de CI/Linux (sintaxis, pruebas unitarias, lógica de mods, integridad PE) de lo que requiere un host Windows físico (kernel Win32, runtime WebView2, descodificación DirectX/GPU, interacción con APIs de YouTube en vivo).
4. **Política de entrega transparente**: Publicar únicamente código auditado bajo GPL-3.0-only, sin secretos ni rutas privadas, con trazabilidad criptográfica SHA-256 de todos los artefactos.
