#!/bin/bash
# One-Stop-Fin — Tek Tık Launcher (Docker'sız)
PROJECT_DIR="/Users/eozakar/Desktop/DevelopmentWorks/One-Stop-Fin"
HEALTH_URL="http://localhost:3000/api/health"
MAX_WAIT=30

cd "$PROJECT_DIR" || { osascript -e 'display alert "One-Stop-Fin" message "Proje dizini bulunamadı."'; exit 1; }

# --- NVM yükle ---
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

if ! command -v node >/dev/null 2>&1; then
  osascript -e 'display alert "One-Stop-Fin" message "Node.js bulunamadı." buttons {"Tamam"} default button "Tamam"'
  exit 1
fi

# --- Zaten çalışıyorsa sadece Chrome aç ---
if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
  open -na "Google Chrome" --args --app=http://localhost:3000
  exit 0
fi

# --- Port 3000 meşgulse uyar ve serbest bırak ---
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

# --- Uygulamayı başlat (foreground) ---
node scripts/start-local.mjs &
APP_PID=$!

# Kapanınca temizle
trap "kill $APP_PID 2>/dev/null; wait $APP_PID 2>/dev/null; exit 0" INT TERM EXIT

# --- Health check bekle ---
SECONDS=0
while ! curl -sf "$HEALTH_URL" >/dev/null 2>&1; do
  sleep 1
  if [ $SECONDS -ge $MAX_WAIT ]; then
    osascript -e 'display alert "One-Stop-Fin" message "Uygulama başlatılamadı (timeout)." buttons {"Tamam"} default button "Tamam"'
    kill $APP_PID 2>/dev/null
    exit 1
  fi
done

# --- Chrome aç ---
open -na "Google Chrome" --args --app=http://localhost:3000

# --- Uygulama çalışmaya devam etsin ---
wait $APP_PID
