import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import sharp from "sharp";



import { getImagesDir } from "@/lib/config";
const IMAGES_ROOT = getImagesDir();
const CACHE_FILE = path.join(IMAGES_ROOT, ".imgtools_cache.json");

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".tiff": "image/tiff",
  ".heic": "image/heic",
  ".svg": "image/svg+xml",
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;

  if (!segments || segments.length === 0) {
    return new Response("Not found", { status: 404 });
  }

  // Reconstruct relative path from segments
  const relativePath = segments.join("/");

  // Security: resolve the full path and ensure it stays within IMAGES_ROOT
  const fullPath = path.resolve(IMAGES_ROOT, relativePath);
  const normalizedRoot = path.resolve(IMAGES_ROOT);

  if (!fullPath.startsWith(normalizedRoot + path.sep) && fullPath !== normalizedRoot) {
    return new Response("Forbidden", { status: 403 });
  }

  let fileBuffer: Buffer;
  try {
    fileBuffer = fs.readFileSync(fullPath);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const ext = path.extname(fullPath).toLowerCase();

  // HEIC/HEIF はブラウザ非対応なので JPEG に変換して返す
  if (ext === ".heic" || ext === ".heif") {
    try {
      const jpegBuffer = await sharp(fileBuffer).jpeg({ quality: 85 }).toBuffer();
      return new Response(new Uint8Array(jpegBuffer), {
        status: 200,
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=3600",
        },
      });
    } catch {
      return new Response("Failed to convert HEIC", { status: 500 });
    }
  }

  const contentType = MIME_TYPES[ext] ?? "application/octet-stream";

  return new Response(new Uint8Array(fileBuffer), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;

  if (!segments || segments.length === 0) {
    return new Response("Not found", { status: 404 });
  }

  const relativePath = segments.join("/");
  const fullPath = path.resolve(IMAGES_ROOT, relativePath);
  const normalizedRoot = path.resolve(IMAGES_ROOT);

  if (!fullPath.startsWith(normalizedRoot + path.sep) && fullPath !== normalizedRoot) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    fs.unlinkSync(fullPath);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  // キャッシュからも削除
  try {
    const raw = fs.readFileSync(CACHE_FILE, "utf-8");
    const cache = JSON.parse(raw);
    delete cache[relativePath];
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch {
    // キャッシュ更新失敗は無視
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
