export interface ActionSignal { code: "TAKE_PROFIT" | "ROLL" | "ALARM" | "HOLD"; label: string; severity: "green" | "yellow" | "red" | "neutral"; }
export function positionActions(p: { profitPct: number; dte: number; spot: number; strike: number; optionType: string; hasEventBeforeExpiry: boolean; }): ActionSignal[] {
  const out: ActionSignal[] = [];
  const strikeTested = p.optionType === "put" ? p.spot <= p.strike * 1.02 : p.spot >= p.strike * 0.98;
  if (strikeTested && p.hasEventBeforeExpiry) out.push({ code: "ALARM", label: "🔴 ALARM", severity: "red" });
  if (p.profitPct >= 0.5) out.push({ code: "TAKE_PROFIT", label: "KAPAT (%50+)", severity: "green" });
  if (p.dte <= 21 && p.profitPct < 0.5) out.push({ code: "ROLL", label: "ROLL DEĞERLENDİR", severity: "yellow" });
  if (out.length === 0) out.push({ code: "HOLD", label: "TUT", severity: "neutral" });
  return out;
}
