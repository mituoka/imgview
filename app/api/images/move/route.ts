import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { getImagesDir } from "@/lib/config";

type CacheEntry = {
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

export async function POST(request: NextRequest) {
  let body: { path: string; targetFolder: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { path: imgPath, targetFolder } = body;
  if (typeof imgPath !== "string" || typeof targetFolder !== "string") {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  let IMAGES_ROOT: string;
  try {
    IMAGES_ROOT = getImagesDir();
  } catch {
    return Response.json({ error: "IMAGES_DIR not configured" }, { status: 500 });
  }

  // パストラバーサル対策（元ファイル）
  const resolvedSrc = path.resolve(IMAGES_ROOT, imgPath);
  if (!resolvedSrc.startsWith(IMAGES_ROOT + path.sep)) {
    return Response.json({ error: "Invalid source path" }, { status: 400 });
  }

  // パストラバーサル対策（移動先フォルダ）
  const resolvedTarget = path.resolve(IMAGES_ROOT, targetFolder);
  if (!resolvedTarget.startsWith(IMAGES_ROOT + path.sep) && resolvedTarget !== IMAGES_ROOT) {
    return Response.json({ error: "Invalid target folder" }, { status: 400 });
  }

  // 移動先フォルダが存在するか確認
  if (!fs.existsSync(resolvedTarget)) {
    return Response.json({ error: "Target folder does not exist" }, { status: 400 });
  }

  const filename = path.basename(imgPath);
  const destPath = path.join(resolvedTarget, filename);
  const newRelativePath = path.join(targetFolder, filename);

  // 同じ場所への移動は無視
  if (resolvedSrc === destPath) {
    return Response.json({ ok: true, newPath: imgPath });
  }

  // 移動先に同名ファイルが存在する場合はエラー
  if (fs.existsSync(destPath)) {
    return Response.json({ error: "File already exists at target" }, { status: 409 });
  }

  try {
    fs.renameSync(resolvedSrc, destPath);
  } catch {
    return Response.json({ error: "Failed to move file" }, { status: 500 });
  }

  // キャッシュの key を更新（旧パス → 新パス）
  const cacheFile = path.join(IMAGES_ROOT, ".imgtools_cache.json");
  const cache = loadCache(cacheFile);
  if (cache[imgPath]) {
    cache[newRelativePath] = cache[imgPath];
    delete cache[imgPath];
    try {
      fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2), "utf-8");
    } catch {
      // キャッシュ更新失敗は無視（ファイル移動は成功済み）
    }
  }

  return Response.json({ ok: true, newPath: newRelativePath });
}
