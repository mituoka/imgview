import { NextRequest } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { getImagesDir } from "@/lib/config";

const TOOLS_DIR = path.join(process.cwd(), "tools");
const PYTHON = path.join(TOOLS_DIR, ".venv/bin/python");
const SCRIPT = path.join(TOOLS_DIR, "imgtools.py");

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const imgPath = searchParams.get("path");

  if (!imgPath) {
    return Response.json({ error: "path is required" }, { status: 400 });
  }

  let IMAGES_ROOT: string;
  try {
    IMAGES_ROOT = getImagesDir();
  } catch {
    return Response.json({ error: "IMAGES_DIR not configured" }, { status: 500 });
  }

  // パストラバーサル対策
  const resolvedPath = path.resolve(IMAGES_ROOT, imgPath);
  if (!resolvedPath.startsWith(IMAGES_ROOT + path.sep) && resolvedPath !== IMAGES_ROOT) {
    return Response.json({ error: "Invalid path" }, { status: 400 });
  }

  return new Promise<Response>((resolve) => {
    const proc = spawn(
      PYTHON,
      [SCRIPT, "palette", imgPath, "--n", "5"],
      {
        cwd: path.dirname(SCRIPT),
        env: {
          ...process.env,
          PATH: `${path.join(TOOLS_DIR, ".venv/bin")}:${process.env.PATH}`,
          IMAGES_DIR: IMAGES_ROOT,
        },
      }
    );

    let stdout = "";
    let stderr = "";

    proc.stdout.setEncoding("utf-8");
    proc.stderr.setEncoding("utf-8");
    proc.stdout.on("data", (d: string) => { stdout += d; });
    proc.stderr.on("data", (d: string) => { stderr += d; });

    proc.on("close", (code) => {
      if (code !== 0) {
        resolve(Response.json({ ok: false, error: stderr || "Process failed" }, { status: 500 }));
        return;
      }
      try {
        const result = JSON.parse(stdout.trim());
        resolve(Response.json(result));
      } catch {
        resolve(Response.json({ ok: false, error: "Invalid JSON from palette command" }, { status: 500 }));
      }
    });

    proc.on("error", (err) => {
      resolve(Response.json({ ok: false, error: err.message }, { status: 500 }));
    });
  });
}
