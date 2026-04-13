import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";

import { getImagesDir } from "@/lib/config";
const IMAGES_ROOT = getImagesDir();
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff", ".heic", ".svg"]);

function findImages(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findImages(fullPath));
    } else if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      results.push(fullPath);
    }
  }
  return results;
}

function md5(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("md5");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

export type DupeGroup = {
  hash: string;
  size: number;
  images: { path: string; folder: string; filename: string; size: number; mtime: number }[];
};

export async function GET(_req: NextRequest) {
  const allImages = findImages(IMAGES_ROOT);

  // 同じファイルサイズのグループだけハッシュ対象にする
  const sizeGroups = new Map<number, string[]>();
  for (const imgPath of allImages) {
    try {
      const { size } = fs.statSync(imgPath);
      const group = sizeGroups.get(size) ?? [];
      group.push(imgPath);
      sizeGroups.set(size, group);
    } catch { /* skip */ }
  }

  const hashMap = new Map<string, string[]>();
  for (const [, paths] of sizeGroups) {
    if (paths.length < 2) continue; // サイズが一意なファイルはスキップ
    for (const imgPath of paths) {
      try {
        const hash = await md5(imgPath);
        const group = hashMap.get(hash) ?? [];
        group.push(imgPath);
        hashMap.set(hash, group);
      } catch {
        // skip unreadable files
      }
    }
  }

  const groups: DupeGroup[] = [];
  for (const [hash, paths] of hashMap) {
    if (paths.length < 2) continue;
    const images = paths.map((p) => {
      const rel = path.relative(IMAGES_ROOT, p);
      const stat = fs.statSync(p);
      return {
        path: rel,
        folder: rel.includes("/") ? rel.split("/")[0] : ".",
        filename: path.basename(p),
        size: stat.size,
        mtime: stat.mtimeMs,
      };
    });
    groups.push({ hash, size: images[0].size, images });
  }

  // 大きいファイルから順に
  groups.sort((a, b) => b.size - a.size);

  return new Response(JSON.stringify(groups), {
    headers: { "Content-Type": "application/json" },
  });
}
