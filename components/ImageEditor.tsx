"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { ImageItem } from "@/types";

type FilterType = "none" | "mono" | "sepia" | "vivid" | "blur";
type TabType = "adjust" | "transform" | "filter" | "crop" | "resize";

type EditSettings = {
  brightness: number;
  contrast: number;
  saturation: number;
  sharpness: number;
  filter: FilterType;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  crop: { x: number; y: number; w: number; h: number } | null;
  cropEnabled: boolean;
  resize: { w: number; h: number; lock: boolean } | null;
  resizeEnabled: boolean;
  rembg: boolean;
  saveAs: "copy" | "overwrite";
};

const DEFAULT_SETTINGS: EditSettings = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  sharpness: 100,
  filter: "none",
  rotation: 0,
  flipH: false,
  flipV: false,
  crop: null,
  cropEnabled: false,
  resize: null,
  resizeEnabled: false,
  rembg: false,
  saveAs: "copy",
};

type Props = {
  image: ImageItem;
  apiBase: string;
  onClose: () => void;
  onSaved: (newPath: string) => void;
};

const FILTER_CSS: Record<FilterType, string> = {
  none: "",
  mono: "grayscale(100%)",
  sepia: "sepia(80%)",
  vivid: "saturate(160%) contrast(110%)",
  blur: "blur(2px)",
};

const FILTER_LABELS: Record<FilterType, string> = {
  none: "なし",
  mono: "モノクロ",
  sepia: "セピア",
  vivid: "ビビッド",
  blur: "ぼかし",
};

const TABS: { key: TabType; label: string }[] = [
  { key: "adjust", label: "調整" },
  { key: "transform", label: "変換" },
  { key: "filter", label: "フィルター" },
  { key: "crop", label: "切り抜き" },
  { key: "resize", label: "リサイズ" },
];

type SliderRowProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  onReset: () => void;
};

function SliderRow({ label, value, min, max, onChange, onReset }: SliderRowProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-gray-400 text-xs w-20 flex-shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-blue-500"
      />
      <span className="text-gray-300 text-xs w-8 text-right tabular-nums">{value}</span>
      <button
        onClick={onReset}
        className="text-gray-500 hover:text-gray-300 text-xs transition-colors w-10 flex-shrink-0"
      >
        リセット
      </button>
    </div>
  );
}

