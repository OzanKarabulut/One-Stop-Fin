#!/bin/bash
# One-Stop-Fin — Tek Tık Launcher (Detached, Prod Mode)
PROJECT_DIR="/Users/eozakar/Desktop/DevelopmentWorks/One-Stop-Fin"
HEALTH_URL="http://localhost:3000/api/health"
PID_FILE="$PROJECT_DIR/.onestopfin.pid"
LOG_FILE="$PROJECT_DIR/logs/app.log"

cd "$PROJECT_DIR" || { osascript -e 'display alert "One-Stop-Fin" message "Proje dizini bulunamadı."'; exit 1; }

# --- NVM yükle ---
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

if ! command -v node >/dev/null 2>&1; then
  osascript -e 'display alert "One-Stop-Fin" message "Node.js bulunamadı." buttons {"Tamam"} default button "Tamam"'
  exit 1
fi

# === 1. Health OK ise sadece Chrome aç ===
if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
  open -na "Google Chrome" --args --app=http://localhost:3000
  exit 0
fi

# === 2. PID dosyası kontrol ===
SKIP_START=false
if [ -f "$PID_FILE" ]; then
  SAVED_PID=$(cat "$PID_FILE")
  if kill -0 "$SAVED_PID" 2>/dev/null; then
    # PID canlı ama health yok — boot'ta, başlatmayı atla
    SKIP_START=true
  else
    # Stale PID dosyası
    rm -f "$PID_FILE"
  fi
fi

if [ "$SKIP_START" = false ]; then
  # === 3. Port 5432 kontrolü ===
  PG_PID=$(lsof -ti :5432 2>/dev/null)
  if [ -n "$PG_PID" ]; then
    # Bizim sürecimizin alt süreci mi kontrol et
    OUR_PID=""
    [ -f "$PID_FILE" ] && OUR_PID=$(cat "$PID_FILE")
    IS_OURS=false
    if [ -n "$OUR_PID" ]; then
      for p in $PG_PID; do
        if [ "$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ')" = "$OUR_PID" ]; then
          IS_OURS=true; break
        fi
      done
    fi
    if [ "$IS_OURS" = false ]; then
      PG_NAME=$(ps -p "$PG_PID" -o comm= 2>/dev/null | head -1)
      RESPONSE=$(osascript -e "display alert \"One-Stop-Fin\" message \"Port 5432'yi başka bir PostgreSQL kullanıyor ($PG_NAME). Kapatılsın mı?\" buttons {\"İptal\", \"Kapat\"} default button \"Kapat\"" 2>&1)
      if echo "$RESPONSE" | grep -q "Kapat"; then
        kill $PG_PID 2>/dev/null
        sleep 2
      else
        exit 0
      fi
    fi
  fi

  # === Port 3000 kontrolü ===
  PORT_PID=$(lsof -ti :3000 2>/dev/null)
  if [ -n "$PORT_PID" ]; then
    PROC_NAME=$(ps -p "$PORT_PID" -o comm= 2>/dev/null)
    RESPONSE=$(osascript -e "display alert \"One-Stop-Fin\" message \"Port 3000 başka bir işlem tarafından kullanılıyor ($PROC_NAME, PID: $PORT_PID). Kapatılsın mı?\" buttons {\"İptal\", \"Kapat\"} default button \"Kapat\"" 2>&1)
    if echo "$RESPONSE" | grep -q "Kapat"; then
      kill "$PORT_PID" 2>/dev/null
      sleep 1
    else
      exit 0
    fi
  fi

  # === 4. Detached başlatma ===
  mkdir -p "$PROJECT_DIR/logs"
  nohup node scripts/start-local.mjs >> "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  disown
fi

# === 5. Aşamalı health bekleme ===

wait_with_dialog() {
  local PHASE_NAME="$1"
  local CHECK_CMD="$2"
  local MAX_WAIT="$3"

  while true; do
    SECONDS=0
    while ! eval "$CHECK_CMD" 2>/dev/null; do
      sleep 1
      if [ $SECONDS -ge $MAX_WAIT ]; then
        RESPONSE=$(osascript -e "display alert \"One-Stop-Fin\" message \"$PHASE_NAME — hâlâ başlatılıyor. Ne yapalım?\" buttons {\"Vazgeç\", \"Logu aç\", \"Beklemeye devam\"} default button \"Beklemeye devam\"" 2>&1)
        if echo "$RESPONSE" | grep -q "Vazgeç"; then
          exit 0
        elif echo "$RESPONSE" | grep -q "Logu"; then
          open "$LOG_FILE"
        fi
        break
      fi
    done
    # Check succeeded or user chose to continue
    if eval "$CHECK_CMD" 2>/dev/null; then
      return 0
    fi
  done
}

# Faz 1: PostgreSQL
wait_with_dialog "PostgreSQL başlatılıyor" "nc -z localhost 5432" 60

# Faz 2: HTTP health
wait_with_dialog "Next.js başlatılıyor (ilk açılışta build alınır)" "curl -sf $HEALTH_URL >/dev/null" 120

# === 6. Chrome aç ===
open -na "Google Chrome" --args --app=http://localhost:3000
