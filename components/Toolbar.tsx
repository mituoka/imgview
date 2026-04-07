"use client";

type SortKey = "mtime" | "size" | "filename";
type SortDir = "desc" | "asc";

type Props = {
  search: string;
  onSearchChange: (v: string) => void;
  sortKey: SortKey;
  sortDir: SortDir;
  onSortChange: (key: SortKey, dir: SortDir) => void;
  columns: number;
  onColumnsChange: (n: number) => void;
  selectMode: boolean;
  selectedCount: number;
  onToggleSelectMode: () => void;
  onBulkDelete: () => void;
};

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "mtime", label: "日付" },
  { key: "size", label: "サイズ" },
  { key: "filename", label: "名前" },
];

export type { SortKey, SortDir };

export default function Toolbar({
  search,
  onSearchChange,
  sortKey,
  sortDir,
  onSortChange,
  columns,
  onColumnsChange,
  selectMode,
  selectedCount,
  onToggleSelectMode,
  onBulkDelete,
}: Props) {
  const handleSortClick = (key: SortKey) => {
    if (key === sortKey) {
      onSortChange(key, sortDir === "desc" ? "asc" : "desc");
    } else {
      onSortChange(key, "desc");
    }
  };

  return (
    <div className="flex items-center gap-2 mb-4 flex-wrap">
      {/* 検索 */}
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
