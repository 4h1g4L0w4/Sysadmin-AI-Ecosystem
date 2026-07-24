---
name: patch-status
description: Estado de parches y actualizaciones. Corré patch-status ante sospecha de servidor desactualizado, antes de un upgrade mayor, o para evaluar compatibilidad.
---

# Patch Status

> **IMPORTANTE**: todas las rutas con `./` son relativas a la raíz del proyecto.

## Cuándo ejecutar

Usá `patch-status` automáticamente cuando el usuario:
- Pregunte por actualizaciones pendientes ("qué updates hay", "está atrasado", "parches", "paquetes")
- Mencione upgrade/dist-upgrade y quiera saber el impacto
- Pida "compatibilidad" o "riesgo de upgrade"
- Quiera saber si hay security patches sin aplicar

## Modos de operación

### `mode: "summary"` (default)
Devuelve resumen compacto:
- OS + package manager
- Total updates (security vs regular)
- Reboot required
- Paquetes que se eliminarían (riesgo ALTO)
- Held/pinned packages (riesgo MEDIO)
- Orphaned packages
- Top 10 security updates

### `mode: "full"`
Listado completo de todos los paquetes upgradables, líneas de simulación de dist-upgrade, held, orphaned.

### `mode: "security"`
Solo paquetes con actualización de seguridad.

## Interpretación de riesgos

| Señal | Riesgo |
|-------|--------|
| Paquetes eliminados en dist-upgrade | ALTO — conflictos de dependencia |
| Held/pinned packages | MEDIO — quedarán atrás, posible break |
| Orphaned packages | BAJO/MEDIO — sin maintainer |
| Reboot required | Informativo — kernel/libc update |
| 100+ updates pendientes | MEDIO — servidor muy atrasado |
| Updates de seguridad sin aplicar | ALTO — vulnerabilidades expuestas |

## Lo que guardar en memoria

Seguí el flujo canónico de `host-memory` (`memory-write` → TOON). **No escribas en `./memoria/hosts/<host>.md`** — ese archivo es legacy, solo fallback de lectura.

Observaciones sugeridas (`key` / `value`):
- `patch.updates_total`, `patch.security_updates`, `patch.reboot_required`, `patch.upgrade_risk`

## Notas técnicas

- Usa `apt list --upgradable` (Debian/Ubuntu), `dnf check-update` (RHEL/Fedora), `yum check-update` (CentOS 7)
- `apt-get -s dist-upgrade` es simulación pura — no modifica nada
- No corre `apt update` ni `dnf makecache` — usa el cache existente
- La tool es read-only — no modifica nada en el servidor
- Reboot detection: verifica existencia de `/var/run/reboot-required`
