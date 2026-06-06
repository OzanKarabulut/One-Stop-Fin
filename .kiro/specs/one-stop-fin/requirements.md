# Requirements Document

## 1. Introduction

Bu doküman, **One-Stop-Fin** v1 için gereksinimleri tanımlar. One-Stop-Fin; tek kullanıcılı (Ozan), tamamen lokal çalışan, masaüstündeki tek bir simgeden tetiklenen kişisel bir ekonomi / karar-destek platformudur. Amaç, dağınık finansal sinyalleri (finans-video sentiment, opsiyon taraması, piyasa sinyalleri, izleme listesi, earnings) tek bir "kişisel terminal" altında toplamak ve zamanla sol menüye yeni modüller/sayfalar ekleyerek büyütmektir.

Proje **sıfırdan yeni bir repoda** (`DevelopmentWorks/One-Stop-Fin`) kurulur. Ancak çalışan mantık baştan yazılmaz: mevcut `finsumy` reposundaki (eski adıyla `video_sentiment_analysis`) çalışır FinSumy + SignalLab modülleri, servisleri ve `MODULE_REGISTRY` mimarisi yeni repoya **taşınarak temizlenir** (fork-and-strip). Aynı repoda bulunan EGA (Ericsson Governance Agent), SaaS iskelesi (Stripe, abonelik, hesap kilitleme, plan limitleri), çok-kullanıcılı kimlik doğrulama ve pazarlama/landing yüzeyleri **taşınmaz**.

Üç değişmez etrafında şekillenir: (1) tek kullanıcı + lokal olduğu için **kimlik doğrulaması yoktur**, uygulama doğrudan Home'a açılır; (2) veri katmanı Supabase yerine **lokal PostgreSQL + Prisma** üzerinde çalışır; (3) sol menü `MODULE_REGISTRY`'den render edilir ve en üstte, Home'un hemen altında **sürükle-bırak ile özelleştirilebilir bir Favoriler bölgesi** bulunur.

Birincil stakeholder tek kişidir (Ozan). Tasarım dili Seeking Alpha esinli (koyu dar sidebar, turuncu vurgu, beyaz/açık-gri yoğun kart düzeni). Uygulama dili TypeScript (Next.js 14 App Router + tRPC + Prisma). Arayüz dili Türkçe (next-intl). Bu gereksinimler `design.md` dokümanından türetilmiştir.

Kapsam dışı (v1): stub modüller (NewsSumy / EduSumy / DocSumy / PodSumy) için gerçek sayfa; FinSumy reports/podcasts/rss özet sayfaları; çok-kullanıcılı erişim; bulut dağıtımı; ödeme/abonelik.

## 2. Glossary

