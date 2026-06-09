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

interface ScanStateOpts {
  prefix: string;
  defaultList: string;
  defaultBudget: number;
}

export function useScanState({ prefix, defaultList, defaultBudget }: ScanStateOpts) {
  const fridays = useMemo(() => generateFridays(), []);
  const defaultExpiry = fridays[1]?.date ?? fridays[0]?.date ?? "";

  const [mode, setMode] = useState<ScanMode>("mylist");
  const [list, setList] = useState(defaultList);
  const [customTickers, setCustomTickers] = useState("");
  const [budget, setBudget] = useState(defaultBudget);
  const [expiry, setExpiry] = useState(defaultExpiry);
  const [editingList, setEditingList] = useState(false);

  // Hydrate from localStorage after mount
  useEffect(() => {
    const m = localStorage.getItem(`${prefix}_mode`) as ScanMode | null;
    if (m) setMode(m);
    const l = localStorage.getItem(`${prefix}_my_list`);
    if (l) setList(l);
    const ct = localStorage.getItem(`${prefix}_custom_tickers`);
    if (ct) setCustomTickers(ct);
    const b = localStorage.getItem(`${prefix}_budget`);
    if (b) setBudget(Number(b) || defaultBudget);
    const e = localStorage.getItem(`${prefix}_expiry`);
    if (e && fridays.some((f) => f.date === e)) setExpiry(e);
  }, [prefix, defaultBudget, defaultList, fridays]);

  useEffect(() => { localStorage.setItem(`${prefix}_mode`, mode); }, [prefix, mode]);
  useEffect(() => { localStorage.setItem(`${prefix}_my_list`, list); }, [prefix, list]);
  useEffect(() => { localStorage.setItem(`${prefix}_custom_tickers`, customTickers); }, [prefix, customTickers]);
  useEffect(() => { localStorage.setItem(`${prefix}_budget`, String(budget)); }, [prefix, budget]);
  useEffect(() => { localStorage.setItem(`${prefix}_expiry`, expiry); }, [prefix, expiry]);

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
    scanWatchlist, scanTickers,
  };
}
