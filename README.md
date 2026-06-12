<p align="center">
  <img src="https://img.shields.io/badge/opencode-Sysadmin%20AI%20Ecosystem-7C3AED?style=for-the-badge&logo=openai&logoColor=white" alt="Badge">
</p>

<h1 align="center">🛠️ Sysadmin AI Ecosystem</h1>

<p align="center">
  <b>Un ecosistema de herramientas inteligentes para administración de servidores · <a href="https://opencode.ai">OpenCode</a></b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square">
  <img src="https://img.shields.io/badge/Tools-9-7C3AED?style=flat-square">
  <img src="https://img.shields.io/badge/Skills-3-22C55E?style=flat-square">
  <img src="https://img.shields.io/badge/Powered%20by-OpenCode-FF6B35?style=flat-square">
</p>

---

## 📋 Tabla de Contenidos

- [Descripción General](#-descripción-general)
- [Arquitectura](#-arquitectura)
- [Tools Disponibles](#-tools-disponibles)
  - [debug](#-debug)
  - [recon](#-recon)
  - [k8s-debug](#-k8s-debug)
  - [docker-debug](#-docker-debug)
  - [network-debug](#-network-debug)
  - [ssl-check](#-ssl-check)
  - [digifort](#-digifort)
  - [security-audit](#-security-audit)
  - [patch-status](#-patch-status)
- [Memoria Persistente](#-memoria-persistente)
- [Flujo de Trabajo](#-flujo-de-trabajo)
- [Instalación](#-instalación)
  - [Requisitos](#requisitos)
  - [Setup rápido](#setup-rápido)
- [Ejemplos de Uso](#-ejemplos-de-uso)
- [Skills](#-skills)
- [Roadmap](#-roadmap)
- [Contribuir](#-contribuir)
- [Licencia](#-licencia)

---

## 🚀 Descripción General

**Sysadmin AI Ecosystem** es un conjunto de herramientas (tools + skills) para [OpenCode](https://opencode.ai) que convierte a un asistente de IA en un **ingeniero de sistemas autónomo** capaz de:

- 🔍 Diagnosticar servidores remotos vía SSH
- 🐳 Inspeccionar contenedores Docker y orquestación Kubernetes
- 🌐 Analizar problemas de conectividad y red
- 🔐 Verificar certificados SSL/TLS
- 📹 Consultar servidores Digifort (NVR) — uso, cámaras, estado de grabación
- 🛡️ Auditar seguridad con Lynis — hardening index, warnings, suggestions
- 📦 Estado de parches y actualizaciones — paquetes pendientes, seguridad, compatibilidad
- 🧠 Mantener **memoria persistente** de cada servidor e incidentes

Todo **read-only** y **sin sudo** — seguro para entornos de producción.

---

## 🏗️ Arquitectura

```
sysadmin-ai-ecosystem/
├── AGENTS.md                      ← Reglas de selección automática de tools
├── .env.example                   ← Template de credenciales (Digifort)
├── ssh-keys/                      ← Claves SSH (auto-detectadas)
│   ├── id_ed25519
│   └── id_ed25519.pub
├── memoria/                       ← Memoria persistente
│   ├── hosts/                     ← Info por servidor
│   └── incidentes/                ← Registro de problemas resueltos
└── .opencode/
    ├── tools/                     ← Tools custom (TypeScript)
    │   ├── _ssh.ts                ← Helper SSH compartido
    │   ├── debug.ts
    │   ├── recon.ts
    │   ├── docker-debug.ts
    │   ├── k8s-debug.ts
    │   ├── network-debug.ts
    │   ├── ssl-check.ts
    │   ├── digifort.ts            ← HTTP directo (sin SSH)
    │   ├── security-audit.ts      ← Lynis security audit
    │   └── patch-status.ts        ← Package updates status
    └── skills/
        └── host-memory/
            └── SKILL.md           ← Skill de gestión de memoria
```

### ⚙️ Cómo funciona

```
Usuario → "chequeá el servidor 192.168.1.50 que está lento"
         │
         ▼
    [AGENTS.md] → deduce: usa debug
         │
         ▼
    [memoria/hosts/192.168.1.50.md] → lee contexto previo
         │
         ▼
    [debug.ts] → SSH a 192.168.1.50, comandos read-only
         │
         ▼
    [memoria/hosts/192.168.1.50.md] → actualiza con hallazgos
```

---

## 🧰 Tools Disponibles

Cada tool se conecta por SSH al servidor, auto-detecta la clave en `ssh-keys/`, ejecuta comandos read-only y devuelve la información estructurada.

### 🔬 debug

Diagnóstico general del servidor. Sistemas, recursos, puertos y logs.

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `host` | `string` | Servidor remoto |
| `port` | `number?` | Puerto SSH (22) |
| `username` | `string?` | Usuario SSH |
| `service` | `string?` | Servicio systemd a inspeccionar |

**Salida:** Kernel, uptime, OS, memoria, disco, load average, top procesos, puertos TCP, journald (50 líneas), servicios fallados. Si se especifica `service`: status + últimos logs.

### 🗺️ recon

Reconocimiento completo del servidor. Descubre qué está corriendo y cómo está configurado.

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `host` | `string` | Servidor remoto |
| `port` | `number?` | Puerto SSH (22) |
| `username` | `string?` | Usuario SSH |

**Salida:** OS, systemd activos, top procesos, TCP/UDP listeners, Docker, Podman, k8s, versiones de runtimes (Node/Python/Go/Java/nginx/PostgreSQL/Redis), config de nginx/apache/caddy, directorios de apps, healthchecks locales.

### ☸️ k8s-debug

Depuración de clústeres Kubernetes. Requiere `kubectl` configurado en el host remoto.

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `host` | `string` | Host con kubectl configurado |
| `port` | `number?` | Puerto SSH (22) |
| `username` | `string?` | Usuario SSH |
| `namespace` | `string?` | Filtrar por namespace |
| `pod` | `string?` | Pod específico (requiere namespace) |

**Salida:** Nodos, namespaces, pods (wide), deployments, statefulsets, daemonsets, services, ingress, eventos ordenados, logs (con `--previous`), restart count, `top pods/nodes`.

### 🐳 docker-debug

Depuración de contenedores Docker.

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `host` | `string` | Servidor con Docker |
| `port` | `number?` | Puerto SSH (22) |
| `username` | `string?` | Usuario SSH |
| `container` | `string?` | Container específico |

**Salida:** `docker ps -a`, `stats --no-stream`, imágenes, redes, volúmenes. Si se especifica `container`: inspect, health, restart count, mounts, puertos publicados, logs.

### 🌐 network-debug

Diagnóstico de conectividad desde el servidor.

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `host` | `string` | Servidor para ejecutar tests |
| `target` | `string` | Destino a testear |
| `port` | `number?` | Puerto SSH (22) |
| `username` | `string?` | Usuario SSH |
| `targetPort` | `number?` | Puerto destino para HTTP/probes |
| `test` | `string?` | Tipo: `all`, `ping`, `dns`, `traceroute`, `mtr`, `http`, `ports` |

**Salida:** IPs locales, ruteo, ping, DNS (directo + reverso), traceroute, MTR, HTTP/HTTPS, conexiones activas, escaneo de puertos vía `/dev/tcp`.

### 🔒 ssl-check

Verificación de certificados SSL/TLS.

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `host` | `string` | Servidor para ejecutar el check |
| `target` | `string` | Hostname a verificar |
| `port` | `number?` | Puerto SSH (22) |
| `username` | `string?` | Usuario SSH |
| `targetPort` | `number?` | Puerto HTTPS (443) |
| `sni` | `string?` | SNI (default: target) |

**Salida:** Fechas, subject, issuer, serial, fingerprint SHA-256, SANs, chain, verificación, ventanas de expiración (30/90 días), soporte TLS 1.2 y 1.3.

### 📹 digifort

Consulta el estado de un servidor Digifort (NVR) vía HTTP directo (no SSH). Lee credenciales de `.env` (`DIGIFORT_USER`, `DIGIFORT_PASS`) o permite pasarlas por parámetro.

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `host` | `string` | IP del servidor Digifort |
| `port` | `number?` | Puerto HTTP (8601) |
| `username` | `string?` | Usuario (default: DIGIFORT_USER del .env) |
| `password` | `string?` | Password (default: DIGIFORT_PASS del .env) |
| `action` | `string?` | `usage`, `cameras`, `cameras-status`, `all` (default) |
| `filter` | `string?` | Filtro por nombre/IP/descripción de cámara |

**Salida:**
- **usage** — CPU, memoria, tráfico, conexiones activas del servidor
- **cameras** — listado con nombre, IP, puerto y estado activa/inactiva
- **cameras-status** — estado de grabación: ok/falla, uptime, horas de grabación, disco usado
- **filter** — sin filter muestra solo cantidad + 5; con filter, todas las coincidencias

### 🛡️ security-audit

Ejecuta Lynis security audit en el servidor remoto. Descarga Lynis a `/tmp` si no está instalado. Read-only, sin sudo.

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `host` | `string` | Servidor remoto |
| `port` | `number?` | Puerto SSH (22) |
| `username` | `string?` | Usuario SSH |
| `identityFile` | `string?` | Clave SSH (auto-detectada) |
| `mode` | `string?` | `quick` (default, resumen) o `full` (reporte completo) |

**Salida (quick):** Hardening Index, cantidad de warnings/suggestions, top 10 de cada uno.
**Salida (full):** Reporte Lynis completo (formato key=value).

### 📦 patch-status

Estado de parches y actualizaciones del servidor. Detecta apt (Debian/Ubuntu), dnf (Fedora/RHEL) y yum (CentOS 7).

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `host` | `string` | Servidor remoto |
| `port` | `number?` | Puerto SSH (22) |
| `username` | `string?` | Usuario SSH |
| `identityFile` | `string?` | Clave SSH (auto-detectada) |
| `mode` | `string?` | `summary` (default), `full`, `security` |

**Salida (summary):** OS y package manager, total updates (security vs regular), reboot pending, paquetes que se eliminarían, held/orphaned, top 10 security updates.
**Salida (full):** Listado completo de paquetes upgradables, simulated dist-upgrade, held, orphaned.
**Salida (security):** Solo los paquetes con update de seguridad.

---

## 🧠 Memoria Persistente

Cada servidor tiene un archivo markdown en `memoria/hosts/` que la IA consulta y actualiza automáticamente:

```markdown
# 192.168.1.50

## Sistema
- OS: Ubuntu 24.04 LTS
- Kernel: 6.8.0-31-generic
- Recursos: 8GB RAM, 4 vCPUs, 80GB disco

## Servicios
| Servicio | Estado | Puerto | Notas |
|----------|--------|--------|-------|
| nginx | active | 80/443 | reverse proxy principal |
| postgresql@14-main | active | 5432 | |

## Problemas conocidos
| Fecha | Problema | Solución |
|-------|----------|----------|
| 2026-06-10 | nginx no levantaba | Puerto 80 ocupado por apache |

## Incidentes relacionados
- [2026-06-10-nginx-down](incidentes/2026-06-10-nginx-down.md)
```

---

## 🔄 Flujo de Trabajo

```mermaid
graph TD
    A[Usuario pide ayuda] --> B{Host conocido?}
    B -->|No| C[recon → mapear servidor]
    B -->|Sí| D[Leer memoria/hosts/]
    C --> E{Aplicar tool según problema}
    D --> E
    E --> F[debug / docker-debug / k8s-debug / network-debug / ssl-check / digifort / security-audit / patch-status]
    F --> G[Actualizar memoria/hosts/]
    F --> H{Problema resuelto?}
    H -->|Sí| I[Crear incidente en memoria/incidentes/]
    H -->|No| J[Documentar hallazgos]
    I --> K[Fin]
    J --> K
```

---

## ⚡ Instalación

### Requisitos

- [OpenCode](https://opencode.ai) instalado (`npm install -g @opencode-ai/cli` o vía Bun)
- **SSH agent** cargado con la clave (si tiene passphrase):
  ```bash
  eval $(ssh-agent) && ssh-add ~/.ssh/id_ed25519
  ```
- **Opcional**: Archivo `.env` con `DIGIFORT_USER` y `DIGIFORT_PASS` para la tool `digifort`
- **Opcional**: `sshpass` para autenticación por password:
  ```bash
  sudo apt install sshpass   # Debian/Ubuntu
  brew install sshpass       # macOS
  ```

### Setup rápido

```bash
git clone <repo-url> && cd sysadmin-ai-ecosystem

# Poner tus claves SSH
cp ~/.ssh/id_ed25519 ssh-keys/

# Configurar credenciales Digifort (opcional)
cp .env.example .env   # y editá DIGIFORT_USER / DIGIFORT_PASS

# Abrir opencode
opencode
```

---

## 💡 Ejemplos de Uso

| Qué decís | Qué hace la IA |
|-----------|---------------|
| *"chequeá el estado del servidor 10.0.0.5"* | `debug(host: "10.0.0.5")` → muestra recursos, puertos, logs |
| *"explorá el servidor nuevo 192.168.1.100"* | `recon(host: "192.168.1.100")` → mapea servicios y runtimes |
| *"el contenedor de redis no responde en el server db1"* | `docker-debug(host: "db1", container: "redis")` → logs, health, stats |
| *"no llego desde el server web1 a la API en api.internal:443"* | `network-debug(host: "web1", target: "api.internal", targetPort: 443)` |
| *"verificá el certificado de ejemplo.com desde el server proxy1"* | `ssl-check(host: "proxy1", target: "ejemplo.com")` |
| *"los pods en producción están reiniciando"* | `k8s-debug(host: "master1", namespace: "prod")` |
| *"cómo está el NVR 10.10.10.10"* | `digifort(host: "10.10.10.10")` → usage + cameras + status |
| *"mostrame solo la cámara de la entrada"* | `digifort(host: "10.10.10.10", action: "cameras", filter: "entrada")` |
| *"auditá la seguridad del server 10.0.0.5"* | `security-audit(host: "10.0.0.5")` → hardening index + warnings + suggestions |
| *"dame el reporte completo de lynis del server db1"* | `security-audit(host: "db1", mode: "full")` |
| *"qué updates hay pendientes en el server web1"* | `patch-status(host: "web1")` → resumen + security |
| *"mostrame solo los security updates del server app1"* | `patch-status(host: "app1", mode: "security")` |

---

## 📜 Skills

| Skill | Descripción |
|-------|-------------|
| [host-memory](.opencode/skills/host-memory/SKILL.md) | Instrucciones para que la IA lea/actualice `memoria/hosts/` y registre incidentes automáticamente |
| [security-audit](.opencode/skills/security-audit/SKILL.md) | Cuándo y cómo ejecutar auditorías Lynis, interpretar resultados, persistir hallazgos |
| [patch-status](.opencode/skills/patch-status/SKILL.md) | Evaluación de actualizaciones pendientes, compatibilidad y riesgos de upgrade |

---

## 🗺️ Roadmap

- [x] **`digifort`** — consulta de servidores Digifort NVR (uso, cámaras, estado de grabación)
- [x] **`security-audit`** — auditoría de seguridad con Lynis
- [x] **`patch-status`** — estado de parches y actualizaciones
- [ ] **`db-query`** — consultas SQL read-only a PostgreSQL/MySQL
- [ ] **`ansible-run`** — ejecución de playbooks Ansible para remediación
- [ ] **`prometheus-mcp`** — integración con Prometheus para métricas
- [ ] **Soporte multi-key** — selección automática de la clave correcta por host
- [ ] **Templates de incidentes** — formato predefinido para post-mortems

---

## 🤝 Contribuir

1. Fork el proyecto
2. Creá tu rama (`git checkout -b feature/awesome-tool`)
3. Commit (`git commit -am 'feat: add awesome tool'`)
4. Push (`git push origin feature/awesome-tool`)
5. Abrí un Pull Request

---

## 📄 Licencia

MIT © 2026 — Construido con [OpenCode](https://opencode.ai)

---

<p align="center">
  Hecho con ❤️ para sysadmins que quieren delegar el troubleshooting a la IA
</p>
