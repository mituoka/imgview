import fs from "fs";
import path from "path";
import { FolderInfo, getFolderLabel } from "@/types";

const IMAGES_ROOT = "/Users/mitsuokatomohiro/dev/images";
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

function countImagesInDir(dir: string): number {
  let count = 0;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += countImagesInDir(fullPath);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (IMAGE_EXTENSIONS.has(ext)) count++;
    }
  }
  return count;
}

export async function GET() {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(IMAGES_ROOT, { withFileTypes: true });
  } catch {
    return Response.json([]);
  }

  const folders: FolderInfo[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;

    const folderPath = path.join(IMAGES_ROOT, entry.name);
    const count = countImagesInDir(folderPath);

    folders.push({
      name: entry.name,
      count,
      label: getFolderLabel(entry.name),
    });
  }

  // Sort by count descending
  folders.sort((a, b) => b.count - a.count);

  return Response.json(folders);
}
