export type ImageItem = {
  id: string;
  path: string;
  folder: string;
  filename: string;
  category?: string;
  size: number;
  mtime: number;
  usage_tags?: string[];
};

export const USAGE_TAGS: { value: string; label: string; color: string }[] = [
  { value: "sp_wallpaper", label: "スマホ壁紙", color: "violet" },
  { value: "pc_wallpaper", label: "PC壁紙",    color: "blue" },
  { value: "icon",         label: "アイコン",   color: "green" },
  { value: "web_material", label: "Web素材",    color: "orange" },
  { value: "sns",          label: "SNS投稿",    color: "pink" },
  { value: "thumbnail",    label: "サムネイル", color: "yellow" },
];

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
