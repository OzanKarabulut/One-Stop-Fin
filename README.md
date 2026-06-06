# One-Stop-Fin

Kişisel finans karar-destek terminali. Tek kullanıcılı, lokal çalışan, masaüstü simgesiyle açılan bir platform.

## Gereksinimler

- Node.js 20+
- Docker Desktop
- Google Chrome

## Geliştirme

```bash
# Docker servislerini başlat (postgres + redis)
docker compose up postgres redis -d

# Veritabanı migration
npx prisma migrate dev

# Seed (varsayılan UserPref)
npm run db:seed

# Geliştirme sunucusu
npm run dev
```

## Üretim (Docker)

```bash
docker compose up -d
```

Uygulama `http://localhost:3000` adresinde açılır.

## Masaüstü Launcher Kurulumu

### Adım 1: Automator ile `.app` oluşturma

1. **Automator**'ı aç → "Yeni Belge" → **Application** seç
2. Soldan **"Run Shell Script"** eylemini sürükle
3. Shell: `/bin/bash`, Pass input: `to stdin`
4. İçeriğe yapıştır:
   ```bash
   /Users/eozakar/Desktop/DevelopmentWorks/One-Stop-Fin/launcher/one-stop-fin.command
   ```
5. **Dosya → Kaydet** → İsim: "One-Stop-Fin" → Konum: Masaüstü

### Adım 2: Özel ikon (isteğe bağlı)

1. Bir `.icns` dosyası hazırla (veya PNG'yi `sips` ile dönüştür)
2. Kaydettiğin `.app`'e sağ tık → **Bilgi Al** (⌘I)
3. Sol üstteki ikona `.icns` dosyasını sürükle

### Adım 3: Kullanım

Masaüstündeki "One-Stop-Fin" ikonuna çift tıkla. Docker → stack → health check → Chrome chromeless penceresi otomatik açılır.

## Teknoloji Yığını

- **Frontend:** Next.js 14, React 18, Tailwind CSS, Recharts
- **Backend:** tRPC, Prisma, PostgreSQL, BullMQ/Redis
- **Servisler:** Yahoo Finance API, Black-Scholes, Signal Engine
- **UI:** Seeking Alpha esinli tasarım, Türkçe arayüz, dnd-kit favoriler
