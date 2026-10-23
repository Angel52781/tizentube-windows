# Windows protegió su PC: publicación responsable

TizenTube Windows distribuye actualmente ejecutables **sin firma Authenticode**. Windows Defender SmartScreen evalúa la reputación de cada binario y editor; una app nueva y poco descargada puede mostrar «Windows protegió su PC» aunque no exista una detección de malware. Una advertencia no certifica que el archivo sea seguro ni que sea malicioso.

## Opciones reales para distribución

- **Ahora:** descargar solo desde las releases oficiales de GitHub, comprobar SHA-256 y publicar código fuente, pruebas reproducibles y changelog. Estas medidas aportan trazabilidad, pero **no eliminan SmartScreen**.
- **Gratis, pendiente de solicitud y aprobación:** estudiar el programa de firma para software libre [SignPath Foundation](https://signpath.org/). Requiere cumplir sus condiciones y contar con una release y proyecto público mantenido. No hay garantía de aceptación ni de ausencia de SmartScreen al principio.
- **Con identidad de editor propia:** certificado comercial Authenticode OV u otro proveedor autorizado y firma de cada binario. Conlleva coste y validación de identidad; la reputación todavía puede tardar en construirse. Los certificados EV ya no garantizan evitar la alerta.
- **Microsoft Store / MSIX:** es otra vía de distribución con firma de Microsoft y menor fricción, pero requiere preparar el paquete y cumplir el proceso de publicación de la Store. No es lo mismo que descargar un ZIP desde GitHub.

No desactivar SmartScreen, quitar Mark-of-the-Web, autoañadir exclusiones al antivirus, instalar certificados autofirmados en equipos de usuarios ni enseñar a ignorar indiscriminadamente el aviso. El primer paso es verificar el origen y el hash del archivo.

Fuentes oficiales: [Microsoft — SmartScreen reputation](https://learn.microsoft.com/windows/apps/package-and-deploy/smartscreen-reputation), [Microsoft — code signing options](https://learn.microsoft.com/windows/apps/package-and-deploy/code-signing-options).
