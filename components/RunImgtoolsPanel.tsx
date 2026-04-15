"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { FolderInfo } from "@/types";

type Command = "scan" | "analyze" | "auto" | "upscale" | "tag" | "suggest";
type Status = "idle" | "running" | "done" | "error";

type Section = {
  label: string;
  commands: { id: Command; label: string; desc: string }[];
};

const SECTIONS: Section[] = [
  {
    label: "ライブラリ",
    commands: [
      { id: "scan",    label: "スキャン",    desc: "画像の統計・概要を表示" },
      { id: "auto",    label: "全自動更新",  desc: "移動 → 分類 → フォルダ整理" },
      { id: "suggest", label: "誤分類チェック", desc: "現在のフォルダの誤分類を検出・移動提案" },
    ],
  },
  {
    label: "AI処理",
    commands: [
      { id: "analyze", label: "AI一括処理",      desc: "分類 → 品質チェック → キャプション → ベクトル化" },
      { id: "tag",     label: "用途タグ自動付与", desc: "カテゴリをもとに用途タグを一括付与" },
    ],
  },
  {
    label: "編集",
    commands: [
      { id: "upscale", label: "高画質化", desc: "Upscaylで画像をアップスケール" },
    ],
  },
];

const UPSCALE_MODELS = [
  { id: "upscayl-standard-4x", label: "Standard（写真向け）" },
  { id: "ultrasharp-4x", label: "Ultra Sharp" },
  { id: "high-fidelity-4x", label: "High Fidelity" },
  { id: "remacri-4x", label: "Remacri" },
  { id: "ultramix-balanced-4x", label: "Ultramix Balanced" },
  { id: "digital-art-4x", label: "Digital Art（イラスト向け）" },
  { id: "upscayl-lite-4x", label: "Lite（軽量）" },
];

type Props = {
  onComplete: () => void;
  currentFolder?: string | null;
  folders?: FolderInfo[];
  onSuggestMoves?: (folder: string) => void;
};

