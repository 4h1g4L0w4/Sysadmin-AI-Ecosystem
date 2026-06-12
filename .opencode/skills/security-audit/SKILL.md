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
- Reciba un servidor nuevo (después de `recon`)

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
| 81-100 | Excelente — hardering avanzado aplicado |

## Lo que guardar en memoria

Después de ejecutar, actualizá `./memoria/hosts/<host>.md` con:

```markdown
## Security
- Último audit: YYYY-MM-DD
- Hardening Index: XX
- Warnings: XX
- Suggestions: XX
- Hallazgos críticos: (resumen breve)
```

No dupliques entradas de auditorías previas; agregá una nueva fila con la fecha más reciente.

## Notas técnicas

- Lynis se descarga a `/tmp/lynis` si no está instalado (no persiste entre reinicios del servidor)
- Usa `--quick --no-colors` para minimizar tiempo y output
- La tool es read-only — no modifica nada en el servidor
- Si el servidor no tiene `curl` ni `wget`, la tool falla. Instalalo manualmente o instalá Lynis por el gestor de paquetes.
