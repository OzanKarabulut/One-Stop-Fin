# CLAUDE.md — One-Stop-Fin

Tek kullanıcılı, tamamen lokal çalışan kişisel finans karar-destek terminali. Auth yok, SaaS yok, çoklu kullanıcı yok — `/` doğrudan `/dashboard`'a yönlenir. Bu kararlar kesindir; asla login, abonelik veya multi-tenancy ekleme.

## Komutlar

```bash
docker compose up postgres redis -d   # Postgres (5432) + Redis (6379)
npx prisma migrate dev                # migration
npm run db:seed                       # varsayılan UserPref seed
npm run dev                           # Next.js dev (port 3000)
npm run dev:local                     # scripts/start-local.mjs (embedded-postgres ile Docker'sız)
npm run build && npm run lint         # her önemli değişiklikten sonra çalıştır
```

Test runner henüz yok (`npm test` no-op). Test eklenecekse önce Ozan'a sor.

## Mimari

- **Stack:** Next.js 14 (App Router) + React 18 + Tailwind, tRPC 10 + superjson + zod v4, Prisma 5 + PostgreSQL, BullMQ + Redis (ioredis), next-intl (sadece `messages/tr.json` — arayüz tamamen Türkçe).
- **Katman kuralı:** Sayfalar (`src/app/dashboard/**`) yalnızca tRPC client üzerinden veri alır. tRPC router'ları (`src/server/routers/*`, `src/server/root.ts`'te toplanır) servisleri çağırır. IO yapan kod `src/server/services/`'te; **`src/lib/` ise saf fonksiyon kütüphanesidir** (matematik, kural motorları) — `src/lib`'e network/DB erişimi ekleme.
- **Worker:** `src/worker/index.ts` — BullMQ kuyrukları (`video-processing`, `daily-report`), FinSumy ingestion pipeline'ını (transcript → sentiment → investment analysis → signals) çalıştırır.
- **`src/services/` (server'sız olan):** FinSumy mirası servisler (sentiment-analyzer, signal-engine, transcript-engine vb.). Yeni SignalLab servisi buraya değil `src/server/services/`'e eklenir.

## Kritik kurallar — bunları asla bozma

1. **Yahoo Finance erişimi curl ile yapılır.** `src/server/services/yahoo-finance.ts` Node `fetch`/`axios` yerine `execFile("/usr/bin/curl", ...)` kullanır çünkü Node'un TLS fingerprint'i Yahoo tarafından engelleniyor. Bunu fetch/axios'a "modernize" etme. Crumb/cookie auth ve exponential backoff'lu `withRetry` korunmalı.
2. **Market data provider soyutlaması:** Tüm yeni piyasa verisi erişimi `src/server/services/market-data/` üzerinden (`marketData` / `getProvider()`, `MARKET_DATA_PROVIDER` env). Gelecekte Tradier/Polygon eklenebilsin diye Yahoo'ya doğrudan bağımlılık yaratma.
3. **Tarama (scan) eşzamanlılığı semaphore ile sınırlıdır.** Yahoo rate-limit'e duyarlı; sınırsız `Promise.all` patlatma.
4. **Yeni sayfa = registry + i18n.** Her yeni dashboard sayfası `src/lib/modules/registry.ts`'e (`MODULE_REGISTRY`) eklenir ve `labelKey`'i `messages/tr.json`'da tanımlanır. Sidebar tamamen registry'den render edilir.
5. **Türkçe arayüz.** Kullanıcıya görünen tüm metinler Türkçe (tr.json veya domain kütüphanelerindeki Türkçe alanlar: `event-knowledge.ts` `mantik/tarihsel/opsiyon`, sell-gate/climate label'ları). Kod, tip ve yorumlar İngilizce/Türkçe karışık olabilir.

## Domain kütüphaneleri (src/lib)

- `market-calendar.ts` — mekanik günler (OPEX, triple witching, VIX expiry, JPM collar roll, Russell recon, çeyrek sonu, tatiller) kuralla üretilir; FOMC + 2026 makro takvimi statik. Kategoriler: makro/opsiyon/yapisal/tatil, önem 1–3.
- `event-knowledge.ts` — her EventType için Türkçe bilgi kartı (mantık, sıcak/soğuk senaryo, tarihsel davranış, opsiyon satıcısı notu, volProfile).
- `vol-math.ts` / `forecast-math.ts` — normCdf/Pdf (Abramowitz-Stegun), invNorm (Acklam), BS gamma vb.
- `gex.ts` — strike bazlı dealer gamma exposure ($ / %1 hareket).
- `sell-gate.ts` (VRP, term contango, earnings penceresi, IV percentile → yeşil/sarı/kırmızı) ve `sell-climate.ts` (VIX, VIX değişimi, Fear&Greed → favorable/cautious/poor) — prim satışı karar kapıları.
- `real-world-pricing.ts` — risk-neutral yerine gerçek dünya (mu'lu) olasılıklar.
- `position-actions.ts` — açık pozisyon aksiyonları: %50+ karda KAPAT, DTE≤21 ROLL, strike test + event ALARM.
- `ticker-universe.ts` — kürate CSP evrenleri (megatech, semi, highiv, etf...). Serbestçe düzenlenebilir.

## Server servisleri (src/server/services)

- `yahoo-finance.ts` — SignalLab (Swift) servisinin Node portu: quote, HV, opsiyon zinciri, IV rank, RSI, market overview, sektörler.
- `black-scholes.ts`, `math-engine.ts` — fiyatlama/Greeks.
- `csp-scoring.ts` + `csp-company-quality.ts` — CSP kontrat skorlama: premium/safety/liquidity/quality alt skorları → cspScore, IV bucket'ları (70-100/100-140/140+), red nedenleri.
- `earnings.ts`, `tickers.ts`, `market-data/` (provider katmanı, `cboe.ts` dahil).

## Veri modeli (özet)

FinSumy: Channel → Video → VideoKeyPoint/StockMention → TickerSignal, DailyReport.
SignalLab: WatchlistItem, Position (CSP/CC/WHEEL; entryCredit, predictedPwin, realizedPnl), VolSnapshot (atmIv/hv20, ticker+date unique), PredictionLog (forecast doğrulama: sigma up/down, median, skew/pin bileşenleri, realized, zScore), AnomalyLog (anomali radarı: dropPct, triggerWindow, sigmaMove, sectorRel, ivHvRatio, konservatif/agresif strike+prim, outcome).
UserPref: tek satır (`id="default"`) — favoriler, tema, sidebar durumu.

## Sayfa haritası

SignalLab: csp-screener, anomaly-radar, ai-strategy, vol-console, forecast-center, command-center, manual, market-overview, watchlist. FinSumy: overview, summaries/youtube, channels, signal-leaders. Ana Sayfa (`/dashboard`): index/futures/treasury/emtia/sektör özet kartları + sellClimate + market-calendar tabanlı etkinlik takvimi. Stub modüller (`/dashboard/stub/[module]`): newssumy, edusumy, docsumy, podsumy — implemente edilmedi.

## UI konvansiyonları

Seeking Alpha esinli: koyu dar sidebar, turuncu vurgu (`#ff7200`), açık zeminde yoğun kart düzeni. Ortak parçalar `src/components/ui/` (Card, SummaryCard, DetailPanel + DetayButton, IndexStrip, TickerChips, TickerTagEditor). dnd-kit ile sürüklenebilir Favoriler bölgesi. Recharts ile grafikler. Yeni komponent yazmadan önce `components/ui`'de benzeri var mı bak (DRY refactor bilinçli yapıldı).