export default function RunImgtoolsPanel({ onComplete, currentFolder, folders = [], onSuggestMoves }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [runningLabel, setRunningLabel] = useState("");
  const [lines, setLines] = useState<string[]>([]);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // upscale オプション
  const [upscaleOpen, setUpscaleOpen] = useState(false);
  const [upscaleModel, setUpscaleModel] = useState("upscayl-standard-4x");
  const [upscaleScale, setUpscaleScale] = useState(4);
  const [upscaleFolder, setUpscaleFolder] = useState<"current" | "all">("current");

  // suggest オプション
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestSelectedFolder, setSuggestSelectedFolder] = useState<string>("");

  // suggestOpen が開いたとき currentFolder で初期化
  const initSuggest = () => {
    setSuggestSelectedFolder(currentFolder ?? (folders[0]?.name ?? ""));
    setSuggestOpen(true);
  };

  useEffect(() => {
    if (logOpen && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [lines, logOpen]);

  const run = (command: Command, opts?: Record<string, unknown>) => {
    const label = SECTIONS.flatMap((s) => s.commands).find((c) => c.id === command)?.label ?? command;
    setMenuOpen(false);
    setUpscaleOpen(false);
    setSuggestOpen(false);
    setLines([]);
    setExitCode(null);
    setStatus("running");
    setRunningLabel(label);
    setLogOpen(true);

    (async () => {
      try {
        const res = await fetch("/api/run-imgtools", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command, ...opts }),
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
              if (msg.line !== undefined) setLines((prev) => [...prev, msg.line]);
              if (msg.done) {
                setExitCode(msg.exitCode);
                setStatus(msg.exitCode === 0 ? "done" : "error");
                if (msg.exitCode === 0) onComplete();
              }
            } catch { /* ignore */ }
          }
        }
      } catch (e) {
        setLines((prev) => [...prev, `ERROR: ${e}`]);
        setStatus("error");
      }
    })();
  };

  const runUpscale = () => {
    const folder = upscaleFolder === "current" && currentFolder ? currentFolder : undefined;
    run("upscale", { model: upscaleModel, scale: upscaleScale, folder });
  };

  const statusIcon = {
    idle: null,
    running: <span className="inline-block w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />,
    done: <span className="text-green-400 text-xs">✓</span>,
    error: <span className="text-red-400 text-xs">✗</span>,
  }[status];

  return (
    <div className="relative">
      {/* メインボタン行 */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => { setMenuOpen((v) => !v); setUpscaleOpen(false); }}
          disabled={status === "running"}
          className="flex-1 flex items-center gap-2 px-3 py-2 rounded text-sm text-gray-300 hover:bg-gray-800 hover:text-gray-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <span>imgtools 実行</span>
        </button>

        {status !== "idle" && (
          <button
            onClick={() => setLogOpen((v) => !v)}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-gray-800 hover:bg-gray-700 transition-colors"
            title="ログを表示"
          >
            {statusIcon}
            {status === "running" && (
              <span className="text-blue-300 max-w-[60px] truncate">{runningLabel}</span>
            )}
          </button>
        )}
      </div>

      {/* コマンド選択ドロップアップ */}
      {menuOpen && (
        <div className="absolute bottom-full left-0 right-0 mb-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden z-20">
          {SECTIONS.map((section, si) => (
            <div key={section.label}>
              {si > 0 && <div className="border-t border-gray-600" />}
              <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                {section.label}
              </div>
              {section.commands.map((cmd) => (
                <button
                  key={cmd.id}
                  onClick={() => {
                    if (cmd.id === "upscale") {
                      setMenuOpen(false);
                      setUpscaleOpen(true);
                    } else if (cmd.id === "suggest") {
                      setMenuOpen(false);
                      initSuggest();
                    } else {
                      run(cmd.id);
                    }
                  }}
                  className="w-full flex flex-col items-start px-3 py-2 hover:bg-gray-700 transition-colors"
                >
                  <span className="text-sm font-medium text-gray-100">{cmd.label}</span>
                  <span className="text-xs text-gray-400 mt-0.5">{cmd.desc}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* 高画質化オプションパネル */}
      {upscaleOpen && (
        <div className="absolute bottom-full left-0 right-0 mb-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-100">高画質化オプション</span>
            <button onClick={() => setUpscaleOpen(false)} className="text-gray-500 hover:text-gray-300 text-xs">✕</button>
          </div>

          {/* モデル選択 */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">モデル</label>
            <select
              value={upscaleModel}
              onChange={(e) => setUpscaleModel(e.target.value)}
              className="w-full bg-gray-900 text-gray-200 text-xs rounded px-2 py-1.5 border border-gray-600 focus:border-blue-500 focus:outline-none"
            >
              {UPSCALE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* スケール選択 */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">拡大倍率</label>
            <div className="flex gap-1">
              {[2, 3, 4].map((s) => (
                <button
                  key={s}
                  onClick={() => setUpscaleScale(s)}
                  className={`flex-1 py-1 rounded text-xs transition-colors ${
                    upscaleScale === s
                      ? "bg-blue-600 text-white"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  ×{s}
                </button>
              ))}
            </div>
          </div>

          {/* 対象フォルダ */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">対象</label>
            <div className="flex gap-1">
              <button
                onClick={() => setUpscaleFolder("current")}
                disabled={!currentFolder}
                className={`flex-1 py-1 rounded text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  upscaleFolder === "current"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                {currentFolder ?? "現在のフォルダ"}
              </button>
              <button
                onClick={() => setUpscaleFolder("all")}
                className={`flex-1 py-1 rounded text-xs transition-colors ${
                  upscaleFolder === "all"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                全画像
              </button>
            </div>
          </div>

          <button
            onClick={runUpscale}
            className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition-colors"
          >
            実行
          </button>
        </div>
      )}

      {/* 誤分類チェック フォルダ選択パネル */}
      {suggestOpen && (
        <div className="absolute bottom-full left-0 right-0 mb-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-100">誤分類チェック</span>
            <button onClick={() => setSuggestOpen(false)} className="text-gray-500 hover:text-gray-300 text-xs">✕</button>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">対象フォルダ</label>
            <select
              value={suggestSelectedFolder}
              onChange={(e) => setSuggestSelectedFolder(e.target.value)}
              className="w-full bg-gray-900 text-gray-200 text-xs rounded px-2 py-1.5 border border-gray-600 focus:border-blue-500 focus:outline-none"
            >
              {folders.map((f) => (
                <option key={f.name} value={f.name}>{f.label} ({f.count})</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => { setSuggestOpen(false); if (suggestSelectedFolder) onSuggestMoves?.(suggestSelectedFolder); }}
            disabled={!suggestSelectedFolder}
            className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded transition-colors"
          >
            チェック開始
          </button>
        </div>
      )}

      {/* ログパネル */}
      {logOpen && (
        <div className="mt-1 bg-gray-950 border border-gray-700 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-2 py-1 border-b border-gray-700">
            <span className="text-xs text-gray-400">{runningLabel}</span>
            <button onClick={() => setLogOpen(false)} className="text-gray-500 hover:text-gray-300 text-xs">✕</button>
          </div>
          <div ref={logRef} className="p-2 font-mono text-xs text-gray-300 max-h-48 overflow-y-auto">
            {lines.map((line, i) => (
              <div key={i} className="whitespace-pre-wrap leading-5">{line}</div>
            ))}
            {status === "running" && <div className="text-blue-400 animate-pulse">▌</div>}
            {status !== "running" && exitCode !== null && (
              <div className={`mt-1 font-bold ${exitCode === 0 ? "text-green-400" : "text-red-400"}`}>
                {exitCode === 0 ? "✓ 完了" : `✗ エラー (exit ${exitCode})`}
              </div>
            )}
          </div>
        </div>
      )}

      {(menuOpen || upscaleOpen || suggestOpen) && (
        <div className="fixed inset-0 z-10" onClick={() => { setMenuOpen(false); setUpscaleOpen(false); setSuggestOpen(false); }} />
      )}
    </div>
  );
}
