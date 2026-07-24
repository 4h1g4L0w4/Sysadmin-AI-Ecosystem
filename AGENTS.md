# Sysadmin AI - Reglas del proyecto

## Auto-sync del ecosistema

Al comenzar cada nuevo chat con el usuario, ejecutar **`opencode-sync`** con `apply=true` para sincronizar `opencode.json` con las tools y skills reales en disco (producto de `git pull`). Si falla (sin git, merge conflict, etc.), reportar el error y continuar igual.

## Auto-diagnóstico del ecosistema

Después del sync, ejecutar **`self-check`** automáticamente para verificar que el ecosistema esté funcionando correctamente (SSH keys, memoria TOON, tools registradas).

Si durante una interacción ocurre un error inesperado (ej: "tool not found", el output de una tool no es el esperado, o la tool reporta un error interno), ejecutar **`self-check`** para diagnosticar el ecosistema antes de asumir que el problema está en el servidor remoto.

Si `self-check` reporta fallos, presentarlos al usuario antes de continuar con cualquier diagnóstico.

## Modo read-only (seguridad)

Todas las tools de diagnóstico son **estrictamente de solo lectura**. Ninguna tool ejecuta comandos que modifiquen el estado del servidor remoto (no reinician servicios, no tocan configuraciones, no matan procesos, no aplican parches).

Si durante un diagnóstico identificás una acción correctiva necesaria:
1. **Informala** al usuario en el resumen como "Acción recomendada"
2. **No la ejecutés** sin confirmación explícita del usuario en ese mismo turno
3. Si el usuario **autoriza** la acción, ejecutala y registrala como change TOON (paso 10 del flujo)

Esta regla aplica a todas las tools (debug, recon, network-debug, ssl-check, docker-debug, k8s-debug, security-audit, patch-status, proxy-debug, digifort). Ninguna de ellas modifica nada en el servidor remoto.

## Selección automática de tools

El usuario **nunca** debe especificar qué tool usar. Inferí la tool correcta según la **intención** del mensaje, no según coincidencia textual con la tabla — las frases de ejemplo son ilustrativas, no las únicas válidas. Si el mensaje combina varios síntomas (ej: "el nginx se cayó y no puedo entrar por SSH"), identificá cada síntoma por separado antes de elegir tool(s); no fuerces todo a una sola fila de la tabla.

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
| "relación" / "depende" / "conecta" / "relacioná" / "este host se conecta a" / "dependencia entre hosts" | **memory-relation** |

## Flujo de trabajo

### Al iniciar un chat (una sola vez por sesión)

1. **Auto-sync inicial** → corré `opencode-sync apply=true` para sincronizar tools y skills con el repo. Si falla, reportalo y continuá igual.

2. **Auto-diagnóstico inicial** → corré `self-check`. Si hay fallos, reportalos y preguntá si querés continuar.

### Por cada pedido del usuario

3. **Host no especificado** → preguntá cuál es el servidor antes de actuar.

4. **Host nuevo / desconocido** → corré `recon` primero para mapear el servidor.
   - **Preguntale al usuario por relaciones con otros hosts solo si `entities/hosts/<host>.toon` no tiene ninguna relación registrada todavía.** Si ya tiene relaciones conocidas, no volvas a preguntar — mostralas como contexto y seguí. Si el usuario menciona una relación nueva espontáneamente, registrala igual aunque ya existan otras.

5. **Host conocido** → corré `memory-read-context host=<host>` para leer el contexto TOON antes de diagnosticar.
   - Si no hay contexto TOON, caé a `./memoria/hosts/<host>.md` (legacy).
   - **Si `memory-stale host=<host>` detecta facts vencidos**, refrescá automáticamente solo los facts relevantes para el pedido actual del usuario (no la totalidad de lo vencido). Si el pedido es puntual (ej: "¿corre redis?"), refrescá como máximo el fact directamente relacionado. Si el pedido es "revisá todo" o un diagnóstico completo, ahí sí refrescá todo lo vencido.

6. **Problema concreto** → usá la tool específica (`debug`, `network-debug`, etc.). Si dos categorías describen una misma cadena causal (ej: "proxy tira 502 y el container backend no responde"), componé ambas tools aunque el usuario no pida "completo".

7. **Acumulá observaciones, NO escribas después de cada tool.** Mantené un array en memoria con las observaciones más relevantes de todas las tools ejecutadas. Al final del diagnóstico de **ese host**, hacé **un único** `memory-write host=<host> observations=<JSON>`.
   - Cada observación incluye: `id`, `entity`, `key`, `value`, `source`, `observed_at`, `confidence`, `ttl_days`.
   - **NUNCA guardar passwords, tokens ni secretos.** Hostnames preferidos para entidades; si no hay hostname conocido, IPs son aceptables.

8. **Después del write, ejecutá automáticamente `memory-conflicts host=<host>`.** Si hay contradicciones (ej: servicio activo pero puerto cerrado), incluilas en el resumen al usuario.

