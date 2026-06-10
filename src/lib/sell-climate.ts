export type Climate = "favorable" | "cautious" | "poor";
export interface ClimateInput {
  vix: number | null;
  vixChangePct: number | null;
  fearGreed: number | null;
}
export interface ClimateVerdict { climate: Climate; label: string; reasons: string[]; }

export function sellClimate(i: ClimateInput): ClimateVerdict {
  const reasons: string[] = [];
  if (i.vixChangePct !== null && i.vixChangePct >= 15) {
    return { climate: "poor", label: "KÖTÜ", reasons: ["VIX sert yükseliyor — düşen bıçak riski, prim zengin görünse de satma"] };
  }
  if (i.vix !== null && i.vix >= 30) {
    return { climate: "poor", label: "KÖTÜ", reasons: ["VIX 30+ — yüksek stres rejimi, gap riski yüksek"] };
  }
  let score = 0;
  if (i.vix !== null && i.vix >= 16 && i.vix < 28) { score++; reasons.push("VIX orta-yüksek, stabil — prim zengin"); }
  if (i.vix !== null && i.vix < 14) { reasons.push("VIX düşük — prim ince, getiri zayıf"); }
  if (i.fearGreed !== null && i.fearGreed <= 35) { score++; reasons.push("Piyasa korku modunda — IV şişkin, satıcı lehine (ama seçici ol)"); }
  if (i.fearGreed !== null && i.fearGreed >= 80) { reasons.push("Aşırı açgözlülük — IV ince, dönüş riski"); }
  if (i.vixChangePct !== null && i.vixChangePct <= -5) { score++; reasons.push("VIX düşüyor — IV crush, mevcut kısa primler lehine"); }
  if (score >= 2) return { climate: "favorable", label: "ELVERİŞLİ", reasons };
  return { climate: "cautious", label: "TEMKİNLİ", reasons: reasons.length ? reasons : ["Karışık sinyaller — seçici ol"] };
}
