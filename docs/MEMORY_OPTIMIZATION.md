# Optimización de Rendimiento y Consumo de Memoria en Windows

> [!WARNING]
> **Advertencia de rigor metodológico:** Las cifras de consumo numérico presentadas históricamente son estimaciones teóricas y objetivos de diseño, **NO resultados empíricos certificados**. No deben utilizarse como reclamo publicitario ni como baseline garantizado hasta que se ejecute la validación sobre hardware físico Windows. Véase [`docs/INCIDENT_2026-10-22_FALSE_PASS.md`](INCIDENT_2026-10-22_FALSE_PASS.md).
> 
> Reducir artificialmente el working set invocando `EmptyWorkingSet` fuerza al sistema operativo a paginar páginas físicas hacia el archivo de paginación (`pagefile.sys`), pero **no disminuye los bytes privados comprometidos** (*Private Bytes* / `PrivateMemorySize64`). Una optimización real debe vigilar tanto el *Working Set* como la *Memoria Privada*.

---

## 1. Objetivos de Diseño y Comparativa Arquitectural

| Métrica / Escenario | Electron Estándar | Navegador Completo (Chrome/Edge con pestañas) | TizenTube Windows (Objetivo WebView2 Optimizado) |
| :--- | :--- | :--- | :--- |
| **Procesos en árbol** | 5 – 7 procesos | 8 – 15 procesos | **2 – 3 procesos consolidados** |
| **RAM Reposo (Idle)** | 350 – 500 MB | 400 – 650 MB | *Pendiente de validación empírica* |
| **RAM Reproducción 1080p** | 500 – 750 MB | 600 – 900 MB | *Pendiente de validación empírica* |
| **RAM tras Minimizar (Trim)** | ~400 MB | ~500 MB | *Sujeto a descarte de páginas en standby* |
| **Uso de CPU (1080p60)** | 12 – 25 % (sin HW boost) | 10 – 18 % | *Dependiente de GPU DXVA offload* |
| **Espacio de Distribución** | 180 – 250 MB | 500 MB+ | **< 3 MB (binario + scripts + bundle)** |

---

## 2. Metodología de Medición Rigurosa en Windows

Para evitar falsos positivos y mediciones sesgadas, todo benchmark en Windows debe registrar:
1. Nombre del host y versión de Windows (ej. Windows 11 23H2 x64).
2. Procesos involucrados: proceso host (`TizenTubeHost.exe` o `TizenTube.exe`) y todos los procesos hijos `msedgewebview2.exe`.
3. Working Set (`WorkingSet64`), Memoria Privada (`PrivateMemorySize64`), y porcentaje de CPU.
4. Timestamps y duración de la sesión (mínimo 15 minutos en reproducción activa).

### Script PowerShell Automatizado de Telemetría Multi-Proceso (`scripts/measure_memory.ps1`)

Para capturar series temporales rigurosas de Working Set y Private Memory por PID en Windows local o CI:

```powershell
# Ejecución automatizada con generación de reporte JSON y resumen tabular:
pwsh scripts/measure_memory.ps1 -ExePath "dist/TizenTube-win-x64/TizenTubeHost.exe" -DurationSeconds 20 -SamplingIntervalMs 1000 -OutputDir "telemetry-results" -Scenario "smoke-test"
```

El script genera:
1. `telemetry-results/memory-telemetry.json`: Artefacto estructurado con PIDs, desglose de rol (host vs webview2-subsystem), working set (MB), memoria privada (MB), tiempos de CPU y métricas agregadas (promedio, mínimo, máximo y final).
2. `telemetry-results/memory-summary.txt`: Reporte legible por humanos con desglose tabular por PID y notas de diagnóstico.

Para validar el artefacto generado frente a los estándares de calidad de CI:
```bash
node scripts/measure_process_telemetry.js --validate telemetry-results/memory-telemetry.json
```

---

## 3. Estrategias de Optimización Implementadas

### 3.1 Restricción del Modelo de Procesos Chromium
Por defecto, Chromium utiliza un modelo de aislamiento de sitios (*site-per-process*) que genera un proceso renderizador independiente para cada dominio y marco. Para YouTube, esto crea procesos adicionales innecesarios.
TizenTube Windows impone:
```
--renderer-process-limit=1
```
Esto consolida todos los marcos y componentes de YouTube en un único proceso de renderizado, ahorrando entre 100 y 200 MB de memoria de trabajo.

### 3.2 Desactivación de Telemetría y Tareas en Segundo Plano
Se desactivan mediante switches específicos de Chromium:
```
--disable-features=Translate,OptimizationHints,MediaRouter,CalculateNativeWinOcclusion,InterestFeedContentSuggestions
```
Estas funciones internas de Chromium ejecutan analizadores de texto, sugerencias de contenido y sincronizaciones que no aportan valor en un reproductor de vídeo dedicado.

### 3.3 Descodificación Acelerada por Hardware (GPU Offloading)
```
--enable-features=VaapiVideoDecoder,PlatformHEVCDecoderSupport
--enable-gpu-rasterization
--enable-zero-copy
```
Permite que el descodificado de vídeo H.264, VP9 y AV1 se ejecute directamente en los bloques de aceleración de vídeo de la GPU (Intel QuickSync, NVIDIA NVDEC o AMD VCN), liberando ciclos de CPU y reduciendo el consumo térmico.

### 3.4 Control del Búfer y Caché en Disco
```
--disk-cache-size=104857600
--media-cache-size=104857600
```
Fija un límite estricto de 100 MB para la caché de red y medios en disco, evitando fugas de memoria o acumulación de gigabytes de datos en `%LOCALAPPDATA%`.

### 3.5 Rutina de Compactación de Memoria Activa (Working Set Trimming)
Mediante la función Win32 de la API de proceso:
```csharp
EmptyWorkingSet(Process.GetCurrentProcess().Handle);
```
Invocada de manera periódica (cada 30 s) y al recibir el evento de ventana minimizada, el sistema operativo transfiere páginas de memoria no activas a la memoria virtual de reserva, reduciendo el conjunto de trabajo físico de la memoria RAM activa. Se debe complementar con vigilancia de memoria privada para garantizar una reducción estructural.

