import { NextRequest } from "next/server";
import { spawn } from "child_process";
import path from "path";

const ALLOWED_COMMANDS = ["scan", "auto", "upscale", "analyze", "classify", "quality", "caption", "embed"] as const;
type Command = (typeof ALLOWED_COMMANDS)[number];

const TOOLS_DIR = path.join(process.cwd(), "tools");
const PYTHON = path.join(TOOLS_DIR, ".venv/bin/python");
const SCRIPT = path.join(TOOLS_DIR, "imgtools.py");

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const command: string = body.command ?? "";

  if (!ALLOWED_COMMANDS.includes(command as Command)) {
    return new Response(JSON.stringify({ error: "Invalid command" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // upscale オプション
  const extraArgs: string[] = [];
  if (command === "upscale") {
    if (body.model) extraArgs.push("--model", body.model);
    if (body.scale) extraArgs.push("--scale", String(body.scale));
    // 単一ファイル指定（Lightbox からの実行）
    if (body.file) {
      const { resolve, join } = await import("path");
      const root = resolve(process.env.IMAGES_DIR ?? join(process.env.HOME ?? "", "dev", "images"));
      const fullPath = resolve(root, body.file);
      if (fullPath.startsWith(root)) extraArgs.push("--source", fullPath);
    } else if (body.folder) {
      extraArgs.push("--folder", body.folder);
    }
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const sendLine = (line: string) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ line })}\n\n`));
      };

      const sendDone = (exitCode: number) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true, exitCode })}\n\n`)
        );
        controller.close();
      };

      const proc = spawn(PYTHON, [SCRIPT, command, ...extraArgs], {
        cwd: path.dirname(SCRIPT),
        env: { ...process.env, PATH: `${path.join(TOOLS_DIR, ".venv/bin")}:${process.env.PATH}`, IMAGES_DIR: process.env.IMAGES_DIR ?? "" },
      });

      proc.stdout.setEncoding("utf-8");
      proc.stderr.setEncoding("utf-8");

      let buf = "";
      const handleData = (data: string) => {
        buf += data;
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (line.trim()) sendLine(line);
        }
      };

      proc.stdout.on("data", handleData);
      proc.stderr.on("data", handleData);

      proc.on("close", (code) => {
        if (buf.trim()) sendLine(buf);
        sendDone(code ?? 0);
      });

      proc.on("error", (err) => {
        sendLine(`ERROR: ${err.message}`);
        sendDone(1);
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
