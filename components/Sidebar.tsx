"use client";

import Link from "next/link";
import { FolderInfo } from "@/types";
import RunImgtoolsPanel from "@/components/RunImgtoolsPanel";

type Props = {
  folders: FolderInfo[];
  totalCount: number;
  selectedFolder: string | null;
  onSelectFolder: (folder: string | null) => void;
  loading: boolean;
  onRefresh: () => void;
};

export default function Sidebar({
  folders,
  totalCount,
  selectedFolder,
  onSelectFolder,
  loading,
  onRefresh,
}: Props) {
  return (
    <aside className="w-56 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col overflow-y-auto">
      <div className="p-4 border-b border-gray-800">
        <h2 className="text-sm font-bold text-gray-100 tracking-wider uppercase">
          imgview
        </h2>
      </div>

      <nav className="flex-1 p-2">
        {loading ? (
          <div className="space-y-1">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="h-8 bg-gray-800 rounded animate-pulse"
              />
            ))}
          </div>
        ) : (
          <ul className="space-y-0.5">
            <li>
              <button
                onClick={() => onSelectFolder(null)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded text-sm transition-colors ${
                  selectedFolder === null
                    ? "bg-blue-600 text-white"
                    : "text-gray-300 hover:bg-gray-800 hover:text-gray-100"
                }`}
              >
                <span>All</span>
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-full ${
                    selectedFolder === null
                      ? "bg-blue-500 text-white"
                      : "bg-gray-700 text-gray-400"
                  }`}
                >
                  {totalCount}
                </span>
              </button>
            </li>

            {folders.map((folder) => (
              <li key={folder.name}>
                <button
                  onClick={() => onSelectFolder(folder.name)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded text-sm transition-colors ${
                    selectedFolder === folder.name
                      ? "bg-blue-600 text-white"
                      : "text-gray-300 hover:bg-gray-800 hover:text-gray-100"
                  }`}
                >
                  <span className="truncate text-left">{folder.label}</span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ml-1 ${
                      selectedFolder === folder.name
                        ? "bg-blue-500 text-white"
                        : "bg-gray-700 text-gray-400"
                    }`}
                  >
                    {folder.count}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>

      <div className="p-2 pb-10 border-t border-gray-800 space-y-1">
        <Link
          href="/cleanup"
          className="w-full flex items-center gap-2 px-3 py-2 rounded text-sm text-gray-300 hover:bg-gray-800 hover:text-gray-100 transition-colors"
        >
          <span className="text-base">🗑️</span>
          <span>クリーンアップ</span>
        </Link>
        <RunImgtoolsPanel onComplete={onRefresh} />
      </div>
    </aside>
  );
}
