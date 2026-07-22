# Sysadmin AI - Reglas del proyecto

## Auto-sync del ecosistema

Al comenzar cada nuevo chat con el usuario, ejecutar **`opencode-sync`** con `apply=true` para sincronizar `opencode.json` con las tools y skills reales en disco (producto de `git pull`). Si falla (sin git, merge conflict, etc.), reportar el error y continuar igual.

## Auto-diagnóstico del ecosistema

Después del sync, ejecutar **`self-check`** automáticamente para verificar que el ecosistema esté funcionando correctamente (SSH keys, memoria TOON, tools registradas).

Si durante una interacción ocurre un error inesperado (ej: "tool not found", el output de una tool no es el esperado, o la tool reporta un error interno), ejecutar **`self-check`** para diagnosticar el ecosistema antes de asumir que el problema está en el servidor remoto.

Si `self-check` reporta fallos, presentarlos al usuario antes de continuar con cualquier diagnóstico.

## Selección automática de tools

El usuario **nunca** debe especificar qué tool usar. Inferí la tool correcta automáticamente según su mensaje:

| Si el usuario dice... | Usá esta tool |
|---|---|
| "server X está lento/caído/tiene errores" / "revisá el estado de X" / "diagnosticá X" | **debug** |
| "qué hay en server X" / "servidor nuevo" / "explorá X" / "descubrí qué corre en X" | **recon** |
| "contenedores" / "Docker" / "container X no funciona / reinicia / no responde" | **docker-debug** |
| "Kubernetes" / "k8s" / "pods" / "cluster" / "deployment X" | **k8s-debug** |
| "conectividad" / "red" / "no llega" / "ping" / "DNS" / "traceroute" / "firewall" | **network-debug** |
| "SSL" / "certificado" / "HTTPS" / "vencimiento" / "TLS" | **ssl-check** |
| "Digifort" / "NVR" / "cámaras" / "servidor de video" / "GetUsage" / "GetCameras" | **digifort** |
| "auditá la seguridad" / "Lynis" / "vulnerabilidades" / "hardening" / "security audit" / "CIS" | **security-audit** |
| "actualizaciones" / "paquetes" / "upgrade" / "atrasado" / "parches" / "patch" / "qué updates hay pendientes" | **patch-status** |
| "proxy" / "nginx" / "apache" / "caddy" / "reverse proxy" / "no responde" / "502" / "504" / "bad gateway" / "gateway timeout" / "web server" | **proxy-debug** |
| "relación" / "depende" / "conecta" / "relacioná" / "este host se conecta a" / dependencia entre hosts" | **memory-relation** |

## Flujo de trabajo

1. **Auto-sync inicial** → corré `opencode-sync apply=true` para sincronizar tools y skills con el repo. Si falla, reportalo y continuá igual.

2. **Auto-diagnóstico inicial** → corré `self-check`. Si hay fallos, reportalos y preguntá si querés continuar.

3. **Host nuevo / desconocido** → corré `recon` primero para mapear el servidor.

4. **Host conocido** → corré `memory-read-context host=<host>` para leer el contexto TOON antes de diagnosticar.
   - Si no hay contexto TOON, caé a `./memoria/hosts/<host>.md` (legacy).
   - **Si `memory-stale host=<host>` detecta facts vencidos**, ejecutá automáticamente las tools necesarias (debug, recon, etc.) para refrescar los facts vencidos antes de continuar con el diagnóstico. No esperés a que el usuario lo pida.

5. **Problema concreto** → usá la tool específica (`debug`, `network-debug`, etc.).

6. **Host no especificado** → preguntá cuál es el servidor antes de actuar.

7. **Acumulá observaciones, NO escribas después de cada tool.** Mantené un array en memoria con las observaciones más relevantes de todas las tools ejecutadas. Al final de todo el diagnóstico, hacé **un único** `memory-write host=<host> observations=<JSON>`.
   - Cada observación debe incluir: `id`, `entity`, `key`, `value`, `source`, `observed_at`, `confidence`, `ttl_days`.
   - **NUNCA guardar secretos, passwords, tokens ni IPs reales.**

8. **Después del write, ejecutá automáticamente `memory-conflicts host=<host>`.** Si hay contradicciones (ej: servicio activo pero puerto cerrado), incluilas en el resumen al usuario.

9. **Compactación inteligente.** Si las observaciones escritas son redundantes (repiten facts ya existentes en el perfil con los mismos valores), ejecutá automáticamente `memory-compact host=<host>` para limpiar el perfil y dejar solo datos nuevos.

10. **Si resolviste un problema** → registralo como incidente TOON con `memory-write`.

11. **Al finalizar, presentá un resumen estructurado:**
   ```
   ── Resumen: <host> ──
   Estado: <ok / warning / critical>
   Servicios relevantes: <lista>
   Riesgos activos: <lista>
   Facts refrescados: <lista>
   Conflictos detectados: <lista>
   Acciones recomendadas: <lista>
   ```

## Relaciones entre hosts

Cuando estés diagnosticando un host, preguntale al usuario si ese host tiene relación con otros (ej: "este host depende de otro?", "a qué servidores proxy pasa tráfico?", "está conectado a tal base de datos?").

