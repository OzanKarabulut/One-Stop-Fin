"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

export default function ChannelsPage() {
  const [youtubeId, setYoutubeId] = useState("");
  const [name, setName] = useState("");

  const utils = trpc.useUtils();
  const { data: channels, isLoading } = trpc.channel.list.useQuery();
  const addMutation = trpc.channel.add.useMutation({ onSuccess: () => { utils.channel.list.invalidate(); setYoutubeId(""); setName(""); } });
  const removeMutation = trpc.channel.remove.useMutation({ onSuccess: () => utils.channel.list.invalidate() });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Kanallar</h1>
        <p className="text-sm text-text-muted">YouTube kanallarını takip et — yeni videolar otomatik analiz edilir</p>
      </div>

      {/* Add form */}
      <div className="rounded-lg border border-card-border bg-card-bg p-4">
        <h2 className="text-sm font-medium text-text-primary mb-3">Kaynak Ekle</h2>
        <div className="flex gap-2 flex-wrap">
          <input value={youtubeId} onChange={(e) => setYoutubeId(e.target.value)} placeholder="YouTube Channel ID" className="rounded border border-card-border px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted flex-1 min-w-[200px]" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Kanal adı" className="rounded border border-card-border px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted w-40" />
          <button onClick={() => addMutation.mutate({ youtubeId, name })} disabled={!youtubeId || !name || addMutation.isLoading} className="rounded bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">Ekle</button>
        </div>
        {addMutation.error && <p className="text-xs text-down mt-2">{addMutation.error.message}</p>}
      </div>

      {/* Channel list */}
      {isLoading && <div className="text-center py-10 text-text-muted">Yükleniyor...</div>}
      {channels && channels.length > 0 ? (
        <div className="space-y-2">
          {channels.map((ch) => (
            <div key={ch.id} className="rounded-lg border border-card-border bg-card-bg p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-primary">{ch.name}</p>
                <p className="text-xs text-text-muted">{ch.youtubeId} • {ch._count.videos} video</p>
              </div>
              <button onClick={() => removeMutation.mutate({ id: ch.id })} className="text-xs text-down hover:underline">Kaldır</button>
            </div>
          ))}
        </div>
      ) : !isLoading ? (
        <div className="text-center py-10 text-text-muted">Henüz kanal eklenmedi.</div>
      ) : null}
    </div>
  );
}
