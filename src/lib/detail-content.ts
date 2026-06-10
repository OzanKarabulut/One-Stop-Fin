export interface DetailContent {
  title: string;
  logic: string;
  scenarios: { durum: string; sonuc: string; renk: "green" | "red" | "yellow" }[];
}

export function gateDetail(color: "green" | "yellow" | "red"): DetailContent {
  return {
    title: "Satış Kapısı Mantığı",
    logic: "VRP (Volatilite Risk Primi), vade yapısı (contango/backwardation), IV yüzdelik dilimi ve earnings takvimi değerlendirilir. 3 koşuldan en az 2'si sağlanırsa SAT, hiçbiri sağlanmazsa veya kırmızı bayrak varsa SATMA sinyali üretilir.",
    scenarios: [
      { durum: "VRP ≥ +3 puan & IV%ile ≥ 40 & contango", sonuc: "SAT — prim zengin, volatilite yüksek, yapı normal", renk: "green" },
      { durum: "VRP negatif (< -2 puan)", sonuc: "SATMA — gerçekleşen vol IV'yi aşıyor, prim ucuz", renk: "red" },
      { durum: "Vade içinde earnings var", sonuc: "SATMA — binary event riski, gap tehlikesi", renk: "red" },
      { durum: "Koşullardan sadece 1'i sağlanıyor", sonuc: "SEÇİCİ — sadece güçlü setup'larda işleme gir", renk: "yellow" },
    ],
  };
}

export function gexDetail(): DetailContent {
  return {
    title: "GEX (Gamma Exposure) Profili",
    logic: "Dealer'ların opsiyon pozisyonlarından kaynaklanan net gamma exposure'ı hesaplanır. Pozitif GEX bölgesinde fiyat baskılanır (düşük volatilite), negatif GEX bölgesinde fiyat serbest kalır (yüksek volatilite).",
    scenarios: [
      { durum: "Spot > Flip noktası, pozitif GEX", sonuc: "Dealer long gamma — satış baskısı pinning yaratır, vol düşük", renk: "green" },
      { durum: "Spot < Flip noktası, negatif GEX", sonuc: "Dealer short gamma — hedging hareketi volatiliteyi artırır", renk: "red" },
      { durum: "Call Wall'a yakın fiyat", sonuc: "Güçlü direnç — dealer hedging tavanda baskı", renk: "yellow" },
      { durum: "Put Wall'a yakın fiyat", sonuc: "Potansiyel destek ama kırılırsa kaskad satış", renk: "red" },
    ],
  };
}

export function actionDetail(code: "TAKE_PROFIT" | "ROLL" | "ALARM" | "HOLD"): DetailContent {
  const map: Record<string, DetailContent> = {
    TAKE_PROFIT: {
      title: "Kâr Al Sinyali",
      logic: "Pozisyon %50+ kârda. Kalan prim/risk oranı azaldığında erken kapatma toplam getiriyi artırır (daha fazla işlem fırsatı).",
      scenarios: [
        { durum: "Kâr %50-65 arası", sonuc: "Kapat — sermayeyi serbest bırak, yeni işleme yönlendir", renk: "green" },
        { durum: "Kâr %80+, DTE > 14", sonuc: "Kesinlikle kapat — theta getirisi marjinal", renk: "green" },
        { durum: "Kâr %50 ama vade 3 gün", sonuc: "Pin riski düşük, bekle — son 3 günde theta hızlanır", renk: "yellow" },
      ],
    },
    ROLL: {
      title: "Roll Değerlendir",
      logic: "DTE ≤ 21 ve kâr %50'nin altında. Gamma riski artıyor, roll ile daha uzak vadeye geçip ek kredi toplamak değerlendirilebilir.",
      scenarios: [
        { durum: "DTE 14-21, kâr %30-49", sonuc: "Roll cazip — aynı strike'a 30-45 gün ileri, ek kredi al", renk: "yellow" },
        { durum: "DTE < 7, kâr düşük", sonuc: "Roll zorunlu — assignment riski yüksek", renk: "red" },
        { durum: "Strike test ediliyorsa", sonuc: "Roll down/out — savunma pozisyonu", renk: "red" },
      ],
    },
    ALARM: {
      title: "Alarm — Strike Test Ediliyor",
      logic: "Fiyat strike'ın %2 yakınında VE vade içinde önemli event var. Assignment + gap riski birleşik tehdit oluşturur.",
      scenarios: [
        { durum: "Strike test + earnings", sonuc: "Acil kapat veya roll — gap riski çok yüksek", renk: "red" },
        { durum: "Strike test + FOMC", sonuc: "Karar öncesi kapat — whipsaw riski", renk: "red" },
        { durum: "Strike test, event yok", sonuc: "İzle — teknik seviye olarak değerlendir", renk: "yellow" },
      ],
    },
    HOLD: {
      title: "Tut",
      logic: "Pozisyon normal seyirde: kâr hedefine ulaşmamış, DTE yeterli, strike uzak. Theta çalışmaya devam ediyor.",
      scenarios: [
        { durum: "Kâr %20-49, DTE > 21", sonuc: "Bekle — zaman senin lehine", renk: "green" },
        { durum: "Kâr %0-20, DTE > 30", sonuc: "Sabır — pozisyon henüz olgunlaşmadı", renk: "yellow" },
        { durum: "Hafif zararda, DTE > 30", sonuc: "Panik yapma — theta toparlar, izle", renk: "yellow" },
      ],
    },
  };
  return map[code] ?? map.HOLD;
}
