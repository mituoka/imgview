import path from "path";

export function getImagesDir(): string {
  const dir = process.env.IMAGES_DIR;
  if (!dir) {
    throw new Error("IMAGES_DIR is not set in .env.local");
  }
  return path.resolve(dir);
}

/** カンマ区切りの EXCLUDED_FOLDERS から除外フォルダ名のSetを返す */
export function getExcludedFolders(): Set<string> {
  const raw = process.env.EXCLUDED_FOLDERS ?? "";
  return new Set(
    raw.split(",").map((s) => s.trim()).filter(Boolean)
  );
}
