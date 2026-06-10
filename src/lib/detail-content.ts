import type { DetailContent } from "@/components/ui/DetailPanel";

export type { DetailContent };

export interface GateDetailInput {
  ticker: string;
  verdict: { color: string; label: string; reasons: string[] };
  vrp: number | null;
  atmIvFront: number | null;
  hv20: number | null;
  termContango: boolean | null;
  ivPercentile: number | null;
  earningsInWindow: boolean | null;
}

export function gateDetail(i: GateDetailInput): DetailContent {
  const checks: string[] = [];
  checks.push(`1) Earnings kontrolü: ${i.earningsInWindow === true ? "VADE İÇİNDE EARNINGS VAR → otomatik SATMA" : i.earningsInWindow === false ? "vade içinde earnings yok ✓" : "veri alınamadı (kontrol devre dışı)"}`);
  checks.push(`2) VRP = IV(${i.atmIvFront?.toFixed(1) ?? "?"}) − HV20(${i.hv20 !== null ? (i.hv20 * 100).toFixed(1) : "?"}) = ${i.vrp !== null ? (i.vrp * 100).toFixed(1) + " puan" : "veri yok"}. ${i.vrp !== null && i.vrp < -0.02 ? "Negatif → prim, gerçekleşen volatiliteyi karşılamıyor → otomatik SATMA" : i.vrp !== null && i.vrp >= 0.03 ? "Pozitif ve güçlü → koşul sağlandı ✓" : "Nötr bölgede → puan yok"}`);
  checks.push(`3) Vade yapısı: ${i.termContango === true ? "Contango (yakın vade IV < uzak vade IV) → normal yapı ✓" : i.termContango === false ? "Backwardation → piyasa kısa vadede stres fiyatlıyor, puan yok" : "veri yok"}`);
  checks.push(`4) IV yüzdelik: ${i.ivPercentile !== null ? i.ivPercentile.toFixed(0) + (i.ivPercentile >= 40 ? " → tarihsel olarak yüksek, prim zengin ✓" : " → tarihsel olarak düşük, puan yok") : "veri yok"}`);
  checks.push(`Sonuç: kırmızı bayrak varsa SATMA; yoksa 3 koşuldan (VRP / Contango / IV yüzdelik) en az 2'si sağlanırsa SAT, 1'i sağlanırsa SEÇİCİ, hiçbiri sağlanmazsa SEÇİCİ.`);
  return {
    title: `${i.ticker} — ${i.verdict.label} hükmüne nasıl ulaşıldı`,
    logic: checks.join("\n"),
    scenarios: [
      { durum: "SAT", sonuc: "CSP satmak için ortam uygun — prim, taşınan riske göre zengin", renk: "green" },
      { durum: "SEÇİCİ", sonuc: "Ortam karışık — sadece çok güvendiğin strike/isimde sat", renk: "yellow" },
      { durum: "SATMA", sonuc: "Bu isimde şu an CSP satma — alacağın prim riski karşılamıyor", renk: "red" },
    ],
    glossary: [
      { term: "IV (Implied Volatility)", def: "Opsiyon fiyatının ima ettiği beklenen dalgalanma. Yüksek IV = pahalı opsiyon = satıcıya zengin prim." },
      { term: "HV20 / HV60", def: "Son 20/60 günde GERÇEKLEŞEN dalgalanma. IV'nin karşılaştırma çıpası." },
      { term: "VRP (Volatilite Risk Primi)", def: "IV − HV. Pozitifse piyasa sana gerçekleşenden FAZLA prim ödüyor — prim satıcısının kâr kaynağı budur." },
      { term: "Term / Contango", def: "Yakın vade IV < uzak vade IV ise contango (normal). Tersi (backwardation) kısa vadeli stres işaretidir." },
      { term: "Skew25", def: "OTM put IV'sinin ATM IV'ye göre fazlalığı. Yüksekse piyasa düşüş koruması için ekstra ödüyor." },
      { term: "IV%ile", def: "Bugünkü IV'nin kendi geçmişine göre yüzdelik sırası. 69 = son dönemin %69'undan daha yüksek IV." },
    ],
  };
}

