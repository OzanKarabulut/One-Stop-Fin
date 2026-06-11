"use client";

import { TICKER_CATEGORIES, type TickerCategory } from "@/lib/ticker-universe";
import { Pencil } from "lucide-react";
import { TickerTagEditor } from "./TickerTagEditor";

interface TickerChipsProps {
  value: string[];
  onChange: (ids: string[]) => void;
  personalTickers: string[];
  onPersonalTickersChange: (tickers: string[]) => void;
  customText: string;
  onCustomTextChange: (s: string) => void;
  editingList: boolean;
  onEditingListChange: (v: boolean) => void;
  extraCategories?: TickerCategory[];
}

function parseCustom(text: string): string[] {
  return text.split(/[,\s]+/).map(t => t.trim().toUpperCase()).filter(Boolean);
}

function chipCount(id: string, personalTickers: string[], customText: string, extra?: TickerCategory[]): number {
  if (id === "listem") return personalTickers.length;
  if (id === "ozel") return parseCustom(customText).length;
  const cat = [...(extra ?? []), ...TICKER_CATEGORIES].find(c => c.id === id);
  return cat?.tickers.length ?? 0;
}

export function resolveTickers(activeIds: string[], personalTickers: string[], customText: string, extra?: TickerCategory[]): string[] {
  const set = new Set<string>();
  const allCats = [...(extra ?? []), ...TICKER_CATEGORIES];
  for (const id of activeIds) {
    if (id === "listem") personalTickers.forEach(t => set.add(t.toUpperCase()));
    else if (id === "ozel") parseCustom(customText).forEach(t => set.add(t));
    else {
      const cat = allCats.find(c => c.id === id);
      cat?.tickers.forEach(t => set.add(t));
    }
  }
  return [...set];
}

export function TickerChips({ value, onChange, personalTickers, onPersonalTickersChange, customText, onCustomTextChange, editingList, onEditingListChange, extraCategories }: TickerChipsProps) {
  const toggle = (id: string) => {
    if (value.includes(id)) {
      if (value.length <= 1) return;
      onChange(value.filter(v => v !== id));
    } else {
      onChange([...value, id]);
    }
  };

  const allChips: { id: string; label: string }[] = [
    ...(extraCategories ?? []).map(c => ({ id: c.id, label: c.label })),
    { id: "listem", label: "CSP Listem" },
    ...TICKER_CATEGORIES.map(c => ({ id: c.id, label: c.label })),
    { id: "ozel", label: "Özel ✎" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {allChips.map(chip => {
          const active = value.includes(chip.id);
          const count = chipCount(chip.id, personalTickers, customText, extraCategories);
          return (
            <button key={chip.id} onClick={() => toggle(chip.id)}
              className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                active ? "bg-[#ff7200] text-white" : "bg-white/10 text-white/90 hover:bg-white/15"
              }`}>
              {chip.label} · {count}
            </button>
          );
        })}
        <button onClick={() => onEditingListChange(!editingList)} title="Listeyi düzenle"
          className="rounded-full p-2 text-white/90 hover:bg-white/10 hover:text-white transition-colors">
          <Pencil size={14} />
        </button>
      </div>
      {value.includes("ozel") && (
        <textarea
          value={customText}
          onChange={e => onCustomTextChange(e.target.value.toUpperCase())}
          placeholder="TSLA, NVDA, AMD..."
          rows={2}
          className="mt-2 w-full bg-[#161616] border border-white/15 rounded-lg text-white font-bold text-sm p-3 focus:outline-none focus:ring-1 focus:ring-[#ff7200]/50"
        />
      )}
      {editingList && (
        <div className="mt-3 space-y-3">
          <TickerTagEditor tickers={personalTickers} onChange={onPersonalTickersChange} title="CSP Listem" />
          {value.filter(id => id !== "listem" && id !== "ozel").map(id => {
            const allCats = [...(extraCategories ?? []), ...TICKER_CATEGORIES];
            const cat = allCats.find(c => c.id === id);
            if (!cat) return null;
            return <TickerTagEditor key={id} tickers={cat.tickers} onChange={() => {}} title={cat.label} readOnly />;
          })}
        </div>
      )}
    </div>
  );
}
