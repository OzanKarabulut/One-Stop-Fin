"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, ChevronDown, ChevronRight, Star, X, type LucideIcon } from "lucide-react";
import { MODULE_REGISTRY } from "@/lib/modules/registry";
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc/client";
import trMessages from "@/../messages/tr.json";

function t(key: string): string {
  const parts = key.split(".");
  let val: unknown = trMessages;
  for (const p of parts) {
    if (val && typeof val === "object" && p in val) val = (val as Record<string, unknown>)[p];
    else return key.split(".").pop() || key;
  }
  return typeof val === "string" ? val : key.split(".").pop() || key;
}

interface FavoriteItem { href: string; labelKey: string; order: number; }

function SubItem({ href, label, isActive, starred, onStar, icon: Icon }: { href: string; label: string; isActive: boolean; starred: boolean; onStar: () => void; icon?: LucideIcon }) {
  const router = useRouter();
  return (
    <div className={`group flex items-center h-[38px] pl-[32px] pr-3 transition-colors cursor-pointer ${isActive ? "bg-[#141414] border-l-2 border-[#ff7200]" : "hover:bg-white/[0.03] border-l-2 border-transparent"}`}
      onClick={() => router.push(href)}>
      {Icon && <Icon size={14} className={`mr-2 shrink-0 ${isActive ? "text-[#ff7200]" : "text-white/80"}`} />}
      <span className={`text-sm flex-1 tracking-tight ${isActive ? "text-[#ff7200] font-bold" : "text-white font-semibold"}`}>{label}</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onStar(); }}
        className={`p-1.5 rounded hover:bg-white/10 opacity-0 group-hover:opacity-100 ${starred ? "!opacity-100 text-[#ff7200]" : "text-white/40 hover:text-[#ff7200]"}`}>
        <Star size={13} fill={starred ? "currentColor" : "none"} />
      </button>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ signallab: true, finsumy: true });
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);

  const utils = trpc.useUtils();
  const { data: pref } = trpc.userPref.get.useQuery();
  const setFavMutation = trpc.userPref.setFavorites.useMutation({ onSuccess: () => utils.userPref.get.invalidate() });

  useEffect(() => {
    if (pref?.favorites) setFavorites(pref.favorites as unknown as FavoriteItem[]);
  }, [pref]);

  const toggle = (id: string) => setExpanded((p) => ({ ...p, [id]: !p[id] }));

  const persist = (f: FavoriteItem[]) => { setFavorites(f); setFavMutation.mutate({ favorites: f }); };

  const addFav = (href: string, label: string) => {
    if (favorites.some((f) => f.href === href)) return;
    persist([...favorites, { href, labelKey: label, order: favorites.length }]);
  };

  const removeFav = (href: string) => {
    persist(favorites.filter((f) => f.href !== href).map((f, i) => ({ ...f, order: i })));
  };

  const isFav = (href: string) => favorites.some((f) => f.href === href);

  return (
    <aside className="w-[264px] h-screen bg-[#060606] border-r border-white/[0.08] flex flex-col overflow-y-auto shrink-0">

      {/* Brand */}
      <Link href="/dashboard" className="flex items-center gap-3 h-[68px] px-4 border-b border-white/[0.12] hover:bg-white/[0.03] transition-colors">
        <div className="w-10 h-10 rounded-lg bg-[#ff7200] flex items-center justify-center border-2 border-[#ff7200]/60 shadow-lg shadow-[#ff7200]/20">
          <span className="text-white text-lg font-bold">O</span>
        </div>
        <div className="text-lg font-bold tracking-tight text-white">One-Stop-Fin</div>
      </Link>

      {/* Home */}
      <div className="py-2">
        <Link href="/dashboard"
          className={`flex items-center h-[44px] px-4 gap-3 transition-colors ${pathname === "/dashboard" ? "bg-[#141414] text-[#ff7200] border-l-2 border-[#ff7200]" : "text-white hover:bg-white/[0.03] border-l-2 border-transparent"}`}>
          <Home size={18} className="text-[#ff7200]" />
          <span className="text-base font-bold tracking-tight">Ana Sayfa</span>
        </Link>
      </div>

      {/* Favorites */}
      {favorites.length > 0 && (
        <div className="border-b border-white/[0.06] py-2">
          <div className="flex items-center h-[44px] px-4 gap-3">
            <Star size={18} className="text-[#ff7200]" />
            <span className="text-base font-bold tracking-tight text-white">Favoriler</span>
          </div>
          {favorites.map((fav) => (
            <div key={fav.href} className={`group flex items-center h-[38px] px-4 pl-[42px] ${pathname === fav.href ? "bg-[#141414]" : "hover:bg-white/[0.03]"}`}>
              <Link href={fav.href}
                className={`text-sm font-semibold tracking-tight flex-1 ${pathname === fav.href ? "text-[#ff7200] font-bold" : "text-white"}`}>
                {fav.labelKey}
              </Link>
              <button onClick={() => removeFav(fav.href)} className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 p-1">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modules */}
      <nav className="flex-1 py-2">
        {MODULE_REGISTRY.filter((m) => m.implemented).map((mod) => {
          const Icon = mod.icon;
          const isExp = expanded[mod.id] ?? false;
          return (
            <div key={mod.id}>
              <button onClick={() => toggle(mod.id)}
                className={`flex items-center w-full h-[44px] px-4 gap-3 transition-colors ${isExp ? "text-white" : "text-[#ccc] hover:bg-white/[0.03]"}`}>
                <Icon size={18} className={isExp ? "text-[#ff7200]" : ""} />
                <span className="text-base font-bold tracking-tight">{mod.id === "signallab" ? "SignalLab" : "FinSumy"}</span>
                {isExp ? <ChevronDown size={14} className="ml-auto text-white/30" /> : <ChevronRight size={14} className="ml-auto text-white/30" />}
              </button>
              {isExp && (
                <div className="border-l border-white/[0.06] ml-4 bg-black/30 py-1">
                  {mod.items.map((item) => {
                    const label = t(item.labelKey);
                    const isActive = pathname === item.href;
                    const starred = isFav(item.href);
                    return (
                      <SubItem key={item.href} href={item.href} label={label} isActive={isActive} starred={starred}
                        icon={item.icon}
                        onStar={() => starred ? removeFav(item.href) : addFav(item.href, label)} />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
