---
name: security-audit
description: Auditoría de seguridad con Lynis. Corré security-audit al recibir un servidor nuevo o ante sospecha de vulnerabilidades. Interpretá el hardening index, warnings y suggestions.
---

# Security Audit con Lynis

> **IMPORTANTE**: todas las rutas con `./` son relativas a la raíz del proyecto.

## Cuándo ejecutar

Usá `security-audit` automáticamente cuando el usuario:
- Pida una auditoría de seguridad ("auditá la seguridad", "hacé un security audit", "ejecutá Lynis")
- Pida análisis de vulnerabilidades o hardening
- Mencione "CIS benchmark", "hardening score", "lynis"
- Al terminar un `recon` de servidor nuevo, **recomendá** en el resumen correr `security-audit`, pero no lo ejecutes automáticamente — es una operación lenta (descarga y corre Lynis) que el usuario debería confirmar.

## Modos de operación

### `mode: "quick"` (default)
Devuelve solo:
- Hardening Index (0-100)
- Cantidad de warnings y suggestions
- Top 10 warnings
- Top 10 suggestions

Usar para una visión rápida.

### `mode: "full"`
Devuelve el reporte Lynis completo (formato key=value). Usar si el usuario pide el reporte completo o si querés profundizar en un hallazgo específico.

## Interpretación de resultados

| Hardening Index | Significado |
|-----------------|-------------|
| 0-40 | Crítico — múltiples vulnerabilidades |
| 41-60 | Bajo — mejoras importantes necesarias |
| 61-70 | Aceptable — mejoras recomendadas |
| 71-80 | Bueno — configuración sólida |
| 81-100 | Excelente — hardening avanzado aplicado |

## Lo que guardar en memoria

Seguí el flujo canónico de `host-memory` (`memory-write` → TOON). **No escribas en `./memoria/hosts/<host>.md`** — ese archivo es legacy, solo fallback de lectura.

Observaciones sugeridas (`key` / `value`):
- `security.hardening_index`, `security.warnings_count`, `security.suggestions_count`, `security.critical_findings`

## Notas técnicas

- Lynis se descarga a `/tmp/lynis` si no está instalado (no persiste entre reinicios del servidor)
- Usa `--quick --no-colors` para minimizar tiempo y output
- La tool es read-only — no modifica nada en el servidor
- Si el servidor no tiene `curl` ni `wget`, la tool falla. Instalalo manualmente o instalá Lynis por el gestor de paquetes.
