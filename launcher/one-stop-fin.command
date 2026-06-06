#!/bin/bash
# One-Stop-Fin — Akıllı & İdempotent Launcher
PROJECT_DIR="/Users/eozakar/Desktop/DevelopmentWorks/One-Stop-Fin"
HEALTH_URL="http://localhost:3000/api/health"
MAX_WAIT=120

cd "$PROJECT_DIR" || { osascript -e 'display alert "One-Stop-Fin" message "Proje dizini bulunamadı."'; exit 1; }

# --- 1) Zaten sağlıklı mı? Hızlı yol ---
if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
  open -na "Google Chrome" --args --app=http://localhost:3000
  exit 0
fi

# --- 2) Docker var mı? ---
DOCKER_BIN=""
for p in /usr/local/bin/docker /opt/homebrew/bin/docker "$HOME/.docker/bin/docker"; do
  [ -x "$p" ] && DOCKER_BIN="$p" && break
done

if [ -z "$DOCKER_BIN" ]; then
  osascript -e 'display alert "One-Stop-Fin" message "Docker Desktop bulunamadı. Lütfen https://docker.com/products/docker-desktop adresinden yükleyin." buttons {"Tamam"} default button "Tamam"'
  exit 1
fi

export PATH="$(dirname "$DOCKER_BIN"):$PATH"

# --- 3) Docker daemon çalışıyor mu? Değilse başlat ---
if ! docker info >/dev/null 2>&1; then
  open -a "Docker" 2>/dev/null || open "$(mdfind 'kMDItemCFBundleIdentifier == "com.docker.docker"' | head -1)" 2>/dev/null
  SECONDS=0
  while ! docker info >/dev/null 2>&1; do
    sleep 2
    if [ $SECONDS -ge 60 ]; then
      osascript -e 'display alert "One-Stop-Fin" message "Docker başlatılamadı. Docker Desktop açık mı?" buttons {"Tamam"} default button "Tamam"'
      exit 1
    fi
  done
fi

# --- 4) Stack kaldır ---
docker compose up -d --build 2>&1

# --- 5) Health check bekle ---
SECONDS=0
while ! curl -sf "$HEALTH_URL" >/dev/null 2>&1; do
  sleep 2
  if [ $SECONDS -ge $MAX_WAIT ]; then
    osascript -e 'display alert "One-Stop-Fin" message "Uygulama başlatılamadı (timeout). docker compose logs ile kontrol edin." buttons {"Tamam"} default button "Tamam"'
    exit 1
  fi
done

# --- 6) Chrome aç ---
open -na "Google Chrome" --args --app=http://localhost:3000
