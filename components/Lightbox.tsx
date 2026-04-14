"use client";

import { useEffect, useCallback, useState, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ImageItem, USAGE_TAGS } from "@/types";

type Props = {
  image: ImageItem;
  index: number;
  total: number;
  apiBase: string;
  prevImage?: ImageItem;
  nextImage?: ImageItem;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onDelete: (image: ImageItem) => void;
  onUsageTagsChange?: (path: string, tags: string[]) => void;
  onEdit?: () => void;
};

// タグの色クラスマップ
const TAG_COLOR_CLASSES: Record<string, { pill: string; badge: string }> = {
  violet: {
    pill: "bg-violet-900/60 text-violet-300 border border-violet-700/50",
    badge: "bg-violet-800 hover:bg-violet-700 text-violet-200",
  },
  blue: {
    pill: "bg-blue-900/60 text-blue-300 border border-blue-700/50",
    badge: "bg-blue-800 hover:bg-blue-700 text-blue-200",
  },
  green: {
    pill: "bg-green-900/60 text-green-300 border border-green-700/50",
    badge: "bg-green-800 hover:bg-green-700 text-green-200",
  },
  orange: {
    pill: "bg-orange-900/60 text-orange-300 border border-orange-700/50",
    badge: "bg-orange-800 hover:bg-orange-700 text-orange-200",
  },
  pink: {
    pill: "bg-pink-900/60 text-pink-300 border border-pink-700/50",
    badge: "bg-pink-800 hover:bg-pink-700 text-pink-200",
  },
  yellow: {
    pill: "bg-yellow-900/60 text-yellow-300 border border-yellow-700/50",
    badge: "bg-yellow-800 hover:bg-yellow-700 text-yellow-200",
  },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const SHORTCUTS = [
  { key: "← →", desc: "前 / 次の画像" },
  { key: "Esc", desc: "閉じる（ズーム中はリセット）" },
  { key: "+ −", desc: "ズームイン / アウト" },
  { key: "0", desc: "ズームリセット" },
  { key: "ダブルクリック", desc: "ズームイン / リセット" },
  { key: "ホイール", desc: "ズーム（カーソル中心）" },
  { key: "ドラッグ", desc: "ズーム中に移動" },
  { key: "?", desc: "このヘルプを表示" },
];

function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-80 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-100">キーボードショートカット</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-xs transition-colors"
          >
            ✕
          </button>
        </div>
        <div className="space-y-2">
          {SHORTCUTS.map(({ key, desc }) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <kbd className="px-2 py-0.5 bg-gray-800 border border-gray-600 rounded text-xs text-gray-300 font-mono whitespace-nowrap">
                {key}
              </kbd>
              <span className="text-xs text-gray-400 text-right">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Lightbox({
  image, index, total, apiBase,
  prevImage, nextImage,
  onClose, onPrev, onNext, onDelete, onUsageTagsChange, onEdit,
}: Props) {
  const src = `${apiBase}/api/images/file/${encodeURIComponent(image.path).replace(/%2F/g, "/")}`;

  // 利用先タグ
  const [usageTags, setUsageTags] = useState<string[]>(image.usage_tags ?? []);
  const [showTagDropdown, setShowTagDropdown] = useState(false);

  const handleAddTag = useCallback(async (tagValue: string) => {
    const prev = usageTags;
    const next = [...prev, tagValue];
    setUsageTags(next);
    setShowTagDropdown(false);
    try {
      const res = await fetch("/api/images/usage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: image.path, tags: next }),
      });
      if (!res.ok) throw new Error("Failed");
      onUsageTagsChange?.(image.path, next);
    } catch (e) {
      console.error(e);
      setUsageTags(prev);
    }
  }, [usageTags, image.path, onUsageTagsChange]);

  const handleRemoveTag = useCallback(async (tagValue: string) => {
    const prev = usageTags;
    const next = prev.filter((t) => t !== tagValue);
    setUsageTags(next);
    try {
      const res = await fetch("/api/images/usage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: image.path, tags: next }),
      });
      if (!res.ok) throw new Error("Failed");
      onUsageTagsChange?.(image.path, next);
    } catch (e) {
      console.error(e);
      setUsageTags(prev);
    }
  }, [usageTags, image.path, onUsageTagsChange]);

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

  // クリップボードコピー
  const [copyStatus, setCopyStatus] = useState<"idle" | "copying" | "done" | "error">("idle");
  const handleCopy = useCallback(async () => {
    setCopyStatus("copying");
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const type = blob.type.startsWith("image/") ? blob.type : "image/png";
      await navigator.clipboard.write([new ClipboardItem({ [type]: blob })]);
      setCopyStatus("done");
    } catch {
      setCopyStatus("error");
    } finally {
      setTimeout(() => setCopyStatus("idle"), 2000);
    }
  }, [src]);

  // ショートカット一覧
  const [showShortcuts, setShowShortcuts] = useState(false);

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
    setCopyStatus("idle");
    setUsageTags(image.usage_tags ?? []);
    setShowTagDropdown(false);
  }, [image.path, image.usage_tags]);

  // 隣接画像のプリロード
  useEffect(() => {
    const toCleanup: HTMLLinkElement[] = [];
    [prevImage, nextImage].forEach((img) => {
      if (!img) return;
      const href = `${apiBase}/api/images/file/${encodeURIComponent(img.path).replace(/%2F/g, "/")}`;
      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "image";
      link.href = href;
      document.head.appendChild(link);
      toCleanup.push(link);
    });
    return () => {
      toCleanup.forEach((link) => {
        if (document.head.contains(link)) document.head.removeChild(link);
      });
    };
  }, [prevImage?.path, nextImage?.path, apiBase]);

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

  // ── キーボード ────────────────────────────────────────────
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (showShortcuts) {
      if (e.key === "Escape" || e.key === "?") setShowShortcuts(false);
      return;
    }
    if (e.key === "?") { setShowShortcuts(true); return; }
    if (e.key === "Escape") {
      if (isZoomed) { setView({ zoom: 1, x: 0, y: 0 }); return; }
      onClose();
    }
    if (e.key === "ArrowLeft") onPrev();
    if (e.key === "ArrowRight") onNext();
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
  }, [isZoomed, showShortcuts, onClose, onPrev, onNext]);

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
          {/* クリップボードコピー */}
          <button
            onClick={handleCopy}
            disabled={copyStatus === "copying"}
            title="クリップボードにコピー"
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors disabled:cursor-not-allowed ${
              copyStatus === "done"
                ? "bg-green-700 text-green-200"
                : copyStatus === "error"
                ? "bg-red-700/80 text-white"
                : copyStatus === "copying"
                ? "bg-gray-700 text-gray-400"
                : "bg-gray-700 hover:bg-gray-600 text-gray-300"
            }`}
          >
            {copyStatus === "copying" && (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                コピー中
              </span>
            )}
            {copyStatus === "done" && "✓ コピー済み"}
            {copyStatus === "error" && "✗ 失敗"}
            {copyStatus === "idle" && "コピー"}
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
          {onEdit && (
            <button
              onClick={onEdit}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg transition-colors"
            >
              編集
            </button>
          )}
          <button
            onClick={() => onDelete(image)}
            className="px-3 py-1.5 bg-red-600/80 hover:bg-red-500 text-white text-sm rounded-lg transition-colors"
          >
            削除
          </button>
          {/* ショートカットヘルプ */}
          <button
            onClick={() => setShowShortcuts(true)}
            title="キーボードショートカット (?)"
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-gray-200 text-sm font-mono transition-colors"
          >
            ?
          </button>
          <button
            onClick={onClose}
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
            onClick={(e) => { e.stopPropagation(); onPrev(); }}
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
            onClick={(e) => { e.stopPropagation(); onNext(); }}
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
      </div>

      {/* Bottom info bar */}
      <div
        className="flex items-center gap-4 px-4 py-3 bg-gray-900/80 flex-shrink-0 text-sm text-gray-400 flex-wrap"
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

        {/* 利用先タグ（区切り線付き） */}
        <div className="flex items-center gap-2 border-l border-gray-700 pl-4 flex-wrap">
          <span className="text-gray-500 text-xs flex-shrink-0">利用先:</span>
          {usageTags.map((tagValue) => {
            const tagDef = USAGE_TAGS.find((t) => t.value === tagValue);
            if (!tagDef) return null;
            const colors = TAG_COLOR_CLASSES[tagDef.color] ?? TAG_COLOR_CLASSES.blue;
            return (
              <span
                key={tagValue}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${colors.pill}`}
              >
                {tagDef.label}
                <button
                  onClick={() => handleRemoveTag(tagValue)}
                  className="hover:text-white transition-colors leading-none"
                  aria-label={`${tagDef.label}を削除`}
                >
                  ×
                </button>
              </span>
            );
          })}

          {/* + ボタン + ドロップダウン */}
          <div className="relative">
            <button
              onClick={() => setShowTagDropdown((v) => !v)}
              className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white text-sm transition-colors"
              aria-label="タグを追加"
            >
              +
            </button>
            {showTagDropdown && (
              <div className="absolute bottom-8 left-0 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-10 min-w-[120px] py-1">
                {USAGE_TAGS.filter((t) => !usageTags.includes(t.value)).map((t) => {
                  const colors = TAG_COLOR_CLASSES[t.color] ?? TAG_COLOR_CLASSES.blue;
                  return (
                    <button
                      key={t.value}
                      onClick={() => handleAddTag(t.value)}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700 transition-colors ${colors.badge.split(" ").filter((c) => c.startsWith("text-")).join(" ")} text-gray-200 hover:text-white`}
                    >
                      {t.label}
                    </button>
                  );
                })}
                {USAGE_TAGS.filter((t) => !usageTags.includes(t.value)).length === 0 && (
                  <p className="px-3 py-1.5 text-xs text-gray-500">すべて付与済み</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* キーボードショートカット一覧 */}
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
    </div>
  );
}
