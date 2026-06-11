# api.muni-sn.com.ar

## Sistema
- Hosting: dattaweb.com
- IPs: 149.50.159.91, 149.50.159.102
- Ruta red: Telecom Argentina (~6.3ms latencia)

## Servicios
| Servicio | Estado | Puerto | Notas |
|----------|--------|--------|-------|
| HTTP | OPEN | 80 | redirect 308 → HTTPS |
| HTTPS | OPEN | 443 | HTTP/2, responde 404 en raíz |
| HTTPS | OPEN | 8080 | - |
| HTTPS | OPEN | 8443 | - |
| SSH | CLOSED | 22 | - |

## Problemas conocidos
| Fecha | Problema | Solución |
|-------|----------|----------|
| 2026-06-11 | HTTPS raíz responde 404 | Depende del path esperado por la API |

## Notas
- Última actualización: 2026-06-11
- Diagnóstico: ping OK, sin pérdida de paquetes, ruta limpia
- No hay SSH habilitado