export default function ImageEditor({ image, apiBase, onClose, onSaved }: Props) {
  const [settings, setSettings] = useState<EditSettings>(DEFAULT_SETTINGS);
  const [activeTab, setActiveTab] = useState<TabType>("adjust");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // 元画像の width/height（縦横比ロック用）
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });

  const imgSrc = `${apiBase}/api/images/file/${encodeURIComponent(image.path).replace(/%2F/g, "/")}`;

  const update = useCallback(<K extends keyof EditSettings>(key: K, value: EditSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaveSuccess(false);
    setSaveError(null);
  }, []);

  // CSS filter preview
  const previewFilter = useMemo(() => {
    const parts: string[] = [];
    parts.push(`brightness(${settings.brightness}%)`);
    parts.push(`contrast(${settings.contrast}%)`);
    parts.push(`saturate(${settings.saturation}%)`);
    if (settings.filter === "mono")  parts.push("grayscale(100%)");
    if (settings.filter === "sepia") parts.push("sepia(80%)");
    if (settings.filter === "vivid") parts.push("saturate(160%) contrast(110%)");
    if (settings.filter === "blur")  parts.push("blur(2px)");
    return parts.join(" ");
  }, [settings]);

  const previewTransform = useMemo(() => {
    const parts: string[] = [];
    parts.push(`rotate(${settings.rotation}deg)`);
    if (settings.flipH) parts.push("scaleX(-1)");
    if (settings.flipV) parts.push("scaleY(-1)");
    return parts.join(" ");
  }, [settings]);

  // リサイズ: 縦横比ロック
  const handleResizeW = useCallback((newW: number) => {
    setSettings((prev) => {
      if (!prev.resize) return prev;
      if (prev.resize.lock && naturalSize.w > 0) {
        const ratio = naturalSize.h / naturalSize.w;
        return { ...prev, resize: { ...prev.resize, w: newW, h: Math.round(newW * ratio) } };
      }
      return { ...prev, resize: { ...prev.resize, w: newW } };
    });
  }, [naturalSize]);

  const handleResizeH = useCallback((newH: number) => {
    setSettings((prev) => {
      if (!prev.resize) return prev;
      if (prev.resize.lock && naturalSize.h > 0) {
        const ratio = naturalSize.w / naturalSize.h;
        return { ...prev, resize: { ...prev.resize, h: newH, w: Math.round(newH * ratio) } };
      }
      return { ...prev, resize: { ...prev.resize, h: newH } };
    });
  }, [naturalSize]);

  // 画像ロード時に naturalSize をセット
  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    // リサイズのデフォルト値を元画像サイズで初期化
    setSettings((prev) => ({
      ...prev,
      resize: prev.resize ?? { w: img.naturalWidth, h: img.naturalHeight, lock: true },
      crop: prev.crop ?? { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight },
    }));
  }, []);

  // 保存処理
  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    const body = {
      path: image.path,
      brightness: settings.brightness,
      contrast: settings.contrast,
      saturation: settings.saturation,
      sharpness: settings.sharpness,
      filter: settings.filter,
      rotation: settings.rotation,
      flipH: settings.flipH,
      flipV: settings.flipV,
      crop: settings.cropEnabled && settings.crop
        ? `${settings.crop.x},${settings.crop.y},${settings.crop.w},${settings.crop.h}`
        : null,
      resize: settings.resizeEnabled && settings.resize
        ? `${settings.resize.w},${settings.resize.h}`
        : null,
      rembg: settings.rembg,
      saveAs: settings.saveAs,
    };
    try {
      const res = await fetch(`${apiBase}/api/images/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setSaving(false);
      if (data.ok) {
        setSaveSuccess(true);
        onSaved(data.path);
      } else {
        setSaveError(data.error ?? "保存に失敗しました");
      }
    } catch (e) {
      setSaving(false);
      setSaveError(e instanceof Error ? e.message : "保存に失敗しました");
    }
  }, [settings, image.path, apiBase, onSaved]);

  // Esc で閉じる
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl flex flex-col w-full max-w-4xl max-h-[90vh] overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800 flex-shrink-0">
        <h2 className="text-sm font-semibold text-gray-100">画像編集</h2>
        <span className="text-gray-500 text-xs truncate mx-4 max-w-xs">{image.filename}</span>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-300 transition-colors p-1"
          aria-label="閉じる"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-800 flex-shrink-0 px-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.key
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Preview (left) */}
        <div className="flex-1 flex items-center justify-center bg-gray-950 p-4 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imgSrc}
            alt={image.filename}
            onLoad={handleImageLoad}
            className="max-w-full max-h-full object-contain rounded"
            style={{
              filter: previewFilter || undefined,
              transform: previewTransform || undefined,
              transition: "filter 0.15s ease, transform 0.15s ease",
            }}
            draggable={false}
          />
        </div>

        {/* Controls (right) */}
        <div className="w-72 flex flex-col border-l border-gray-800 flex-shrink-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">

            {/* 調整タブ */}
            {activeTab === "adjust" && (
              <div className="space-y-4">
                <SliderRow
                  label="明るさ"
                  value={settings.brightness}
                  min={50} max={150}
                  onChange={(v) => update("brightness", v)}
                  onReset={() => update("brightness", 100)}
                />
                <SliderRow
                  label="コントラスト"
                  value={settings.contrast}
                  min={50} max={150}
                  onChange={(v) => update("contrast", v)}
                  onReset={() => update("contrast", 100)}
                />
                <SliderRow
                  label="彩度"
                  value={settings.saturation}
                  min={0} max={200}
                  onChange={(v) => update("saturation", v)}
                  onReset={() => update("saturation", 100)}
                />
                <SliderRow
                  label="シャープネス"
                  value={settings.sharpness}
                  min={50} max={150}
                  onChange={(v) => update("sharpness", v)}
                  onReset={() => update("sharpness", 100)}
                />
              </div>
            )}

            {/* 変換タブ */}
            {activeTab === "transform" && (
              <div className="space-y-5">
                <div>
                  <p className="text-xs text-gray-400 mb-2">回転</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => update("rotation", (settings.rotation - 90 + 360) % 360)}
                      className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
                      title="反時計回り 90°"
                    >
                      ↺ 90°
                    </button>
                    <button
                      onClick={() => update("rotation", (settings.rotation + 180) % 360)}
                      className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
                    >
                      180°
                    </button>
                    <button
                      onClick={() => update("rotation", (settings.rotation + 90) % 360)}
                      className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
                      title="時計回り 90°"
                    >
                      ↻ 90°
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5 text-center">{settings.rotation}°</p>
                </div>

                <div>
                  <p className="text-xs text-gray-400 mb-2">反転</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => update("flipH", !settings.flipH)}
                      className={`flex-1 py-2 text-sm rounded-lg transition-colors ${
                        settings.flipH
                          ? "bg-blue-600 text-white"
                          : "bg-gray-800 hover:bg-gray-700 text-gray-300"
                      }`}
                    >
                      ↔ 水平
                    </button>
                    <button
                      onClick={() => update("flipV", !settings.flipV)}
                      className={`flex-1 py-2 text-sm rounded-lg transition-colors ${
                        settings.flipV
                          ? "bg-blue-600 text-white"
                          : "bg-gray-800 hover:bg-gray-700 text-gray-300"
                      }`}
                    >
                      ↕ 垂直
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* フィルタータブ */}
            {activeTab === "filter" && (
              <div>
                <p className="text-xs text-gray-400 mb-3">フィルター</p>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(FILTER_CSS) as FilterType[]).map((f) => (
                    <button
                      key={f}
                      onClick={() => update("filter", f)}
                      className={`flex flex-col items-center gap-1.5 p-1.5 rounded-lg border transition-colors ${
                        settings.filter === f
                          ? "border-blue-500 bg-blue-900/30"
                          : "border-gray-700 hover:border-gray-500 bg-gray-800/50"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imgSrc}
                        alt={f}
                        className="w-full h-12 object-cover rounded"
                        style={{ filter: FILTER_CSS[f] || undefined }}
                        draggable={false}
                      />
                      <span className="text-xs text-gray-300">{FILTER_LABELS[f]}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 切り抜きタブ */}
            {activeTab === "crop" && (
              <div className="space-y-3">
                {naturalSize.w > 0 && (
                  <p className="text-xs text-gray-500">
                    元サイズ: {naturalSize.w} × {naturalSize.h} px
                  </p>
                )}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.cropEnabled}
                    onChange={(e) => update("cropEnabled", e.target.checked)}
                    className="w-4 h-4 rounded accent-blue-500"
                  />
                  <span className="text-sm text-gray-300">切り抜きを有効にする</span>
                </label>
                {settings.crop && (
                  <div className={`space-y-3 ${!settings.cropEnabled ? "opacity-40 pointer-events-none" : ""}`}>
                    <div className="grid grid-cols-2 gap-2">
                      {(["x", "y", "w", "h"] as const).map((key) => (
                        <div key={key}>
                          <label className="text-xs text-gray-400 mb-1 block">
                            {key === "x" ? "X (左端)" : key === "y" ? "Y (上端)" : key === "w" ? "幅" : "高さ"}
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={settings.crop?.[key] ?? 0}
                            onChange={(e) => {
                              const v = Math.max(0, Number(e.target.value));
                              setSettings((prev) => ({
                                ...prev,
                                crop: prev.crop ? { ...prev.crop, [key]: v } : null,
                              }));
                            }}
                            className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500">単位: ピクセル</p>
                  </div>
                )}
              </div>
            )}

            {/* リサイズタブ */}
            {activeTab === "resize" && (
              <div className="space-y-3">
                {naturalSize.w > 0 && (
                  <p className="text-xs text-gray-500">
                    元サイズ: {naturalSize.w} × {naturalSize.h} px
                  </p>
                )}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.resizeEnabled}
                    onChange={(e) => update("resizeEnabled", e.target.checked)}
                    className="w-4 h-4 rounded accent-blue-500"
                  />
                  <span className="text-sm text-gray-300">リサイズを有効にする</span>
                </label>
                {settings.resize && (
                  <div className={`space-y-3 ${!settings.resizeEnabled ? "opacity-40 pointer-events-none" : ""}`}>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <label className="text-xs text-gray-400 mb-1 block">幅 (px)</label>
                        <input
                          type="number"
                          min={1}
                          value={settings.resize.w}
                          onChange={(e) => handleResizeW(Math.max(1, Number(e.target.value)))}
                          className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <button
                        onClick={() =>
                          setSettings((prev) => ({
                            ...prev,
                            resize: prev.resize ? { ...prev.resize, lock: !prev.resize.lock } : null,
                          }))
                        }
                        className={`mt-4 p-1.5 rounded-lg text-lg transition-colors ${
                          settings.resize.lock
                            ? "text-blue-400 bg-blue-900/30"
                            : "text-gray-500 hover:text-gray-300 bg-gray-800"
                        }`}
                        title={settings.resize.lock ? "縦横比ロック中" : "縦横比フリー"}
                      >
                        {settings.resize.lock ? "🔒" : "🔓"}
                      </button>
                      <div className="flex-1">
                        <label className="text-xs text-gray-400 mb-1 block">高さ (px)</label>
                        <input
                          type="number"
                          min={1}
                          value={settings.resize.h}
                          onChange={(e) => handleResizeH(Math.max(1, Number(e.target.value)))}
                          className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer: rembg + save */}
          <div className="border-t border-gray-800 p-4 space-y-3 flex-shrink-0">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.rembg}
                onChange={(e) => update("rembg", e.target.checked)}
                className="w-4 h-4 rounded accent-blue-500"
              />
              <span className="text-xs text-gray-300">背景除去 (rembg)</span>
            </label>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="saveAs"
                  value="copy"
                  checked={settings.saveAs === "copy"}
                  onChange={() => update("saveAs", "copy")}
                  className="accent-blue-500"
                />
                <span className="text-xs text-gray-300">コピーとして保存</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="saveAs"
                  value="overwrite"
                  checked={settings.saveAs === "overwrite"}
                  onChange={() => update("saveAs", "overwrite")}
                  className="accent-blue-500"
                />
                <span className="text-xs text-gray-300">上書き保存</span>
              </label>
            </div>

            {saveError && (
              <p className="text-xs text-red-400 break-all">{saveError}</p>
            )}
            {saveSuccess && (
              <p className="text-xs text-green-400">✓ 保存しました</p>
            )}

            <button
              onClick={handleSave}
              disabled={saving || saveSuccess}
              className={`w-full py-2 rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                saveSuccess
                  ? "bg-green-700 text-green-200"
                  : saving
                  ? "bg-gray-700 text-gray-400"
                  : "bg-blue-600 hover:bg-blue-500 text-white"
              }`}
            >
              {saving ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <span className="inline-block w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                  保存中...
                </span>
              ) : saveSuccess ? (
                "✓ 保存しました"
              ) : (
                "保存"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
