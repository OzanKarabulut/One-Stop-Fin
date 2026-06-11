"use client";

import { useState, useMemo, useEffect } from "react";

export type ScanMode = "mylist" | "all" | "custom";

export function generateFridays(): { date: string; label: string }[] {
  const fridays: { date: string; label: string }[] = [];
  const now = new Date();
  for (let i = 1; i < 120 && fridays.length < 10; i++) {
    const d = new Date(now.getTime() + i * 86400000);
    if (d.getUTCDay() === 5) {
      const dateStr = d.toISOString().split("T")[0];
      const label = `${d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} (${i}g)`;
      fridays.push({ date: dateStr, label });
    }
  }
  return fridays;
}

const SHARED_LIST_KEY = "shared:personalTickers";

interface ScanStateOpts {
  prefix: string;
  defaultList: string;
  defaultBudget: number;
  defaultChips?: string[];
}

export function useScanState({ prefix, defaultList, defaultBudget, defaultChips }: ScanStateOpts) {
  const fridays = useMemo(() => generateFridays(), []);
  const defaultExpiry = fridays[1]?.date ?? fridays[0]?.date ?? "";

  const [mode, setMode] = useState<ScanMode>("mylist");
  const [list, setList] = useState(defaultList);
  const [customTickers, setCustomTickers] = useState("");
  const [budget, setBudget] = useState(defaultBudget);
  const [expiry, setExpiry] = useState(defaultExpiry);
  const [editingList, setEditingList] = useState(false);
  const [activeChips, setActiveChips] = useState<string[]>(defaultChips ?? ["listem"]);

  // Hydrate from localStorage after mount
  useEffect(() => {
    // Migrate: if shared key doesn't exist but old csp_my_list does, copy it
    const shared = localStorage.getItem(SHARED_LIST_KEY);
    if (!shared) {
      const legacy = localStorage.getItem("csp_my_list");
      if (legacy) localStorage.setItem(SHARED_LIST_KEY, legacy);
    }

    // Personal list: always from shared key
    const l = localStorage.getItem(SHARED_LIST_KEY);
    if (l) setList(l);

    // Prefix-scoped state
    const m = localStorage.getItem(`${prefix}_mode`) as ScanMode | null;
    if (m) setMode(m);
    const ct = localStorage.getItem(`${prefix}_custom_tickers`);
    if (ct) setCustomTickers(ct);
    const b = localStorage.getItem(`${prefix}_budget`);
    if (b) setBudget(Number(b) || defaultBudget);
    const e = localStorage.getItem(`${prefix}_expiry`);
    if (e && fridays.some((f) => f.date === e)) setExpiry(e);
    const chips = localStorage.getItem(`${prefix}_activeChips`);
    if (chips) { try { setActiveChips(JSON.parse(chips)); } catch { /* ignore */ } }
  }, [prefix, defaultBudget, defaultList, fridays]);

  useEffect(() => { localStorage.setItem(`${prefix}_mode`, mode); }, [prefix, mode]);
  useEffect(() => { localStorage.setItem(SHARED_LIST_KEY, list); }, [list]);
  useEffect(() => { localStorage.setItem(`${prefix}_custom_tickers`, customTickers); }, [prefix, customTickers]);
  useEffect(() => { localStorage.setItem(`${prefix}_budget`, String(budget)); }, [prefix, budget]);
  useEffect(() => { localStorage.setItem(`${prefix}_expiry`, expiry); }, [prefix, expiry]);
  useEffect(() => { localStorage.setItem(`${prefix}_activeChips`, JSON.stringify(activeChips)); }, [prefix, activeChips]);

  const scanWatchlist: "all" | "custom" = mode === "all" ? "all" : "custom";
  const scanTickers = mode === "all" ? "" : mode === "custom" ? customTickers : list;

  return {
    fridays,
    mode, setMode,
    list, setList,
    customTickers, setCustomTickers,
    budget, setBudget,
    expiry, setExpiry,
    editingList, setEditingList,
    activeChips, setActiveChips,
    scanWatchlist, scanTickers,
  };
}
