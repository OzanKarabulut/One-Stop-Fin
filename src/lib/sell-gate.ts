export type GateColor = "green" | "yellow" | "red" | "neutral";
export interface GateInput {
  vrp: number | null;
  termContango: boolean | null;
  earningsInWindow: boolean | null;
  ivPercentile: number | null;
}
export interface GateVerdict { color: GateColor; label: string; reasons: string[]; }

export function sellGate(i: GateInput): GateVerdict {
  const reasons: string[] = [];
  if (i.earningsInWindow === true) {
    return { color: "red", label: "SATMA", reasons: ["Vade içinde earnings var — binary event riski"] };
  }
  if (i.vrp !== null && i.vrp < -0.02) {
    return { color: "red", label: "SATMA", reasons: ["VRP negatif: IV, gerçekleşen volatilitenin altında — prim ucuz"] };
  }
  let score = 0;
  if (i.vrp !== null && i.vrp >= 0.03) { score++; reasons.push("VRP pozitif (+" + (i.vrp * 100).toFixed(1) + " puan)"); }
  if (i.termContango === true) { score++; reasons.push("Vade yapısı contango"); }
  if (i.ivPercentile !== null && i.ivPercentile >= 40) { score++; reasons.push("IV yüzdelik dilimi yüksek"); }
  if (score >= 2) return { color: "green", label: "SAT", reasons };
  reasons.push("Koşullar kısmen sağlanıyor — seçici ol");
  return { color: "yellow", label: "SEÇİCİ", reasons };
}
