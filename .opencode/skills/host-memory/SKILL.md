---
name: host-memory
description: Gestión de memoria persistente por host. Antes de conectar a un servidor, leé su archivo de memoria. Después de cada interacción, actualizalo con nuevos hallazgos, servicios detectados, problemas y soluciones.
---

# Memoria de servidores

> **IMPORTANTE**: todas las rutas con `./` son relativas a la **raíz del proyecto**, no a este archivo.
> La memoria canónica ahora es **TOON**. Los archivos Markdown legacy en `./memoria/hosts/` e `./memoria/incidentes/` NO se borran — solo se leen como fallback.

## Estructura de archivos (TOON — canónica)

```
memoria/
├── entities/hosts/<host>.toon      ← estado consolidado del host
├── events/observations/<week>.toon ← observaciones históricas
├── events/incidents/<id>.toon      ← incidentes
└── views/host-context/<host>.toon  ← vista compacta para IA (leer primero)
```

Legacy Markdown (no tocar, solo fallback):
```
./memoria/hosts/<host>.md
./memoria/incidentes/YYYY-MM-DD-desc.md
```

## Flujo obligatorio

### 1. ANTES de ejecutar debug/recon/k8s-debug/docker-debug/network-debug/ssl-check/digifort/security-audit/patch-status/proxy-debug

Ejecutá `memory-read-context host=<host>`. Si no existe, caé a `./memoria/hosts/<host>.md` (legacy).

### 2. DESPUÉS de obtener datos

Guardá observaciones con `memory-write`. Cada observación debe incluir:
- `id` — único
- `entity` — ej: `host:192.168.1.50`
- `key` — ej: `service.nginx`, `os.name`, `disk.usage_percent`
- `value` — string, number, o boolean
- `source` — la tool que generó el dato (debug, recon, etc.)
- `observed_at` — ISO 8601
- `confidence` — 0-1
- `ttl_days` — días hasta que expire
- `evidence` — opcional, se redacta automáticamente

Esto actualiza automáticamente:
- `events/observations/` (historial append-only)
- `entities/hosts/<host>.toon` (estado consolidado)
- `views/host-context/<host>.toon` (vista para IA)

### 3. Si resolviste un problema o aplicaste un cambio

Seguí los pasos 10 y 11 de `AGENTS.md`: registrá el cambio en `events/changes/<id>.toon` (schema `sysadmin.change.v1`) y/o el incidente en `events/incidents/<id>.toon` (schema `sysadmin.incident.v1`). No uses `memory-write` con key `incident.*` para esto — son mecanismos separados.

## Reglas
- NO borrés memoria legacy Markdown.
- Hostnames preferidos para entidades; si no hay hostname conocido, IPs son aceptables. **Nunca passwords, tokens ni secretos.** La redacción automática ayuda pero no es infalible.
- Si `memory-*` falla, seguí usando las tools de diagnóstico normalmente y actualizá el Markdown legacy como antes.
- No confiar en facts vencidos sin refrescarlos — corré `memory-stale host=<host>` primero.