- **OneStopFin_System**: Yeni repodaki uygulamanın tamamı (shell, sidebar, Home, modül sayfaları, servisler, launcher, docker stack dahil).
- **Source repo (`finsumy`)**: Mevcut `video_sentiment_analysis` reposu; çalışan kod buradan taşınır.
- **Fork-and-strip**: Source repo'dan değerli kodu yeni repoya taşıyıp gereksiz katmanları silme stratejisi.
- **MODULE_REGISTRY**: `src/lib/modules/registry.ts` içinde tanımlı, sidebar'ın tek veri kaynağı olan `ModuleDefinition[]`.
- **ModuleDefinition / ModuleItem**: Source repo'daki tiplerin aynısı; bir modülün id, label key, ikon, `implemented` bayrağı ve alt linklerini tanımlar.
- **Home**: `/dashboard` rotasındaki, her modül sayfasının özet kartını içeren ana sayfa.
- **SummaryCard**: Home'da tek bir sayfanın özetini gösteren ve detaya yönlendiren kart.
- **FavoritesZone**: Sidebar'da Home'un hemen altında bulunan, kullanıcının modül menüsünden öğe sürükleyip sabitleyebildiği ve sıralayabildiği özelleştirilebilir bölge.
- **FavoriteItem**: FavoritesZone içindeki tek sabitlenmiş link; `{ href, labelKey, order }`.
- **UserPref**: Tek kullanıcının tercihlerini (favoriler, sıra, tema, sidebar accordion durumu) tutan lokal kalıcı kayıt (Prisma `UserPref` tablosu).
- **DesignTokens**: Seeking Alpha esinli renk/tipografi token kümesi (Tailwind teması + CSS değişkenleri).
- **db**: Prisma client örneği (`src/lib/db.ts`); Supabase client'ının yerini alır.
- **Launcher**: Masaüstündeki `.app` (Automator/Script ile shell betiği sarmalı); docker stack'i ayağa kaldırıp chromeless pencerede uygulamayı açar.
- **Stack**: `docker-compose.yml` ile tanımlı `web` (Next.js) + `postgres` + `redis` servisleri.
- **SignalLab pages (v1)**: CSP Tarayıcı, AI Strateji, Manuel Analiz, Piyasa, İzleme Listesi.
- **FinSumy pages (v1)**: Genel Bakış, YouTube Özetleri, Kanallar, Sinyal Liderleri/heatmap.
- **EXCLUDED**: Source repo'dan taşınmayacak yüzeyler: `(ega-authenticated)/*`, Stripe/subscription/account-lockout, çok-kullanıcılı auth, landing/pricing/marketing, "Sumy" SaaS markası.

## 3. Requirements

### Requirement 1: Sıfırdan repo ve teknoloji yığını

**User Story:** Geliştirici olarak, `DevelopmentWorks/One-Stop-Fin` altında temiz bir Next.js reposu isterim ki eski repodaki SaaS/EGA yükü olmadan üzerine inşa edebileyim.

**İlgili tasarım bölümleri:** §1 Genel Bakış, §2 Mimari, §3 Repo Yapısı.

#### Acceptance Criteria

1. THE OneStopFin_System SHALL yeni bir Next.js 14 (App Router) + TypeScript reposu olarak `DevelopmentWorks/One-Stop-Fin` dizininde oluşturulmalıdır.
2. THE OneStopFin_System SHALL şu bağımlılıkları içermelidir: `@trpc/*`, `@prisma/client` + `prisma`, `@tanstack/react-query`, `recharts`, `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`, `next-intl`, `lucide-react`, `tailwindcss`, `bullmq` + `ioredis`, `@anthropic-ai/sdk` (veya `openai`), `zod`.
3. THE OneStopFin_System SHALL `@supabase/*`, `stripe`, `@stripe/stripe-js`, `web-push`, `resend` bağımlılıklarını **içermemelidir**.
4. THE OneStopFin_System SHALL `npm run dev`, `npm run build`, `npm run test` script'lerini sağlamalıdır ve temiz build üretmelidir.

### Requirement 2: Fork-and-strip — taşınan ve dışlanan kod

**User Story:** Geliştirici olarak, çalışan beyni yeniden yazmadan taşımak isterim ki signal-engine/black-scholes/yahoo/sentiment mantığını sıfırdan üretmeyeyim.

**İlgili tasarım bölümleri:** §2 Mimari, §4 Veri Katmanı Geçişi.

#### Acceptance Criteria

1. THE OneStopFin_System SHALL source repo'dan şu servisleri taşımalıdır: `server/services/{yahoo-finance, black-scholes, math-engine}`, `services/{sentiment-analyzer, signal-engine, signal-engine-cache, transcript-engine, video-detector, investment-analyzer, stock-recognizer, watchlist-service, report-generator}`.
2. THE OneStopFin_System SHALL source repo'dan `lib/modules/registry.ts`, ilgili tRPC router'larını (`signallab, sentiment, watchlist, video, channel, report, digest, alert`) ve gerekli `components/ui/*` ile `components/dashboard/*` bileşenlerini taşımalıdır.
3. THE OneStopFin_System SHALL EXCLUDED yüzeylerin (EGA, Stripe/subscription/account-lockout, çok-kullanıcılı auth, landing/pricing/marketing) hiçbirini **içermemelidir**.
4. WHEN bir taşınan servis `@supabase/supabase-js` tiplerine (`SupabaseClient`, `Database`) bağımlıysa THE OneStopFin_System SHALL bu bağımlılığı Prisma tabanlı veri erişimiyle değiştirmelidir (Req 4).

