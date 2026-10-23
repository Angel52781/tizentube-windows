# Viabilidad y plan de port Windows — 2026-10-22

## Hechos verificados

1. `reisxd/TizenTube` es una aplicación/módulo para Samsung Tizen y YouTube TV, no una APK. En el paquete raíz y en `mods/package.json` declara `GPL-3.0-only`.
2. `reisxd/TizenTubeCobalt` es la variante para otros dispositivos, basada en Cobalt (runtime HTML5 para embedded). No equivale a un framework recomendado para Windows y su licencia/árbol de terceros debe estudiarse si se reutiliza su código.
3. El código de TizenTube utiliza interceptación `JSON.parse` y limpieza de campos como `adPlacements`, `playerAds` y `adSlots` en respuestas de la UI de YouTube TV, no de youtube.com desktop. `mods/features/adblock.js` contiene la implementación concreta.
4. SponsorBlock solicita segmentos a `https://sponsor.ajay.app/api`, consulta categorías y calcula hash corto de ID. Está en `mods/features/sponsorblock.js`.
5. La versión standalone de TizenTube usa rutas de proxy/servidor localhost para ciertos recursos (ver `mods/features/standaloneUserscript.js`); ello NO debe copiarse a ciegas a un entorno Windows por implicaciones de CORS, identidad y seguridad.
6. REA `6.7.0` inspeccionó estáticamente `references/TizenTube/mods` con salida completa en `evidence/rea-tizentube-mods.json`: 74 archivos relevantes, 40 JS parseados, 244 nodos, 516 aristas, 0 parse failures, 399 findings; evidencia ID `ev_253fce06d5e967e02a1f2fbdad70b1ead42241b5fb4bc8fd1fe5de897fc45a3d`. No hubo ejecución de frontend ni prueba de publicidad real.

## Hipótesis de arquitectura — se valida antes de fijarla

Empezar por prototipo con Chromium/Electron y navegación de YouTube embebida en ventana de escritorio, usando integración mínima y modular para SponsorBlock/DeArrow y, solo después de pruebas, bloqueador de publicidad. Ventaja: conservar UI original evitando reescribir el diseño de YouTube. Riesgos: login OAuth embebido bloqueado, políticas/condiciones de YouTube, evolución dinámica del frontend, anuncios integrados, reproducción protegida y gasto de recursos.

Si la UI original o login no es soportable, contrastar una UI independiente estilo cliente YouTube, al modo de FreeTube, sin prometer identidad visual exacta ni cuenta Google. Comparar Electron, Tauri/WebView2 y otras opciones por reproducción efectiva, aislamiento, interceptabilidad, peso y mantenibilidad, no por preferencia previa.

No elegir clonar Android o compilar Cobalt para Windows solo por el hecho de existir; ambos añaden complejidad y difieren de la UX de PC.

## Riesgos críticos que debe abordar el Director

- **P0 — funcionamiento real en Windows:** debe generar y probar .exe, no solo compilarlo en Linux.
- **P0 — funcionamiento de reproducción y anuncios:** bloquear anuncios en YouTube TV no prueba el mismo comportamiento en youtube.com desktop. Cambios de YouTube pueden romper interceptores.
- **P0 — identidad y legal:** login de Google en navegador embebido puede no ser admitido; nunca simular cookies, copiar perfiles ni automatizar credenciales. Distribución de código GPL-3.0-only exige licenciamiento/atribución apropiados y conservación de derechos; evaluar ToS de YouTube y terceros antes de publicación.
- **P1 — DRM, codecs, multimedia:** capturar casos de playback, fullscreen, audio, seek, calidad y restricciones reales.
- **P1 — SponsorBlock/DeArrow:** tolerar API caídas; caché prudente y estados visibles.
- **P1 — privacidad:** no interceptar contraseñas ni enviar datos de sesión a servidores no autorizados.
- **P2 — updates, auto-instalador, PiP, atajos:** priorizar después de core funcional salvo dependencia observada.

## Criterios verificables de la misión

1. Un ejecutable de Windows x64 construido de forma reproducible, ubicado en salida/versionado local con su commit/hash; installer opcional si `.exe` portable satisface instalación.
2. Navegar y reproducir vídeos reales de YouTube, buscar, navegar, pausar, avanzar, cambiar volumen/velocidad, fullscreen, abrir links y recuperar estado de ajustes.
3. SponsorBlock salta segmentos reales de vídeos con datos disponibles, demuestra el salto y permite desactivación; DeArrow cambia títulos o miniaturas donde haya datos. Fallos API no rompen reproducción.
4. Funcionalidad publicitaria probada en sesiones/casos reales y reportada con pruebas negativas, no como éxito por ausencia accidental de anuncios en un vídeo. Las medidas adoptadas deben ser seguras y explicables.
5. E2E en la PC Windows del owner cuando esa superficie sea accesible con permiso, evidencia de proceso/captura/log; salida clara de lo que se pudo/no se pudo probar.
6. Documentación de autoría/procedencia, licencias, dependencias, riesgos, instrucciones de compilación y diagnóstico; se publica en el repositorio comunitario público solo tras revisión legal, funcional y de secretos; nunca como software oficial de terceros.
7. Review independiente y diff validado. No tocar Streamflix ni sistemas transversales.

## Observabilidad / método de REA

Usar la inspección estática existente como baseline, reducir el grafo a componentes por función, verificar cada hipótesis con la fuente y usar escenarios runtime acotados solo en el entorno propio autorizado. No ejecutar código fuente de referencia ni capturar credenciales. Emitir evidencias de análisis y pruebas con versión, escenario, resultado real, error y límite explícito.

## Gobernanza, licencias y límites de ejecución

Desarrollo comunitario abierto. Sin costes ni dependencias privativas externas, empleando dependencias locales debidamente auditadas. El código fuente se publica y mantiene en https://github.com/Angel52781/tizentube-windows bajo licencia GPL-3.0-only. Queda expresamente prohibido incluir secretos, credenciales o documentación operativa interna en el repositorio público. Todo cambio material debe conservar trazabilidad técnica y validación reproducible.

## Rendimiento como requisito principal

Evitar una decisión anticipada Electron vs Tauri: elegir por ejecución multimedia real, coste total del árbol de procesos y compatibilidad con controles de YouTube. Benchmark verificable en Windows: reposo tras warm-up, navegación, reproducción 1080p o máxima estable, reproducción prolongada, cierre y eventual leak; reportar RAM de procesos relacionados, memoria privada/working set, peak y CPU, con metodología y entorno. Comparar opciones con misma tarea y no prometer cifras sin ensayo.

## Publicación

Repositorio GitHub público aprobado: https://github.com/Angel52781/tizentube-windows (verificado PUBLIC 2026-10-22). Fuente de proyecto no oficial bajo licencia GPL-3.0-only. El repositorio público contiene exclusivamente código fuente, documentación técnica y artefactos verificados y sanitizados.
