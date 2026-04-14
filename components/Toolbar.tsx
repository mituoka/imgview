"use client";

import { useState, useRef, useEffect } from "react";
import { USAGE_TAGS } from "@/types";

export type OrientationFilter = "all" | "landscape" | "portrait";

type Props = {
  search: string;
  onSearchChange: (v: string) => void;
  onAiSearch: (q: string) => void;
  aiSearching: boolean;
  aiActive: boolean;
  orientation: OrientationFilter;
  onOrientationChange: (v: OrientationFilter) => void;
  columns: number;
  onColumnsChange: (n: number) => void;
  selectMode: boolean;
  selectedCount: number;
  onToggleSelectMode: () => void;
  onBulkDelete: () => void;
  selectedUsageTag: string | null;
  onSelectUsageTag: (tag: string | null) => void;
  favoritesOnly: boolean;
  onToggleFavoritesOnly: () => void;
};

const ORIENTATION_OPTIONS: { value: OrientationFilter; label: string }[] = [
  { value: "all", label: "全て" },
  { value: "landscape", label: "横長" },
  { value: "portrait", label: "縦長" },
];

export default function Toolbar({
  search,
  onSearchChange,
  onAiSearch,
  aiSearching,
  aiActive,
  orientation,
  onOrientationChange,
  columns,
  onColumnsChange,
  selectMode,
  selectedCount,
  onToggleSelectMode,
  onBulkDelete,
  selectedUsageTag,
  onSelectUsageTag,
  favoritesOnly,
  onToggleFavoritesOnly,
}: Props) {
  const [usageOpen, setUsageOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 外クリックで閉じる
  useEffect(() => {
    if (!usageOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setUsageOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [usageOpen]);

  const currentTag = USAGE_TAGS.find((t) => t.value === selectedUsageTag);

  return (
    <div className="flex items-center gap-2 mb-4 flex-wrap">
      {/* 検索ボックス（タイプ→ローカルフィルタ、Enter→AI検索） */}
      <div className="relative flex-1 min-w-40">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
          {aiSearching ? (
            <span className="inline-block w-3.5 h-3.5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg
              className={`w-3.5 h-3.5 ${aiActive ? "text-violet-400" : "text-gray-500"}`}
              viewBox="0 0 16 16" fill="none" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round"
            >
              <circle cx="6.5" cy="6.5" r="4.5"/>
              <line x1="10" y1="10" x2="14" y2="14"/>
            </svg>
          )}
        </span>
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && search.trim()) onAiSearch(search.trim());
          }}
          placeholder="検索..."
          className={`w-full bg-gray-800 text-gray-100 text-sm rounded-lg pl-8 pr-8 py-1.5 border focus:outline-none placeholder-gray-500 transition-colors ${
            aiActive
              ? "border-violet-600 focus:border-violet-400"
              : "border-gray-700 focus:border-blue-500"
          }`}
        />
        {search && !aiSearching && (
          <button
            onClick={() => onSearchChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs"
          >
            ✕
          </button>
        )}
      </div>

      {/* 用途フィルター（プルダウン） */}
      <div ref={dropdownRef} className="relative">
        <button
          onClick={() => setUsageOpen((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors ${
            selectedUsageTag
              ? "bg-blue-900/50 border-blue-600 text-blue-300"
              : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200"
          }`}
        >
          <span>{currentTag ? currentTag.label : "用途"}</span>
          <svg className="w-3 h-3 opacity-60" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M3 4.5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {selectedUsageTag && (
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); onSelectUsageTag(null); }}
              className="ml-0.5 hover:text-white transition-colors"
              aria-label="フィルタ解除"
            >
              ✕
            </span>
          )}
        </button>

        {usageOpen && (
          <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20 min-w-[120px] py-1 overflow-hidden">
            <button
              onClick={() => { onSelectUsageTag(null); setUsageOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                !selectedUsageTag
                  ? "text-white bg-gray-700"
                  : "text-gray-300 hover:bg-gray-700 hover:text-white"
              }`}
            >
              すべて
            </button>
            <div className="border-t border-gray-700 my-0.5" />
            {USAGE_TAGS.map((tag) => (
              <button
                key={tag.value}
                onClick={() => { onSelectUsageTag(tag.value); setUsageOpen(false); }}
                className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                  selectedUsageTag === tag.value
                    ? "text-white bg-gray-700"
                    : "text-gray-300 hover:bg-gray-700 hover:text-white"
                }`}
              >
                {tag.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* お気に入りフィルター */}
      <button
        onClick={onToggleFavoritesOnly}
        title="お気に入りのみ表示"
        className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
          favoritesOnly
            ? "bg-red-900/40 border-red-600 text-red-400"
            : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200"
        }`}
      >
        {favoritesOnly ? "♥" : "♡"}
      </button>

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
