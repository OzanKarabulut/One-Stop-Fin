"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Card } from "@/components/ui/Card";
import { Plus, Trash2 } from "lucide-react";

export default function ChannelsPage() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.channel.list.useQuery();
  const addMutation = trpc.channel.add.useMutation({ onSuccess: () => utils.channel.list.invalidate() });
  const removeMutation = trpc.channel.remove.useMutation({ onSuccess: () => utils.channel.list.invalidate() });

  const [youtubeId, setYoutubeId] = useState("");
  const [name, setName] = useState("");

  const handleAdd = () => {
    if (!youtubeId.trim() || !name.trim()) return;
    addMutation.mutate({ youtubeId: youtubeId.trim(), name: name.trim() });
    setYoutubeId("");
    setName("");
  };

  return (
    <div>
      <h1 className="text-lg font-semibold text-text-primary mb-4">Kanallar</h1>
      <Card className="mb-4">
        <div className="flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Kanal adı"
            className="border border-card-border rounded px-2 py-1 text-sm flex-1 min-w-[120px]"
          />
          <input
            value={youtubeId}
            onChange={(e) => setYoutubeId(e.target.value)}
            placeholder="YouTube Kanal ID"
            className="border border-card-border rounded px-2 py-1 text-sm flex-1 min-w-[120px]"
          />
          <button onClick={handleAdd} className="bg-accent text-white px-3 py-1 rounded text-sm hover:bg-accent-hover flex items-center gap-1">
            <Plus size={14} /> Ekle
          </button>
        </div>
      </Card>

      {isLoading && <p className="text-sm text-text-muted">Yükleniyor...</p>}
      {data && data.length === 0 && <p className="text-sm text-text-muted">Henüz kanal eklenmemiş.</p>}
      {data && data.length > 0 && (
        <div className="space-y-2">
          {data.map((ch) => (
            <Card key={ch.id} className="flex items-center justify-between">
              <div>
                <span className="font-medium text-sm">{ch.name}</span>
                <span className="ml-2 text-xs text-text-muted">{ch.youtubeId}</span>
              </div>
              <button onClick={() => removeMutation.mutate({ id: ch.id })} className="text-text-muted hover:text-down">
                <Trash2 size={14} />
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
