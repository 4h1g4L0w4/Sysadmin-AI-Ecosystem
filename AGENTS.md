# Sysadmin AI - Reglas del proyecto

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

## Flujo de trabajo

1. **Host nuevo / desconocido** → corré `recon` primero para mapear el servidor.
2. **Host conocido** → corré `memory-read-context host=<host>` para leer el contexto TOON antes de diagnosticar.
   - Si no hay contexto TOON, caé a `./memoria/hosts/<host>.md` (legacy).
3. **Problema concreto** → usá la tool específica (`debug`, `network-debug`, etc.).
4. **Host no especificado** → preguntá cuál es el servidor antes de actuar.
5. **Siempre al finalizar** → guardá observaciones relevantes con `memory-write host=<host> observations=<JSON>`.
   - Cada observación debe incluir: `id`, `entity`, `key`, `value`, `source`, `observed_at`, `confidence`, `ttl_days`.
   - **NUNCA guardar secretos, passwords, tokens ni IPs reales.**
6. **Si resolviste un problema** → registralo como incidente TOON con `memory-write`.
7. **No confiar en facts vencidos** → corré `memory-stale host=<host>` antes de reusar facts viejos.

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
- Después de cada tool, escribir observaciones con `memory-write`.
- No confiar en facts vencidos sin refrescarlos.
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
| "revisá el server X completo" | `memory-read-context` + `debug` + `recon` + `patch-status` (modo quick) |
| "auditá seguridad + parches en X" | `security-audit` + `patch-status` |
| "diagnóstico completo de red y proxy" | `network-debug` + `proxy-debug` |
| "todo lo que sepas de X" | `memory-read-context` + todas las tools relevantes según el contexto |

Al componer:
- Si el host es **conocido**, leé contexto primero con `memory-read-context`
- Si el host es **desconocido**, empezá con `recon`
- Consolidá los resultados en una respuesta única

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
