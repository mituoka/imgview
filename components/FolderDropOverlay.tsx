"use client";

import { FolderInfo } from "@/types";
import { useState } from "react";

type Props = {
  visible: boolean;
  folders: FolderInfo[];
  onDrop: (targetFolder: string) => void;
};

export default function FolderDropOverlay({ visible, folders, onDrop }: Props) {
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);

  if (!visible) return null;

  const handleDragOver = (e: React.DragEvent, folder: string) => {
    e.preventDefault();
    setDragOverFolder(folder);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // 子要素への移動は無視する
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOverFolder(null);
  };

  const handleDrop = (e: React.DragEvent, folder: string) => {
    e.preventDefault();
    setDragOverFolder(null);
    const imgPath = e.dataTransfer.getData("imagePath");
    if (!imgPath) return;
    onDrop(folder);
    // 実際の移動処理は onDrop に path を渡す必要があるため、ここで fetch する
    fetch("/api/images/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: imgPath, targetFolder: folder }),
    }).catch(console.error);
  };

  return (
    <div className="fixed inset-0 z-30 flex pointer-events-none">
      {/* 左側オーバーレイ: サイドバー幅に合わせた薄暗いパネル */}
      <div className="w-56 flex-shrink-0 bg-gray-900/90 backdrop-blur-sm flex flex-col pointer-events-auto">
        <div className="p-3 border-b border-gray-700">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">フォルダに移動</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {folders.map((folder) => (
            <div
              key={folder.name}
              onDragOver={(e) => handleDragOver(e, folder.name)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, folder.name)}
              className={`flex items-center justify-between px-3 py-3 rounded-lg text-sm border-2 transition-all cursor-default ${
                dragOverFolder === folder.name
                  ? "bg-blue-600/30 border-blue-400 text-white scale-[1.02]"
                  : "bg-gray-800/60 border-gray-600 text-gray-300"
              }`}
            >
              <span className="truncate font-medium">{folder.label}</span>
              <span className="text-xs text-gray-500 flex-shrink-0 ml-2">{folder.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 右側: クリックなどを透過させるための透明レイヤー */}
      <div className="flex-1" />
    </div>
  );
}
