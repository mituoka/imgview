import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { resolve as pathResolve, join } from "path";

const TOOLS_DIR = path.join(process.cwd(), "tools");
const PYTHON = path.join(TOOLS_DIR, ".venv/bin/python");
const SCRIPT = path.join(TOOLS_DIR, "imgtools.py");

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const {
    path: imgPath = "",
    brightness = 100,
    contrast = 100,
    saturation = 100,
    sharpness = 100,
    filter = "none",
    rotation = 0,
    flipH = false,
    flipV = false,
    crop = null,   // "x,y,w,h"
    resize = null, // "w,h"
    rembg = false,
    saveAs = "copy",
  } = body;

  if (!imgPath) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }

  // パストラバーサル対策
  const root = pathResolve(process.env.IMAGES_DIR ?? join(process.env.HOME ?? "", "dev", "images"));
  const full = pathResolve(root, imgPath);
  if (full !== root && !full.startsWith(root + path.sep)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const args: string[] = [
    SCRIPT, "edit", imgPath,
    "--brightness", String(brightness),
    "--contrast",   String(contrast),
    "--saturation", String(saturation),
    "--sharpness",  String(sharpness),
    "--filter",     filter,
    "--rotation",   String(rotation),
    "--save-as",    saveAs,
  ];
  if (flipH)  args.push("--flip-h");
  if (flipV)  args.push("--flip-v");
  if (crop)   args.push("--crop",   crop);
  if (resize) args.push("--resize", resize);
  if (rembg)  args.push("--rembg");

  return new Promise<Response>((resolve) => {
    let stdout = "";
    let stderr = "";

    const proc = spawn(PYTHON, args, {
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
        resolve(NextResponse.json(data));
      } catch {
        if (process.env.NODE_ENV === "development") console.error("[edit] stderr:", stderr);
        resolve(NextResponse.json({ ok: false, error: "Parse error", stderr }, { status: 500 }));
      }
    });

    proc.on("error", (err: Error) => {
      resolve(NextResponse.json({ ok: false, error: err.message }, { status: 500 }));
    });
  });
}
