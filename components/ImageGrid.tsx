"use client";

import { ImageItem } from "@/types";
import { useState, useEffect, useRef } from "react";

type Props = {
  images: ImageItem[];
  loading: boolean;
  columns: number;
  selectMode: boolean;
  selectedPaths: Set<string>;
  onImageClick: (index: number) => void;
  onDelete: (image: ImageItem) => void;
  onToggleSelect: (image: ImageItem) => void;
  onDimensionLoad?: (path: string, w: number, h: number) => void;
  onFavoriteChange?: (path: string, favorite: boolean) => void;
  apiBase: string;
  focusedIndex?: number | null;
  onDragStartNotify?: () => void;
  onDragEndNotify?: () => void;
};

type ThumbnailProps = {
  image: ImageItem;
  index: number;
  priority: boolean;
  selectMode: boolean;
  selected: boolean;
  selectedPaths: Set<string>;
  focused: boolean;
  onImageClick: (index: number) => void;
  onDelete: (image: ImageItem) => void;
  onToggleSelect: (image: ImageItem) => void;
  onDimensionLoad?: (path: string, w: number, h: number) => void;
  onFavoriteChange?: (path: string, favorite: boolean) => void;
  apiBase: string;
  onDragStartNotify?: () => void;
  onDragEndNotify?: () => void;
};

const COL_CLASS: Record<number, string> = {
  3: "columns-3",
  5: "columns-5",
  7: "columns-7",
  9: "columns-9",
  11: "columns-11",
};

const INITIAL_COUNT = 120;
const INCREMENT = 60;

function Thumbnail({
  image, index, priority, selectMode, selected, selectedPaths, focused,
  onImageClick, onDelete, onToggleSelect, onDimensionLoad, onFavoriteChange, apiBase,
  onDragStartNotify, onDragEndNotify,
}: ThumbnailProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [isFavorite, setIsFavorite] = useState(image.favorite ?? false);
  const [isDragging, setIsDragging] = useState(false);
  const elemRef = useRef<HTMLDivElement>(null);

  const src = `${apiBase}/api/images/file/${encodeURIComponent(image.path).replace(/%2F/g, "/")}`;

  const handleClick = () => {
    if (selectMode) {
      onToggleSelect(image);
    } else {
      onImageClick(index);
    }
  };

  const handleFavoriteClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const prev = isFavorite;
    const next = !prev;
    setIsFavorite(next); // 楽観的更新
    try {
      const res = await fetch("/api/images/favorite", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: image.path, favorite: next }),
      });
      if (!res.ok) throw new Error("Failed");
      onFavoriteChange?.(image.path, next);
    } catch (e) {
      console.error(e);
      setIsFavorite(prev); // ロールバック
    }
  };

  // フォーカス時に scrollIntoView
  useEffect(() => {
    if (focused && elemRef.current) {
      elemRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [focused]);

  return (
    <div
      ref={elemRef}
      role="button"
      tabIndex={0}
      draggable={true}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleClick(); }}
      onDragStart={(e) => {
        // 選択済み画像を複数選択中にドラッグ → 全選択パスを移動対象にする
        const isMultiDrag = selected && selectedPaths.size > 1;
        const paths = isMultiDrag ? Array.from(selectedPaths) : [image.path];
        e.dataTransfer.setData("imagePaths", JSON.stringify(paths));
        setIsDragging(true);
        // カスタムゴースト（小さいバッジ）
        const ghost = document.createElement("div");
        ghost.style.cssText =
          "position:fixed;top:-200px;left:0;background:#1f2937;color:#f3f4f6;padding:4px 10px;" +
          "border-radius:6px;font-size:11px;border:1px solid #4b5563;white-space:nowrap;" +
          "box-shadow:0 2px 8px rgba(0,0,0,0.5);pointer-events:none;";
        ghost.textContent = isMultiDrag ? `📷 ${selectedPaths.size}枚` : `📷 ${image.filename}`;
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, 0, 0);
        setTimeout(() => document.body.removeChild(ghost), 0);
        onDragStartNotify?.();
      }}
      onDragEnd={() => { setIsDragging(false); onDragEndNotify?.(); }}
      className={`relative bg-gray-800 overflow-hidden group cursor-pointer outline-none transition-opacity ${
        isDragging ? "opacity-50" : "opacity-100"
      } ${
        selectMode && selected
          ? "ring-2 ring-blue-500"
          : focused
          ? "ring-2 ring-white/70"
          : "focus-visible:ring-2 focus-visible:ring-blue-500"
      }`}
    >
      {!error ? (
        <>
          {!loaded && <div className="w-full aspect-square bg-gray-800 animate-pulse" />}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={image.filename}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            fetchPriority={priority ? "high" : "low"}
            className={`w-full h-auto block transition-opacity duration-300 group-hover:scale-105 ${
              loaded ? "opacity-100" : "opacity-0 absolute inset-0"
            } ${selectMode && selected ? "opacity-70" : ""}`}
            onLoad={(e) => {
              setLoaded(true);
              const el = e.currentTarget;
              onDimensionLoad?.(image.path, el.naturalWidth, el.naturalHeight);
            }}
            onError={() => setError(true)}
          />
        </>
      ) : (
        <div className="w-full aspect-square flex items-center justify-center bg-gray-800">
          <span className="text-gray-500 text-xs text-center px-2">{image.filename}</span>
        </div>
      )}

      {/* 選択モード: チェックボックス */}
      {selectMode && (
        <div className={`absolute top-2 left-2 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
          selected ? "bg-blue-500 border-blue-500" : "bg-black/40 border-white/60"
        }`}>
          {selected && <span className="text-white text-xs leading-none">✓</span>}
        </div>
      )}

      {/* 通常モード: ホバーオーバーレイ */}
      {!selectMode && (
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all duration-200 flex flex-col justify-between p-2 opacity-0 group-hover:opacity-100">
          <div className="flex justify-end gap-1">
            {/* お気に入りボタン */}
            <button
              onClick={handleFavoriteClick}
              className={`w-7 h-7 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 text-sm transition-colors ${
                isFavorite ? "text-red-400" : "text-gray-300 hover:text-red-400"
              }`}
              aria-label={isFavorite ? "お気に入り解除" : "お気に入り追加"}
            >
              {isFavorite ? "♥" : "♡"}
            </button>
            {/* 削除ボタン */}
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(image); }}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-red-600/80 hover:bg-red-500 text-white text-xs transition-colors"
              aria-label="Delete"
            >
              ✕
            </button>
          </div>
          <div>
            <p className="text-white text-xs font-medium truncate leading-tight">{image.filename}</p>
            <p className="text-gray-300 text-xs truncate">{image.folder}</p>
          </div>
        </div>
      )}

      {/* お気に入り常時表示（ホバーしなくても見える） */}
      {!selectMode && isFavorite && (
        <div className="absolute top-2 right-2 text-red-400 text-sm pointer-events-none opacity-80 group-hover:opacity-0 transition-opacity">
          ♥
        </div>
      )}
    </div>
  );
}

