"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ChevronDown, ChevronRight, Star, GripVertical, X } from "lucide-react";
import { MODULE_REGISTRY } from "@/lib/modules/registry";
import { useState, useEffect } from "react";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, pointerWithin, useDroppable, useDraggable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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

// ─── Draggable Sub-Item ──────────────────────────────────────────────────────
function DraggableSubItem({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: href, data: { href, label } });
  const isActive = pathname === href;

  return (
    <div ref={setNodeRef} className={`group flex items-center h-[34px] transition-colors ${isActive ? "bg-[#141414] border-l-2 border-[#ff7200]" : "hover:bg-white/[0.03] border-l-2 border-transparent"} ${isDragging ? "opacity-30" : ""}`}
      style={{ paddingLeft: "38px", paddingRight: "16px" }}>
      <span {...attributes} {...listeners} className="mr-2 cursor-grab opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity flex-shrink-0">
        <GripVertical size={11} />
      </span>
      <Link href={href} className={`text-[13px] ${isActive ? "text-[#ff7200] font-medium" : "text-[#b9b9b9] hover:text-white"}`}>
        {label}
      </Link>
    </div>
  );
}

// ─── Sortable Favorite ───────────────────────────────────────────────────────
function SortableFavorite({ item, onRemove }: { item: FavoriteItem; onRemove: () => void }) {
  const pathname = usePathname();
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.href });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const isActive = pathname === item.href;

  return (
    <div ref={setNodeRef} style={style} className={`group flex items-center h-[34px] px-4 ${isActive ? "bg-[#141414]" : "hover:bg-white/[0.03]"}`}>
      <span {...attributes} {...listeners} className="mr-2 cursor-grab opacity-0 group-hover:opacity-50 transition-opacity">
        <GripVertical size={11} className="text-white/40" />
      </span>
      <Link href={item.href} className={`flex-1 text-[13px] ${isActive ? "text-[#ff7200] font-medium" : "text-[#b9b9b9] hover:text-white"}`}>
        {item.labelKey}
      </Link>
      <button onClick={onRemove} className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 transition-opacity">
        <X size={12} />
      </button>
    </div>
  );
}

// ─── Favorites Zone ──────────────────────────────────────────────────────────
function FavoritesZone({ items, onRemove }: { items: FavoriteItem[]; onRemove: (href: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: "favorites-zone" });

  return (
    <div ref={setNodeRef} className={`border-b border-white/[0.06] transition-colors ${isOver ? "bg-[#ff7200]/[0.04] border-[#ff7200]/30" : ""}`}
      style={{ padding: items.length > 0 ? "8px 0 6px" : "10px 0" }}>
      <div className="flex items-center h-[24px] px-4 mb-1">
        <Star size={11} className="text-[#ff7200]/80 mr-2" />
        <span className="text-[10px] font-semibold tracking-[0.08em] uppercase text-white/40">Favoriler</span>
      </div>
      {items.length === 0 && (
        <div className={`mx-4 py-2 border border-dashed rounded text-center text-[11px] transition-colors ${isOver ? "border-[#ff7200]/50 text-[#ff7200]/80" : "border-white/10 text-white/20"}`}>
          Sürükleyip favorilere ekle
        </div>
      )}
      <SortableContext items={items.map((i) => i.href)} strategy={verticalListSortingStrategy}>
        {items.map((item) => (
          <SortableFavorite key={item.href} item={item} onRemove={() => onRemove(item.href)} />
        ))}
      </SortableContext>
    </div>
  );
}

