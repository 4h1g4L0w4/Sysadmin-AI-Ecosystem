<#
.SYNOPSIS
  Sysadmin AI Ecosystem - Windows Installer
.DESCRIPTION
  Verifica prerequisitos, clona el repo, instala dependencias TOON,
  configura SSH keys y .env, y verifica la instalación.
.NOTES
  Ejecutar con: powershell -ExecutionPolicy RemoteSigned -File install.ps1
#>

$Host.UI.RawUI.WindowTitle = "Sysadmin AI Ecosystem - Instalador"

function Write-Info  { Write-Host "  $args" -ForegroundColor Cyan }
function Write-Ok    { Write-Host "✓ $args" -ForegroundColor Green }
function Write-Warn  { Write-Host "⚠ $args" -ForegroundColor Yellow }
function Write-Err   { Write-Host "✗ $args" -ForegroundColor Red; exit 1 }

# ─── Header ──────────────────────────────────────────────────────────
Clear-Host
Write-Host "╔═══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║    Sysadmin AI Ecosystem — Instalador     ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ─── 1. Verify prerequisites ─────────────────────────────────────────
Write-Info "[1/6] Verificando prerequisitos..."

# Git
if (Get-Command git -ErrorAction SilentlyContinue) {
  Write-Ok "Git encontrado"
} else {
  Write-Err "Git no está instalado. Descargalo desde https://git-scm.com"
}

# Node.js
if (Get-Command node -ErrorAction SilentlyContinue) {
  $nodeVer = node -v
  Write-Ok "Node.js $nodeVer"
} else {
  Write-Err "Node.js no está instalado. Descargalo desde https://nodejs.org"
}

# npm
if (Get-Command npm -ErrorAction SilentlyContinue) {
  $npmVer = npm -v
  Write-Ok "npm $npmVer"
} else {
  Write-Err "npm no está instalado."
}

# OpenCode CLI
$opencodeFound = $false
if (Get-Command opencode -ErrorAction SilentlyContinue) {
  Write-Ok "OpenCode CLI encontrado"
  $opencodeFound = $true
} elseif (Get-Command "npx" -ErrorAction SilentlyContinue) {
  Write-Warn "OpenCode CLI no está instalado como comando global."
  $ans = Read-Host "  ¿Querés instalarlo ahora? [S/n]"
  if ($ans -ne "n" -and $ans -ne "N") {
    $oldPath = $env:Path
    npm install -g @opencode-ai/cli
    # Refresh PATH in current session
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
    if (Get-Command opencode -ErrorAction SilentlyContinue) {
      Write-Ok "OpenCode instalado"
      $opencodeFound = $true
    } else {
      Write-Warn "OpenCode instalado. Reiniciá la terminal o agregá npm global a tu PATH manualmente."
    }
  } else {
    Write-Warn "Omitiendo. Ejecutá 'npm install -g @opencode-ai/cli' más tarde."
  }
} else {
  Write-Warn "npm global no está en PATH. Instalá Node.js primero."
}

# OpenSSH Client
$sshInstalled = (Get-WindowsCapability -Online | Where-Object { $_.Name -like 'OpenSSH.Client*' }).State -eq 'Installed'
if ($sshInstalled) {
  Write-Ok "OpenSSH Client instalado"
} else {
  Write-Warn "OpenSSH Client no está instalado."
  $ans = Read-Host "  ¿Querés instalarlo? (requiere admin) [S/n]"
  if ($ans -ne "n" -and $ans -ne "N") {
    try {
      Add-WindowsCapability -Online -Name "OpenSSH.Client~~~~0.0.1.0" -ErrorAction Stop | Out-Null
      Write-Ok "OpenSSH Client instalado"
    } catch {
      Write-Warn "No se pudo instalar OpenSSH. Ejecutá PowerShell como administrador."
    }
  } else {
    Write-Warn "Omitiendo OpenSSH. Necesitás SSH para conectar a servidores."
  }
}

# ─── 2. Clone repository ────────────────────────────────────────────
Write-Info "[2/6] Repositorio..."

if (Test-Path ".git") {
  Write-Ok "Ya estás dentro del repositorio: $(Split-Path -Leaf (Get-Location))"
} else {
  $repoUrl = Read-Host "  URL del repositorio a clonar (Enter para saltar)"
  if ([string]::IsNullOrWhiteSpace($repoUrl)) {
    Write-Err "No se especificó URL."
  }
  git clone $repoUrl
  $dirName = [System.IO.Path]::GetFileNameWithoutExtension($repoUrl)
  Set-Location $dirName
  Write-Ok "Clonado: $dirName"
}

# ─── 3. Install dependencies ─────────────────────────────────────────
Write-Info "[3/6] Instalando dependencias TOON..."

