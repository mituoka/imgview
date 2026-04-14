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
  apiBase: string;
};

type ThumbnailProps = {
  image: ImageItem;
  index: number;
  priority: boolean;
  selectMode: boolean;
  selected: boolean;
  onImageClick: (index: number) => void;
  onDelete: (image: ImageItem) => void;
  onToggleSelect: (image: ImageItem) => void;
  onDimensionLoad?: (path: string, w: number, h: number) => void;
  apiBase: string;
};

const COL_CLASS: Record<number, string> = {
  2: "columns-2",
  3: "columns-3",
  4: "columns-4",
  5: "columns-5",
};

const INITIAL_COUNT = 120;
const INCREMENT = 60;

function Thumbnail({
  image, index, priority, selectMode, selected,
  onImageClick, onDelete, onToggleSelect, onDimensionLoad, apiBase,
}: ThumbnailProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const src = `${apiBase}/api/images/file/${encodeURIComponent(image.path).replace(/%2F/g, "/")}`;

  const handleClick = () => {
    if (selectMode) {
      onToggleSelect(image);
    } else {
      onImageClick(index);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleClick(); }}
      className={`relative bg-gray-800 overflow-hidden group cursor-pointer outline-none ${
        selectMode && selected
          ? "ring-2 ring-blue-500"
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
          <div className="flex justify-end">
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
    </div>
  );
}

export default function ImageGrid({
  images, loading, columns, selectMode, selectedPaths,
  onImageClick, onDelete, onToggleSelect, onDimensionLoad, apiBase,
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
              onImageClick={onImageClick}
              onDelete={onDelete}
              onToggleSelect={onToggleSelect}
              onDimensionLoad={onDimensionLoad}
              apiBase={apiBase}
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
