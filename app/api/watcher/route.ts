import { NextRequest } from "next/server";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";

const TOOLS_DIR = path.join(process.cwd(), "tools");
const PYTHON = path.join(TOOLS_DIR, ".venv/bin/python");
const WATCHER_SCRIPT = path.join(TOOLS_DIR, "watcher.py");
const PID_FILE = path.join(TOOLS_DIR, ".watcher.pid");

// プロセス参照をモジュールレベルで保持
declare global {
  // eslint-disable-next-line no-var
  var _watcherProc: ChildProcess | null;
}
globalThis._watcherProc ??= null;

function isRunning(): boolean {
  // PIDファイルで確認
  if (!fs.existsSync(PID_FILE)) return false;
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, "utf-8").trim());
    process.kill(pid, 0); // シグナル0 = 存在確認のみ
    return true;
  } catch {
    // PIDが無効 → PIDファイルを削除
    fs.unlinkSync(PID_FILE);
    return false;
  }
}

// GET: ステータス確認
export async function GET() {
  return new Response(JSON.stringify({ running: isRunning() }), {
    headers: { "Content-Type": "application/json" },
  });
}

// POST: 起動 / 停止
export async function POST(req: NextRequest) {
  const { action } = await req.json().catch(() => ({ action: "" }));

  if (action === "start") {
    if (isRunning()) {
      return new Response(JSON.stringify({ ok: true, running: true, message: "already running" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const proc = spawn(PYTHON, [WATCHER_SCRIPT], {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        PATH: `${path.join(TOOLS_DIR, ".venv/bin")}:${process.env.PATH}`,
        IMAGES_DIR: process.env.IMAGES_DIR ?? "",
      },
    });
    proc.unref();
    globalThis._watcherProc = proc;

    // PIDファイルが書かれるまで少し待つ
    await new Promise((r) => setTimeout(r, 500));

    return new Response(JSON.stringify({ ok: true, running: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (action === "stop") {
    if (!fs.existsSync(PID_FILE)) {
      return new Response(JSON.stringify({ ok: true, running: false }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    try {
      const pid = parseInt(fs.readFileSync(PID_FILE, "utf-8").trim());
      process.kill(pid, "SIGTERM");
      fs.unlinkSync(PID_FILE);
    } catch {
      // 既に終了していたら無視
    }
    return new Response(JSON.stringify({ ok: true, running: false }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "action must be start or stop" }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
}
