"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ChevronDown, ChevronRight, Star, GripVertical, X } from "lucide-react";
import { MODULE_REGISTRY } from "@/lib/modules/registry";
import { useState, useEffect } from "react";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCenter, useDroppable, useDraggable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { trpc } from "@/lib/trpc/client";
import trMessages from "@/../messages/tr.json";

// ─── i18n helper ─────────────────────────────────────────────────────────────
function t(key: string): string {
  const parts = key.split(".");
  let val: unknown = trMessages;
  for (const p of parts) {
    if (val && typeof val === "object" && p in val) val = (val as Record<string, unknown>)[p];
    else return key.split(".").pop() || key;
  }
  return typeof val === "string" ? val : key.split(".").pop() || key;
}

// ─── Types ───────────────────────────────────────────────────────────────────
interface FavoriteItem { href: string; labelKey: string; order: number; }

// ─── Draggable Sub-Item ──────────────────────────────────────────────────────
function DraggableSubItem({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: href, data: { href, label } });
  const isActive = pathname === href;

  return (
    <div ref={setNodeRef} {...attributes} {...listeners}
      className={`flex items-center h-[48px] cursor-grab ${isDragging ? "opacity-40" : ""}`}
      style={{ paddingLeft: "58px", paddingRight: "24px" }}
    >
      <Link href={href} onClick={(e) => { if (isDragging) e.preventDefault(); }}
        className={`text-[18px] font-semibold leading-[28px] transition-colors ${isActive ? "text-[#ff7200]" : "text-[#d8d8d8] hover:text-white"}`}>
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
    <div ref={setNodeRef} style={style}
      className={`flex items-center h-[44px] group ${isActive ? "bg-[#18191b]" : ""}`}
    >
      <span {...attributes} {...listeners} className="pl-[14px] pr-[8px] cursor-grab opacity-40 hover:opacity-100">
        <GripVertical size={14} className="text-white/50" />
      </span>
      <Link href={item.href} className={`flex-1 text-[15px] font-semibold ${isActive ? "text-[#ff7200]" : "text-[#d8d8d8] hover:text-white"}`}>
        {item.labelKey}
      </Link>
      <button onClick={onRemove} className="pr-[16px] opacity-0 group-hover:opacity-100 text-white/40 hover:text-red-400">
        <X size={14} />
      </button>
    </div>
  );
}

// ─── Favorites Zone ──────────────────────────────────────────────────────────
function FavoritesZone({ items, onRemove }: { items: FavoriteItem[]; onRemove: (href: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: "favorites-zone" });

  if (items.length === 0 && !isOver) return <div ref={setNodeRef} className="h-[2px]" />;

  return (
    <div ref={setNodeRef} className={`py-[8px] border-b border-white/10 ${isOver ? "bg-[#ff7200]/5" : ""}`}>
      <div className="flex items-center h-[32px] px-[36px]">
        <Star size={13} className="text-[#ff7200] mr-[8px]" />
        <span className="text-[13px] font-semibold tracking-[0.08em] uppercase text-white/60">Favoriler</span>
      </div>
      <SortableContext items={items.map((i) => i.href)} strategy={verticalListSortingStrategy}>
        {items.map((item) => (
          <SortableFavorite key={item.href} item={item} onRemove={() => onRemove(item.href)} />
        ))}
      </SortableContext>
      {items.length === 0 && isOver && (
        <div className="text-[12px] text-center text-[#ff7200] py-[6px]">Buraya bırak</div>
      )}
    </div>
  );
}

// ─── Main Sidebar ────────────────────────────────────────────────────────────
export function Sidebar() {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ signallab: true });
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const { data: pref } = trpc.userPref.get.useQuery();
  const setFavMutation = trpc.userPref.setFavorites.useMutation({
    onSuccess: () => utils.userPref.get.invalidate(),
  });

  useEffect(() => {
    if (pref?.favorites) setFavorites(pref.favorites as unknown as FavoriteItem[]);
  }, [pref]);

  const toggle = (id: string) => setExpanded((p) => ({ ...p, [id]: !p[id] }));

  const persist = (newFavs: FavoriteItem[]) => {
    setFavorites(newFavs);
    setFavMutation.mutate({ favorites: newFavs });
  };

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

    const oldIdx = favorites.findIndex((f) => f.href === href);
    const newIdx = favorites.findIndex((f) => f.href === over.id);
    if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
      persist(arrayMove(favorites, oldIdx, newIdx).map((f, i) => ({ ...f, order: i })));
    }
  };

  const removeFav = (href: string) => persist(favorites.filter((f) => f.href !== href).map((f, i) => ({ ...f, order: i })));

  return (
    <DndContext collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <aside className="w-[280px] h-screen bg-[#000] flex flex-col overflow-y-auto shrink-0"
        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, Arial, sans-serif, "Segoe UI", Roboto' }}>

        {/* Home */}
        <Link href="/dashboard"
          className={`flex items-center h-[58px] px-[36px] gap-[22px] ${pathname === "/dashboard" ? "bg-[#18191b]" : "hover:bg-[#18191b]/50"}`}>
          <Home size={28} className={pathname === "/dashboard" ? "text-[#ff7200]" : "text-[#f2f2f2]"} />
          <span className={`text-[20px] font-semibold leading-[30px] ${pathname === "/dashboard" ? "text-[#ff7200]" : "text-[#f2f2f2]"}`}>
            Ana Sayfa
          </span>
        </Link>

        {/* Favorites */}
        <FavoritesZone items={favorites} onRemove={removeFav} />

        {/* Modules */}
        <nav className="flex-1 py-[8px]">
          {MODULE_REGISTRY.map((mod) => {
            const Icon = mod.icon;
            const isExp = expanded[mod.id] ?? false;

            if (!mod.implemented) {
              return (
                <Link key={mod.id} href={`/dashboard/stub/${mod.id}`}
                  className="flex items-center h-[58px] px-[36px] gap-[22px] opacity-40 hover:opacity-60">
                  <Icon size={28} className="text-[#f2f2f2]" />
                  <span className="text-[20px] font-semibold leading-[30px] text-[#f2f2f2]">{mod.id}</span>
                  <span className="ml-auto text-[11px] bg-white/10 px-[8px] py-[2px] rounded-[2px] text-white/60">Yakında</span>
                </Link>
              );
            }

            return (
              <div key={mod.id}>
                <button onClick={() => toggle(mod.id)}
                  className={`flex items-center w-full h-[58px] px-[36px] gap-[22px] ${isExp ? "bg-[#18191b]" : "hover:bg-[#18191b]/50"}`}>
                  <Icon size={28} className="text-[#f2f2f2]" />
                  <span className="text-[20px] font-semibold leading-[30px] text-[#f2f2f2]">
                    {mod.id === "signallab" ? "SignalLab" : "FinSumy"}
                  </span>
                  {isExp
                    ? <ChevronDown size={18} className="ml-auto text-white/50" />
                    : <ChevronRight size={18} className="ml-auto text-white/50" />}
                </button>
                {isExp && (
                  <div className="bg-[#050505]">
                    {mod.items.map((item) => (
                      <DraggableSubItem key={item.href} href={item.href} label={t(item.labelKey)} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      <DragOverlay>
        {activeId && (
          <div className="bg-[#18191b] text-[#ff7200] px-[16px] py-[8px] text-[15px] font-semibold rounded-[4px] shadow-xl border border-[#ff7200]/30">
            {activeId.split("/").pop()}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
