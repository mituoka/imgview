"use client";

import { useEffect, useCallback } from "react";
import { ImageItem } from "@/types";

type Props = {
  image: ImageItem;
  index: number;
  total: number;
  apiBase: string;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onDelete: (image: ImageItem) => void;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Lightbox({
  image,
  index,
  total,
  apiBase,
  onClose,
  onPrev,
  onNext,
  onDelete,
}: Props) {
  const src = `${apiBase}/api/images/file/${encodeURIComponent(image.path).replace(/%2F/g, "/")}`;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    },
    [onClose, onPrev, onNext]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
      onClick={onClose}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-gray-900/80 flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-gray-400 text-sm">
          {index + 1} / {total}
        </span>
        <span className="text-gray-200 text-sm font-medium truncate mx-4 max-w-md">
          {image.filename}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onDelete(image)}
            className="px-3 py-1.5 bg-red-600/80 hover:bg-red-500 text-white text-sm rounded-lg transition-colors"
          >
            削除
          </button>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1"
            aria-label="Close"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Image area */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden">
        {/* Prev button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPrev();
          }}
          className="absolute left-4 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/80 transition-colors"
          aria-label="Previous"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>

        {/* Image */}
        <div
          className="max-w-full max-h-full flex items-center justify-center p-4"
          onClick={(e) => e.stopPropagation()}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={image.filename}
            className="max-w-full max-h-[calc(100vh-160px)] object-contain select-none"
            draggable={false}
          />
        </div>

        {/* Next button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
          className="absolute right-4 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/80 transition-colors"
          aria-label="Next"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>

      {/* Bottom info bar */}
      <div
        className="flex items-center gap-6 px-4 py-3 bg-gray-900/80 flex-shrink-0 text-sm text-gray-400"
        onClick={(e) => e.stopPropagation()}
      >
        <span>
          <span className="text-gray-500">Path: </span>
          <span className="text-gray-300">{image.path}</span>
        </span>
        <span>
          <span className="text-gray-500">Size: </span>
          <span className="text-gray-300">{formatBytes(image.size)}</span>
        </span>
        {image.category && (
          <span>
            <span className="text-gray-500">Category: </span>
            <span className="text-blue-400">{image.category}</span>
          </span>
        )}
        <span>
          <span className="text-gray-500">Modified: </span>
          <span className="text-gray-300">
            {new Date(image.mtime).toLocaleDateString("ja-JP")}
          </span>
        </span>
      </div>
    </div>
  );
}
