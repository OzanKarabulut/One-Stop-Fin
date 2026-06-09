import type { EventType } from "./market-calendar";

export interface EventDetail {
  mantik: string;
  sicak?: string;
  soguk?: string;
  tarihsel: string;
  opsiyon: string;
}

export const EVENT_KNOWLEDGE: Partial<Record<EventType, EventDetail>> = {
  cpi: {
    mantik: "Aylık tüketici enflasyonu — Fed'in faiz patikasının ana girdisi. Manşet ve çekirdek (gıda/enerji hariç) izlenir.",
    sicak: "Beklenti üstü: faiz indirimi beklentisi geriler → 10Y faiz ↑, uzun-vadeli/teknoloji hisseleri ↓, USD ↑, VIX ↑.",
    soguk: "Beklenti altı: indirim ihtimali ↑ → risk iştahı ↑, Russell/teknoloji rally eğilimi.",
    tarihsel: "S&P CPI günü ortalama ±1–1.5% gün-içi hareket; açıklama 08:30 ET, ilk 30 dk en oynak.",
    opsiyon: "IV açıklama öncesi şişer, sonrası crush. Vade içinde CPI olan put satışında yüksek prim ama gap riski.",
  },
  ppi: {
    mantik: "Üretici fiyatları — enflasyonun boru hattındaki öncü göstergesi; PCE tahminine girdi.",
    sicak: "Sıcak PPI çekirdek PCE beklentisini yukarı çeker → faiz ve USD baskısı.",
    soguk: "Soğuk PPI dezenflasyon hikâyesini destekler → tahvil rally.",
    tarihsel: "CPI'dan daha az reaksiyon yaratır ama ikisi aynı hafta gelirse birleşik etki güçlüdür.",
    opsiyon: "Tek başına düşük etkili; CPI ile aynı haftadaysa event riskini birlikte değerlendir.",
  },
  pce: {
    mantik: "Çekirdek PCE — Fed'in TERCİH ettiği enflasyon ölçütü. Ay sonu açıklanır.",
    sicak: "Yapışkan PCE indirim takvimini öteler → faiz ve dolar yukarı.",
    soguk: "Soğuk PCE Fed'in işini kolaylaştırır → risk iştahı.",
    tarihsel: "Genelde CPI'dan sonra geldiği için sürpriz potansiyeli daha düşük; yine de Fed'in metriği.",
    opsiyon: "Ay sonu pozisyonlarında PCE + ay-sonu rebalancing çakışmasına dikkat.",
  },
  nfp: {
    mantik: "Tarım dışı istihdam + işsizlik + saatlik kazanç. İstihdam-enflasyon dengesinin kalbi.",
    sicak: "Güçlü istihdam + ücret artışı: 'higher for longer' → faiz ↑, hisse baskı.",
    soguk: "Zayıf istihdam: indirim beklentisi ↑ ama çok zayıfsa resesyon korkusu → karışık tepki.",
    tarihsel: "Ayın ilk Cuma'sı 08:30 ET; yılın en sert tek-gün hareketlerinden bazıları NFP'de.",
    opsiyon: "Cuma açılışında gap riski yüksek; haftalık put satarken NFP'yi vade içine alma.",
  },
  fomc: {
    mantik: "Faiz kararı + politika metni; dot-plot/SEP toplantılarında üyelerin faiz projeksiyonu da gelir.",
    sicak: "Şahin sürpriz: faizler ↑, hisse ↓, USD ↑.",
    soguk: "Güvercin sürpriz: risk rally; ama 'neden güvercin?' resesyon endişesi tersine çevirebilir.",
    tarihsel: "Karar 14:00 ET, 14:30 basın toplantısı. Asıl volatilite Powell konuşurken; gün-içi sert ters dönüşler sık.",
    opsiyon: "Klasik IV crush adayı; karar öncesi şişen IV sonrası söner. Iron condor/credit spread cazip ama whipsaw riski.",
  },
  "triple-witching": {
    mantik: "Hisse opsiyonları, endeks opsiyonları ve endeks futures aynı anda vade dolar; çeyreklik endeks rebalansıyla çakışır.",
    tarihsel: "Yılın en yüksek hacimli günlerinden; son işlem saati (15:00–16:00 ET) özellikle oynak. Büyük açık pozisyonlu strike'larda pin etkisi.",
    opsiyon: "Vade günü ve sonrası gamma boşalır; OPEX sonrası hafta yön değişimi sık. Pin riskini hesaba kat.",
  },
  opex: {
    mantik: "Aylık standart opsiyon vadesi (3. Cuma). Dealer gamma pozisyonu boşalır.",
    tarihsel: "Vade haftası büyük strike'larda pinning; vade sonrası gamma azalınca hareket alanı genişler.",
    opsiyon: "Yüksek açık pozisyonlu strike'lar mıknatıs gibi davranabilir; haftalık satışta bu seviyeleri kontrol et.",
  },
  "vix-expiry": {
    mantik: "VIX futures/opsiyon vade sonu (sonraki ay SPX OPEX'inden 30 gün önce, genelde Çarşamba).",
    tarihsel: "Vol-of-vol oynaklığı; VIX türevlerinde pozisyon ayarı spot VIX'i kısa süreli zıplatabilir.",
    opsiyon: "VIX stratejisi taşıyorsan settlement mekaniğine dikkat; doğrudan SPX etkisi sınırlı ama dolaylı.",
  },
  "jpm-collar": {
    mantik: "JPMorgan Hedged Equity Fund (JHEQX, ~$18-20B) çeyrek sonu son iş günü put-spread collar'ını roll eder: ~5% OTM put alır, ~20% OTM put + ~3-5% OTM call satar (sıfır-maliyete yakın).",
    tarihsel: "~40k+ kontrat; 'hep açık, hiç müdahale yok' yapısı öngörülebilir dealer hedging akışı yaratır. Roll'a giden RUN-UP roll gününden daha etkili; strike'lar çeyrek boyunca pin/destek-direnç gibi davranır.",
    opsiyon: "Collar strike'larını (put spread tabanı + short call tavanı) seviye olarak izle; spot put strike'ına yakınken dealer long gamma → vol baskısı/pinning. Ay-sonu rebalancing ile çakışır.",
  },
  "russell-recon": {
    mantik: "FTSE Russell endekslerinin yıllık yeniden yapılanması (Haziran son Cuma kapanışı); endeks fonları pozisyonu yeniler.",
    tarihsel: "Kapanış işlemi yılın en yüksek hacimlilerinden; eklenen/çıkarılan isimlerde kapanışa doğru sert hacim/fiyat.",
    opsiyon: "Russell 2000 isimlerinde recon haftası likidite ve volatilite artar; opsiyon satışında spread genişlemesine dikkat.",
  },
  holiday: {
    mantik: "ABD piyasası kapalı (tam tatil).",
    tarihsel: "Tatil öncesi/sonrası seanslar ince likiditeli; yarım günlerde hacim düşer.",
    opsiyon: "Kapalı günde theta işler; tatil etrafında likidite düşüğünde geniş spread'e dikkat.",
  },
};
