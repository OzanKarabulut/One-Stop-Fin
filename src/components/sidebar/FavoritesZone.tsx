"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GripVertical, Star, X } from "lucide-react";

export interface FavoriteItem {
  href: string;
  labelKey: string;
  order: number;
}

function SortableFavorite({ item, onRemove }: { item: FavoriteItem; onRemove: () => void }) {
  const pathname = usePathname();
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.href });

  const style = { transform: CSS.Transform.toString(transform), transition };
  const label = item.labelKey.split(".").pop() || item.labelKey;

  return (
    <div ref={setNodeRef} style={style} className={`flex items-center gap-1 px-3 py-1.5 text-xs group ${pathname === item.href ? "border-l-[3px] border-accent bg-white/5" : ""}`}>
      <span {...attributes} {...listeners} className="cursor-grab opacity-50 hover:opacity-100">
        <GripVertical size={12} />
      </span>
      <Link href={item.href} className="flex-1 truncate hover:text-white">
        {label}
      </Link>
      <button onClick={onRemove} className="opacity-0 group-hover:opacity-100 hover:text-down">
        <X size={12} />
      </button>
    </div>
  );
}

export function FavoritesZone({
  items,
  onRemove,
}: {
  items: FavoriteItem[];
  onRemove: (href: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "favorites-zone" });

  return (
    <div
      ref={setNodeRef}
      className={`border-b border-white/10 ${items.length === 0 ? "py-1" : "py-1"} ${isOver ? "bg-accent/10" : ""}`}
    >
      {items.length > 0 && (
        <div className="flex items-center gap-1 px-3 py-1 text-[10px] text-sidebar-fg/50 uppercase">
          <Star size={10} /> Favoriler
        </div>
      )}
      <SortableContext items={items.map((i) => i.href)} strategy={verticalListSortingStrategy}>
        {items.map((item) => (
          <SortableFavorite key={item.href} item={item} onRemove={() => onRemove(item.href)} />
        ))}
      </SortableContext>
      {items.length === 0 && isOver && (
        <div className="text-[10px] text-center text-accent py-1">Buraya bırak</div>
      )}
    </div>
  );
}
