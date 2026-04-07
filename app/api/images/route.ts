import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { ImageItem } from "@/types";

import { getImagesDir, getExcludedFolders } from "@/lib/config";
const IMAGES_ROOT = getImagesDir();
const EXCLUDED_FOLDERS = getExcludedFolders();
const CACHE_FILE = path.join(IMAGES_ROOT, ".imgtools_cache.json");
const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".bmp",
  ".tiff",
  ".heic",
  ".svg",
]);

type CacheEntry = {
  category?: string;
  name?: string;
};

function loadCache(): Record<string, CacheEntry> {
  try {
    const raw = fs.readFileSync(CACHE_FILE, "utf-8");
    return JSON.parse(raw) as Record<string, CacheEntry>;
  } catch {
    return {};
  }
}

function scanImages(dir: string, root: string): ImageItem[] {
  const results: ImageItem[] = [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const topLevelFolder = path.relative(root, fullPath).split(path.sep)[0];
      if (EXCLUDED_FOLDERS.has(topLevelFolder)) continue;
      results.push(...scanImages(fullPath, root));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) continue;

      const relativePath = path.relative(root, fullPath);
      const folder = path.relative(root, dir);

      let stat: fs.Stats;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }

      results.push({
        id: relativePath,
        path: relativePath,
        folder,
        filename: entry.name,
        size: stat.size,
        mtime: stat.mtimeMs,
      });
    }
  }

  return results;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const folderFilter = searchParams.get("folder");

  const cache = loadCache();
  let images = scanImages(IMAGES_ROOT, IMAGES_ROOT);

  // Attach category from cache
  images = images.map((img) => {
    const cached = cache[img.id];
    return {
      ...img,
      category: cached?.category,
    };
  });

  // Filter by folder if requested
  if (folderFilter) {
    images = images.filter((img) => img.folder === folderFilter);
  }

  // Sort by mtime descending
  images.sort((a, b) => b.mtime - a.mtime);

  return Response.json(images);
}
