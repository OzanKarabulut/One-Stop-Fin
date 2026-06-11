"use client";

import { useState } from "react";

interface TickerTagEditorProps {
  tickers: string[];
  onChange: (next: string[]) => void;
  title?: string;
  readOnly?: boolean;
}

export function TickerTagEditor({ tickers, onChange, title, readOnly }: TickerTagEditorProps) {
  const [draft, setDraft] = useState("");
  const [dup, setDup] = useState(false);

  const addFromDraft = () => {
    const parts = draft.split(/[,\s]+/).map(t => t.trim().toUpperCase()).filter(Boolean);
    const valid = parts.filter(t => /^[A-Z.\-]{1,8}$/.test(t));
    let hasDup = false;
    const toAdd: string[] = [];
    for (const t of valid) {
      if (tickers.includes(t)) { hasDup = true; continue; }
      if (!toAdd.includes(t)) toAdd.push(t);
    }
    if (toAdd.length > 0) {
      onChange([...tickers, ...toAdd]);
      setDup(false);
    } else if (hasDup) {
      setDup(true);
    }
    setDraft("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addFromDraft();
    }
  };

  return (
    <div className="bg-[#121212] border border-white/12 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-white">{title ?? "Listem"}</span>
        <span className="text-sm font-bold text-white/90">{tickers.length} hisse</span>
      </div>

      <div className="flex flex-wrap gap-x-2 gap-y-3 min-h-[52px]">
        {tickers.map(t => (
          <span key={t} className={`relative inline-flex items-center border border-white/35 rounded-full px-3 py-1.5 ${readOnly ? "" : "pr-7"} text-sm font-bold text-white bg-white/5`}>
            {t}
            {!readOnly && (
              <button
                aria-label={`${t} sil`}
                onClick={() => { onChange(tickers.filter(v => v !== t)); setDup(false); }}
                className="absolute top-1/2 -translate-y-1/2 right-2 w-4 h-4 rounded-full bg-white/15 hover:bg-red-400 text-white text-[9px] font-bold leading-none flex items-center justify-center"
              >✕</button>
            )}
          </span>
        ))}
      </div>

      {!readOnly && (
        <div className="flex gap-2 mt-3 items-center">
          <input
            value={draft}
            onChange={e => { setDraft(e.target.value); setDup(false); }}
            onKeyDown={handleKeyDown}
            placeholder="Ticker ekle — Enter veya virgül (örn. NVDA, TSLA)"
            className="flex-1 bg-[#161616] text-white font-bold text-sm border border-white/15 rounded-lg px-3.5 py-2.5 uppercase placeholder:text-white/40 placeholder:normal-case focus:outline-none focus:ring-1 focus:ring-[#ff7200]/50"
          />
          <button onClick={addFromDraft} className="bg-[#ff7200] hover:bg-[#ff8a2b] text-white font-bold text-sm rounded-lg px-4 py-2.5 transition-colors">+ Ekle</button>
        </div>
      )}
      {!readOnly && dup && <p className="text-yellow-400 text-xs font-bold mt-2">Zaten listede</p>}
    </div>
  );
}
