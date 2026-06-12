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

## Flujo de trabajo

1. **Host nuevo / desconocido** → corré `recon` primero para mapear el servidor.
2. **Host conocido** → leé `./memoria/hosts/<host>.md` antes de diagnosticar.
3. **Problema concreto** → usá la tool específica (`debug`, `network-debug`, etc.).
4. **Host no especificado** → preguntá cuál es el servidor antes de actuar.
5. **Siempre** al finalizar, actualizá `./memoria/hosts/<host>.md` con los hallazgos.
6. **Si resolviste un problema** → creá `./memoria/incidentes/YYYY-MM-DD-desc.md`.

## Configuración de credenciales

- Las credentials de Digifort se leen del archivo `.env` en la raíz del proyecto, con las variables `DIGIFORT_USER` y `DIGIFORT_PASS`.
- Usá el `.env.example` como plantilla.
- El usuario puede sobreescribirlas pasando `username`/`password` directamente a la tool `digifort`.

## Recursos del proyecto

- `ssh-keys/` → claves SSH (auto-detectadas, no pasar `identityFile`)
- `./memoria/hosts/` → info persistente por servidor
- `./memoria/incidentes/` → registro de problemas resueltos
