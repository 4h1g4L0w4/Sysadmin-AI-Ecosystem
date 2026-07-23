#!/usr/bin/env bash
set -euo pipefail

# ─── Colors ──────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { printf "${CYAN}%s${NC}\n" "$*"; }
ok()    { printf "${GREEN}✓ %s${NC}\n" "$*"; }
warn()  { printf "${YELLOW}⚠ %s${NC}\n" "$*"; }
err()   { printf "${RED}✗ %s${NC}\n" "$*"; exit 1; }

# ─── Header ──────────────────────────────────────────────────────────
cat << "EOF"
╔═══════════════════════════════════════════╗
║    Sysadmin AI Ecosystem — Instalador     ║
╚═══════════════════════════════════════════╝
EOF
echo ""

# ─── 1. Verify prerequisites ─────────────────────────────────────────
info "[1/6] Verificando prerequisitos..."

command -v git  >/dev/null 2>&1 || err "Git no está instalado. Instalalo desde https://git-scm.com"
ok "Git encontrado"

command -v node >/dev/null 2>&1 || err "Node.js no está instalado. Instalalo desde https://nodejs.org"
ok "Node.js $(node -v)"

command -v npm  >/dev/null 2>&1 || err "npm no está instalado."
ok "npm $(npm -v)"

if command -v opencode >/dev/null 2>&1; then
  ok "OpenCode CLI $(opencode --version 2>/dev/null || echo 'encontrado')"
else
  warn "OpenCode CLI no está instalado."
  info "  Instalalo con: npm install -g @opencode-ai/cli"
  read -rp "  ¿Querés que lo instale ahora? [S/n]: " ans
  if [[ ! "$ans" =~ ^[Nn] ]]; then
    npm install -g @opencode-ai/cli || err "Falló la instalación de OpenCode"
    ok "OpenCode instalado"
  else
    warn "Omitiendo OpenCode. Ejecutá 'npm install -g @opencode-ai/cli' más tarde."
  fi
fi

# ─── 2. Clone repository ────────────────────────────────────────────
info "[2/6] Repositorio..."

if [ -d .git ]; then
  ok "Ya estás dentro del repositorio: $(basename "$(pwd)")"
else
  read -rp "  URL del repositorio a clonar (Enter para default): " repo_url
  repo_url="${repo_url:-}"
  if [ -z "$repo_url" ]; then
    err "No se especificó URL. Proporcionala como argumento o编辑 .env"
  fi
  git clone "$repo_url" || err "Falló el clone"
  dir_name=$(basename "$repo_url" .git)
  cd "$dir_name"
  ok "Clonado: $dir_name"
fi

# ─── 3. Install dependencies ─────────────────────────────────────────
info "[3/6] Instalando dependencias TOON..."

if [ -d .opencode/node_modules ]; then
  ok "node_modules ya existe en .opencode/"
else
  (cd .opencode && npm install) || err "Falló npm install en .opencode/"
  ok "Dependencias instaladas en .opencode/"
fi

# ─── 4. SSH keys ─────────────────────────────────────────────────────
info "[4/6] Configurando claves SSH..."

if [ -d ssh-keys ] && [ "$(find ssh-keys -type f ! -name '*.pub' ! -name '.*' 2>/dev/null)" ]; then
  ok "Claves SSH ya presentes en ssh-keys/"
else
  mkdir -p ssh-keys
  # Detect existing keys in ~/.ssh
  existing_keys=()
  for k in "$HOME/.ssh/id_ed25519" "$HOME/.ssh/id_rsa" "$HOME/.ssh/id_ecdsa"; do
    [ -f "$k" ] && existing_keys+=("$k")
  done

  if [ ${#existing_keys[@]} -gt 0 ]; then
    echo "  Se encontraron claves existentes en ~/.ssh/:"
    for i in "${!existing_keys[@]}"; do
      echo "    [$((i+1))] ${existing_keys[$i]}"
    done
    echo "    [C] Cancelar y elegir manual"
    read -rp "  ¿Cuál querés copiar? [1-${#existing_keys[@]}/C]: " key_choice
    if [[ "$key_choice" =~ ^[0-9]+$ ]] && [ "$key_choice" -ge 1 ] && [ "$key_choice" -le "${#existing_keys[@]}" ]; then
      idx=$((key_choice-1))
      cp "${existing_keys[$idx]}" ssh-keys/
      cp "${existing_keys[$idx]}.pub" ssh-keys/ 2>/dev/null || true
      ok "Clave copiada: $(basename "${existing_keys[$idx]}")"
    else
      warn "Omitiendo. Copiá tus claves manualmente a ssh-keys/ después."
    fi
  else
    warn "No se encontraron claves en ~/.ssh/"
    read -rp "  ¿Querés generar una nueva clave? [S/n]: " gen_key
    if [[ ! "$gen_key" =~ ^[Nn] ]]; then
      ssh-keygen -t ed25519 -f ssh-keys/id_ed25519 -N "" || err "Falló ssh-keygen"
      ok "Clave generada: ssh-keys/id_ed25519"
    else
      warn "Omitiendo. Copiá tus claves manualmente a ssh-keys/ después."
    fi
  fi
fi

# ─── 5. Environment ──────────────────────────────────────────────────
info "[5/6] Configurando .env..."

if [ -f .env ]; then
  ok ".env ya existe"
else
  cp .env.example .env
  warn "Editá .env con tus credenciales Digifort (o dejalas vacías si no usás Digifort)"
  read -rp "  DIGIFORT_USER (Enter para dejar vacío): " du
  read -rsp "  DIGIFORT_PASS (Enter para dejar vacío): " dp
  echo
  if [ -n "$du" ] || [ -n "$dp" ]; then
    # escape & and \ for sed replacement
    du_esc=$(printf '%s\n' "$du" | sed 's/[&\]/\\&/g')
    dp_esc=$(printf '%s\n' "$dp" | sed 's/[&\]/\\&/g')
    if [ "$(uname)" = "Darwin" ]; then
      sed -i '' "s#DIGIFORT_USER=.*#DIGIFORT_USER=${du_esc}#" .env 2>/dev/null || true
      sed -i '' "s#DIGIFORT_PASS=.*#DIGIFORT_PASS=${dp_esc}#" .env 2>/dev/null || true
    else
      sed -i "s#DIGIFORT_USER=.*#DIGIFORT_USER=${du_esc}#" .env 2>/dev/null || true
      sed -i "s#DIGIFORT_PASS=.*#DIGIFORT_PASS=${dp_esc}#" .env 2>/dev/null || true
    fi
    ok "Credenciales guardadas en .env"
  else
    warn ".env.example copiado sin credenciales"
  fi
fi

# ─── 6. Verify ───────────────────────────────────────────────────────
info "[6/6] Verificando instalación..."

if command -v opencode >/dev/null 2>&1; then
  opencode --eval "self-check" 2>/dev/null || true
fi

echo ""
ok "Instalación completada."
echo ""
info "  Para empezar:  opencode"
info "  Más info:      cat README.md"
echo ""
