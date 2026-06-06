# Implementation Plan: One-Stop-Fin (v1)

## Overview

Bu plan, `design.md`'yi bir kod-üretim LLM'inin (Kiro) artımlı uygulayabileceği görevlere böler. Her üst task bağımsız commit/PR granülaritesindedir ve bir öncekinin üzerine kurulur; askıda/entegre edilmemiş kod bırakılmaz. Uygulama dili TypeScript (Next.js 14 App Router + tRPC + Prisma + PostgreSQL). Kaynak kod `finsumy` (`video_sentiment_analysis`) reposundan **taşınır**; yeniden yazılmaz. Property/birim testleri `*` ile opsiyonel işaretlenmiştir. Yalnızca kod yazma/değiştirme/test görevlerine odaklanılır.

## Tasks

- [ ] 1. Repo iskeleti ve yığın
  - [ ] 1.1 `DevelopmentWorks/One-Stop-Fin`'de Next.js 14 (App Router) + TS reposu oluştur
    - Tailwind, ESLint/Prettier, `tsconfig` path alias (`@/*`) kur
    - _Requirements: 1.1, 1.4_
  - [ ] 1.2 Bağımlılıkları ekle (tRPC, Prisma, react-query, recharts, dnd-kit, next-intl, lucide-react, bullmq, ioredis, zod, AI SDK)
    - Supabase/Stripe/web-push/resend **ekleme**
    - _Requirements: 1.2, 1.3_

- [ ] 2. Lokal veri altyapısı (Prisma + Postgres)
  - [ ] 2.1 `docker-compose.yml` ile `postgres` + `redis` servislerini tanımla; `.env`'de `DATABASE_URL`/`REDIS_URL`
    - _Requirements: 4.4, 11.1_
  - [ ] 2.2 `prisma/schema.prisma`'yı tanımla: `Channel, Video, VideoKeyPoint, StockMention, TickerSignal, WatchlistItem, DailyReport, UserPref`
    - `UserPref` alanları: `favorites Json`, `theme String`, `sidebarState Json`
    - _Requirements: 4.1_
  - [ ] 2.3 `src/lib/db.ts`'de tek Prisma client (`db`) export et; `prisma migrate dev` + `prisma/seed.ts` ile boş DB'yi çalışır hale getir
    - _Requirements: 4.2, 4.5_

