import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { resolve as pathResolve, join } from "path";

const TOOLS_DIR = path.join(process.cwd(), "tools");
const PYTHON = path.join(TOOLS_DIR, ".venv/bin/python");
const SCRIPT = path.join(TOOLS_DIR, "imgtools.py");

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const imagePath = searchParams.get("path") ?? "";
  const limit = searchParams.get("limit") ?? "12";

  if (!imagePath.trim()) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }

  // パストラバーサル対策
  const root = pathResolve(process.env.IMAGES_DIR ?? join(process.env.HOME ?? "", "dev", "images"));
  const full = pathResolve(root, imagePath);
  if (full !== root && !full.startsWith(root + path.sep)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  return new Promise<Response>((resolve) => {
    let stdout = "";
    let stderr = "";

    const proc = spawn(PYTHON, [SCRIPT, "similar", imagePath, "--limit", limit], {
      cwd: path.dirname(SCRIPT),
      env: {
        ...process.env,
        PATH: `${path.join(TOOLS_DIR, ".venv/bin")}:${process.env.PATH}`,
        IMAGES_DIR: process.env.IMAGES_DIR ?? "",
      },
    });

    proc.stdout.setEncoding("utf-8");
    proc.stderr.setEncoding("utf-8");
    proc.stdout.on("data", (d: string) => { stdout += d; });
    proc.stderr.on("data", (d: string) => { stderr += d; });

    proc.on("close", () => {
      try {
        const data = JSON.parse(stdout.trim());
        if (!Array.isArray(data) && data.error) {
          resolve(NextResponse.json({ error: data.error }, { status: 500 }));
        } else {
          resolve(NextResponse.json(data));
        }
      } catch {
        if (process.env.NODE_ENV === "development") console.error("[similar] stderr:", stderr);
        resolve(NextResponse.json({ error: "Parse error" }, { status: 500 }));
      }
    });

    proc.on("error", (err: Error) => {
      resolve(NextResponse.json({ error: err.message }, { status: 500 }));
    });
  });
}
