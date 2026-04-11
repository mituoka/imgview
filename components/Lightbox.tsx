"use client";

import { useEffect, useCallback, useState, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
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
  onFindSimilar: (path: string) => void;
};

const SLIDESHOW_INTERVAL = 3000;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Lightbox({
  image, index, total, apiBase,
  onClose, onPrev, onNext, onDelete, onFindSimilar,
}: Props) {
  const src = `${apiBase}/api/images/file/${encodeURIComponent(image.path).replace(/%2F/g, "/")}`;
  const [playing, setPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // QR共有
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const showQr = useCallback(async () => {
    const res = await fetch(`${apiBase}/api/local-ip`).then((r) => r.json());
    const port = window.location.port ? `:${window.location.port}` : "";
    const fileUrl = `/api/images/file/${encodeURIComponent(image.path).replace(/%2F/g, "/")}`;
    setQrUrl(`http://${res.ip}${port}${fileUrl}`);
  }, [apiBase, image.path]);

  // 高画質化
  const [upscaleStatus, setUpscaleStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const runUpscale = useCallback(async () => {
    setUpscaleStatus("running");
    try {
      const res = await fetch(`${apiBase}/api/run-imgtools`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "upscale", file: image.path }),
      });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const raw = part.replace(/^data: /, "").trim();
          if (!raw) continue;
          try {
            const msg = JSON.parse(raw);
            if (msg.done) setUpscaleStatus(msg.exitCode === 0 ? "done" : "error");
          } catch { /* ignore */ }
        }
      }
    } catch {
      setUpscaleStatus("error");
    }
  }, [apiBase, image.path]);

  // ── ズーム state ──────────────────────────────────────────
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, ox: 0, oy: 0 });
  const isZoomed = view.zoom > 1.001;

  // 画像が変わったらリセット
  useEffect(() => {
    setView({ zoom: 1, x: 0, y: 0 });
    setUpscaleStatus("idle");
    setQrUrl(null);
  }, [image.path]);

  // ホイールズーム（カーソル位置を中心に）
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - (rect.left + rect.width / 2);
      const mouseY = e.clientY - (rect.top + rect.height / 2);
      setView((prev) => {
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        const newZoom = Math.min(Math.max(prev.zoom * factor, 1), 8);
        if (newZoom <= 1) return { zoom: 1, x: 0, y: 0 };
        const scaleDelta = newZoom / prev.zoom;
        return {
          zoom: newZoom,
          x: mouseX - scaleDelta * (mouseX - prev.x),
          y: mouseY - scaleDelta * (mouseY - prev.y),
        };
      });
    };
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, []);

  // ドラッグ（ズーム中のみ）
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (!isZoomed) return;
    e.preventDefault();
    e.stopPropagation();
    isDragging.current = true;
    dragStart.current = { mx: e.clientX, my: e.clientY, ox: view.x, oy: view.y };
  }, [isZoomed, view.x, view.y]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - dragStart.current.mx;
      const dy = e.clientY - dragStart.current.my;
      setView((prev) => ({ ...prev, x: dragStart.current.ox + dx, y: dragStart.current.oy + dy }));
    };
    const onUp = () => { isDragging.current = false; };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  // ダブルクリック：ズームイン ↔ リセット
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (isZoomed) {
      setView({ zoom: 1, x: 0, y: 0 });
      return;
    }
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - (rect.left + rect.width / 2);
    const mouseY = e.clientY - (rect.top + rect.height / 2);
    setView({ zoom: 2.5, x: -mouseX * 1.5, y: -mouseY * 1.5 });
  }, [isZoomed]);

  // ── スライドショー ────────────────────────────────────────
  const stopSlideshow = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setPlaying(false);
  }, []);

  const startSlideshow = useCallback(() => {
    setPlaying(true);
    intervalRef.current = setInterval(() => { onNext(); }, SLIDESHOW_INTERVAL);
  }, [onNext]);

  const toggleSlideshow = useCallback(() => {
    playing ? stopSlideshow() : startSlideshow();
  }, [playing, startSlideshow, stopSlideshow]);

  const handlePrev = useCallback(() => {
    if (playing) stopSlideshow();
    onPrev();
  }, [playing, stopSlideshow, onPrev]);

  const handleNext = useCallback(() => {
    if (playing) stopSlideshow();
    onNext();
  }, [playing, stopSlideshow, onNext]);

  // ── キーボード ────────────────────────────────────────────
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      if (isZoomed) { setView({ zoom: 1, x: 0, y: 0 }); return; }
      stopSlideshow(); onClose();
    }
    if (e.key === "ArrowLeft") handlePrev();
    if (e.key === "ArrowRight") handleNext();
    if (e.key === " ") { e.preventDefault(); toggleSlideshow(); }
    if (e.key === "+" || e.key === "=") {
      setView((prev) => {
        const newZoom = Math.min(prev.zoom * 1.3, 8);
        return { ...prev, zoom: newZoom };
      });
    }
    if (e.key === "-") {
      setView((prev) => {
        const newZoom = Math.max(prev.zoom / 1.3, 1);
        return newZoom <= 1 ? { zoom: 1, x: 0, y: 0 } : { ...prev, zoom: newZoom };
      });
    }
    if (e.key === "0") setView({ zoom: 1, x: 0, y: 0 });
  }, [isZoomed, onClose, handlePrev, handleNext, toggleSlideshow, stopSlideshow]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [handleKeyDown]);

  // スライドショー中に onNext が変わったらインターバル再設定
  useEffect(() => {
    if (!playing) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => { onNext(); }, SLIDESHOW_INTERVAL);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [playing, onNext]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
      onClick={isZoomed ? undefined : onClose}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-gray-900/80 flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-gray-400 text-sm">{index + 1} / {total}</span>
        <span className="text-gray-200 text-sm font-medium truncate mx-4 max-w-md">{image.filename}</span>
        <div className="flex items-center gap-2">
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
            onClick={() => qrUrl ? setQrUrl(null) : showQr()}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              qrUrl ? "bg-blue-600 text-white" : "bg-gray-700 hover:bg-gray-600 text-gray-300"
            }`}
          >
            QR
          </button>
          <button
            onClick={() => onFindSimilar(image.path)}
            title="この画像に似た画像を探す"
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg transition-colors"
          >
            類似を探す
          </button>
          <button
            onClick={runUpscale}
            disabled={upscaleStatus === "running" || upscaleStatus === "done"}
            title="Upscaylで高画質化（元ファイルは置き換えられます）"
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors disabled:cursor-not-allowed ${
              upscaleStatus === "running"
                ? "bg-purple-700 text-purple-200"
                : upscaleStatus === "done"
                ? "bg-green-700 text-green-200"
                : upscaleStatus === "error"
                ? "bg-red-700/80 hover:bg-red-600 text-white"
                : "bg-gray-700 hover:bg-gray-600 text-gray-300"
            }`}
          >
            {upscaleStatus === "running" && (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 border-2 border-purple-300 border-t-transparent rounded-full animate-spin" />
                高画質化中...
              </span>
            )}
            {upscaleStatus === "done" && "✓ 高画質化済み"}
            {upscaleStatus === "error" && "✗ 再試行"}
            {upscaleStatus === "idle" && "高画質化"}
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
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center relative overflow-hidden"
        style={{ cursor: isZoomed ? (isDragging.current ? "grabbing" : "grab") : "default" }}
      >
        {/* 前へ（ズーム中は非表示） */}
        {!isZoomed && (
          <button
            onClick={(e) => { e.stopPropagation(); handlePrev(); }}
            className="absolute left-4 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/80 transition-colors"
            aria-label="Previous"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        <div
          className="max-w-full max-h-full flex items-center justify-center p-4 select-none"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={handleMouseDown}
          onDoubleClick={handleDoubleClick}
          style={{
            transform: `scale(${view.zoom}) translate(${view.x / view.zoom}px, ${view.y / view.zoom}px)`,
            transformOrigin: "center center",
            transition: isDragging.current ? "none" : "transform 0.1s ease-out",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={image.filename}
            className="max-w-full max-h-[calc(100vh-160px)] object-contain"
            draggable={false}
          />
        </div>

        {/* 次へ（ズーム中は非表示） */}
        {!isZoomed && (
          <button
            onClick={(e) => { e.stopPropagation(); handleNext(); }}
            className="absolute right-4 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/80 transition-colors"
            aria-label="Next"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}

        {/* QRコードポップアップ */}
        {qrUrl && (
          <div
            className="absolute top-4 right-4 bg-white rounded-xl p-4 shadow-2xl z-20 flex flex-col items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <QRCodeSVG value={qrUrl} size={180} />
            <p className="text-gray-600 text-xs text-center max-w-[180px] break-all">{qrUrl}</p>
          </div>
        )}

        {/* ズームレベルバッジ */}
        {isZoomed && (
          <div className="absolute bottom-4 right-4 flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); setView({ zoom: 1, x: 0, y: 0 }); }}
              className="px-2.5 py-1 bg-black/70 hover:bg-black/90 text-white text-xs rounded-full transition-colors"
            >
              ×{view.zoom.toFixed(1)} リセット
            </button>
          </div>
        )}

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
        {isZoomed && (
          <span className="ml-auto text-gray-500 text-xs">
            ホイール: ズーム｜ドラッグ: 移動｜ダブルクリック/0: リセット
          </span>
        )}
      </div>
    </div>
  );
}