### Requirement 3: Tek kullanıcı, kimlik doğrulamasız shell

**User Story:** Tek kullanıcı olarak, lokalde launcher arkasında çalıştığım için giriş ekranı görmek istemem; uygulama doğrudan Home'a açılmalı.

**İlgili tasarım bölümleri:** §2 Mimari, §6 Shell.

#### Acceptance Criteria

1. THE OneStopFin_System SHALL kök rota (`/`) çağrıldığında doğrudan `/dashboard` (Home) rotasına yönlendirmelidir.
2. THE OneStopFin_System SHALL login/register/reset-password/auth-callback rotalarını ve `DashboardAuthGuard`/`LandingRedirectGuard` bileşenlerini **içermemelidir**.
3. THE OneStopFin_System SHALL `middleware.ts` içinde kimlik doğrulama mantığı barındırmamalıdır (pass-through ya da hiç).

### Requirement 4: Lokal veri katmanı (Prisma + PostgreSQL)

**User Story:** Geliştirici olarak, buluta bağımlı olmadan lokal bir veritabanı isterim ki uygulama çevrimdışı ve tek kutuda çalışsın.

**İlgili tasarım bölümleri:** §4 Veri Katmanı Geçişi, §3 Repo Yapısı.

#### Acceptance Criteria

1. THE OneStopFin_System SHALL Prisma şemasında en az şu modelleri tanımlamalıdır: `Channel`, `Video`, `VideoKeyPoint` (veya `InvestmentAnalysis`), `StockMention`, `TickerSignal`, `WatchlistItem`, `DailyReport`, `UserPref`.
2. THE OneStopFin_System SHALL `src/lib/db.ts` içinde tek bir Prisma client (`db`) export etmelidir.
3. THE OneStopFin_System SHALL taşınan servislerdeki Supabase sorgularını eşdeğer Prisma sorgularıyla değiştirmelidir; servis fonksiyon imzalarında `SupabaseClient` parametresi `db: PrismaClient` ile değiştirilmelidir.
4. THE OneStopFin_System SHALL `docker-compose.yml` içinde bir `postgres` servisi sağlamalı ve Prisma `DATABASE_URL`'i bu servise işaret etmelidir.
5. THE OneStopFin_System SHALL `prisma migrate` ve bir `seed` script'i ile boş bir veritabanını çalışır hale getirebilmelidir.

### Requirement 5: Module Registry ve sidebar

**User Story:** Geliştirici olarak, yeni sayfa eklemenin tek adres olmasını isterim ki platform sol menüden sürekli büyüsün.

**İlgili tasarım bölümleri:** §6 Shell, §7 Sidebar.

#### Acceptance Criteria

1. THE OneStopFin_System SHALL sidebar linklerini, ikonlarını ve alt linklerini yalnızca `MODULE_REGISTRY`'den render etmelidir; hard-coded liste bulunmamalıdır.
2. THE MODULE_REGISTRY SHALL `FinSumy` (implemented: true) ve `SignalLab` (implemented: true) modüllerini ve `NewsSumy/EduSumy/DocSumy/PodSumy` stub modüllerini (implemented: false) içermelidir.
3. THE OneStopFin_System SHALL sidebar düzenini yukarıdan aşağıya şu sırada render etmelidir: sabit Home linki → FavoritesZone → registry modül listesi.
4. WHEN bir modül `implemented: false` ise THE OneStopFin_System SHALL onu "Yakında" rozetiyle ve `/dashboard/stub/<lowercase-id>` rotasına bağlı olarak göstermelidir.

### Requirement 6: Seeking Alpha esinli tasarım sistemi

**User Story:** Tek kullanıcı olarak, Seeking Alpha'nın temiz, yoğun ve modern görünümünü isterim.