export function gexDetail(): DetailContent {
  return {
    title: "GEX Profili — Put Satıcısı için Anlamı",
    logic: "GEX (Gamma Exposure) = dealer'ların tuttuğu gamma miktarı.\n• Flip noktasının ÜSTÜNDE: dealer'lar long gamma → fiyat hareketi dampelenir, pinning eğilimi.\n• Flip noktasının ALTINDA: dealer'lar short gamma → fiyat hareketi amplifiye olur, sert düşüş riski artar.\n• Put Wall: en yoğun negatif gamma seviyesi → bu seviyede dealer hedging akışı yapısal destek yaratır.\n• Call Wall: en yoğun pozitif gamma → üst direnç, fiyat bu seviyeye yapışma eğiliminde.\n\nCSP strike seçimi: Put Wall ALTINDA strike seçersen, dealer'ın yapısal desteğinden yararlanırsın.",
    scenarios: [
      { durum: "Spot put wall'a yaklaşırsa", sonuc: "Dealer hedging alım yapacak → destek güçlenir, assignment riski düşer", renk: "green" },
      { durum: "Spot flip altına kırarsa", sonuc: "Dealer short gamma → satış hızlanır, aşağı hareket sertleşir", renk: "red" },
      { durum: "OPEX sonrası duvarlar silinirse", sonuc: "Gamma boşalır → destek/direnç seviyeleri geçersizleşir, yeniden tara", renk: "yellow" },
    ],
    glossary: [
      { term: "GEX", def: "Gamma Exposure — dealer'ların toplam gamma pozisyonu. Fiyatın nereye doğru çekildiğini gösterir." },
      { term: "Flip", def: "Net gamma'nın sıfır olduğu seviye. Üstü = sakin (dampened), altı = volatil (amplified)." },
      { term: "Call Wall", def: "En yoğun pozitif gamma. Fiyat bu seviyeye mıknatıs gibi çekilir (üst pin)." },
      { term: "Put Wall", def: "En yoğun negatif gamma SPOT ALTINDA. Yapısal destek — CSP strike'ını bunun altında seç." },
    ],
  };
}

export function actionDetail(code: string, position?: { entryCredit: number; strike: number; contracts: number }): DetailContent {
  const prem = position ? position.entryCredit : 0;
  const maxLoss = position ? position.strike * 100 * position.contracts - prem : 0;
  if (code === "TAKE_PROFIT") {
    return {
      title: "KAPAT (%50+ kâr) — Neden şimdi?",
      logic: "Primin %50+'sini kazandın. Kalan %50 prim için vadeye kadar beklersen:\n• Gamma riski artar (küçük hareket büyük P&L değişimi)\n• Theta geliri azalır (günlük kazanç küçülür)\n• Kâr/risk oranı bozulur — kalan primin büyük kısmı son haftalarda erir ama assignment riski en yüksekte.\nKapatıp sermayeyi yeni trade'e yönlendirmek bileşik getiri sağlar.",
      scenarios: [
        { durum: "Şimdi kapatırsan", sonuc: `+${Math.round(prem * 0.5)}$ realize eder, sermaye serbest`, renk: "green" },
        { durum: "Tutarsan ve yatay kalırsa", sonuc: `+${Math.round(prem * 0.3)}$ ek kazanç potansiyeli (küçük)`, renk: "yellow" },
        { durum: "Tutarsan ve düşüş gelirse", sonuc: `−${Math.round(maxLoss * 0.3)}$ risk (gamma hızlanır)`, renk: "red" },
      ],
    };
  }
  if (code === "ROLL") {
    return {
      title: "ROLL DEĞERLENDİR — 21 DTE kuralı",
      logic: "DTE 21 günün altına indi. Bu eşik önemli çünkü:\n• Gamma riski 21 günden sonra üstel hızlanır\n• Theta'nın büyük kısmı (%65-70) zaten toplandı\n• Kalan sürede risk/ödül oranı bozulur.\nYeni vadeye roll: mevcut pozisyonu kapat + aynı/farklı strike'ta yeni vade aç.",
      scenarios: [
        { durum: "Roll yaparsan", sonuc: `Yeni prim toplar + DTE sıfırlanır, gamma riski düşer`, renk: "green" },
        { durum: "Vadeye bırakırsan (yatay)", sonuc: `Kalan primi alırsın ama risk/ödül asimetrik`, renk: "yellow" },
        { durum: "Vadeye bırakırsan (düşüş)", sonuc: `Assignment riski yüksek — gamma hızlı büyür`, renk: "red" },
      ],
    };
  }
  // ALARM
  return {
    title: "🔴 ALARM — Strike test + olay çakışması",
    logic: "Hisse fiyatı strike'a %2 veya daha yakın VE vade içinde önemli bir olay var (CPI, FOMC, NFP, OPEX vb.).\nBu kombinasyon tehlikeli çünkü:\n• Olay günü gap riski (açılışta strike'ın altına düşebilir)\n• Gamma zaten yüksek (strike yakınında)\n• Assignment olasılığı ani artabilir.",
    scenarios: [
      { durum: "Olay öncesi kapatırsan", sonuc: `Küçük zarar/kâr realize, binary riskten kurtulursun`, renk: "green" },
      { durum: "Olay yukarı sürpriz yaparsa", sonuc: `Hisse uzaklaşır, rahatla — ama önceden bilinemez`, renk: "yellow" },
      { durum: "Olay aşağı sürpriz yaparsa", sonuc: `Gap down → ITM → assignment (−${Math.round(maxLoss)}$ max zarar)`, renk: "red" },
    ],
  };
}
