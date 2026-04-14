"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, useCallback } from "react";
import { FolderInfo, USAGE_TAGS } from "@/types";
import RunImgtoolsPanel from "@/components/RunImgtoolsPanel";

type Props = {
  folders: FolderInfo[];
  totalCount: number;
  selectedFolder: string | null;
  onSelectFolder: (folder: string | null) => void;
  loading: boolean;
  onRefresh: () => void;
  currentFolder: string | null;
  selectedUsageTag: string | null;
  onSelectUsageTag: (tag: string | null) => void;
};

function WatcherButton({ onRefresh }: { onRefresh: () => void }) {
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(() => {
    fetch("/api/watcher")
      .then((r) => r.json())
      .then((d) => setRunning(d.running))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 10000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  const toggle = async () => {
    setLoading(true);
    await fetch("/api/watcher", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: running ? "stop" : "start" }),
    });
    await new Promise((r) => setTimeout(r, 600));
    fetchStatus();
    if (!running) onRefresh();
  };

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors disabled:opacity-50 ${
        running
          ? "text-green-400 hover:bg-gray-800"
          : "text-gray-300 hover:bg-gray-800 hover:text-gray-100"
      }`}
    >
      {running && <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />}
      <span>{running ? "監視中..." : "自動取り込み"}</span>
    </button>
  );
}

export default function Sidebar({
  folders,
  totalCount,
  selectedFolder,
  onSelectFolder,
  loading,
  onRefresh,
  currentFolder,
  selectedUsageTag,
  onSelectUsageTag,
}: Props) {
  return (
    <aside className="w-56 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col overflow-y-auto">
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Image src="/icon.png" alt="logo" width={24} height={24} className="rounded-full" />
          <h2 className="text-sm font-bold text-gray-100 tracking-wider uppercase">
            imgview
          </h2>
        </div>
      </div>

      <nav className="flex-1 p-2">
        {loading ? (
          <div className="space-y-1">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-8 bg-gray-800 rounded animate-pulse" />
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
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  selectedFolder === null ? "bg-blue-500 text-white" : "bg-gray-700 text-gray-400"
                }`}>
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
                  <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ml-1 ${
                    selectedFolder === folder.name ? "bg-blue-500 text-white" : "bg-gray-700 text-gray-400"
                  }`}>
                    {folder.count}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>

      {/* 利用先タグセクション */}
      <div className="p-2 border-t border-gray-800">
        <p className="px-3 py-1.5 text-xs text-gray-500 font-medium">利用先</p>
        <ul className="space-y-0.5">
          <li>
            <button
              onClick={() => onSelectUsageTag(null)}
              className={`w-full flex items-center px-3 py-2 rounded text-sm transition-colors ${
                selectedUsageTag === null
                  ? "bg-blue-600 text-white"
                  : "text-gray-300 hover:bg-gray-800 hover:text-gray-100"
              }`}
            >
              すべて
            </button>
          </li>
          {USAGE_TAGS.map((tag) => (
            <li key={tag.value}>
              <button
                onClick={() => onSelectUsageTag(tag.value)}
                className={`w-full flex items-center px-3 py-2 rounded text-sm transition-colors ${
                  selectedUsageTag === tag.value
                    ? "bg-blue-600 text-white"
                    : "text-gray-300 hover:bg-gray-800 hover:text-gray-100"
                }`}
              >
                {tag.label}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="p-2 pb-10 border-t border-gray-800 space-y-1">
        <WatcherButton onRefresh={onRefresh} />
        <Link
          href="/cleanup"
          className="w-full flex items-center gap-2 px-3 py-2 rounded text-sm text-gray-300 hover:bg-gray-800 hover:text-gray-100 transition-colors"
        >
          クリーンアップ
        </Link>
        <RunImgtoolsPanel onComplete={onRefresh} currentFolder={currentFolder} />
      </div>
    </aside>
  );
}
