---
name: host-memory
description: Gestión de memoria persistente por host. Antes de conectar a un servidor, leé su archivo de memoria. Después de cada interacción, actualizalo con nuevos hallazgos, servicios detectados, problemas y soluciones.
---

# Memoria de servidores

> **IMPORTANTE**: todas las rutas con `./` son relativas a la **raíz del proyecto**, no a este archivo.

## Estructura de archivos

```
./memoria/
  hosts/<host>.md        → info persistente por servidor
  incidentes/YYYY-MM-DD-descripcion.md  → registro de incidentes
```

## Flujo obligatorio

### 1. ANTES de ejecutar debug/recon/k8s-debug/docker-debug/network-debug/ssl-check

Leé `./memoria/hosts/<host>.md` si existe. Si no existe, inicializalo al final.

### 2. DESPUÉS de obtener datos

Actualizá `./memoria/hosts/<host>.md` con:
- Servicios activos detectados (merge, no duplicar)
- Problemas encontrados y cómo se solucionaron
- Cambios en configuración o estado relevantes
- Fecha de última actualización

### 3. Si resolviste un problema

Creá un archivo en `./memoria/incidentes/` con nombre `YYYY-MM-DD-descripcion-corta.md` conteniendo:
- Host afectado
- Síntomas
- Diagnóstico (comandos usados, output relevante)
- Solución aplicada
- Estado actual

## Formato del archivo host

```markdown
# <hostname o IP>

## Sistema
- OS:
- Kernel:
- Recursos: (RAM, CPU, disco)

## Servicios
| Servicio | Estado | Puerto | Notas |
|----------|--------|--------|-------|

## Problemas conocidos
| Fecha | Problema | Solución |
|-------|----------|----------|

## Incidentes relacionados
- [[YYYY-MM-DD-desc]]

## Notas
```

## Reglas
- NO borrés información anterior al actualizar — solo agregá o corregí.
- Si un servicio ya no está, movelo a una sección "Servicios anteriores".
- Siempre registrá la fecha (`YYYY-MM-DD`) en cada entrada.
- Si detectás un problema nuevo pero no lo resolvés, dejalo documentado igual.
