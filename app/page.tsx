"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { ImageItem, FolderInfo } from "@/types";
import Sidebar from "@/components/Sidebar";
import ImageGrid from "@/components/ImageGrid";
import Lightbox from "@/components/Lightbox";
import Toolbar, { OrientationFilter } from "@/components/Toolbar";
import ImageEditor from "@/components/ImageEditor";
import FolderDropOverlay from "@/components/FolderDropOverlay";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

function shuffleImages(images: ImageItem[]): ImageItem[] {
  const arr = [...images];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
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
  const [selectedUsageTag, setSelectedUsageTag] = useState<string | null>(null);
  const [editingImage, setEditingImage] = useState<ImageItem | null>(null);

  // ツールバー状態
  const [search, setSearch] = useState("");
  const [orientation, setOrientation] = useState<OrientationFilter>("all");
  const [dimensionMap, setDimensionMap] = useState<Map<string, { w: number; h: number }>>(new Map());
  const [columns, setColumns] = useState(3);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  // お気に入りフィルタ
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  // グリッドキーボードナビゲーション
  const [gridFocusIndex, setGridFocusIndex] = useState<number | null>(null);

  // ドラッグ中フラグ（フォルダオーバーレイ表示制御）
  const [isDraggingImage, setIsDraggingImage] = useState(false);

  // AI 検索状態
  const [aiSearching, setAiSearching] = useState(false);
  const [aiResults, setAiResults] = useState<ImageItem[] | null>(null);

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
      .then((data: ImageItem[]) => setImages(shuffleImages(data)))
      .catch(console.error)
      .finally(() => setLoadingImages(false));
  }, [selectedFolder, refreshKey]);

  // 選択モード終了時にクリア
  useEffect(() => {
    if (!selectMode) setSelectedPaths(new Set());
  }, [selectMode]);

  // 編集後にジャンプするパスを保持
  const pendingOpenPath = useRef<string | null>(null);

  // 画像リフレッシュ完了後、pendingOpenPath があればライトボックスで開く
  useEffect(() => {
    if (!pendingOpenPath.current || loadingImages) return;
    const idx = images.findIndex((img) => img.path === pendingOpenPath.current);
    if (idx !== -1) {
      setLightboxIndex(idx);
      pendingOpenPath.current = null;
    }
  }, [images, loadingImages]);

  // 画像ロードごとの setDimensionMap を rAF でまとめて1回の setState に
  const pendingDims = useRef<Map<string, { w: number; h: number }>>(new Map());
  const rafRef = useRef<number | null>(null);

  const handleDimensionLoad = useCallback((path: string, w: number, h: number) => {
    pendingDims.current.set(path, { w, h });
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const updates = new Map(pendingDims.current);
      pendingDims.current.clear();
      setDimensionMap((prev) => {
        let changed = false;
        for (const [k, v] of updates) {
          if (prev.get(k)?.w !== v.w || prev.get(k)?.h !== v.h) { changed = true; break; }
        }
        if (!changed) return prev;
        const next = new Map(prev);
        updates.forEach((v, k) => next.set(k, v));
        return next;
      });
    });
  }, []);

  // フィルタ済み画像（順序はシャッフル済み）
  const filteredImages = useMemo(() => {
    // AI 検索結果があればそちらを優先（スコア順で確定済み）
    if (aiResults !== null) return aiResults;
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

    if (selectedUsageTag) {
      filtered = filtered.filter((img) => img.usage_tags?.includes(selectedUsageTag));
    }

    if (favoritesOnly) {
      filtered = filtered.filter((img) => img.favorite);
    }

    return filtered;
  }, [images, search, orientation, dimensionMap, selectedUsageTag, favoritesOnly, aiResults]);

  // filteredImages が縮小したとき lightboxIndex を範囲内に収める
  useEffect(() => {
    if (lightboxIndex !== null && lightboxIndex >= filteredImages.length) {
      setLightboxIndex(filteredImages.length > 0 ? filteredImages.length - 1 : null);
    }
  }, [filteredImages.length, lightboxIndex]);

  // グリッドキーボードナビゲーション（ライトボックスが閉じているとき）
  useEffect(() => {
    if (lightboxIndex !== null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // 検索ボックスにフォーカスがある場合は無視
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;

      if (e.key === "ArrowRight") {
        e.preventDefault();
        setGridFocusIndex((prev) => {
          if (prev === null) return 0;
          return Math.min(prev + 1, filteredImages.length - 1);
        });
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setGridFocusIndex((prev) => {
          if (prev === null) return 0;
          return Math.max(prev - 1, 0);
        });
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setGridFocusIndex((prev) => {
          if (prev === null) return 0;
          return Math.min(prev + columns, filteredImages.length - 1);
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setGridFocusIndex((prev) => {
          if (prev === null) return 0;
          return Math.max(prev - columns, 0);
        });
      } else if (e.key === "Enter") {
        if (gridFocusIndex !== null) {
          setLightboxIndex(gridFocusIndex);
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [lightboxIndex, filteredImages.length, columns, gridFocusIndex]);

  // ライトボックスが開いたらグリッドフォーカスをリセット
  useEffect(() => {
    if (lightboxIndex !== null) {
      setGridFocusIndex(null);
    }
  }, [lightboxIndex]);

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
    setAiResults((prev) => prev ? prev.filter((img) => img.path !== p) : null);
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
    const paths = Array.from(selectedPaths);
    await Promise.allSettled(
      paths.map((p) =>
        fetch(`${API_BASE}/api/images/file/${encodeURIComponent(p).replace(/%2F/g, "/")}`, {
          method: "DELETE",
        })
      )
    );
    setImages((prev) => prev.filter((img) => !selectedPaths.has(img.path)));
    setAiResults((prev) => prev ? prev.filter((img) => !selectedPaths.has(img.path)) : null);
    setSelectedPaths(new Set());
    setSelectMode(false);
    setRefreshKey((k) => k + 1);
  }, [selectedPaths]);

  // AI セマンティック検索（Enter キーで発火）
  const handleAiSearch = useCallback(async (q: string) => {
    setAiSearching(true);
    setAiResults(null);
    try {
      const res = await fetch(`${API_BASE}/api/images/search?q=${encodeURIComponent(q)}&limit=40`);
      const data = await res.json();
      if (Array.isArray(data)) {
        const pathOrder = new Map<string, number>(
          data.map((r: { path: string }, i: number) => [r.path, i])
        );
        const matched = images
          .filter((img) => pathOrder.has(img.path))
          .sort((a, b) => (pathOrder.get(a.path) ?? 999) - (pathOrder.get(b.path) ?? 999));
        setAiResults(matched);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAiSearching(false);
    }
  }, [images]);

  // テキスト変更時は AI 結果をリセット（ローカルフィルタに戻す）
  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
    setAiResults(null);
  }, []);

  // 用途タグ変更時に images と aiResults を更新
  const handleUsageTagsChange = useCallback((path: string, tags: string[]) => {
    setImages((prev) =>
      prev.map((img) => img.path === path ? { ...img, usage_tags: tags } : img)
    );
    setAiResults((prev) =>
      prev ? prev.map((img) => img.path === path ? { ...img, usage_tags: tags } : img) : null
    );
  }, []);

  // お気に入り変更時に images と aiResults を更新
  const handleFavoriteChange = useCallback((path: string, favorite: boolean) => {
    setImages((prev) =>
      prev.map((img) => img.path === path ? { ...img, favorite } : img)
    );
    setAiResults((prev) =>
      prev ? prev.map((img) => img.path === path ? { ...img, favorite } : img) : null
    );
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
        currentFolder={selectedFolder}
        onImageMoved={handleRefresh}
      />

      <main className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-gray-950 border-b border-gray-800 px-4 pt-4 pb-3">
          <div className="mb-2 flex items-center gap-2">
            <h1 className="text-lg font-semibold text-gray-100">
              {selectedFolder ?? "All"}
            </h1>
            {!loadingImages && (
              <span className="text-sm text-gray-400">
                {filteredImages.length}{aiResults === null && search ? ` / ${images.length}` : ""} images
              </span>
            )}
          </div>

          <Toolbar
            search={search}
            onSearchChange={handleSearchChange}
            onAiSearch={handleAiSearch}
            aiSearching={aiSearching}
            aiActive={aiResults !== null}
            orientation={orientation}
            onOrientationChange={setOrientation}
            columns={columns}
            onColumnsChange={setColumns}
            selectMode={selectMode}
            selectedCount={selectedPaths.size}
            onToggleSelectMode={() => setSelectMode((v) => !v)}
            onBulkDelete={handleBulkDelete}
            selectedUsageTag={selectedUsageTag}
            onSelectUsageTag={setSelectedUsageTag}
            favoritesOnly={favoritesOnly}
            onToggleFavoritesOnly={() => setFavoritesOnly((v) => !v)}
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
            onFavoriteChange={handleFavoriteChange}
            apiBase={API_BASE}
            focusedIndex={gridFocusIndex}
            onDragStartNotify={() => setIsDraggingImage(true)}
            onDragEndNotify={() => setIsDraggingImage(false)}
          />
        </div>
      </main>

      {lightboxIndex !== null && filteredImages[lightboxIndex] && (
        <Lightbox
          image={filteredImages[lightboxIndex]}
          index={lightboxIndex}
          total={filteredImages.length}
          apiBase={API_BASE}
          prevImage={filteredImages[lightboxIndex > 0 ? lightboxIndex - 1 : filteredImages.length - 1]}
          nextImage={filteredImages[lightboxIndex < filteredImages.length - 1 ? lightboxIndex + 1 : 0]}
          onClose={handleLightboxClose}
          onPrev={handleLightboxPrev}
          onNext={handleLightboxNext}
          onDelete={handleDeleteRequest}
          onUsageTagsChange={handleUsageTagsChange}
          onEdit={() => lightboxIndex !== null && setEditingImage(filteredImages[lightboxIndex])}
          onFavoriteChange={handleFavoriteChange}
        />
      )}

      {editingImage && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4">
          <ImageEditor
            image={editingImage}
            apiBase={API_BASE}
            onClose={() => setEditingImage(null)}
            onSaved={(newPath) => {
              setEditingImage(null);
              pendingOpenPath.current = newPath;
              setRefreshKey((k) => k + 1);
            }}
          />
        </div>
      )}

      <FolderDropOverlay
        visible={isDraggingImage}
        folders={folders}
        onDrop={() => { setIsDraggingImage(false); handleRefresh(); }}
      />

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