Si el usuario confirma una relación, ejecutá **`memory-relation from=<host> relation=<tipo> to=<otro-host>`** para persistirla.

Tipos de relación soportados:
- `proxiesa` — este host actúa como proxy de otro
- `depende-de` — este host depende de otro (ej: app → database)
- `conecta-a` — conexión de red directa
- `balancea-a` — este host balancea tráfico hacia otro
- `es-clon-de` — servidor duplicado (HA/failover)

Las relaciones se muestran automáticamente en el contexto TOON del host para que estén disponibles en futuros diagnósticos.

## Manejo de errores SSH

Si una tool falla con `SSH_ERROR`, timeout o conexión rechazada:
1. Informá el error específico al usuario (timeout, conexión rechazada, autenticación, etc.).
2. Preguntale qué hacer: intentar con otro puerto, otro usuario, o cancelar la operación.
3. No reintentes automáticamente sin confirmación del usuario.

## Memoria TOON (canónica)

La memoria canónica usa formato **TOON** (Token-Oriented Object Notation), no Markdown.

```
memoria/
├── entities/hosts/<host>.toon      ← estado consolidado del host
├── entities/services/<svc>.toon     ← estado consolidado de servicios
├── entities/clusters/<cls>.toon     ← estado consolidado de clusters
├── events/observations/<week>.toon  ← observaciones históricas (append)
├── events/incidents/<id>.toon       ← incidentes
├── events/changes/<id>.toon         ← cambios aplicados
├── views/host-context/<host>.toon   ← vista compacta para la IA (leer esto)
└── schemas/*.toon                   ← contratos TOON
```

- **events/** = historial append-only
- **entities/** = estado consolidado actual
- **views/** = contexto generado para consumo rápido de la IA
- La IA lee **views/host-context/** primero. Si no existe, genera desde entities.
- Acumulá observaciones de múltiples tools y escribí **una sola vez** al final. No escribir después de cada tool individual.
- Usá `memory-stale` para refrescar facts vencidos antes de diagnosticar.
- Usá `memory-conflicts` después de escribir para detectar contradicciones.
- Si `memory-*` falla, las tools de diagnóstico siguen funcionando.

## Prioridad de selección

Cuando un mensaje mencione **múltiples** categorías, aplicá este orden de prioridad:

1. **Seguridad** → `security-audit`
2. **Parches** → `patch-status`
3. **Proxies / Web server** → `proxy-debug`
4. **SSL/TLS** → `ssl-check`
5. **Digifort / NVR** → `digifort`
6. **Kubernetes** → `k8s-debug`
7. **Docker / Contenedores** → `docker-debug`
8. **Red / Conectividad** → `network-debug`
9. **General / Estado del server** → `debug`
10. **Descubrimiento / Mapeo** → `recon`

Ejemplos:
- *"el server web1 está lento y tiene el disco lleno"* → **debug** (general), no patch-status
- *"el server web1 tiene actualizaciones pendientes y problemas de red"* → **patch-status** (prioridad 2 sobre network-debug)
- *"revisá el server X completo"* → podés **componer**: debug + recon + patch-status en paralelo

## Composición de tools

Podés ejecutar **múltiples tools** en una misma interacción si el pedido lo amerita:

| Pedido del usuario | Tools a ejecutar |
|---|---|
| "revisá el server X completo" | `self-check` + `memory-read-context` + `debug` + `recon` + `patch-status` (modo quick) |
| "auditá seguridad + parches en X" | `security-audit` + `patch-status` |
| "diagnóstico completo de red y proxy" | `network-debug` + `proxy-debug` |
| "todo lo que sepas de X" | `memory-read-context` + todas las tools relevantes según el contexto |

Al componer:
- Siempre empezar con `opencode-sync apply=true` + `self-check` si es el inicio del chat.
- Si el host es **conocido**, leé contexto primero con `memory-read-context` y verificá facts vencidos con `memory-stale`.
- Si el host es **desconocido**, empezá con `recon`.
- Acumulá observaciones en memoria y escribí **una sola vez** al final.
- Después del write, ejecutá `memory-conflicts` y presentá resultados.
- Consolidá los resultados en una respuesta única con el resumen estructurado.

## Catch-all

Si el mensaje del usuario **no matchea** ninguna categoría de la tabla:
- Preguntá **cuál es el servidor** primero
- Si ya hay un servidor en contexto, ejecutá **`debug`** como default
- Si hay dudas sobre qué tool usar, preferí **`recon`** (es la más completa para entender un server)

## Configuración de credenciales

- Las credentials de Digifort se leen del archivo `.env` en la raíz del proyecto, con las variables `DIGIFORT_USER` y `DIGIFORT_PASS`.
- Usá el `.env.example` como plantilla.
- El usuario puede sobreescribirlas pasando `username`/`password` directamente a la tool `digifort`.

## Recursos del proyecto

- `ssh-keys/` → claves SSH (auto-detectadas, no pasar `identityFile`)
- `memoria/hosts/` → info persistente legacy (Markdown, no editar)
- `memoria/incidentes/` → registro legacy de problemas resueltos (Markdown, no editar)
- `memoria/entities/` → estado consolidado TOON
- `memoria/events/` → historial TOON
- `memoria/views/` → contexto compacto TOON para IA
- `memoria/schemas/` → contratos TOON
