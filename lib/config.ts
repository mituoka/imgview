import path from "path";

export function getImagesDir(): string {
  const dir = process.env.IMAGES_DIR;
  if (!dir) {
    throw new Error("IMAGES_DIR is not set in .env.local");
  }
  return path.resolve(dir);
}
