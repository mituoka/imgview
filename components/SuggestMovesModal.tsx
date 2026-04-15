"use client";

import { useState, useEffect, useRef } from "react";
import { FolderInfo } from "@/types";

type Suggestion = {
  path: string;
  filename: string;
  current_folder: string;
  current_category: string;
  current_category_label: string;
  suggested_folder: string;
  confidence: number;
  method: string;
};

type Props = {
  folder: string;
  folders: FolderInfo[];
  apiBase: string;
  onClose: () => void;
  onMoved: () => void;
};

type Phase = "idle" | "scanning" | "done" | "error";
type DoneMsg = { done: true; total: number; suggestions: Suggestion[]; chroma_used?: boolean };

export default function SuggestMovesModal({ folder, folders, apiBase, onClose, onMoved }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState({ current: 0, total: 0, file: "" });
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [overrideFolder, setOverrideFolder] = useState<Record<string, string>>({});
  const [moving, setMoving] = useState(false);
  const [movedCount, setMovedCount] = useState(0);
  const [chromaUsed, setChromaUsed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // スキャン開始
  useEffect(() => {
    startScan(false);
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startScan = (forceClassify: boolean) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setPhase("scanning");
    setProgress({ current: 0, total: 0, file: "" });
    setSuggestions([]);
    setChecked(new Set());

    const url = `/api/images/suggest-moves?folder=${encodeURIComponent(folder)}${forceClassify ? "&force=1" : ""}`;

    (async () => {
      try {
        const res = await fetch(url, { signal: ac.signal });
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
              if (msg.progress !== undefined) {
                setProgress({ current: msg.progress, total: msg.total, file: msg.file });
              }
              if (msg.done) {
                const doneMsg = msg as DoneMsg;
                setSuggestions(doneMsg.suggestions ?? []);
                setChecked(new Set((doneMsg.suggestions ?? []).map((s: Suggestion) => s.path)));
                setChromaUsed(doneMsg.chroma_used ?? false);
                setPhase("done");
              }
              if (msg.error) {
                setPhase("error");
              }
            } catch { /* ignore */ }
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") setPhase("error");
      }
    })();
  };

  const toggleAll = (on: boolean) => {
    setChecked(on ? new Set(suggestions.map((s) => s.path)) : new Set());
  };

  const toggleOne = (path: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  };

  const handleMove = async () => {
    const targets = suggestions.filter((s) => checked.has(s.path));
    if (targets.length === 0) return;
    setMoving(true);
    let count = 0;
    for (const s of targets) {
      const destFolder = overrideFolder[s.path] ?? s.suggested_folder;
      try {
        const res = await fetch("/api/images/move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: s.path, targetFolder: destFolder }),
        });
        if (res.ok) count++;
      } catch { /* ignore */ }
    }
    setMovedCount(count);
    setMoving(false);
    onMoved();
    // 移動済みを candidates から除外
    setSuggestions((prev) => prev.filter((s) => !checked.has(s.path)));
    setChecked(new Set());
  };

  const thumbSrc = (p: string) =>
    `${apiBase}/api/images/file/${encodeURIComponent(p).replace(/%2F/g, "/")}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-100">移動提案</h2>
            <p className="text-xs text-gray-500 mt-0.5">「{folder}」内の誤分類を検出</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">✕</button>
        </div>

        {/* コンテンツ */}
        <div className="flex-1 overflow-y-auto">
          {/* スキャン中 */}
          {phase === "scanning" && (
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3 text-sm text-gray-300">
                <span className="inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                <span>
                  {progress.total > 0
                    ? `${progress.current} / ${progress.total} 枚 — ${progress.file}`
                    : "スキャン中..."}
                </span>
              </div>
              {progress.total > 0 && (
                <div className="w-full bg-gray-800 rounded-full h-1.5">
                  <div
                    className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
              )}
              <p className="text-xs text-gray-500">
                キャッシュにカテゴリがない画像はOllamaで判定します
              </p>
            </div>
          )}

          {/* エラー */}
          {phase === "error" && (
            <div className="p-6 text-sm text-red-400">スキャン中にエラーが発生しました。</div>
          )}

          {/* 結果 */}
          {phase === "done" && (
            <>
              {movedCount > 0 && (
                <div className="mx-4 mt-4 px-3 py-2 bg-green-900/40 border border-green-700 rounded-lg text-xs text-green-400">
                  {movedCount} 枚を移動しました
                </div>
              )}

              {suggestions.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-500">
                  誤分類の画像は見つかりませんでした
                </div>
              ) : (
                <div className="p-4 space-y-2">
                  {/* 全選択 + 判定方法バッジ */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={checked.size === suggestions.length}
                          onChange={(e) => toggleAll(e.target.checked)}
                          className="accent-blue-500"
                        />
                        すべて選択（{suggestions.length} 件）
                      </label>
                      {chromaUsed && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-violet-900/50 border border-violet-700 text-violet-400">
                          RAG
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => startScan(true)}
                      className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      未分類も含めて再スキャン
                    </button>
                  </div>

                  {suggestions.map((s) => {
                    const dest = overrideFolder[s.path] ?? s.suggested_folder;
                    return (
                      <div
                        key={s.path}
                        className={`flex items-center gap-3 p-2 rounded-lg border transition-colors ${
                          checked.has(s.path)
                            ? "border-blue-600 bg-blue-900/20"
                            : "border-gray-700 bg-gray-800/40"
                        }`}
                      >
                        {/* チェック */}
                        <input
                          type="checkbox"
                          checked={checked.has(s.path)}
                          onChange={() => toggleOne(s.path)}
                          className="accent-blue-500 flex-shrink-0"
                        />

                        {/* サムネイル */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={thumbSrc(s.path)}
                          alt={s.filename}
                          className="w-14 h-14 object-cover rounded flex-shrink-0 bg-gray-800"
                        />

                        {/* 情報 */}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-200 truncate font-medium">{s.filename}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-xs text-gray-500">
                              カテゴリ:{" "}
                              <span className="text-amber-400">{s.current_category_label}</span>
                            </p>
                            {/* 信頼度バー */}
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <div className="w-12 h-1 bg-gray-700 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    s.confidence >= 0.75 ? "bg-green-500" :
                                    s.confidence >= 0.55 ? "bg-amber-500" : "bg-gray-500"
                                  }`}
                                  style={{ width: `${s.confidence * 100}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-gray-500">{Math.round(s.confidence * 100)}%</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <span className="text-xs text-gray-500">{s.current_folder}</span>
                            <span className="text-gray-600 text-xs">→</span>
                            {/* 移動先フォルダ選択 */}
                            <select
                              value={dest}
                              onChange={(e) =>
                                setOverrideFolder((prev) => ({ ...prev, [s.path]: e.target.value }))
                              }
                              className="text-xs bg-gray-700 border border-gray-600 text-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-blue-500"
                            >
                              {/* 提案フォルダ */}
                              <option value={s.suggested_folder}>{s.suggested_folder} (推奨)</option>
                              {/* 既存フォルダ */}
                              {folders
                                .filter((f) => f.name !== s.current_folder && f.name !== s.suggested_folder)
                                .map((f) => (
                                  <option key={f.name} value={f.name}>{f.name}</option>
                                ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* フッター */}
        {phase === "done" && suggestions.length > 0 && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-gray-700 flex-shrink-0">
            <span className="text-xs text-gray-500">{checked.size} 件選択中</span>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded-lg transition-colors"
              >
                閉じる
              </button>
              <button
                onClick={handleMove}
                disabled={checked.size === 0 || moving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors flex items-center gap-2"
              >
                {moving && (
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                {checked.size} 枚を移動
              </button>
            </div>
          </div>
        )}

        {phase === "done" && suggestions.length === 0 && (
          <div className="flex justify-end px-5 py-4 border-t border-gray-700 flex-shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded-lg transition-colors"
            >
              閉じる
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