export default function ImageGrid({
  images, loading, columns, selectMode, selectedPaths,
  onImageClick, onDelete, onToggleSelect, onDimensionLoad, onFavoriteChange, apiBase,
  focusedIndex, onDragStartNotify, onDragEndNotify,
}: Props) {
  const colClass = COL_CLASS[columns] ?? "columns-3";
  const [displayCount, setDisplayCount] = useState(INITIAL_COUNT);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // 画像リストが変わったら表示数をリセット
  useEffect(() => {
    setDisplayCount(INITIAL_COUNT);
  }, [images]);

  // IntersectionObserver でスクロール末尾に達したら追加ロード
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setDisplayCount((prev) => Math.min(prev + INCREMENT, images.length));
        }
      },
      { rootMargin: "400px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [images.length]);

  if (loading) {
    return (
      <div className={`${colClass} gap-1`}>
        {[...Array(columns * 5)].map((_, i) => (
          <div
            key={i}
            className="mb-1 bg-gray-800 animate-pulse"
            style={{ aspectRatio: i % 3 === 0 ? "3/4" : i % 3 === 1 ? "4/3" : "1/1" }}
          />
        ))}
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No images found
      </div>
    );
  }

  // 最初の2行分（columns × 2）はビューポート内として eager ロード
  const PRIORITY_COUNT = columns * 2;
  const visibleImages = images.slice(0, displayCount);

  return (
    <>
      <div className={`${colClass} gap-1`}>
        {visibleImages.map((image, index) => (
          <div key={image.id} className="mb-1 break-inside-avoid">
            <Thumbnail
              image={image}
              index={index}
              priority={index < PRIORITY_COUNT}
              selectMode={selectMode}
              selected={selectedPaths.has(image.path)}
              selectedPaths={selectedPaths}
              focused={focusedIndex === index}
              onImageClick={onImageClick}
              onDelete={onDelete}
              onToggleSelect={onToggleSelect}
              onDimensionLoad={onDimensionLoad}
              onFavoriteChange={onFavoriteChange}
              apiBase={apiBase}
              onDragStartNotify={onDragStartNotify}
              onDragEndNotify={onDragEndNotify}
            />
          </div>
        ))}
      </div>

      {/* 追加ロードのセンチネル / 残件数表示 */}
      <div ref={sentinelRef} className="py-4 text-center">
        {displayCount < images.length ? (
          <span className="text-gray-600 text-xs">
            {displayCount} / {images.length} 枚表示中
          </span>
        ) : images.length > INITIAL_COUNT ? (
          <span className="text-gray-700 text-xs">{images.length} 枚すべて表示済み</span>
        ) : null}
      </div>
    </>
  );
}
