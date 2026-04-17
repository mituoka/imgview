"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function imgSrc(p: string) {
  return `${API_BASE}/api/images/file/${encodeURIComponent(p).replace(/%2F/g, "/")}`;
}

// ────────────────────────────────────────────────────────
// 重複タブ
// ────────────────────────────────────────────────────────
type DupeImage = { path: string; folder: string; filename: string; size: number; mtime: number };
type DupeGroup = { hash: string; size: number; images: DupeImage[] };

function DupesTab({ onDeleted }: { onDeleted: () => void }) {
  const [groups, setGroups] = useState<DupeGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [keepMap, setKeepMap] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${API_BASE}/api/images/dupes`)
      .then((r) => r.json())
      .then((data: DupeGroup[]) => {
        setGroups(data);
        const init: Record<string, string> = {};
        for (const g of data) init[g.hash] = g.images[0].path;
        setKeepMap(init);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalWaste = groups.reduce((sum, g) => sum + g.size * (g.images.length - 1), 0);

  const deleteSelected = async () => {
    setDeleting(true);
    for (const g of groups) {
      const keepPath = keepMap[g.hash] ?? g.images[0].path;
      for (const img of g.images) {
        if (img.path === keepPath) continue;
        await fetch(`${API_BASE}/api/images/file/${encodeURIComponent(img.path).replace(/%2F/g, "/")}`, {
          method: "DELETE",
        });
      }
    }
    setDeleting(false);
    onDeleted();
    load();
  };

  if (loading) return <div className="text-gray-400 p-8">スキャン中...</div>;
  if (groups.length === 0) return (
    <div className="text-gray-400 p-8 text-center">
      <div className="text-4xl mb-3">✓</div>
      <div>重複画像は見つかりませんでした</div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-400">
          <span className="text-white font-medium">{groups.length} グループ</span>の重複を検出 —
          削除すると <span className="text-yellow-400">{formatBytes(totalWaste)}</span> 節約できます
        </div>
        <button
          onClick={deleteSelected}
          disabled={deleting}
          className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
        >
          {deleting ? "削除中..." : `選択以外を削除（${groups.reduce((s, g) => s + g.images.length - 1, 0)}枚）`}
        </button>
      </div>

      {groups.map((g) => (
        <div key={g.hash} className="bg-gray-800 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-3">
            {g.images.length}枚の重複 — {formatBytes(g.size)} / 枚
          </div>
          <div className="flex gap-3 flex-wrap">
            {g.images.map((img) => {
              const isKeep = keepMap[g.hash] === img.path;
              return (
                <button
                  key={img.path}
                  onClick={() => setKeepMap((m) => ({ ...m, [g.hash]: img.path }))}
                  className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                    isKeep ? "border-green-500" : "border-gray-700 opacity-60 hover:opacity-80"
                  }`}
                  style={{ width: 120, height: 120 }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imgSrc(img.path)} alt={img.filename} className="w-full h-full object-cover" />
                  <div className="absolute inset-x-0 bottom-0 bg-black/70 px-1.5 py-1">
                    <div className="text-xs text-gray-200 truncate">{img.folder}</div>
                  </div>
                  {isKeep && (
                    <div className="absolute top-1 right-1 bg-green-500 text-white text-xs rounded px-1">保持</div>
                  )}
                  {!isKeep && (
                    <div className="absolute top-1 right-1 bg-red-600/80 text-white text-xs rounded px-1">削除</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────
// AI品質タブ
// ────────────────────────────────────────────────────────
type QualityItem = {
  path: string; folder: string; filename: string;
  size: number; mtime: number; category?: string;
  quality_ok: boolean; quality_reason: string;
};

type RunStatus = "idle" | "running" | "done" | "error";

function QualityTab({ onDeleted }: { onDeleted: () => void }) {
  const [items, setItems] = useState<QualityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  // インライン実行状態
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [runLines, setRunLines] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${API_BASE}/api/images/quality`)
      .then((r) => r.json())
      .then((data: QualityItem[]) => {
        setItems(data);
        setSelected(new Set(data.map((i) => i.path)));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [runLines]);

  const runQualityCheck = async () => {
    setRunStatus("running");
    setRunLines([]);
    try {
      const res = await fetch("/api/run-imgtools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "quality" }),
      });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const raw = part.replace(/^data: /, "").trim();
          if (!raw) continue;
          try {
            const msg = JSON.parse(raw);
            if (msg.line !== undefined) setRunLines((l) => [...l, msg.line]);
            if (msg.done) {
              setRunStatus(msg.exitCode === 0 ? "done" : "error");
              if (msg.exitCode === 0) load();
            }
          } catch { /* ignore */ }
        }
      }
    } catch (e) {
      setRunLines((l) => [...l, `ERROR: ${e}`]);
      setRunStatus("error");
    }
  };

  const toggle = (p: string) => {
    setSelected((s) => {
      const next = new Set(s);
      next.has(p) ? next.delete(p) : next.add(p);
      return next;
    });
  };

  const deleteSelected = async () => {
    setDeleting(true);
    for (const p of selected) {
      await fetch(`${API_BASE}/api/images/file/${encodeURIComponent(p).replace(/%2F/g, "/")}`, {
        method: "DELETE",
      });
    }
    setDeleting(false);
    onDeleted();
    load();
  };

  if (loading) return <div className="text-gray-400 p-8">読み込み中...</div>;

  if (items.length === 0) return (
    <div className="flex flex-col items-center gap-4 p-8 text-center">
      <div className="text-4xl text-gray-600">🔍</div>
      <div className="text-gray-300 font-medium">AI品質チェック未実行</div>
      <div className="text-sm text-gray-500">Ollamaで画像を分析し、ブレ・低品質・価値の低い画像を検出します</div>

      <button
        onClick={runQualityCheck}
        disabled={runStatus === "running"}
        className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
      >
        {runStatus === "running" ? "チェック中..." : "AI品質チェックを実行"}
      </button>

      {runStatus !== "idle" && (
        <div className="w-full text-left">
          <div
            ref={logRef}
            className="bg-gray-900 rounded-lg p-3 font-mono text-xs text-gray-300 max-h-48 overflow-y-auto"
          >
            {runLines.map((line, i) => (
              <div key={i} className="whitespace-pre-wrap leading-5">{line}</div>
            ))}
            {runStatus === "running" && <div className="text-blue-400 animate-pulse">▌</div>}
            {runStatus === "done" && <div className="text-green-400 font-bold mt-1">✓ 完了</div>}
            {runStatus === "error" && <div className="text-red-400 font-bold mt-1">✗ エラー</div>}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-400">
          <span className="text-white font-medium">{items.length}枚</span>が不要と判定されました —
          選択した <span className="text-red-400">{selected.size}枚</span> を削除します
        </div>
        <div className="flex gap-2">
          <button
            onClick={runQualityCheck}
            disabled={runStatus === "running" || deleting}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-200 text-sm rounded-lg transition-colors"
          >
            {runStatus === "running" ? "チェック中..." : "再チェック"}
          </button>
          <button
            onClick={() => setSelected(new Set(items.map((i) => i.path)))}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded-lg"
          >
            全選択
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded-lg"
          >
            全解除
          </button>
          <button
            onClick={deleteSelected}
            disabled={deleting || selected.size === 0}
            className="px-4 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
          >
            {deleting ? "削除中..." : `${selected.size}枚を削除`}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {items.map((item) => {
          const checked = selected.has(item.path);
          return (
            <button
              key={item.path}
              onClick={() => toggle(item.path)}
              className={`relative rounded-xl overflow-hidden border-2 transition-all text-left ${
                checked ? "border-red-500" : "border-gray-700 opacity-50"
              }`}
            >
              <div className="aspect-square bg-gray-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imgSrc(item.path)} alt={item.filename} className="w-full h-full object-cover" />
              </div>
              <div className="p-2 bg-gray-900">
                <div className="text-xs text-gray-300 truncate">{item.filename}</div>
                <div className="text-xs text-red-400 mt-0.5 line-clamp-2">{item.quality_reason}</div>
              </div>
              <div className={`absolute top-2 right-2 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                checked ? "bg-red-500 border-red-500" : "bg-transparent border-gray-400"
              }`}>
                {checked && <span className="text-white text-xs">✓</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────
// モーダル本体
// ────────────────────────────────────────────────────────
type Props = {
  onClose: () => void;
  onDeleted: () => void;
};

export default function CleanupModal({ onClose, onDeleted }: Props) {
  const [tab, setTab] = useState<"dupes" | "quality">("dupes");
  const [refreshKey, setRefreshKey] = useState(0);

  const handleDeleted = useCallback(() => {
    setRefreshKey((k) => k + 1);
    onDeleted();
  }, [onDeleted]);

  // Escape で閉じる
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end">
      {/* 背景オーバーレイ */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* ドロワーパネル */}
      <div className="relative w-full max-w-2xl bg-gray-950 flex flex-col shadow-2xl">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 flex-shrink-0">
          <h2 className="text-base font-semibold">クリーンアップ</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-100 transition-colors text-xl leading-none"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>

        {/* タブ */}
        <div className="flex border-b border-gray-800 flex-shrink-0 px-6">
          {(["dupes", "quality"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
            >
              {t === "dupes" ? "重複検出" : "AI品質チェック"}
            </button>
          ))}
        </div>

        {/* コンテンツ（スクロール） */}
        <div className="flex-1 overflow-y-auto p-6">
          {tab === "dupes" ? (
            <DupesTab key={`dupes-${refreshKey}`} onDeleted={handleDeleted} />
          ) : (
            <QualityTab key={`quality-${refreshKey}`} onDeleted={handleDeleted} />
          )}
        </div>
      </div>
    </div>
  );
}
