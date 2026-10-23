# Auditoría de arquitectura: TizenTube original vs TizenTube Windows

**Fecha:** 2026-10-23
**Incidente:** Anuncio masthead UPN («Patrocinado») reaparece al abrir TizenTube Windows, incluidas previews anteriores; solicitudes de paridad con TizenTube Cobalt de Chromecast.

## Fuentes propietarias inspeccionadas

- `references/TizenTube` — copia de `reisxd/TizenTube` en commit `f99945a`, solo lectura.
- `references/TizenTube/mods/features/adblock.js` — fuente original de filtrado, no mera documentación.
- `references/TizenTube/mods/userScript.js`, `mods/features/userAgentSpoofing.js`, `standalone/service/index.js`, `mods/features/sponsorblock.js` — inicialización e integración de la app TV.
- [`reisxd/TizenTubeCobalt`](https://github.com/reisxd/TizenTubeCobalt) — Android/Google TV y runtime Cobalt, distinto del repositorio Tizen. Se comprobó el puente nativo en `cobalt/browser/h5vcc_tizentube/h5vcc_tizentube_impl.cc` y los perfiles de dispositivo de TizenTube.
- [Incidente público TizenTube Cobalt #356](https://github.com/reisxd/TizenTubeCobalt/issues/356) — reportes recientes de anuncios que vuelven a atravesar sus filtros: el bloqueo upstream tampoco es una garantía permanente.

## Tabla de diferencias comprobadas

| Decisión | TizenTube original (TV) | Windows anterior a esta auditoría | Recuperación |
|---|---|---|---|
| Interfaz | YouTube **TV**, respuesta `tvBrowseRenderer` | `https://www.youtube.com`, interfaz **desktop** | Ruta `--tv` experimental y separada; no imponerla sin prueba funcional |
| Contenedor Android | **Cobalt** y puentes nativos (`h5vcc`, integración dispositivo) | .NET 8 WinForms + Edge **WebView2** | No afirmar compatibilidad completa de runtimes distintos |
| Identidad de dispositivo | Perfil UA Cobalt para TV, generado en `userAgentSpoofing.js` | UA de WebView2/Windows | UA basado en el perfil Chromecast *solo en modo `--tv`*, sin reutilizar sesión desktop |
| Anuncios del reproductor | `JSON.parse`: `adPlacements=[]`, `playerAds=false`, `adSlots=[]` | Eliminación de propiedades; algunas respuestas desktop por otros mecanismos | Preservar semántica del upstream **solo en TV**, sin romper el formato desktop |
| Portada TV | Elimina `adSlotRenderer` en `tvSurfaceContentRenderer.sectionListRenderer.contents` | Adaptación parcial a `richGridRenderer` desktop | Eliminar nodos TV también dentro de `shelfRenderer.content.horizontalListRenderer.items` |
| Solicitud de playback en TV | `JSON.stringify`: `isInlinePlaybackNoAd=true` | No existía | Portar hook solo para `/tv` con copia superficial, sin modificar request desktop ni objeto original |
| Inyección de scripts | Antes de ejecución, en entorno app TV | `AddScriptToExecuteOnDocumentCreatedAsync` en WebView2 | Ya confirmado que bundle y CSS se ejecutan; esto **no prueba** que se filtre la publicidad desktop |
| Portada desktop | No existe esa interfaz en TV original | Tarjetas masthead y feed promocionado específicas de desktop | Filtros propios y captura de metadatos de DOM para reconocer formatos reales, no asumir paridad |
| SponsorBlock | Base comunitaria y saltos asociados al reproductor TV | Port de API y eventos de vídeo HTML5 | Mantener pruebas reales y fallos de API separados del bloqueo de anuncios |

## Causa raíz

El proyecto Windows heredó **técnicas** del original, pero no su **interfaz, contrato de datos, runtime ni estructura DOM**. YouTube de escritorio inserta promociones donde la aplicación de TV no lo hace; eliminar `adSlotRenderer` de una respuesta TV no evita un anuncio masthead distinto en desktop. Los tests que solo confirman carga del CSS, presencia del módulo o fixtures de anuncios **no prueban** que la tarjeta UPN de una cuenta real desaparezca.

La captura del propietario prueba que el problema persiste pese a las previews. No se conoce todavía el árbol DOM exacto de esa tarjeta en su cuenta; inventarlo sería repetir el mismo error metodológico.

## Qué se implementó en esta revisión

1. Se restablecieron semánticas originales de arrays/booleanos y la limpieza anidada de estanterías de TV. Hay regresiones con fixtures del contrato original.
2. Se añadió modo **`TizenTubeHost.exe --tv` experimental** con perfil separado `%LOCALAPPDATA%/TizenTube/TVUserData`. La modalidad desktop y su login permanecen como antes. Cobalt no es WebView2: **no hay garantía** de login, reproducción, interfaz idéntica ni adblock hasta un E2E verdadero.
3. Se añadió **diagnóstico local bajo demanda** con `Ctrl+Shift+F10`: solo etiquetas explícitas de anuncios y tipos/IDs de elementos ancestros. El archivo queda en `%LOCALAPPDATA%/TizenTube/UserData/adblock-diagnostic.json` (o `TVUserData` en modo TV). El usuario decide si lo comparte. No se recogen automáticamente cookies, cuentas, títulos, comentarios, vídeo IDs ni URLs.
4. Se mantienen los filtros específicos de desktop previamente implementados y las pruebas de que no modifican APIs de Google Accounts.

## Criterio de aceptación todavía pendiente

- **Desktop:** abrir con la cuenta real y comprobar ausencia de masthead y anuncios en Inicio después de varias navegaciones. Si reaparece UPN, usar el diagnóstico para identificar el componente real y corregirlo con un fixture reproducible.
- **TV experimental:** comprobar que la ruta `/tv` carga una interfaz utilizable, admite navegación y reproduce un vídeo; comparar experiencia y anuncios con TizenTube Cobalt. Que el proceso WinForms arranque no basta.
- **Calidad:** comprobar login, SponsorBlock, DeArrow, nitidez y consumo completo de procesos bajo reproducción en Windows.

**No afirmar «adblock 100 % resuelto» o «réplica exacta» hasta superar estos casos con evidencia de ejecución real.**