**İlgili tasarım bölümleri:** §5 Tasarım Token'ları.

#### Acceptance Criteria

1. THE OneStopFin_System SHALL Tailwind temasında DesignTokens'ı tanımlamalıdır: koyu sidebar (`#16181c`), turuncu vurgu (`#ff6b00`), açık-gri sayfa zemini (`#f6f7f9`), beyaz kart (`#ffffff`), mavi link (`#2b6cb0`), yeşil/kırmızı değişim (`#15803d` / `#dc2626`).
2. THE OneStopFin_System SHALL modern bir sans yazı tipi (örn. Inter) kullanmalı ve başlık/gövde tipografisini Seeking Alpha yoğunluğuna yakın tutmalıdır.
3. THE OneStopFin_System SHALL kartlar için 0.5px kenarlık + yumuşak köşe, yoğun ama temiz satır düzeni uygulamalıdır.
4. THE OneStopFin_System SHALL açık tema varsayılan olmak üzere isteğe bağlı koyu tema desteği sağlamalı ve seçimi `UserPref`'te saklamalıdır.

### Requirement 7: Home özet panosu

**User Story:** Tek kullanıcı olarak, Home'da her sayfanın özetini görmek ve tıklayınca detayına gitmek isterim.

**İlgili tasarım bölümleri:** §8 Home.

#### Acceptance Criteria

1. THE OneStopFin_System SHALL Home'da üstte bir indeks/ticker şeridi (S&P, Nasdaq, VIX, izlenen hisseler, BTC) göstermelidir.
2. THE OneStopFin_System SHALL Home'da en az şu SummaryCard'ları göstermelidir: Piyasa Sinyalleri, Sinyal Liderleri, CSP Tarayıcı (bugün), Son Video Özetleri, Earnings (kullanıcı hisseleri), İzleme Listesi.
3. WHEN bir SummaryCard'ın "Detay →" linkine tıklanırsa THE OneStopFin_System SHALL ilgili detay sayfasına yönlendirmelidir.
4. THE OneStopFin_System SHALL her SummaryCard verisini ilgili tRPC procedure'undan çekmeli, yükleniyor/boş/hata durumlarını ele almalıdır.

### Requirement 8: Özelleştirilebilir Favoriler bölgesi

**User Story:** Tek kullanıcı olarak, sık kullandığım sayfaları Home'un altındaki bir bölgeye sürükleyip kendi sıramı vermek isterim; orijinal menü değişmemeli.

**İlgili tasarım bölümleri:** §7 Sidebar, §9 Favoriler.

#### Acceptance Criteria

1. THE OneStopFin_System SHALL sidebar'da Home'un hemen altında bir FavoritesZone render etmelidir.
2. WHEN kullanıcı modül menüsündeki bir öğeyi FavoritesZone'a sürüklerse THE OneStopFin_System SHALL o öğeyi bir FavoriteItem olarak bölgeye **kopyalamalı** (orijinal menüden silmemeli).
3. THE OneStopFin_System SHALL FavoritesZone içinde öğelerin `@dnd-kit/sortable` ile yeniden sıralanmasına izin vermeli ve bir öğeyi sürükleyip çıkararak favoriden kaldırabilmelidir.
4. THE OneStopFin_System SHALL FavoriteItem listesini ve sırasını `UserPref`'te kalıcı saklamalı; uygulama yeniden başlatıldığında (launcher) aynı düzeni göstermelidir.
5. THE OneStopFin_System SHALL aynı sayfanın FavoritesZone'a birden fazla kez eklenmesini engellemelidir.

### Requirement 9: SignalLab v1 sayfaları

**User Story:** Tek kullanıcı olarak, opsiyon karar-destek sayfalarımı One-Stop-Fin içinde isterim.

**İlgili tasarım bölümleri:** §10 SignalLab Modülü.

#### Acceptance Criteria

