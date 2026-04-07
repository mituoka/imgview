export type ImageItem = {
  id: string;
  path: string;
  folder: string;
  filename: string;
  category?: string;
  size: number;
  mtime: number;
};

export type FolderInfo = {
  name: string;
  count: number;
  label: string;
};

export const FOLDER_LABELS: Record<string, string> = {
  anime_illustration: "アニメ・イラスト",
  artwork: "アートワーク",
  design: "デザイン",
  meme_funny: "ミーム・面白画像",
  other: "その他",
  photo_people: "人物写真",
  screenshot: "スクリーンショット",
  人: "人",
};

export function getFolderLabel(name: string): string {
  return FOLDER_LABELS[name] ?? name;
}
