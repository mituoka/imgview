import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { getImagesDir } from "@/lib/config";

type CacheEntry = {
  category?: string;
  name?: string;
  usage_tags?: string[];
  [key: string]: unknown;
};

function loadCache(cacheFile: string): Record<string, CacheEntry> {
  try {
    const raw = fs.readFileSync(cacheFile, "utf-8");
    return JSON.parse(raw) as Record<string, CacheEntry>;
  } catch {
    return {};
  }
}

export async function PATCH(request: NextRequest) {
  let body: { path: string; tags: string[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { path: imgPath, tags } = body;
  if (typeof imgPath !== "string" || !Array.isArray(tags)) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
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

  const cacheFile = path.join(IMAGES_ROOT, ".imgtools_cache.json");
  const cache = loadCache(cacheFile);

  // 既存エントリがなければ空オブジェクトから作成
  if (!cache[imgPath]) {
    cache[imgPath] = {};
  }
  cache[imgPath].usage_tags = tags;

  try {
    fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2), "utf-8");
  } catch {
    return Response.json({ error: "Failed to write cache" }, { status: 500 });
  }

  return Response.json({ ok: true, usage_tags: tags });
}
