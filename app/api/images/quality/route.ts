import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";

import { getImagesDir } from "@/lib/config";
const IMAGES_ROOT = getImagesDir();
const CACHE_FILE = path.join(IMAGES_ROOT, ".imgtools_cache.json");

export type QualityItem = {
  path: string;
  folder: string;
  filename: string;
  size: number;
  mtime: number;
  category?: string;
  quality_ok: boolean;
  quality_reason: string;
};

export async function GET(_req: NextRequest) {
  let cache: Record<string, Record<string, unknown>> = {};
  try {
    cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
  } catch {
    return new Response(JSON.stringify([]), { headers: { "Content-Type": "application/json" } });
  }

  const flagged: QualityItem[] = [];

  for (const [rel, info] of Object.entries(cache)) {
    if (info.quality_ok !== false) continue; // quality_ok が明示的に false のものだけ

    const fullPath = path.resolve(IMAGES_ROOT, rel);
    if (!fs.existsSync(fullPath)) continue;

    const stat = fs.statSync(fullPath);
    flagged.push({
      path: rel,
      folder: rel.includes("/") ? rel.split("/")[0] : ".",
      filename: path.basename(rel),
      size: stat.size,
      mtime: stat.mtimeMs,
      category: info.category as string | undefined,
      quality_ok: false,
      quality_reason: (info.quality_reason as string) ?? "",
    });
  }

  return new Response(JSON.stringify(flagged), {
    headers: { "Content-Type": "application/json" },
  });
}
