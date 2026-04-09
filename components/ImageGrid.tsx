"use client";

import { ImageItem } from "@/types";
import { useState } from "react";

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
  selectMode: boolean;
  selected: boolean;
  onImageClick: (index: number) => void;
  onDelete: (image: ImageItem) => void;
  onToggleSelect: (image: ImageItem) => void;
  onDimensionLoad?: (path: string, w: number, h: number) => void;
  apiBase: string;
};

const GRID_COLS: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
};

function Thumbnail({
  image, index, selectMode, selected,
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
      className={`relative aspect-square bg-gray-800 overflow-hidden group cursor-pointer outline-none ${
        selectMode && selected
          ? "ring-2 ring-blue-500"
          : "focus-visible:ring-2 focus-visible:ring-blue-500"
      }`}
    >
      {!error ? (
        <>
          {!loaded && <div className="absolute inset-0 bg-gray-800 animate-pulse" />}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={image.filename}
            className={`w-full h-full object-cover transition-all duration-200 group-hover:scale-105 ${
              loaded ? "opacity-100" : "opacity-0"
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
        <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
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
  const colClass = GRID_COLS[columns] ?? "grid-cols-3";

  if (loading) {
    return (
      <div className={`grid ${colClass} gap-1`}>
        {[...Array(columns * 4)].map((_, i) => (
          <div key={i} className="aspect-square bg-gray-800 animate-pulse" />
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

  return (
    <div className={`grid ${colClass} gap-1`}>
      {images.map((image, index) => (
        <Thumbnail
          key={image.id}
          image={image}
          index={index}
          selectMode={selectMode}
          selected={selectedPaths.has(image.path)}
          onImageClick={onImageClick}
          onDelete={onDelete}
          onToggleSelect={onToggleSelect}
          onDimensionLoad={onDimensionLoad}
          apiBase={apiBase}
        />
      ))}
    </div>
  );
}
