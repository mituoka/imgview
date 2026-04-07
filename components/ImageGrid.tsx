"use client";

import { ImageItem } from "@/types";
import { useState } from "react";

type Props = {
  images: ImageItem[];
  loading: boolean;
  onImageClick: (index: number) => void;
  onDelete: (image: ImageItem) => void;
  apiBase: string;
};

type ThumbnailProps = {
  image: ImageItem;
  index: number;
  onImageClick: (index: number) => void;
  onDelete: (image: ImageItem) => void;
  apiBase: string;
};

function Thumbnail({ image, index, onImageClick, onDelete, apiBase }: ThumbnailProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const src = `${apiBase}/api/images/file/${encodeURIComponent(image.path).replace(/%2F/g, "/")}`;

  return (
    <button
      onClick={() => onImageClick(index)}
      className="relative aspect-square bg-gray-800 overflow-hidden group focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {!error ? (
        <>
          {!loaded && (
            <div className="absolute inset-0 bg-gray-800 animate-pulse" />
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={image.filename}
            className={`w-full h-full object-cover transition-all duration-200 group-hover:scale-105 ${
              loaded ? "opacity-100" : "opacity-0"
            }`}
            onLoad={() => setLoaded(true)}
            onError={() => setError(true)}
          />
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
          <span className="text-gray-500 text-xs text-center px-2">
            {image.filename}
          </span>
        </div>
      )}

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all duration-200 flex flex-col justify-between p-2 opacity-0 group-hover:opacity-100">
        {/* 削除ボタン */}
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
    </button>
  );
}

export default function ImageGrid({
  images,
  loading,
  onImageClick,
  onDelete,
  apiBase,
}: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-1">
        {[...Array(18)].map((_, i) => (
          <div
            key={i}
            className="aspect-square bg-gray-800 animate-pulse"
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

  return (
    <div className="grid grid-cols-3 gap-1">
      {images.map((image, index) => (
        <Thumbnail
          key={image.id}
          image={image}
          index={index}
          onImageClick={onImageClick}
          onDelete={onDelete}
          apiBase={apiBase}
        />
      ))}
    </div>
  );
}
