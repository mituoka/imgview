"use client";

import { useState, useRef, useEffect } from "react";

type Command = "scan" | "classify" | "auto" | "quality";
type Status = "idle" | "running" | "done" | "error";

const COMMANDS: { id: Command; label: string; desc: string }[] = [
  { id: "scan", label: "スキャン", desc: "画像の統計・概要を表示" },
  { id: "classify", label: "AI分類", desc: "未分類画像をOllamaで分類" },
  { id: "quality", label: "AI品質チェック", desc: "不要・低品質画像をOllamaで判定" },
  { id: "auto", label: "全自動更新", desc: "移動 → 分類 → フォルダ整理" },
];

type Props = {
  onComplete: () => void;
};

export default function RunImgtoolsPanel({ onComplete }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [runningLabel, setRunningLabel] = useState("");
  const [lines, setLines] = useState<string[]>([]);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logOpen && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [lines, logOpen]);

  const run = (command: Command) => {
    const label = COMMANDS.find((c) => c.id === command)?.label ?? command;
    setMenuOpen(false);
    setLines([]);
    setExitCode(null);
    setStatus("running");
    setRunningLabel(label);

    // バックグラウンドで実行 — awaitしない
    (async () => {
      try {
        const res = await fetch("/api/run-imgtools", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command }),
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
              if (msg.line !== undefined) {
                setLines((prev) => [...prev, msg.line]);
              }
              if (msg.done) {
                setExitCode(msg.exitCode);
                setStatus(msg.exitCode === 0 ? "done" : "error");
                if (msg.exitCode === 0) onComplete();
              }
            } catch {
              // ignore
            }
          }
        }
      } catch (e) {
        setLines((prev) => [...prev, `ERROR: ${e}`]);
        setStatus("error");
      }
    })();
  };

  const statusIcon = {
    idle: null,
    running: (
      <span className="inline-block w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
    ),
    done: <span className="text-green-400 text-xs">✓</span>,
    error: <span className="text-red-400 text-xs">✗</span>,
  }[status];

  return (
    <div className="relative">
      {/* メインボタン行 */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          disabled={status === "running"}
          className="flex-1 flex items-center gap-2 px-3 py-2 rounded text-sm text-gray-300 hover:bg-gray-800 hover:text-gray-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <span className="text-base">⚡</span>
          <span>imgtools 実行</span>
        </button>

        {/* ステータスバッジ — クリックでログ展開 */}
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
          {COMMANDS.map((cmd) => (
            <button
              key={cmd.id}
              onClick={() => run(cmd.id)}
              className="w-full flex flex-col items-start px-3 py-2.5 hover:bg-gray-700 transition-colors border-b border-gray-700 last:border-0"
            >
              <span className="text-sm font-medium text-gray-100">{cmd.label}</span>
              <span className="text-xs text-gray-400 mt-0.5">{cmd.desc}</span>
            </button>
          ))}
        </div>
      )}

      {/* ログパネル（インライン展開） */}
      {logOpen && (
        <div className="mt-1 bg-gray-950 border border-gray-700 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-2 py-1 border-b border-gray-700">
            <span className="text-xs text-gray-400">{runningLabel}</span>
            <button
              onClick={() => setLogOpen(false)}
              className="text-gray-500 hover:text-gray-300 text-xs"
            >
              ✕
            </button>
          </div>
          <div
            ref={logRef}
            className="p-2 font-mono text-xs text-gray-300 max-h-48 overflow-y-auto"
          >
            {lines.map((line, i) => (
              <div key={i} className="whitespace-pre-wrap leading-5">{line}</div>
            ))}
            {status === "running" && (
              <div className="text-blue-400 animate-pulse">▌</div>
            )}
            {status !== "running" && exitCode !== null && (
              <div className={`mt-1 font-bold ${exitCode === 0 ? "text-green-400" : "text-red-400"}`}>
                {exitCode === 0 ? "✓ 完了" : `✗ エラー (exit ${exitCode})`}
              </div>
            )}
          </div>
        </div>
      )}

      {/* メニュー外クリックで閉じる */}
      {menuOpen && (
        <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
      )}
    </div>
  );
}
