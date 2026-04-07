"use client";

import { useEffect, useState, useCallback } from "react";
import { ImageItem, FolderInfo } from "@/types";
import Sidebar from "@/components/Sidebar";
import ImageGrid from "@/components/ImageGrid";
import Lightbox from "@/components/Lightbox";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export default function Home() {
  const [folders, setFolders] = useState<FolderInfo[]>([]);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [loadingFolders, setLoadingFolders] = useState(true);
  const [loadingImages, setLoadingImages] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<ImageItem | null>(null);

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  // Fetch folders
  useEffect(() => {
    setLoadingFolders(true);
    fetch(`${API_BASE}/api/folders`)
      .then((res) => res.json())
      .then((data: FolderInfo[]) => setFolders(data))
      .catch(console.error)
      .finally(() => setLoadingFolders(false));
  }, [refreshKey]);

  // Fetch images when folder changes or refresh
  useEffect(() => {
    setLoadingImages(true);
    const url =
      selectedFolder != null
        ? `${API_BASE}/api/images?folder=${encodeURIComponent(selectedFolder)}`
        : `${API_BASE}/api/images`;

    fetch(url)
      .then((res) => res.json())
      .then((data: ImageItem[]) => setImages(data))
      .catch(console.error)
      .finally(() => setLoadingImages(false));
  }, [selectedFolder, refreshKey]);

  const totalCount = folders.reduce((sum, f) => sum + f.count, 0);

  const handleImageClick = useCallback((index: number) => {
    setLightboxIndex(index);
  }, []);

  const handleLightboxClose = useCallback(() => {
    setLightboxIndex(null);
  }, []);

  const handleLightboxPrev = useCallback(() => {
    setLightboxIndex((prev) =>
      prev === null ? null : prev > 0 ? prev - 1 : images.length - 1
    );
  }, [images.length]);

  const handleLightboxNext = useCallback(() => {
    setLightboxIndex((prev) =>
      prev === null ? null : prev < images.length - 1 ? prev + 1 : 0
    );
  }, [images.length]);

  const handleDeleteRequest = useCallback((image: ImageItem) => {
    setConfirmDelete(image);
  }, []);

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
        <div className="p-4">
          <div className="mb-4 flex items-center gap-2">
            <h1 className="text-lg font-semibold text-gray-100">
              {selectedFolder ?? "All"}
            </h1>
            {!loadingImages && (
              <span className="text-sm text-gray-400">
                {images.length} images
              </span>
            )}
          </div>

          <ImageGrid
            images={images}
            loading={loadingImages}
            onImageClick={handleImageClick}
            onDelete={handleDeleteRequest}
            apiBase={API_BASE}
          />
        </div>
      </main>

      {lightboxIndex !== null && images[lightboxIndex] && (
        <Lightbox
          image={images[lightboxIndex]}
          index={lightboxIndex}
          total={images.length}
          apiBase={API_BASE}
          onClose={handleLightboxClose}
          onPrev={handleLightboxPrev}
          onNext={handleLightboxNext}
          onDelete={handleDeleteRequest}
        />
      )}

      {/* 削除確認ダイアログ */}
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
