---
name: proxy-debug
description: Diagnóstico de reverse proxies (nginx, apache, caddy, traefik, haproxy). Corré proxy-debug cuando haya errores 502/504, config inválida, proxies caídos o problemas de red.
---

# Proxy Debug

> **IMPORTANTE**: todas las rutas con `./` son relativas a la raíz del proyecto.

## Cuándo ejecutar

Usá `proxy-debug` automáticamente cuando el usuario:
- Reporte errores 502, 504, Bad Gateway, Gateway Timeout
- Diga "nginx no funciona", "no responde el proxy", "apache no levanta"
- Mencione configuración de proxy (sites-enabled, vhosts, upstreams)
- Pida revisar logs de nginx/apache/caddy
- Reporte que el servidor web no responde en puerto 80/443
- Mencione algún reverse proxy por nombre

## Modos de operación

### `mode: "auto"` (default)
Resumen compacto:
- Proxy detectado + versión
- Syntax check (VALID/FAILED)
- Server names y puertos clave
- Últimas 10 líneas de error log (si hay errores)
- Resumen 4xx/5xx del access log

### `mode: "config"`
Solo extrae las líneas relevantes de configuración (listen, server_name, proxy_pass, VirtualHost, etc.)

### `mode: "logs"`
Solo error log + resumen del access log.

### `mode: "full"`
Todo sin resumir.

### `proxy: "nginx"` (o "apache"/"caddy"/"traefik"/"haproxy")
Saltea la detección automática y apunta al proxy específico.

## Interpretación de errores comunes

| Error en log | Causa probable |
|---|---|
| `connect() failed (111: Connection Refused)` | Backend caído |
| `no live upstreams` | Todos los upstreams fallaron |
| `SSL: error:14094416` | Certificado inválido/expirado |
| `client intended to send too large body` | `client_max_body_size` bajo |
| `open() "/path" failed (13: Permission denied)` | Permisos en archivos estáticos |
| `Request exceeded the limit of 10 internal redirects` | Rewrite loop |
| `proxy read timed out` | Backend lento, aumentar `proxy_read_timeout` |

## Lo que guardar en memoria

Seguí el flujo canónico de `host-memory` (`memory-write` → TOON). **No escribas en `./memoria/hosts/<host>.md`** — ese archivo es legacy, solo fallback de lectura.

Observaciones sugeridas (`key` / `value`):
- `proxy.type`, `proxy.version`, `proxy.config_valid`, `proxy.last_errors`

## Notas técnicas

- Detección por binario + systemd is-active
- `nginx -t` / `apache2ctl -t` validan sintaxis sin modificar
- No requiere root para la mayoría de las operaciones
- Si el proxy corre en Docker, usar `docker-debug` + `proxy-debug`