// ─── Main Sidebar ────────────────────────────────────────────────────────────
export function Sidebar() {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ signallab: true, finsumy: false });
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const { data: pref } = trpc.userPref.get.useQuery();
  const setFavMutation = trpc.userPref.setFavorites.useMutation({ onSuccess: () => utils.userPref.get.invalidate() });

  useEffect(() => {
    if (pref?.favorites) setFavorites(pref.favorites as unknown as FavoriteItem[]);
  }, [pref]);

  const toggle = (id: string) => setExpanded((p) => ({ ...p, [id]: !p[id] }));
  const persist = (f: FavoriteItem[]) => { setFavorites(f); setFavMutation.mutate({ favorites: f }); };
  const removeFav = (href: string) => persist(favorites.filter((f) => f.href !== href).map((f, i) => ({ ...f, order: i })));

  const handleDragStart = (e: DragStartEvent) => setActiveId(e.active.id as string);
  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const href = active.id as string;
    if (over.id === "favorites-zone") {
      if (favorites.some((f) => f.href === href)) return;
      const label = (active.data?.current as { label?: string })?.label || href.split("/").pop() || "";
      persist([...favorites, { href, labelKey: label, order: favorites.length }]);
      return;
    }
    const oi = favorites.findIndex((f) => f.href === href);
    const ni = favorites.findIndex((f) => f.href === over.id);
    if (oi !== -1 && ni !== -1 && oi !== ni) persist(arrayMove(favorites, oi, ni).map((f, i) => ({ ...f, order: i })));
  };

  return (
    <DndContext collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <aside className="w-[264px] h-screen bg-[#060606] border-r border-white/[0.08] flex flex-col overflow-y-auto shrink-0">

        {/* Brand */}
        <div className="flex items-center gap-3 h-[56px] px-4 border-b border-white/[0.06]">
          <div className="w-7 h-7 rounded-md bg-[#ff7200] flex items-center justify-center">
            <span className="text-white text-sm font-bold">O</span>
          </div>
          <div>
            <div className="text-[13px] font-semibold text-white/90">One-Stop-Fin</div>
            <div className="text-[10px] text-white/30">Finance Terminal</div>
          </div>
        </div>

        {/* Home */}
        <Link href="/dashboard"
          className={`flex items-center h-[44px] px-4 gap-3 transition-colors ${pathname === "/dashboard" ? "bg-[#141414] text-[#ff7200]" : "text-[#e0e0e0] hover:bg-white/[0.03]"}`}>
          <Home size={18} />
          <span className="text-[14px] font-medium">Ana Sayfa</span>
        </Link>

        {/* Favorites */}
        <FavoritesZone items={favorites} onRemove={removeFav} />

        {/* Modules */}
        <nav className="flex-1 py-2">
          {MODULE_REGISTRY.filter((m) => m.implemented).map((mod) => {
            const Icon = mod.icon;
            const isExp = expanded[mod.id] ?? false;
            return (
              <div key={mod.id}>
                <button onClick={() => toggle(mod.id)}
                  className={`flex items-center w-full h-[42px] px-4 gap-3 transition-colors ${isExp ? "text-white" : "text-[#ccc] hover:bg-white/[0.03]"}`}>
                  <Icon size={18} className={isExp ? "text-[#ff7200]" : ""} />
                  <span className="text-[14px] font-medium">{mod.id === "signallab" ? "SignalLab" : "FinSumy"}</span>
                  {isExp ? <ChevronDown size={14} className="ml-auto text-white/30" /> : <ChevronRight size={14} className="ml-auto text-white/30" />}
                </button>
                {isExp && (
                  <div className="ml-4 border-l border-white/[0.06] bg-black/30 py-1">
                    {mod.items.map((item) => (
                      <DraggableSubItem key={item.href} href={item.href} label={t(item.labelKey)} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Future modules */}
          <div className="mt-4 px-4 py-2">
            <span className="text-[10px] font-semibold tracking-[0.08em] uppercase text-white/25">Yakında</span>
          </div>
          {MODULE_REGISTRY.filter((m) => !m.implemented).map((mod) => {
            const Icon = mod.icon;
            return (
              <div key={mod.id} className="flex items-center h-[36px] px-4 gap-3 opacity-25">
                <Icon size={16} />
                <span className="text-[13px] text-white/60">{mod.id}</span>
              </div>
            );
          })}
        </nav>
      </aside>

      <DragOverlay>
        {activeId && (
          <div className="bg-[#141414] text-[#ff7200] px-3 py-1.5 text-[12px] font-medium rounded border border-[#ff7200]/20 shadow-xl">
            {activeId.split("/").pop()}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