$modulesPath = Join-Path ".opencode" "node_modules"
if (Test-Path $modulesPath) {
  Write-Ok "node_modules ya existe en .opencode/"
} else {
  Push-Location ".opencode"
  npm install
  if ($LASTEXITCODE -ne 0) { Write-Err "Falló npm install en .opencode/" }
  Pop-Location
  Write-Ok "Dependencias instaladas en .opencode/"
}

# ─── 4. SSH keys ─────────────────────────────────────────────────────
Write-Info "[4/6] Configurando claves SSH..."

$sshKeysDir = "ssh-keys"
$privateKeys = @()
if (Test-Path $sshKeysDir) {
  $privateKeys = Get-ChildItem $sshKeysDir | Where-Object { !$_.Name.EndsWith('.pub') -and !$_.Name.StartsWith('.') }
}

if ($privateKeys.Count -gt 0) {
  Write-Ok "Claves SSH ya presentes en ssh-keys/"
} else {
  New-Item -ItemType Directory -Force -Path $sshKeysDir | Out-Null

  # Detect existing keys in ~/.ssh
  $homeSsh = Join-Path $env:USERPROFILE ".ssh"
  $existingKeys = @()
  foreach ($k in @("id_ed25519", "id_rsa", "id_ecdsa")) {
    $p = Join-Path $homeSsh $k
    if (Test-Path $p) { $existingKeys += $p }
  }

  if ($existingKeys.Count -gt 0) {
    Write-Host "  Se encontraron claves existentes en ~/.ssh/:" -ForegroundColor Yellow
    for ($i = 0; $i -lt $existingKeys.Count; $i++) {
      Write-Host "    [$($i+1)] $($existingKeys[$i])"
    }
    Write-Host "    [C] Cancelar y elegir manual"
    $keyChoice = Read-Host "  ¿Cuál querés copiar? [1-$($existingKeys.Count)/C]"
    if ($keyChoice -match '^\d+$' -and [int]$keyChoice -ge 1 -and [int]$keyChoice -le $existingKeys.Count) {
      $idx = [int]$keyChoice - 1
      Copy-Item $existingKeys[$idx] $sshKeysDir\
      $pubPath = "$($existingKeys[$idx]).pub"
      if (Test-Path $pubPath) { Copy-Item $pubPath $sshKeysDir\ }
      Write-Ok "Clave copiada: $(Split-Path -Leaf $existingKeys[$idx])"
    } else {
      Write-Warn "Omitiendo. Copiá tus claves manualmente a ssh-keys/ después."
    }
  } else {
    Write-Warn "No se encontraron claves en ~/.ssh/"
    $genKey = Read-Host "  ¿Querés generar una nueva clave? [S/n]"
    if ($genKey -ne "n" -and $genKey -ne "N") {
      $keyPath = Join-Path (Get-Location) "ssh-keys\id_ed25519"
      ssh-keygen -t ed25519 -f $keyPath -N '""'
      Write-Ok "Clave generada: ssh-keys\id_ed25519"
      Write-Warn "  No olvides agregar la clave pública a tus servidores:"
      Write-Warn "  type ssh-keys\id_ed25519.pub"
    } else {
      Write-Warn "Omitiendo. Copiá tus claves manualmente a ssh-keys/ después."
    }
  }
}

# ─── 5. Environment ──────────────────────────────────────────────────
Write-Info "[5/6] Configurando .env..."

if (Test-Path ".env") {
  Write-Ok ".env ya existe"
} else {
  Copy-Item ".env.example" ".env"
  Write-Warn "Editá .env con tus credenciales Digifort (o dejalas vacías si no usás Digifort)"
  $du = Read-Host "  DIGIFORT_USER (Enter para dejar vacío)"
  $dp = Read-Host "  DIGIFORT_PASS (Enter para dejar vacío)"

  if (-not [string]::IsNullOrWhiteSpace($du) -or -not [string]::IsNullOrWhiteSpace($dp)) {
    (Get-Content ".env") -replace 'DIGIFORT_USER=.*', "DIGIFORT_USER=$du" -replace 'DIGIFORT_PASS=.*', "DIGIFORT_PASS=$dp" | Set-Content ".env"
    Write-Ok "Credenciales guardadas en .env"
  } else {
    Write-Warn ".env.example copiado sin credenciales"
  }
}

# ─── 6. Verify ───────────────────────────────────────────────────────
Write-Info "[6/6] Verificando instalación..."

if ($opencodeFound) {
  try {
    $result = opencode --eval "self-check" 2>&1
    Write-Host $result
  } catch {
    Write-Warn "No se pudo ejecutar self-check. Verificá manualmente con 'opencode --eval self-check'"
  }
}

Write-Host ""
Write-Ok "Instalación completada."
Write-Host ""
Write-Info "  Para empezar:  opencode"
Write-Info "  Más info:      Get-Content README.md"
Write-Host ""
Read-Host "Presioná Enter para salir"
