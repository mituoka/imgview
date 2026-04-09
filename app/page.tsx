"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { ImageItem, FolderInfo } from "@/types";
import Sidebar from "@/components/Sidebar";
import ImageGrid from "@/components/ImageGrid";
import Lightbox from "@/components/Lightbox";
import Toolbar, { SortKey, SortDir, OrientationFilter } from "@/components/Toolbar";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

function sortImages(images: ImageItem[], key: SortKey, dir: SortDir): ImageItem[] {
  return [...images].sort((a, b) => {
    let v = 0;
    if (key === "mtime") v = a.mtime - b.mtime;
    else if (key === "size") v = a.size - b.size;
    else v = a.filename.localeCompare(b.filename, "ja");
    return dir === "desc" ? -v : v;
  });
}

export default function Home() {
  const [folders, setFolders] = useState<FolderInfo[]>([]);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [loadingFolders, setLoadingFolders] = useState(true);
  const [loadingImages, setLoadingImages] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<ImageItem | null>(null);

  // ツールバー状態
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("mtime");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [orientation, setOrientation] = useState<OrientationFilter>("all");
  const [dimensionMap, setDimensionMap] = useState<Map<string, { w: number; h: number }>>(new Map());
  const [columns, setColumns] = useState(3);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  const handleRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    setLoadingFolders(true);
    fetch(`${API_BASE}/api/folders`)
      .then((r) => r.json())
      .then((data: FolderInfo[]) => setFolders(data))
      .catch(console.error)
      .finally(() => setLoadingFolders(false));
  }, [refreshKey]);

  useEffect(() => {
    setLoadingImages(true);
    const url = selectedFolder != null
      ? `${API_BASE}/api/images?folder=${encodeURIComponent(selectedFolder)}`
      : `${API_BASE}/api/images`;
    fetch(url)
      .then((r) => r.json())
      .then((data: ImageItem[]) => setImages(data))
      .catch(console.error)
      .finally(() => setLoadingImages(false));
  }, [selectedFolder, refreshKey]);

  // 選択モード終了時にクリア
  useEffect(() => {
    if (!selectMode) setSelectedPaths(new Set());
  }, [selectMode]);

  const handleDimensionLoad = useCallback((path: string, w: number, h: number) => {
    setDimensionMap((prev) => {
      if (prev.get(path)?.w === w && prev.get(path)?.h === h) return prev;
      const next = new Map(prev);
      next.set(path, { w, h });
      return next;
    });
  }, []);

  // フィルタ + ソート済み画像
  const filteredImages = useMemo(() => {
    const q = search.trim().toLowerCase();
    let filtered = q
      ? images.filter(
          (img) =>
            img.filename.toLowerCase().includes(q) ||
            img.folder.toLowerCase().includes(q) ||
            (img.category ?? "").toLowerCase().includes(q)
        )
      : images;

    if (orientation !== "all") {
      filtered = filtered.filter((img) => {
        const dim = dimensionMap.get(img.path);
        if (!dim) return true; // 未ロードは除外しない
        return orientation === "landscape" ? dim.w > dim.h : dim.h >= dim.w;
      });
    }

    return sortImages(filtered, sortKey, sortDir);
  }, [images, search, sortKey, sortDir, orientation, dimensionMap]);

  const totalCount = folders.reduce((sum, f) => sum + f.count, 0);

  const handleImageClick = useCallback((index: number) => setLightboxIndex(index), []);
  const handleLightboxClose = useCallback(() => setLightboxIndex(null), []);
  const handleLightboxPrev = useCallback(() => {
    setLightboxIndex((p) => p === null ? null : p > 0 ? p - 1 : filteredImages.length - 1);
  }, [filteredImages.length]);
  const handleLightboxNext = useCallback(() => {
    setLightboxIndex((p) => p === null ? null : p < filteredImages.length - 1 ? p + 1 : 0);
  }, [filteredImages.length]);

  const handleDeleteRequest = useCallback((image: ImageItem) => setConfirmDelete(image), []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!confirmDelete) return;
    const p = confirmDelete.path;
    await fetch(`${API_BASE}/api/images/file/${encodeURIComponent(p).replace(/%2F/g, "/")}`, {
      method: "DELETE",
    });
    setConfirmDelete(null);
    setLightboxIndex(null);
    setImages((prev) => prev.filter((img) => img.path !== p));
    setRefreshKey((k) => k + 1);
  }, [confirmDelete]);

  const handleToggleSelect = useCallback((image: ImageItem) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      next.has(image.path) ? next.delete(image.path) : next.add(image.path);
      return next;
    });
  }, []);

  const handleBulkDelete = useCallback(async () => {
    if (selectedPaths.size === 0) return;
    if (!confirm(`${selectedPaths.size}枚の画像を削除しますか？`)) return;
    for (const p of selectedPaths) {
      await fetch(`${API_BASE}/api/images/file/${encodeURIComponent(p).replace(/%2F/g, "/")}`, {
        method: "DELETE",
      });
    }
    setSelectedPaths(new Set());
    setSelectMode(false);
    setRefreshKey((k) => k + 1);
  }, [selectedPaths]);

  const handleSortChange = useCallback((key: SortKey, dir: SortDir) => {
    setSortKey(key);
    setSortDir(dir);
  }, []);

  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar
        folders={folders}
        totalCount={totalCount}
        selectedFolder={selectedFolder}
        onSelectFolder={setSelectedFolder}
        loading={loadingFolders}
        onRefresh={handleRefresh}
      />

      <main className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-gray-950 border-b border-gray-800 px-4 pt-4 pb-3">
          <div className="mb-2 flex items-center gap-2">
            <h1 className="text-lg font-semibold text-gray-100">
              {selectedFolder ?? "All"}
            </h1>
            {!loadingImages && (
              <span className="text-sm text-gray-400">
                {filteredImages.length}{search ? ` / ${images.length}` : ""} images
              </span>
            )}
          </div>

          <Toolbar
            search={search}
            onSearchChange={setSearch}
            sortKey={sortKey}
            sortDir={sortDir}
            onSortChange={handleSortChange}
            orientation={orientation}
            onOrientationChange={setOrientation}
            columns={columns}
            onColumnsChange={setColumns}
            selectMode={selectMode}
            selectedCount={selectedPaths.size}
            onToggleSelectMode={() => setSelectMode((v) => !v)}
            onBulkDelete={handleBulkDelete}
          />
        </div>

        <div className="p-4">
          <ImageGrid
            images={filteredImages}
            loading={loadingImages}
            columns={columns}
            selectMode={selectMode}
            selectedPaths={selectedPaths}
            onImageClick={handleImageClick}
            onDelete={handleDeleteRequest}
            onToggleSelect={handleToggleSelect}
            onDimensionLoad={handleDimensionLoad}
            apiBase={API_BASE}
          />
        </div>
      </main>

      {lightboxIndex !== null && filteredImages[lightboxIndex] && (
        <Lightbox
          image={filteredImages[lightboxIndex]}
          index={lightboxIndex}
          total={filteredImages.length}
          apiBase={API_BASE}
          onClose={handleLightboxClose}
          onPrev={handleLightboxPrev}
          onNext={handleLightboxNext}
          onDelete={handleDeleteRequest}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-80 shadow-2xl">
            <h3 className="text-sm font-semibold text-gray-100 mb-2">画像を削除しますか？</h3>
            <p className="text-xs text-gray-400 mb-1 break-all">{confirmDelete.filename}</p>
            <p className="text-xs text-gray-500 mb-5 break-all">{confirmDelete.path}</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded-lg"
              >
                キャンセル
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm rounded-lg"
              >
                削除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