- [ ] 3. Shell ve registry (auth'suz)
  - [ ] 3.1 `src/lib/modules/registry.ts`'yi taşı; sadece FinSumy + SignalLab (implemented) + News/Edu/Doc/Pod (stub) kalsın
    - _Requirements: 5.1, 5.2_
  - [ ] 3.2 `app/page.tsx` → `/dashboard` redirect; login/register/reset/auth-callback ve auth guard'ları **taşıma**
    - _Requirements: 3.1, 3.2, 3.3_
  - [ ] 3.3 `app/dashboard/layout.tsx` + Sidebar bileşeni: Home linki → FavoritesZone (placeholder) → registry modül listesi; stub rotası `/dashboard/stub/[module]`
    - _Requirements: 5.3, 5.4_
  - [ ] 3.4* Registry ordering property testi: `MODULE_REGISTRY[0..1].implemented === true`, stub'ların `implemented === false`
    - _Requirements: 5.2_

- [ ] 4. Tasarım sistemi (Seeking Alpha)
  - [ ] 4.1 Tailwind temasına DesignTokens'ı işle (sidebar/accent/page/card/link/up/down/text); Inter fontunu kur
    - _Requirements: 6.1, 6.2_
  - [ ] 4.2 Ortak `Card`, `SummaryCard`, `IndexStrip`, sidebar öğe stillerini (aktif = turuncu sol bar) oluştur; açık tema varsayılan, koyu tema toggle → `UserPref.theme`
    - _Requirements: 6.3, 6.4_
  - [ ] 4.3 `next-intl` kur; `messages/tr.json` birincil; modül/ticker adlarını çevirme
    - _Requirements: 12.1, 12.2_

- [ ] 5. tRPC + Yahoo servisleri (DB'siz SignalLab)
  - [ ] 5.1 `server/trpc.ts` + `server/root.ts` kur; `server/services/{yahoo-finance, black-scholes, math-engine}`'i taşı (DB'ye dokunmaz)
    - _Requirements: 2.1, 9.2_
  - [ ] 5.2 `signallab` router'ını taşı; `OZAN_TICKERS` listesini koru
    - _Requirements: 2.2, 9.3_

- [ ] 6. SignalLab v1 sayfaları (Yahoo'dan canlı — erken, ucuz)
  - [ ] 6.1 CSP Tarayıcı sayfasını taşı + tema token'larına uyarla
    - _Requirements: 9.1, 9.2_
  - [ ] 6.2 AI Strateji (`signallab.aiPick`) ve Manuel Analiz sayfalarını taşı
    - _Requirements: 9.1_
  - [ ] 6.3 Piyasa (market-overview) sayfasını taşı
    - _Requirements: 9.1_
  - [ ] 6.4 Earnings/Sektör/Takvim/Unusual'ı registry'de bırak; v1.1 için stub-ya-da-gizli işaretle
    - _Requirements: 9.4_

- [ ] 7. Veri katmanı geçişi (Supabase → Prisma) — DB'li servisler
  - [ ] 7.1 `watchlist-service`'i Prisma'ya çevir; `watchlist` router + İzleme Listesi sayfası
    - _Requirements: 2.4, 4.3, 9.1_
  - [ ] 7.2 `sentiment-analyzer` + `investment-analyzer` + `transcript-engine` + `video-detector`'ı Prisma'ya çevir
    - _Requirements: 2.4, 4.3, 10.2_
  - [ ] 7.3 `signal-engine` (+ cache) ve `channel-manager`'ı Prisma'ya çevir
    - _Requirements: 2.4, 4.3, 10.2_
  - [ ] 7.4* Geçen servisler için birim testleri (mock Prisma) ekle/uyarlat

- [ ] 8. FinSumy v1 sayfaları + ingestion
  - [ ] 8.1 Kanallar sayfası + kanal ekleme → çözümleme kuyruğuna alma
    - _Requirements: 10.1, 10.4_
  - [ ] 8.2 YouTube Özetleri + Genel Bakış (overview) + Sinyal Liderleri/heatmap sayfaları
    - _Requirements: 10.1_
  - [ ] 8.3 BullMQ worker + cron: yeni video tarama + günlük rapor; `docker-compose`'a `worker` ekle
    - _Requirements: 10.3_

- [ ] 9. Home (özet panosu)
  - [ ] 9.1 `app/dashboard/page.tsx`: IndexStrip + SummaryCard ızgarası
    - _Requirements: 7.1, 7.2_
  - [ ] 9.2 Kartları ilgili tRPC procedure'larına bağla (Piyasa Sinyalleri, Sinyal Liderleri, CSP, Son Videolar, Earnings, İzleme); yükleniyor/boş/hata + round'lama; "Detay →" yönlendirmeleri
    - _Requirements: 7.3, 7.4_

- [ ] 10. Favoriler bölgesi (dnd-kit + kalıcılık)
  - [ ] 10.1 FavoritesZone: modül öğelerini draggable yap, bölgeyi droppable + `SortableContext` yap; bırakınca kopyala (silme), tekrar engelle
    - _Requirements: 8.1, 8.2, 8.3, 8.5_
  - [ ] 10.2 `userPref` tRPC procedure'ları (get/set favorites+order); ilk yüklemede DB'den oku, değişimde upsert; sürükleyip çıkarınca kaldır
    - _Requirements: 8.4_
  - [ ] 10.3* Favori kalıcılığı testi: ekle → yeniden yükle → aynı sıra

- [ ] 11. Launcher + health + paketleme
  - [ ] 11.1 `app/api/health/route.ts`: DB + Redis hazırsa 200
    - _Requirements: 11.2_
  - [ ] 11.2 `Dockerfile` + `docker-compose.yml` (`web` + `postgres` + `redis` + `worker`); tek komutla `docker compose up`
    - _Requirements: 11.1_
  - [ ] 11.3 `launcher/one-stop-fin.command` betiği (Docker başlat → compose up → health bekle → chromeless pencere)
    - _Requirements: 11.3, 11.5_
  - [ ] 11.4 README: Automator ile `.app`'e sarmalama + özel ikon + masaüstüne yerleştirme adımları
    - _Requirements: 11.4_

- [ ] 12. Uçtan uca doğrulama
  - [ ] 12.1 `docker compose up` → launcher → Home açılıyor; SignalLab v1 sayfaları canlı veri çekiyor; favori sürükleme kalıcı
  - [ ] 12.2 `npm run build` + `npm run test` temiz
    - _Requirements: 1.4_
