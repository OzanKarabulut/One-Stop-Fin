"use client";
import { useState } from "react";

export interface DetailContent {
  title: string;
  logic: string;
  scenarios: { durum: string; sonuc: string; renk: "green" | "red" | "yellow" }[];
  glossary?: { term: string; def: string }[];
}

export function DetayButton({ content, below }: { content: DetailContent; below?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(!open)}
        className="bg-[#ff7200] text-white font-bold rounded-lg px-4 py-2 text-sm hover:bg-[#ff8a2b] transition-colors shrink-0">
        Detay {open ? "▾" : "▸"}
      </button>
      {open && below && <div className="w-full mt-2"><DetailPanel content={content} /></div>}
      {open && !below && <DetailPanel content={content} />}
    </>
  );
}

export function DetayPanelBelow({ content, below }: { content: DetailContent; below?: boolean }) {
  return below ? <DetailPanel content={content} /> : null;
}

export function DetailPanel({ content }: { content: DetailContent }) {
  return (
    <div className="mt-2 rounded-lg border border-white/10 bg-[#101013] px-4 py-3 space-y-3">
      <div className="text-sm font-bold text-white">{content.title}</div>
      <div className="text-sm font-bold text-white/90 whitespace-pre-line">{content.logic}</div>
      {content.scenarios.length > 0 && (
        <table className="w-full text-xs font-bold">
          <thead><tr className="border-b border-white/10"><th className="text-left py-1 text-white">Durum</th><th className="text-left py-1 text-white">Sonuç</th></tr></thead>
          <tbody>
            {content.scenarios.map((s, i) => (
              <tr key={i} className="border-b border-white/5">
                <td className="py-1.5 text-white/90">{s.durum}</td>
                <td className={`py-1.5 ${s.renk === "green" ? "text-emerald-400" : s.renk === "red" ? "text-red-400" : "text-yellow-400"}`}>{s.sonuc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {content.glossary && content.glossary.length > 0 && (
        <div className="border-t border-white/10 pt-2 space-y-1.5">
          <div className="text-xs font-bold text-white/90">Sözlük</div>
          {content.glossary.map((g, i) => (
            <div key={i} className="text-xs font-bold">
              <span className="text-[#ff7200]">{g.term}:</span>{" "}
              <span className="text-white/90">{g.def}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