9. **Compactación inteligente.** Si las observaciones escritas son redundantes (repiten facts ya existentes en el perfil con los mismos valores), ejecutá automáticamente `memory-compact host=<host>` para limpiar el perfil y dejar solo datos nuevos. Si no estás seguro de si un fact es redundante, comparalo contra el perfil actual en `entities/hosts/<host>.toon`.

10. **Si aplicaste un cambio en el servidor** (reinicio de servicio, config change, fix) → registralo como change TOON en `memoria/events/changes/<id>.toon` con schema `sysadmin.change.v1`:
    ```
    schema: sysadmin.change.v1
    id: chg-<host>-<fecha>       ← único
    host: <IP o hostname>       ← servidor afectado
    summary: <qué cambió>
    action: <applied|rolledback|in-progress>
    applied_at: <ISO 8601>
    evidence: |-               ← opcional
      <output del comando>
    ```

11. **Si resolviste un problema** → registralo como incidente TOON en `memoria/events/incidents/<id>.toon` con schema `sysadmin.incident.v1`:
    ```
    schema: sysadmin.incident.v1
    id: inc-<host>-<fecha>       ← único
    host: <IP o hostname>       ← servidor afectado
    severity: <critical|warning|info>
    summary: <descripción corta>
    status: <resolved|mitigated>
    opened_at: <ISO 8601>
    resolved_at: <ISO 8601>
    evidence: |-               ← opcional
      <detalles del diagnóstico>
    ```

12. **Al finalizar, presentá un resumen acorde a la complejidad del pedido:**

    - **Pedido puntual, una sola tool, sin hallazgos relevantes** → respuesta corta en prosa, sin template. Ej: "redis está activo en web1, puerto 6379 abierto, sin errores recientes en el log."

    - **Diagnóstico multi-tool o con hallazgos relevantes** → resumen estructurado completo:
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

Tipos de relación soportados por `memory-relation`:
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
├── entities/hosts/<host>.toon      ← estado consolidado del host (incluye relaciones)
├── entities/services/<svc>.toon     ← estado consolidado de servicios
├── entities/clusters/<cls>.toon     ← estado consolidado de clusters
├── events/observations/<week>.toon  ← observaciones históricas (append)
├── events/incidents/<id>.toon       ← incidentes
├── events/changes/<id>.toon         ← cambios aplicados
├── events/audit/<id>.toon           ← auditorías de seguridad
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

## TTL de referencia por tipo de fact

Al escribir observaciones, usá estos TTL como default salvo que el contexto indique algo distinto. Esto es lo que hace que `memory-stale` refresque lo que realmente cambia y no toque lo que no:

| Tipo de fact | TTL sugerido | Ejemplos |
|---|---|---|
| Hardware / capacidad fija | 90+ días | cores de CPU, RAM total, modelo de disco |
| Configuración estable | 14-30 días | versión de OS, paquetes instalados, config de proxy |
| Estado de servicios | 1-3 días | servicio activo/inactivo, puertos abiertos |
| Métricas de uso | horas (ej: 0.25-1 día) | uso de disco %, uso de memoria, carga |
| Seguridad / hardening | 7 días | resultado de Lynis, CVEs pendientes |
| Relaciones entre hosts | sin vencimiento (no aplica TTL) | proxiesa, depende-de, conecta-a |

Si una tool nueva no está en esta lista, elegí el TTL por analogía con la fila más parecida y agregala acá.

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

**Regla general de composición:** la tabla de prioridad define el **orden de presentación**, no cuáles tools correr. Si el mensaje nombra más de un síntoma concreto (sea cual sea la cantidad de categorías involucradas), componé una tool por cada síntoma nombrado. Usá la prioridad únicamente para decidir qué resultado liderar en el resumen final — nunca para descartar diagnósticos que el usuario pidió explícita o implícitamente.

## Composición de tools

Podés ejecutar **múltiples tools** en una misma interacción si el pedido lo amerita:

| Pedido del usuario | Tools a ejecutar |
|---|---|
| "revisá el server X completo" | `memory-read-context` + `debug` + `recon` + `patch-status` (modo quick) |
| "auditá seguridad + parches en X" | `security-audit` + `patch-status` |
| "diagnóstico completo de red y proxy" | `network-debug` + `proxy-debug` |
| "todo lo que sepas de X" | `memory-read-context` + todas las tools relevantes según el contexto |

Al componer (asumiendo que los pasos 1-2 ya se ejecutaron al iniciar el chat):
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
- El usuario puede sobreescribirlas pasando `username`/`password` directamente a la tool `digifort`. **Advertencia:** el override en el chat queda visible en el historial de la conversación. Preferí siempre el `.env`.

## Recursos del proyecto

- `ssh-keys/` → claves SSH (auto-detectadas, no pasar `identityFile`)
- `memoria/hosts/` → info persistente legacy (Markdown, no editar)
- `memoria/incidentes/` → registro legacy de problemas resueltos (Markdown, no editar)
- `memoria/entities/` → estado consolidado TOON
- `memoria/events/` → historial TOON
- `memoria/views/` → contexto compacto TOON para IA
- `memoria/schemas/` → contratos TOON
