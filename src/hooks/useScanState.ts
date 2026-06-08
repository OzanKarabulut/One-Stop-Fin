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

  const [mode, setMode] = useState<ScanMode>(() => {
    if (typeof window !== "undefined") return (localStorage.getItem(`${prefix}_mode`) as ScanMode) || "mylist";
    return "mylist";
  });
  const [list, setList] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem(`${prefix}_my_list`) || defaultList;
    return defaultList;
  });
  const [customTickers, setCustomTickers] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem(`${prefix}_custom_tickers`) || "";
    return "";
  });
  const [budget, setBudget] = useState(() => {
    if (typeof window !== "undefined") return Number(localStorage.getItem(`${prefix}_budget`)) || defaultBudget;
    return defaultBudget;
  });
  const [expiry, setExpiry] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`${prefix}_expiry`);
      if (saved && fridays.some((f) => f.date === saved)) return saved;
    }
    return fridays[1]?.date ?? fridays[0]?.date ?? "";
  });
  const [editingList, setEditingList] = useState(false);

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
