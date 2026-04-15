import { NextRequest } from "next/server";
import { spawn } from "child_process";
import path from "path";

const TOOLS_DIR = path.join(process.cwd(), "tools");
const PYTHON = path.join(TOOLS_DIR, ".venv/bin/python");
const SCRIPT = path.join(TOOLS_DIR, "imgtools.py");

export async function GET(req: NextRequest) {
  const folder = req.nextUrl.searchParams.get("folder");
  const forceClassify = req.nextUrl.searchParams.get("force") === "1";

  if (!folder) {
    return new Response(JSON.stringify({ error: "folder is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const args = ["suggest", folder];
  if (forceClassify) args.push("--force-classify");

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };

      const proc = spawn(PYTHON, [SCRIPT, ...args], {
        cwd: path.dirname(SCRIPT),
        env: {
          ...process.env,
          PATH: `${path.join(TOOLS_DIR, ".venv/bin")}:${process.env.PATH}`,
          IMAGES_DIR: process.env.IMAGES_DIR ?? "",
        },
      });

      proc.stdout.setEncoding("utf-8");
      proc.stderr.setEncoding("utf-8");

      let buf = "";
      const handleData = (data: string) => {
        buf += data;
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const msg = JSON.parse(trimmed);
            send(msg);
          } catch {
            // non-JSON lines (debug output etc.) — ignore
          }
        }
      };

      proc.stdout.on("data", handleData);
      proc.stderr.on("data", (d: string) => {
        // stderrはログとして流す
        for (const line of d.split("\n")) {
          if (line.trim()) send({ log: line });
        }
      });

      proc.on("close", (code) => {
        if (buf.trim()) {
          try { send(JSON.parse(buf)); } catch { /* ignore */ }
        }
        if (code !== 0) send({ error: `Process exited with code ${code}` });
        controller.close();
      });

      proc.on("error", (err) => {
        send({ error: err.message });
        controller.close();
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
