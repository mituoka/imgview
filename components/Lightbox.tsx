"use client";

import { useEffect, useCallback, useState, useRef } from "react";
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

const SLIDESHOW_INTERVAL = 3000;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Lightbox({
  image, index, total, apiBase,
  onClose, onPrev, onNext, onDelete,
}: Props) {
  const src = `${apiBase}/api/images/file/${encodeURIComponent(image.path).replace(/%2F/g, "/")}`;
  const [playing, setPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopSlideshow = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setPlaying(false);
  }, []);

  const startSlideshow = useCallback(() => {
    setPlaying(true);
    intervalRef.current = setInterval(() => {
      onNext();
    }, SLIDESHOW_INTERVAL);
  }, [onNext]);

  const toggleSlideshow = useCallback(() => {
    playing ? stopSlideshow() : startSlideshow();
  }, [playing, startSlideshow, stopSlideshow]);

  // スライドショー中に手動ナビしたらリセット
  const handlePrev = useCallback(() => {
    if (playing) stopSlideshow();
    onPrev();
  }, [playing, stopSlideshow, onPrev]);

  const handleNext = useCallback(() => {
    if (playing) stopSlideshow();
    onNext();
  }, [playing, stopSlideshow, onNext]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") { stopSlideshow(); onClose(); }
    if (e.key === "ArrowLeft") handlePrev();
    if (e.key === "ArrowRight") handleNext();
    if (e.key === " ") { e.preventDefault(); toggleSlideshow(); }
  }, [onClose, handlePrev, handleNext, toggleSlideshow, stopSlideshow]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [handleKeyDown]);

  // 最後の画像でスライドショーが止まらないよう onNext が変わったらインターバル再設定
  useEffect(() => {
    if (!playing) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => { onNext(); }, SLIDESHOW_INTERVAL);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [playing, onNext]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95" onClick={onClose}>
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-gray-900/80 flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-gray-400 text-sm">{index + 1} / {total}</span>
        <span className="text-gray-200 text-sm font-medium truncate mx-4 max-w-md">{image.filename}</span>
        <div className="flex items-center gap-2">
          {/* スライドショーボタン */}
          <button
            onClick={toggleSlideshow}
            title={`スライドショー (Space) — ${SLIDESHOW_INTERVAL / 1000}秒`}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              playing
                ? "bg-blue-600 text-white"
                : "bg-gray-700 hover:bg-gray-600 text-gray-300"
            }`}
          >
            {playing ? "⏸ 停止" : "▶ スライドショー"}
          </button>
          <button
            onClick={() => onDelete(image)}
            className="px-3 py-1.5 bg-red-600/80 hover:bg-red-500 text-white text-sm rounded-lg transition-colors"
          >
            削除
          </button>
          <button
            onClick={() => { stopSlideshow(); onClose(); }}
            className="text-gray-400 hover:text-white transition-colors p-1"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Image area */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden">
        <button
          onClick={(e) => { e.stopPropagation(); handlePrev(); }}
          className="absolute left-4 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/80 transition-colors"
          aria-label="Previous"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="max-w-full max-h-full flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={image.filename}
            className="max-w-full max-h-[calc(100vh-160px)] object-contain select-none"
            draggable={false}
          />
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); handleNext(); }}
          className="absolute right-4 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/80 transition-colors"
          aria-label="Next"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* スライドショー進行バー */}
        {playing && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-700">
            <div
              className="h-full bg-blue-500"
              style={{ animation: `progress ${SLIDESHOW_INTERVAL}ms linear` }}
            />
          </div>
        )}
      </div>

      {/* Bottom info bar */}
      <div
        className="flex items-center gap-6 px-4 py-3 bg-gray-900/80 flex-shrink-0 text-sm text-gray-400"
        onClick={(e) => e.stopPropagation()}
      >
        <span><span className="text-gray-500">Path: </span><span className="text-gray-300">{image.path}</span></span>
        <span><span className="text-gray-500">Size: </span><span className="text-gray-300">{formatBytes(image.size)}</span></span>
        {image.category && (
          <span><span className="text-gray-500">Category: </span><span className="text-blue-400">{image.category}</span></span>
        )}
        <span>
          <span className="text-gray-500">Modified: </span>
          <span className="text-gray-300">{new Date(image.mtime).toLocaleDateString("ja-JP")}</span>
        </span>
      </div>
    </div>
  );
}
