"use client";

import { useState, useRef, useEffect } from "react";

type SortKey = "mtime" | "size" | "filename";
type SortDir = "desc" | "asc";
export type OrientationFilter = "all" | "landscape" | "portrait";

type Props = {
  search: string;
  onSearchChange: (v: string) => void;
  sortKey: SortKey;
  sortDir: SortDir;
  onSortChange: (key: SortKey, dir: SortDir) => void;
  orientation: OrientationFilter;
  onOrientationChange: (v: OrientationFilter) => void;
  columns: number;
  onColumnsChange: (n: number) => void;
  selectMode: boolean;
  selectedCount: number;
  onToggleSelectMode: () => void;
  onBulkDelete: () => void;
  // AI 検索
  aiMode: boolean;
  aiSearching: boolean;
  aiResultCount: number | null;
  onAiModeToggle: () => void;
  onAiSearch: (q: string) => void;
};

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "mtime", label: "日付" },
  { key: "size", label: "サイズ" },
  { key: "filename", label: "名前" },
];

const ORIENTATION_OPTIONS: { value: OrientationFilter; label: string }[] = [
  { value: "all", label: "全て" },
  { value: "landscape", label: "横長" },
  { value: "portrait", label: "縦長" },
];

export type { SortKey, SortDir };

export default function Toolbar({
  search,
  onSearchChange,
  sortKey,
  sortDir,
  onSortChange,
  orientation,
  onOrientationChange,
  columns,
  onColumnsChange,
  selectMode,
  selectedCount,
  onToggleSelectMode,
  onBulkDelete,
  aiMode,
  aiSearching,
  aiResultCount,
  onAiModeToggle,
  onAiSearch,
}: Props) {
  const [aiQuery, setAiQuery] = useState("");
  const aiInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (aiMode) aiInputRef.current?.focus();
    else setAiQuery("");
  }, [aiMode]);

  const handleSortClick = (key: SortKey) => {
    if (key === sortKey) {
      onSortChange(key, sortDir === "desc" ? "asc" : "desc");
    } else {
      onSortChange(key, "desc");
    }
  };

  const handleAiSubmit = () => {
    if (aiQuery.trim()) onAiSearch(aiQuery.trim());
  };

  return (
    <div className="flex items-center gap-2 mb-4 flex-wrap">
      {/* AI 検索トグル */}
      <button
        onClick={onAiModeToggle}
        title="AI セマンティック検索"
        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
          aiMode
            ? "bg-violet-600 text-white"
            : "bg-gray-800 text-gray-400 hover:text-gray-200"
        }`}
      >
        <span>✦</span>
        AI
      </button>

      {/* 検索ボックス（通常 / AI） */}
      {aiMode ? (
        <div className="relative flex-1 min-w-40 flex gap-1">
          <div className="relative flex-1">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-violet-400 text-sm">✦</span>
            <input
              ref={aiInputRef}
              type="text"
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAiSubmit()}
              placeholder="自然言語で検索... (例: 夕日の海、笑顔の人)"
              className="w-full bg-gray-800 text-gray-100 text-sm rounded-lg pl-8 pr-3 py-1.5 border border-violet-700 focus:border-violet-400 focus:outline-none placeholder-gray-500"
            />
          </div>
          <button
            onClick={handleAiSubmit}
            disabled={aiSearching || !aiQuery.trim()}
            className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs rounded-lg transition-colors"
          >
            {aiSearching ? (
              <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              "検索"
            )}
          </button>
          {aiResultCount !== null && (
            <span className="self-center text-xs text-violet-400 whitespace-nowrap">
              {aiResultCount} 件
            </span>
          )}
        </div>
      ) : (
        <div className="relative flex-1 min-w-40">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-sm">🔍</span>
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="検索..."
            className="w-full bg-gray-800 text-gray-100 text-sm rounded-lg pl-8 pr-3 py-1.5 border border-gray-700 focus:border-blue-500 focus:outline-none placeholder-gray-500"
          />
          {search && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* 向きフィルター */}
      <div className="flex items-center gap-0.5 bg-gray-800 rounded-lg p-0.5">
        {ORIENTATION_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => onOrientationChange(value)}
            className={`px-2.5 py-1 rounded text-xs transition-colors ${
              orientation === value
                ? "bg-gray-600 text-gray-100"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ソート */}
      <div className="flex items-center gap-0.5 bg-gray-800 rounded-lg p-0.5">
        {SORT_OPTIONS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => handleSortClick(key)}
            className={`px-2.5 py-1 rounded text-xs transition-colors flex items-center gap-1 ${
              sortKey === key
                ? "bg-gray-600 text-gray-100"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            {label}
            {sortKey === key && (
              <span className="text-[10px]">{sortDir === "desc" ? "↓" : "↑"}</span>
            )}
          </button>
        ))}
      </div>

      {/* 列数 */}
      <div className="flex items-center gap-0.5 bg-gray-800 rounded-lg p-0.5">
        {[2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => onColumnsChange(n)}
            className={`w-7 h-7 rounded text-xs transition-colors ${
              columns === n
                ? "bg-gray-600 text-gray-100"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            {n}
          </button>
        ))}
      </div>

      {/* 選択モード */}
      <button
        onClick={onToggleSelectMode}
        className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
          selectMode
            ? "bg-blue-600 text-white"
            : "bg-gray-800 text-gray-400 hover:text-gray-200"
        }`}
      >
        選択
      </button>

      {/* 一括削除（選択中のみ表示） */}
      {selectMode && selectedCount > 0 && (
        <button
          onClick={onBulkDelete}
          className="px-3 py-1.5 rounded-lg text-xs bg-red-600 hover:bg-red-500 text-white transition-colors"
        >
          {selectedCount}枚を削除
        </button>
      )}
    </div>
  );
}
