import { NextRequest } from "next/server";
import { spawn } from "child_process";
import path from "path";

const ALLOWED_COMMANDS = ["scan", "classify", "auto", "quality"] as const;
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

      const proc = spawn(PYTHON, [SCRIPT, command], {
        cwd: path.dirname(SCRIPT),
        env: { ...process.env, PATH: `${path.join(TOOLS_DIR, ".venv/bin")}:${process.env.PATH}` },
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
