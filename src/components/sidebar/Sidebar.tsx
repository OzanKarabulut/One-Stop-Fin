"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ChevronDown, ChevronRight } from "lucide-react";
import { MODULE_REGISTRY } from "@/lib/modules/registry";
import { useState, useEffect } from "react";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCenter } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useDraggable } from "@dnd-kit/core";
import { FavoritesZone, FavoriteItem } from "./FavoritesZone";
import { trpc } from "@/lib/trpc/client";
import trMessages from "@/../messages/tr.json";

// Resolve a dot-separated key from the translations object
function t(key: string): string {
  const parts = key.split(".");
  let val: unknown = trMessages;
  for (const p of parts) {
    if (val && typeof val === "object" && p in val) val = (val as Record<string, unknown>)[p];
    else return key.split(".").pop() || key;
  }
  return typeof val === "string" ? val : key.split(".").pop() || key;
}

function DraggableModuleItem({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: href, data: { href, label } });

  return (
    <div ref={setNodeRef} {...attributes} {...listeners}>
      <Link
        href={href}
        className={`block py-1.5 px-2 text-xs hover:bg-white/5 rounded cursor-grab ${
          pathname === href ? "border-l-[3px] border-accent bg-white/5" : ""
        } ${isDragging ? "opacity-50" : ""}`}
        onClick={(e) => { if (isDragging) e.preventDefault(); }}
      >
        {label}
      </Link>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const { data: pref } = trpc.userPref.get.useQuery();
  const setFavoritesMutation = trpc.userPref.setFavorites.useMutation({
    onSuccess: () => utils.userPref.get.invalidate(),
  });

  useEffect(() => {
    if (pref?.favorites) setFavorites(pref.favorites as unknown as FavoriteItem[]);
  }, [pref]);

  const toggle = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const persistFavorites = (newFavs: FavoriteItem[]) => {
    setFavorites(newFavs);
    setFavoritesMutation.mutate({ favorites: newFavs });
  };

  const handleDragStart = (event: DragStartEvent) => setActiveId(event.active.id as string);

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const activeHref = active.id as string;
    if (over.id === "favorites-zone") {
      if (favorites.some((f) => f.href === activeHref)) return;
      const label = (active.data?.current as { label?: string })?.label || activeHref;
      persistFavorites([...favorites, { href: activeHref, labelKey: label, order: favorites.length }]);
      return;
    }
    const oldIdx = favorites.findIndex((f) => f.href === activeHref);
    const newIdx = favorites.findIndex((f) => f.href === over.id);
    if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
      persistFavorites(arrayMove(favorites, oldIdx, newIdx).map((f, i) => ({ ...f, order: i })));
    }
  };

  const handleRemove = (href: string) => {
    persistFavorites(favorites.filter((f) => f.href !== href).map((f, i) => ({ ...f, order: i })));
  };

  return (
    <DndContext collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <aside className="w-60 h-screen bg-sidebar-bg text-sidebar-fg flex flex-col overflow-y-auto shrink-0">
        <Link
          href="/dashboard"
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium hover:bg-white/5 ${
            pathname === "/dashboard" ? "border-l-[3px] border-accent bg-white/5" : ""
          }`}
        >
          <Home size={18} />
          <span>{t("sidebar.home")}</span>
        </Link>

        <FavoritesZone items={favorites} onRemove={handleRemove} />

        <nav className="flex-1 py-2">
          {MODULE_REGISTRY.map((mod) => {
            const isExpanded = expanded[mod.id] ?? false;
            const Icon = mod.icon;
            const moduleLabel = t(mod.labelKey);

            if (!mod.implemented) {
              return (
                <Link key={mod.id} href={`/dashboard/stub/${mod.id}`} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-white/5 opacity-50">
                  <Icon size={16} />
                  <span>{moduleLabel}</span>
                  <span className="ml-auto text-[10px] bg-white/10 px-1.5 py-0.5 rounded">{t("sidebar.comingSoon")}</span>
                </Link>
              );
            }

            return (
              <div key={mod.id}>
                <button onClick={() => toggle(mod.id)} className="flex items-center gap-2 px-4 py-2 text-sm w-full hover:bg-white/5">
                  <Icon size={16} />
                  <span className="font-medium">{moduleLabel}</span>
                  {isExpanded ? <ChevronDown size={14} className="ml-auto" /> : <ChevronRight size={14} className="ml-auto" />}
                </button>
                {isExpanded && (
                  <div className="pl-8">
                    {mod.items.map((item) => (
                      <DraggableModuleItem key={item.href} href={item.href} label={t(item.labelKey)} />
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
          <div className="bg-sidebar-bg text-sidebar-fg px-3 py-1.5 text-xs rounded shadow-lg border border-accent/50">
            {activeId.split("/").pop()}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