1. THE OneStopFin_System SHALL şu SignalLab sayfalarını çalışır halde sağlamalıdır: CSP Tarayıcı, AI Strateji, Manuel Analiz, Piyasa (market-overview), İzleme Listesi.
2. THE OneStopFin_System SHALL bu sayfaları source repo'daki TS servisleri (`yahoo-finance`, `black-scholes`, `math-engine`) ve `signallab` tRPC router'ı üzerinden beslemelidir.
3. THE OneStopFin_System SHALL CSP Tarayıcı'da kullanıcının kişisel ticker listesini (`OZAN_TICKERS`) korumalıdır.
4. THE OneStopFin_System SHALL Earnings, Sektör, Takvim, Unusual Options sayfalarını registry'de tanımlı bırakabilir ancak v1 teslim zorunluluğu dışındadır (v1.1).

### Requirement 10: FinSumy v1 sayfaları ve ingestion

**User Story:** Tek kullanıcı olarak, finans-video sentiment akışını ve ondan türeyen ticker sinyallerini isterim.

**İlgili tasarım bölümleri:** §11 FinSumy Modülü, §4 Veri Katmanı.

#### Acceptance Criteria

1. THE OneStopFin_System SHALL şu FinSumy sayfalarını sağlamalıdır: Genel Bakış, YouTube Özetleri, Kanallar ve Sinyal Liderleri/heatmap.
2. THE OneStopFin_System SHALL video çözümleme hattını (`transcript-engine` → `sentiment-analyzer` → `investment-analyzer` → `signal-engine`) Prisma üzerinden çalışacak şekilde taşımalıdır.
3. THE OneStopFin_System SHALL yeni video tarama ve günlük rapor üretimini BullMQ/Redis zamanlı işleri olarak çalıştırmalı; bu işler `docker-compose` stack'i ayaktayken arka planda işlemelidir.
4. WHEN bir kullanıcı kanal eklerse THE OneStopFin_System SHALL kanalı kaydetmeli ve videolarını çözümleme kuyruğuna almalıdır.

### Requirement 11: Masaüstü launcher ve docker stack

**User Story:** Tek kullanıcı olarak, masaüstündeki tek simgeye basınca tüm platformun ayağa kalkmasını ve chromeless bir pencerede açılmasını isterim — native Mac uygulaması olmasın.

**İlgili tasarım bölümleri:** §12 Launcher.

#### Acceptance Criteria

1. THE OneStopFin_System SHALL `docker-compose.yml` ile `web` + `postgres` + `redis` servislerini tek komutla (`docker compose up`) ayağa kaldırabilmelidir.
2. THE OneStopFin_System SHALL `/api/health` endpoint'i sağlamalı; tüm bağımlılıklar hazır olduğunda 200 dönmelidir.
3. THE OneStopFin_System SHALL bir launcher betiği sağlamalı; betik Docker'ı başlatmalı, `docker compose up -d` çalıştırmalı, `/api/health` 200 dönene kadar beklemeli, sonra uygulamayı chromeless bir pencerede (`open -na "Google Chrome" --args --app=http://localhost:3000`) açmalıdır.
4. THE OneStopFin_System SHALL betiğin Automator "Application" olarak `.app`'e sarmalanması ve özel ikonla masaüstüne yerleştirilmesi için adımları (README) belgelemelidir.
5. THE Launcher SHALL native bir SwiftUI/Xcode uygulaması **olmamalıdır**; yalnızca tetikleyici bir kabuk olmalıdır.

### Requirement 12: Uluslararasılaştırma (Türkçe)

**User Story:** Tek kullanıcı olarak, arayüzü Türkçe isterim.

**İlgili tasarım bölümleri:** §5 Tasarım, §6 Shell.

#### Acceptance Criteria

1. THE OneStopFin_System SHALL `next-intl` ile Türkçe'yi birincil dil olarak sağlamalı; tüm yeni etiketler `messages/tr.json` altında olmalıdır.
2. THE OneStopFin_System SHALL ticker sembolleri ve modül adları (FinSumy, SignalLab) gibi özel adları çevirmemelidir.
