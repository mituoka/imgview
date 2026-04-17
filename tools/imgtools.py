#!/usr/bin/env python3
"""
imgtools - ローカル画像管理・AI自動分類CLIツール

使い方:
  python imgtools.py auto                    # 全自動: download → images → 分類 → 整理
  python imgtools.py rename                  # ファイル名を整理（カテゴリ_001.jpg形式）
  python imgtools.py rename --dry-run        # リネームのプレビュー
  python imgtools.py scan                    # 画像の概要を表示
  python imgtools.py dupes                   # 重複画像を検出
  python imgtools.py classify                # AIで画像を自動分類
  python imgtools.py organize                # 分類結果に基づいてフォルダ整理

固定ディレクトリ:
  Download : ~/dev/download
  Downloads: ~/Downloads  (Macの標準ダウンロードフォルダ)
  Images   : ~/dev/images
"""

import argparse
import base64
import hashlib
import json
import os
import sys
from collections import defaultdict
from pathlib import Path

import requests
from PIL import Image

try:
    import pillow_heif
    pillow_heif.register_heif_opener()
    HEIC_SUPPORT = True
except ImportError:
    HEIC_SUPPORT = False

# ─── 設定 ───────────────────────────────────────────────
BASE_DIR = Path(os.environ.get("IMAGES_DIR", str(Path.home() / "dev" / "images")))
DOWNLOAD_DIR = Path.home() / "dev" / "download"  # 固定のダウンロードフォルダ
MAC_DOWNLOADS_DIR = Path.home() / "Downloads"  # Macの標準ダウンロードフォルダ
CACHE_FILE = BASE_DIR / ".imgtools_cache.json"
UPSCAYL_BIN = Path("/Applications/Upscayl.app/Contents/Resources/bin/upscayl-bin")
UPSCAYL_MODELS = Path("/Applications/Upscayl.app/Contents/Resources/models")
UPSCAYL_DEFAULT_MODEL = "upscayl-standard-4x"
OLLAMA_URL = "http://localhost:11434"
VISION_MODEL = "llava:7b"
EMBED_MODEL = "nomic-embed-text"
CHROMA_DIR = BASE_DIR / ".imgvec"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff", ".heic", ".svg"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv", ".wmv"}

CATEGORIES = [
    "anime_illustration",  # アニメ・イラスト
    "photo_people",        # 人物写真
    "photo_landscape",     # 風景・自然写真
    "photo_food",          # 食べ物写真
    "photo_object",        # 物撮り・商品写真
    "screenshot",          # スクリーンショット
    "meme_funny",          # ミーム・面白画像
    "document",            # ドキュメント・テキスト画像
    "artwork",             # アート・デジタルアート
    "other",               # その他
]

CATEGORY_LABELS = {
    "anime_illustration": "Anime & Illustration",
    "photo_people": "People Photos",
    "photo_landscape": "Landscape & Nature",
    "photo_food": "Food Photos",
    "photo_object": "Object & Product Photos",
    "screenshot": "Screenshots",
    "meme_funny": "Memes & Funny",
    "document": "Documents & Text",
    "artwork": "Artwork & Digital Art",
    "other": "Other",
}

# ─── 用途タグ ─────────────────────────────────────────
USAGE_TAG_LABELS = {
    "sp_wallpaper": "スマホ壁紙",
    "pc_wallpaper": "PC壁紙",
    "icon":         "アイコン",
    "web_material": "Web素材",
    "sns":          "SNS投稿",
    "thumbnail":    "サムネイル",
}

# カテゴリ → デフォルト用途タグ のマッピング
CATEGORY_TO_USAGE_TAGS: dict[str, list[str]] = {
    "anime_illustration": ["sp_wallpaper", "sns"],
    "artwork":            ["sp_wallpaper", "pc_wallpaper"],
    "photo_landscape":    ["sp_wallpaper", "pc_wallpaper"],
    "photo_people":       ["sns"],
    "photo_food":         ["sns"],
    "photo_object":       ["sns"],
    "screenshot":         ["web_material", "thumbnail"],
    "document":           ["web_material"],
    "meme_funny":         ["sns"],
    "other":              [],
}


# ─── ユーティリティ ─────────────────────────────────────
def find_images(target_dir: Path = BASE_DIR, recursive: bool = True,
                include_download: bool = False) -> list[Path]:
    """画像ファイルを探す。include_download=True で DOWNLOAD_DIR と MAC_DOWNLOADS_DIR も対象にする"""
    dirs = [target_dir]
    if include_download:
        for dl_dir in [DOWNLOAD_DIR, MAC_DOWNLOADS_DIR]:
            if dl_dir.exists() and dl_dir != target_dir and dl_dir not in dirs:
                dirs.append(dl_dir)

    images = []
    for d in dirs:
        if not d.exists():
            continue
        pattern = "**/*" if recursive else "*"
        for p in d.glob(pattern):
            if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS and not p.name.startswith("."):
                images.append(p)
    return sorted(images)


def get_cache_key(img: Path) -> str:
    """キャッシュキーを返す。BASE_DIR 外の画像は 'download/<name>' 形式"""
    try:
        return str(img.relative_to(BASE_DIR))
    except ValueError:
        try:
            img.relative_to(MAC_DOWNLOADS_DIR)
            return f"mac_downloads/{img.name}"
        except ValueError:
            return f"download/{img.name}"


def format_size(size_bytes: int) -> str:
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / 1024 / 1024:.1f} MB"
    return f"{size_bytes / 1024 / 1024 / 1024:.1f} GB"


def file_hash(path: Path) -> str:
    """ファイルのMD5ハッシュ"""
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def load_cache() -> dict:
    if CACHE_FILE.exists():
        with open(CACHE_FILE) as f:
            return json.load(f)
    return {}


def save_cache(data: dict):
    with open(CACHE_FILE, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def image_to_base64(path: Path, max_size: int = 1024) -> str:
    """画像をbase64に変換（リサイズしてOllamaに送る）"""
    with Image.open(path) as img:
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        img.thumbnail((max_size, max_size))
        from io import BytesIO
        buf = BytesIO()
        img.save(buf, format="JPEG", quality=85)
        return base64.b64encode(buf.getvalue()).decode()


def _parse_category(answer: str) -> str | None:
    """モデルの回答からカテゴリを抽出（完全一致→単語境界マッチの順）"""
    import re
    cleaned = answer.strip().lower()
    if cleaned in CATEGORIES:
        return cleaned
    for cat in CATEGORIES:
        if re.search(r'(?<![a-z_])' + re.escape(cat) + r'(?![a-z_])', cleaned):
            return cat
    return None


def classify_image_with_ollama(path: Path) -> str:
    """Ollamaのビジョンモデルで画像を分類"""
    img_b64 = image_to_base64(path)

    prompt = """Classify this image into exactly ONE of these categories.
Output ONLY the category name on a single line. No explanation.

anime_illustration  = 2D anime/manga/cartoon art, hand-drawn or digital illustrations, VTuber avatars, fan art
photo_people        = real photograph of humans (portrait, selfie, group, celebrity)
photo_landscape     = real photograph of nature, scenery, cityscape, outdoor environments
photo_food          = real photograph of food, drinks, cooking, recipes
photo_object        = real photograph of products, items, gadgets, still life
screenshot          = computer/phone screen capture including UI, websites, apps, games
meme_funny          = meme template, image macro, reaction image, humorous internet content
document            = text-heavy image, scanned document, diagram, chart, slide, notes
artwork             = non-anime fine art, oil painting, watercolor, abstract art, realistic digital painting
other               = anything that does not clearly fit the above categories

Category:"""

    for attempt in range(2):
        try:
            resp = requests.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": VISION_MODEL,
                    "prompt": prompt,
                    "images": [img_b64],
                    "stream": False,
                    "options": {"temperature": 0.0 if attempt == 0 else 0.2},
                },
                timeout=90,
            )
            resp.raise_for_status()
            answer = resp.json()["response"].strip().lower()
            cat = _parse_category(answer)
            if cat:
                return cat
        except Exception as e:
            print(f"  [ERROR] {path.name}: {e}")
            return "other"

    return "other"


# ─── コマンド ───────────────────────────────────────────
def cmd_scan(args):
    """画像の概要を表示"""
    target_dir = Path(args.source).resolve() if args.source else BASE_DIR
    include_dl = getattr(args, "include_download", False)
    images = find_images(target_dir, include_download=include_dl)

    if not images:
        print("画像が見つかりませんでした。")
        return

    # 統計
    total_size = 0
    by_ext = defaultdict(int)
    by_folder = defaultdict(int)
    sizes = []

    for img in images:
        size = img.stat().st_size
        total_size += size
        sizes.append(size)
        by_ext[img.suffix.lower()] += 1
        try:
            folder = img.parent.relative_to(BASE_DIR)
        except ValueError:
            folder = Path("download")
        by_folder[str(folder)] += 1

    print(f"\n{'=' * 50}")
    print(f"  Image Library Overview")
    print(f"{'=' * 50}")
    print(f"  Total images : {len(images)}")
    print(f"  Total size   : {format_size(total_size)}")
    print(f"  Avg size     : {format_size(total_size // len(images))}")
    print()

    print("  By format:")
    for ext, count in sorted(by_ext.items(), key=lambda x: -x[1]):
        print(f"    {ext:8s} : {count}")
    print()

    print("  By folder:")
    for folder, count in sorted(by_folder.items(), key=lambda x: -x[1]):
        print(f"    {folder:30s} : {count}")

    # キャッシュに分類済みがあれば表示
    cache = load_cache()
    classified = {k: v for k, v in cache.items() if "category" in v}
    if classified:
        print()
        print(f"  Classified   : {len(classified)} / {len(images)}")
        by_cat = defaultdict(int)
        for v in classified.values():
            by_cat[v["category"]] += 1
        print("  By category:")
        for cat, count in sorted(by_cat.items(), key=lambda x: -x[1]):
            label = CATEGORY_LABELS.get(cat, cat)
            print(f"    {label:30s} : {count}")

    print(f"\n{'=' * 50}\n")


def cmd_dupes(args):
    """重複画像を検出"""
    include_dl = getattr(args, "include_download", False)
    images = find_images(include_download=include_dl)
    print(f"\n{len(images)} 画像をスキャン中...")

    hash_map = defaultdict(list)
    for i, img in enumerate(images):
        h = file_hash(img)
        hash_map[h].append(img)
        if (i + 1) % 50 == 0:
            print(f"  {i + 1}/{len(images)}...")

    dupes = {h: paths for h, paths in hash_map.items() if len(paths) > 1}

    if not dupes:
        print("\n重複画像は見つかりませんでした。")
        return

    total_waste = 0
    print(f"\n{len(dupes)} 組の重複が見つかりました:\n")
    for h, paths in dupes.items():
        size = paths[0].stat().st_size
        waste = size * (len(paths) - 1)
        total_waste += waste
        print(f"  [{format_size(size)}] ({len(paths)} copies)")
        for p in paths:
            print(f"    - {get_cache_key(p)}")
        print()

    print(f"重複による無駄な容量: {format_size(total_waste)}")


def cmd_classify(args):
    """AIで画像を自動分類"""
    # Ollamaの接続確認
    try:
        resp = requests.get(f"{OLLAMA_URL}/api/tags", timeout=5)
        models = [m["name"] for m in resp.json().get("models", [])]
        if not any(VISION_MODEL.split(":")[0] in m for m in models):
            print(f"Error: ビジョンモデル '{VISION_MODEL}' がインストールされていません。")
            print(f"  実行: ollama pull {VISION_MODEL}")
            return
    except requests.ConnectionError:
        print("Error: Ollama サーバーに接続できません。'ollama serve' を実行してください。")
        return

    # ソースディレクトリの決定
    include_dl = getattr(args, "include_download", False)
    if args.source:
        target = Path(args.source).resolve()
        images = find_images(target)
    elif args.folder:
        target = BASE_DIR / args.folder
        images = find_images(target)
    else:
        images = find_images(BASE_DIR, include_download=include_dl)

    if not images:
        print("画像が見つかりませんでした。")
        return

    cache = load_cache()

    # 未分類のみ
    if not args.force:
        images = [img for img in images if get_cache_key(img) not in cache
                  or "category" not in cache.get(get_cache_key(img), {})]

    if not images:
        print("分類する画像がありません（すべて分類済み）。--force で再分類できます。")
        return

    print(f"\n{len(images)} 画像を分類中... (model: {VISION_MODEL})\n")

    for i, img in enumerate(images):
        rel = get_cache_key(img)
        print(f"  [{i + 1}/{len(images)}] {img.name} ... ", end="", flush=True)

        try:
            category = classify_image_with_ollama(img)
            label = CATEGORY_LABELS.get(category, category)
            print(f"→ {label}")

            if rel not in cache:
                cache[rel] = {}
            cache[rel]["category"] = category
            cache[rel]["name"] = img.name

            # 10件ごとにキャッシュ保存
            if (i + 1) % 10 == 0:
                save_cache(cache)
        except Exception as e:
            print(f"ERROR: {e}")

    save_cache(cache)
    print(f"\n分類完了! 結果は {CACHE_FILE.name} に保存されました。")
    print("'python imgtools.py organize --dry-run' で整理プレビューを確認できます。")


def cmd_organize(args):
    """分類結果に基づいてフォルダ整理"""
    cache = load_cache()
    classified = {k: v for k, v in cache.items() if "category" in v}

    if not classified:
        print("分類データがありません。先に 'python imgtools.py classify' を実行してください。")
        return

    # 移動計画を作成
    moves = []
    for rel_path, info in classified.items():
        src = BASE_DIR / rel_path
        if not src.exists():
            continue

        category = info["category"]
        # 既にカテゴリフォルダ内にある場合はスキップ
        parent_name = src.parent.name
        if parent_name == category:
            continue

        dest_dir = BASE_DIR / category
        dest = dest_dir / src.name

        # 名前衝突回避
        if dest.exists():
            stem = dest.stem
            suffix = dest.suffix
            counter = 1
            while dest.exists():
                dest = dest_dir / f"{stem}_{counter}{suffix}"
                counter += 1

        moves.append((src, dest, category))

    if not moves:
        print("移動する画像がありません（すべて整理済み）。")
        return

    # カテゴリ別にまとめて表示
    by_cat = defaultdict(list)
    for src, dest, cat in moves:
        by_cat[cat].append((src, dest))

    print(f"\n{'=' * 50}")
    print(f"  Organize Plan: {len(moves)} files")
    print(f"{'=' * 50}\n")

    for cat in sorted(by_cat.keys()):
        label = CATEGORY_LABELS.get(cat, cat)
        files = by_cat[cat]
        print(f"  📁 {cat}/ ({label}) - {len(files)} files")
        for src, dest in files[:5]:
            print(f"    ← {src.relative_to(BASE_DIR)}")
        if len(files) > 5:
            print(f"    ... and {len(files) - 5} more")
        print()

    if args.dry_run:
        print("[DRY RUN] 実際のファイル移動は行いません。")
        print("実行するには: python imgtools.py organize")
        return

    confirm = input("実行しますか? (y/N): ").strip().lower()
    if confirm != "y":
        print("キャンセルしました。")
        return

    # ChromaDB が存在すれば使う（なければスキップ）
    chroma_collection = None
    if CHROMA_DIR.exists():
        try:
            chroma_collection = get_chroma_collection()
        except Exception:
            pass

    # 実行
    moved = 0
    for src, dest, category in moves:
        dest.parent.mkdir(parents=True, exist_ok=True)
        try:
            src.rename(dest)
            # キャッシュを更新
            old_rel = str(src.relative_to(BASE_DIR))
            new_rel = str(dest.relative_to(BASE_DIR))
            if old_rel in cache:
                cache[new_rel] = cache.pop(old_rel)

            # ChromaDB の ID を新パスに移し替え
            if chroma_collection is not None:
                try:
                    result = chroma_collection.get(
                        ids=[old_rel],
                        include=["embeddings", "documents", "metadatas"],
                    )
                    if result["ids"]:
                        meta = result["metadatas"][0]
                        meta["path"] = new_rel
                        chroma_collection.upsert(
                            ids=[new_rel],
                            embeddings=result["embeddings"],
                            documents=result["documents"],
                            metadatas=[meta],
                        )
                        chroma_collection.delete(ids=[old_rel])
                except Exception:
                    pass  # DB 未生成なら無視

            moved += 1
        except Exception as e:
            print(f"  [ERROR] {src.name}: {e}")

    save_cache(cache)
    print(f"\n{moved} ファイルを移動しました。")


def cmd_stats(args):
    """分類結果の詳細統計"""
    cache = load_cache()
    classified = {k: v for k, v in cache.items() if "category" in v}

    if not classified:
        print("分類データがありません。先に 'classify' を実行してください。")
        return

    by_cat = defaultdict(list)
    for rel, info in classified.items():
        by_cat[info["category"]].append(rel)

    print(f"\n{'=' * 50}")
    print(f"  Classification Results: {len(classified)} images")
    print(f"{'=' * 50}\n")

    for cat in CATEGORIES:
        if cat not in by_cat:
            continue
        files = by_cat[cat]
        label = CATEGORY_LABELS.get(cat, cat)
        pct = len(files) / len(classified) * 100
        bar = "█" * int(pct / 2)
        print(f"  {label:30s} {len(files):4d}  {pct:5.1f}% {bar}")

    print()


def convert_heic_to_jpeg(src: Path, dest_dir: Path, quality: int = 85) -> Path | None:
    """HEIC を JPEG に変換して dest_dir に保存。成功時に JPEG パスを返す。"""
    if not HEIC_SUPPORT:
        return None
    dest = dest_dir / (src.stem + ".jpg")
    if dest.exists():
        return None  # 変換済み
    try:
        with Image.open(src) as img:
            img.convert("RGB").save(dest, "JPEG", quality=quality)
        return dest
    except Exception as e:
        print(f"  [HEIC ERROR] {src.name}: {e}")
        if dest.exists():
            dest.unlink()
        return None


def _move_files_from_source(source: Path, dest: Path, show_summary: bool) -> int:
    """指定ソースフォルダから画像・動画を dest へ移動（内部用）"""
    images = find_images(source, recursive=False)
    videos = [p for p in source.glob("*") if p.is_file() and p.suffix.lower() in VIDEO_EXTENSIONS]

    if not images and not videos:
        return 0

    if show_summary:
        print(f"  [{source}]")
        print(f"    画像: {len(images)}枚, 動画: {len(videos)}本")

    moved = 0
    for img in images:
        try:
            # HEIC は JPEG に変換してから保存（元ファイルは削除）
            if img.suffix.lower() in (".heic", ".heif"):
                if HEIC_SUPPORT:
                    converted = convert_heic_to_jpeg(img, dest)
                    if converted:
                        img.unlink()
                        moved += 1
                        if show_summary:
                            print(f"  [HEIC→JPG] {img.name} → {converted.name}")
                    else:
                        if show_summary:
                            print(f"  [SKIP] {img.name} (変換済みまたは失敗)")
                else:
                    # pillow-heif なしの場合はそのまま移動
                    dest_path = dest / img.name
                    if not dest_path.exists():
                        img.rename(dest_path)
                        moved += 1
                        if show_summary:
                            print(f"  [WARN] {img.name} (pillow-heif 未インストール、変換なし)")
                continue

            dest_path = dest / img.name
            if dest_path.exists():
                if show_summary:
                    print(f"  [SKIP] {img.name} (already exists)")
                continue
            img.rename(dest_path)
            moved += 1
        except Exception as e:
            print(f"  [ERROR] {img.name}: {e}")

    if videos:
        video_dest = dest / "videos"
        video_dest.mkdir(exist_ok=True)
        for vid in videos:
            try:
                dest_path = video_dest / vid.name
                if dest_path.exists():
                    if show_summary:
                        print(f"  [SKIP] {vid.name} (already exists)")
                    continue
                vid.rename(dest_path)
                moved += 1
            except Exception as e:
                print(f"  [ERROR] {vid.name}: {e}")

    return moved


def move_from_download(show_summary: bool = True) -> int:
    """download フォルダと Mac 標準 Downloads フォルダから画像を移動（内部用）"""
    dest = BASE_DIR
    dest.mkdir(parents=True, exist_ok=True)

    sources = [s for s in [DOWNLOAD_DIR, MAC_DOWNLOADS_DIR] if s.exists()]
    if not sources:
        if show_summary:
            print(f"ℹ️  移動するファイルがありません。")
        return 0

    if show_summary:
        print(f"\n📥 Download → Images")

    total = 0
    for source in sources:
        total += _move_files_from_source(source, dest, show_summary)

    if show_summary:
        if total == 0:
            print("ℹ️  移動するファイルがありません。")
        else:
            print(f"✅ {total} ファイルを移動しました。\n")
    return total


def _ollama_available() -> bool:
    """Ollamaが起動していてビジョンモデルが使えるか確認"""
    try:
        resp = requests.get(f"{OLLAMA_URL}/api/tags", timeout=5)
        models = [m["name"] for m in resp.json().get("models", [])]
        return any(VISION_MODEL.split(":")[0] in m for m in models)
    except requests.ConnectionError:
        return False


def cmd_auto(args):
    """全自動処理: download → images → 分類 → 整理"""
    print("=" * 60)
    print("  🤖 imgtools - 全自動モード")
    print("=" * 60)
    print(f"  Download : {DOWNLOAD_DIR}")
    print(f"  Downloads: {MAC_DOWNLOADS_DIR}")
    print(f"  Images   : {BASE_DIR}")
    print("=" * 60)

    # ステップ1: 移動
    print("\n[1/3] 📥 ファイル移動中...")
    moved = move_from_download(show_summary=True)
    if moved == 0:
        print("  新しいファイルはありませんでした。")

    # ステップ2: 分類（Ollama必須）
    print("\n[2/3] 🔍 AI分類中...")
    cache = load_cache()
    unclassified = [
        img for img in find_images(BASE_DIR)
        if "category" not in cache.get(get_cache_key(img), {})
    ]

    if not unclassified:
        print("  未分類の画像はありません。")
    elif not _ollama_available():
        print(f"⚠️  Ollama未起動 or モデル '{VISION_MODEL}' なし。分類をスキップします。")
        print("     'ollama serve' を起動後に 'classify' を個別実行してください。")
    else:
        print(f"  {len(unclassified)}枚の画像を分類中...\n")
        for i, img in enumerate(unclassified):
            rel = get_cache_key(img)
            print(f"  [{i + 1}/{len(unclassified)}] {img.name} ... ", end="", flush=True)
            try:
                category = classify_image_with_ollama(img)
                label = CATEGORY_LABELS.get(category, category)
                print(f"→ {label}")
                cache.setdefault(rel, {})
                cache[rel]["category"] = category
                cache[rel]["name"] = img.name
                if (i + 1) % 10 == 0:
                    save_cache(cache)
            except Exception as e:
                print(f"ERROR: {e}")
        save_cache(cache)
        print("\n✅ 分類完了！")

    # ステップ3: 整理（Ollama不要 — 分類済みなら常に実行）
    print("\n[3/3] 📁 フォルダ整理中...")
    classified = {k: v for k, v in cache.items() if "category" in v}
    moves = []
    for rel_path, info in classified.items():
        src = BASE_DIR / rel_path
        if not src.exists():
            continue
        category = info["category"]
        if src.parent.name == category:
            continue
        dest_dir = BASE_DIR / category
        dest = dest_dir / src.name
        if dest.exists():
            stem, suffix = dest.stem, dest.suffix
            counter = 1
            while dest.exists():
                dest = dest_dir / f"{stem}_{counter}{suffix}"
                counter += 1
        moves.append((src, dest, category))

    if moves:
        for src, dest, category in moves:
            dest.parent.mkdir(parents=True, exist_ok=True)
            try:
                src.rename(dest)
                old_rel = str(src.relative_to(BASE_DIR))
                new_rel = str(dest.relative_to(BASE_DIR))
                if old_rel in cache:
                    cache[new_rel] = cache.pop(old_rel)
            except Exception as e:
                print(f"  [ERROR] {src.name}: {e}")
        save_cache(cache)
        print(f"✅ {len(moves)}ファイルを整理しました。")
    else:
        print("  すべて整理済みです。")

    print("\n" + "=" * 60)
    print("  🎉 完了！")
    print("=" * 60)


def cmd_rename(args):
    """ファイル名を整理（カテゴリ_001.jpg形式）"""
    cache = load_cache()

    # カテゴリフォルダごとに処理
    rename_plan = []

    for category in CATEGORIES:
        cat_dir = BASE_DIR / category
        if not cat_dir.exists():
            continue

        # カテゴリフォルダ内の画像を取得（作成日時順）
        images = sorted(
            [p for p in cat_dir.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS],
            key=lambda p: p.stat().st_mtime
        )

        if not images:
            continue

        # 短縮名を決定
        cat_short = {
            "anime_illustration": "anime",
            "photo_people": "people",
            "photo_landscape": "landscape",
            "photo_food": "food",
            "photo_object": "object",
            "screenshot": "screen",
            "meme_funny": "meme",
            "document": "doc",
            "artwork": "art",
            "other": "other",
        }.get(category, category)

        # 連番を割り当て
        for i, img in enumerate(images, start=1):
            # 既に整形済みかチェック（例: anime_001.jpg のパターン）
            if img.stem.startswith(cat_short + "_") and img.stem.split("_")[-1].isdigit():
                continue

            new_name = f"{cat_short}_{i:03d}{img.suffix}"
            new_path = cat_dir / new_name

            # 名前の衝突を避ける
            counter = 1
            while new_path.exists() and new_path != img:
                new_name = f"{cat_short}_{i:03d}_{counter}{img.suffix}"
                new_path = cat_dir / new_name
                counter += 1

            if new_path != img:
                rename_plan.append((img, new_path, category))

    if not rename_plan:
        print("\n✅ すべてのファイル名は既に整理されています。")
        return

    # プレビュー表示
    by_cat = defaultdict(list)
    for src, dest, cat in rename_plan:
        by_cat[cat].append((src, dest))

    print(f"\n{'=' * 60}")
    print(f"  📝 ファイル名整理プラン: {len(rename_plan)} files")
    print(f"{'=' * 60}\n")

    for cat in sorted(by_cat.keys()):
        label = CATEGORY_LABELS.get(cat, cat)
        files = by_cat[cat]
        print(f"  📁 {cat}/ ({label}) - {len(files)} files")
        for src, dest in files[:3]:
            print(f"    {src.name:40s} → {dest.name}")
        if len(files) > 3:
            print(f"    ... and {len(files) - 3} more")
        print()

    if args.dry_run:
        print("[DRY RUN] 実際のリネームは行いません。")
        print("実行するには: python imgtools.py rename")
        return

    confirm = input("リネームを実行しますか? (y/N): ").strip().lower()
    if confirm != "y":
        print("キャンセルしました。")
        return

    # 実行
    renamed = 0
    for src, dest, category in rename_plan:
        try:
            src.rename(dest)
            # キャッシュを更新
            old_rel = str(src.relative_to(BASE_DIR))
            new_rel = str(dest.relative_to(BASE_DIR))
            if old_rel in cache:
                cache[new_rel] = cache.pop(old_rel)
            renamed += 1
        except Exception as e:
            print(f"  [ERROR] {src.name}: {e}")

    save_cache(cache)
    print(f"\n✅ {renamed} ファイルをリネームしました。")


def cmd_quality(args):
    """AIで不要画像を判定（ブレ・低品質・価値の低い画像をフラグ）"""
    try:
        resp = requests.get(f"{OLLAMA_URL}/api/tags", timeout=5)
        models = [m["name"] for m in resp.json().get("models", [])]
        if not any(VISION_MODEL.split(":")[0] in m for m in models):
            print(f"Error: ビジョンモデル '{VISION_MODEL}' がインストールされていません。")
            print(f"  実行: ollama pull {VISION_MODEL}")
            return
    except requests.ConnectionError:
        print("Error: Ollama サーバーに接続できません。'ollama serve' を実行してください。")
        return

    include_dl = getattr(args, "include_download", False)
    images = find_images(BASE_DIR, include_download=include_dl)
    cache = load_cache()

    if not args.force:
        images = [img for img in images if "quality_ok" not in cache.get(get_cache_key(img), {})]

    if not images:
        print("チェックする画像がありません（すべて判定済み）。--force で再判定できます。")
        return

    print(f"\n{len(images)} 画像の品質をチェック中... (model: {VISION_MODEL})\n")

    flagged = 0
    for i, img in enumerate(images):
        rel = get_cache_key(img)
        print(f"  [{i + 1}/{len(images)}] {img.name} ... ", end="", flush=True)

        try:
            img_b64 = image_to_base64(img)
            prompt = """Analyze this image and judge if it's worth keeping in a personal photo library.
Reply with ONLY a JSON object on one line, no markdown:
{"keep": true, "reason": "clear photo"}
or
{"keep": false, "reason": "blurry and out of focus"}

Mark as NOT worth keeping (keep: false) if:
- Very blurry, out of focus, or shaky
- Mostly black, white, or solid color with no content
- Corrupted or heavily artifacted
- Low-value screenshot (error dialog, loading screen, blank page)
- Accidental photo (finger, floor, ceiling with nothing interesting)

Keep (keep: true) if:
- Clear and intentional photo or illustration
- Meaningful screenshot or document
- Any artwork or creative content

JSON:"""

            resp = requests.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": VISION_MODEL,
                    "prompt": prompt,
                    "images": [img_b64],
                    "stream": False,
                    "options": {"temperature": 0.1},
                },
                timeout=60,
            )
            resp.raise_for_status()
            raw = resp.json()["response"].strip()

            import re
            match = re.search(r'\{.*?\}', raw, re.DOTALL)
            result = {}
            if match:
                try:
                    result = json.loads(match.group())
                except json.JSONDecodeError:
                    pass
            keep = bool(result.get("keep", True))
            reason = str(result.get("reason", ""))

            status = "OK" if keep else f"NG: {reason}"
            print(status)
            if not keep:
                flagged += 1

            if rel not in cache:
                cache[rel] = {}
            cache[rel]["quality_ok"] = keep
            cache[rel]["quality_reason"] = reason

            if (i + 1) % 10 == 0:
                save_cache(cache)

        except Exception as e:
            print(f"ERROR: {e}")

    save_cache(cache)
    print(f"\n品質チェック完了！ {flagged}/{len(images)} 枚が不要と判定されました。")
    if flagged:
        print("'python imgtools.py purge --dry-run' で削除対象を確認できます。")


def cmd_purge(args):
    """quality で不要判定された画像を削除"""
    cache = load_cache()
    targets = [
        (BASE_DIR / rel, info)
        for rel, info in cache.items()
        if not info.get("quality_ok", True)
    ]
    targets = [(p, info) for p, info in targets if p.exists()]

    if not targets:
        print("\n削除対象がありません（quality コマンドを先に実行してください）。")
        return

    print(f"\n{'=' * 50}")
    print(f"  Purge Plan: {len(targets)} files")
    print(f"{'=' * 50}\n")
    for path, info in targets:
        reason = info.get("quality_reason", "")
        print(f"  🗑  {path.relative_to(BASE_DIR)}  [{reason}]")

    if args.dry_run:
        print("\n[DRY RUN] 実際の削除は行いません。")
        print("実行するには: python imgtools.py purge")
        return

    confirm = input(f"\n{len(targets)} 枚を完全削除しますか? (y/N): ").strip().lower()
    if confirm != "y":
        print("キャンセルしました。")
        return

    deleted = 0
    for path, _ in targets:
        try:
            rel = str(path.relative_to(BASE_DIR))
            path.unlink()
            cache.pop(rel, None)
            deleted += 1
        except Exception as e:
            print(f"  [ERROR] {path.name}: {e}")

    save_cache(cache)
    print(f"\n✅ {deleted} 枚を削除しました。")


def cmd_upscale(args):
    """Upscayl で画像を高画質化"""
    if not UPSCAYL_BIN.exists():
        print("Error: Upscayl が見つかりません。")
        print("  https://upscayl.org からインストールしてください。")
        return

    model = args.model
    scale = args.scale

    # 利用可能なモデルを表示
    if args.list_models:
        models = sorted(p.stem for p in UPSCAYL_MODELS.glob("*.param"))
        print("\n利用可能なモデル:")
        for m in models:
            mark = " ← default" if m == UPSCAYL_DEFAULT_MODEL else ""
            print(f"  {m}{mark}")
        return

    # 対象画像の決定
    if args.source:
        target = Path(args.source).resolve()
        if target.is_file():
            images = [target]  # 単一ファイル指定
        else:
            images = find_images(target, recursive=not args.no_recursive)
    elif args.folder:
        images = find_images(BASE_DIR / args.folder, recursive=True)
    else:
        images = find_images(BASE_DIR)

    # HEIC/SVG/GIF は upscayl-bin が非対応なので除外
    unsupported = {".heic", ".heif", ".svg", ".gif"}
    images = [img for img in images if img.suffix.lower() not in unsupported]

    if not images:
        print("対象画像が見つかりませんでした。")
        return

    # 出力ディレクトリ
    out_dir = Path(args.output) if args.output else None

    # 既にアップスケール済みのものをスキップ（最終ファイルが存在し、かつ元が jpg なら同名なので除外しない）
    if not args.force:
        def is_done(img: Path) -> bool:
            final = _upscale_final(img, out_dir)
            # 元ファイルと最終ファイルが同じパス（例: img.jpg → img.jpg）の場合はスキップ不可
            if final == img:
                return False
            return final.exists()
        before = len(images)
        images = [img for img in images if not is_done(img)]
        skipped = before - len(images)
        if skipped:
            print(f"  {skipped} 枚はスキップ（処理済み）。--force で再処理できます。")

    if not images:
        print("処理する画像がありません（すべて処理済み）。")
        return

    print(f"\n{'=' * 55}")
    print(f"  🔍 Upscayl 高画質化: {len(images)} 枚")
    print(f"  モデル : {model}")
    print(f"  スケール: ×{scale}")
    if out_dir:
        print(f"  出力先 : {out_dir}")
    if args.dry_run:
        print(f"  [DRY RUN]")
    print(f"{'=' * 55}\n")

    if args.dry_run:
        for img in images:
            final = _upscale_final(img, out_dir)
            print(f"  [DRY] {img.name} → {final.name} (元ファイル削除)")
        return

    if out_dir:
        out_dir.mkdir(parents=True, exist_ok=True)

    import subprocess
    done = 0
    for i, img in enumerate(images):
        dest = _upscale_dest(img, out_dir)
        dest.parent.mkdir(parents=True, exist_ok=True)
        print(f"  [{i + 1}/{len(images)}] {img.name} → {dest.name} ... ", end="", flush=True)
        try:
            result = subprocess.run(
                [
                    str(UPSCAYL_BIN),
                    "-i", str(img),
                    "-o", str(dest),
                    "-m", str(UPSCAYL_MODELS),
                    "-n", model,
                    "-s", str(scale),
                    "-f", "jpg",
                ],
                capture_output=True,
                text=True,
                timeout=300,
            )
            if result.returncode == 0 and dest.exists():
                size_before = img.stat().st_size
                size_after = dest.stat().st_size
                # 元ファイルを削除してから _upscaled サフィックスなしにリネーム
                final = dest.parent / (img.stem + ".jpg")
                img.unlink()
                dest.rename(final)
                print(f"✓ ({_fmt_size(size_before)} → {_fmt_size(size_after)})")
                done += 1
            else:
                err = result.stderr.strip().splitlines()[-1] if result.stderr.strip() else "unknown error"
                print(f"ERROR: {err}")
        except subprocess.TimeoutExpired:
            print("TIMEOUT")
        except Exception as e:
            print(f"ERROR: {e}")

    print(f"\n完了: {done}/{len(images)} 枚を高画質化しました。")


def _upscale_dest(img: Path, out_dir: Path | None) -> Path:
    """upscayl-bin への出力パス（一時的に _upscaled サフィックスを使う）"""
    dest_dir = out_dir if out_dir else img.parent
    return dest_dir / f"{img.stem}_upscaled.jpg"


def _upscale_final(img: Path, out_dir: Path | None) -> Path:
    """アップスケール完了後の最終ファイルパス（元ファイル名.jpg）"""
    dest_dir = out_dir if out_dir else img.parent
    return dest_dir / f"{img.stem}.jpg"


def _fmt_size(n: int) -> str:
    if n < 1024 * 1024:
        return f"{n / 1024:.0f} KB"
    return f"{n / 1024 / 1024:.1f} MB"


# ─── RAG ヘルパー ────────────────────────────────────────

def get_chroma_collection():
    import chromadb
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    return client.get_or_create_collection(
        "images",
        metadata={"hnsw:space": "cosine"},
    )


def generate_caption(path: Path) -> str:
    """llava:7b で画像の詳細な説明文を生成"""
    img_b64 = image_to_base64(path)
    prompt = (
        "Describe this image in detail in English. "
        "Include the main subjects, colors, setting, and mood. "
        "Be concise but descriptive (2-3 sentences)."
    )
    resp = requests.post(
        f"{OLLAMA_URL}/api/generate",
        json={
            "model": VISION_MODEL,
            "prompt": prompt,
            "images": [img_b64],
            "stream": False,
            "options": {"temperature": 0.3},
        },
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()["response"].strip()


def generate_embedding(text: str) -> list:
    """nomic-embed-text でテキストの embedding を生成"""
    resp = requests.post(
        f"{OLLAMA_URL}/api/embeddings",
        json={"model": EMBED_MODEL, "prompt": text},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["embedding"]


# ─── caption コマンド ─────────────────────────────────────

def cmd_caption(args):
    """llava:7b で画像のキャプションを生成してキャッシュに保存"""
    try:
        resp = requests.get(f"{OLLAMA_URL}/api/tags", timeout=5)
        models = [m["name"] for m in resp.json().get("models", [])]
        if not any(VISION_MODEL.split(":")[0] in m for m in models):
            print(f"Error: ビジョンモデル '{VISION_MODEL}' がインストールされていません。")
            print(f"  実行: ollama pull {VISION_MODEL}")
            return
    except requests.ConnectionError:
        print("Error: Ollama サーバーに接続できません。'ollama serve' を実行してください。")
        return

    images = find_images(BASE_DIR)
    cache = load_cache()

    if not args.force:
        images = [img for img in images if "caption" not in cache.get(get_cache_key(img), {})]

    if not images:
        print("キャプション生成する画像がありません（すべて生成済み）。--force で再生成できます。")
        return

    print(f"\n{len(images)} 画像のキャプションを生成中... (model: {VISION_MODEL})\n")

    for i, img in enumerate(images):
        rel = get_cache_key(img)
        print(f"  [{i + 1}/{len(images)}] {img.name} ... ", end="", flush=True)
        try:
            caption = generate_caption(img)
            print("OK")
            if rel not in cache:
                cache[rel] = {}
            cache[rel]["caption"] = caption
            if (i + 1) % 10 == 0:
                save_cache(cache)
        except Exception as e:
            print(f"ERROR: {e}")

    save_cache(cache)
    print(f"\nキャプション生成完了！次は 'embed' でベクトル化してください。")


# ─── embed コマンド ───────────────────────────────────────

def cmd_embed(args):
    """キャプションから embedding を生成して ChromaDB に保存"""
    try:
        import chromadb  # noqa: F401
    except ImportError:
        print("Error: chromadb がインストールされていません。pip install chromadb")
        return

    cache = load_cache()
    captioned = [(k, v) for k, v in cache.items() if "caption" in v]

    if not captioned:
        print("キャプションが生成されている画像がありません。先に 'caption' を実行してください。")
        return

    collection = get_chroma_collection()

    existing: set = set()
    if not args.force:
        try:
            result = collection.get(ids=[k for k, _ in captioned])
            existing = set(result["ids"])
        except Exception:
            pass

    to_embed = [(k, v) for k, v in captioned if k not in existing]

    if not to_embed:
        print(f"embedding する画像がありません（{len(captioned)} 件すべて完了済み）。--force で再生成できます。")
        return

    print(f"\n{len(to_embed)} 画像の embedding を生成中... (model: {EMBED_MODEL})\n")

    batch_ids, batch_embeddings, batch_documents, batch_metadatas = [], [], [], []

    for i, (key, info) in enumerate(to_embed):
        print(f"  [{i + 1}/{len(to_embed)}] {info.get('name', key)} ... ", end="", flush=True)
        try:
            caption = info["caption"]
            text = f"{info.get('category', '')} {caption}".strip()
            embedding = generate_embedding(text)

            batch_ids.append(key)
            batch_embeddings.append(embedding)
            batch_documents.append(caption)
            batch_metadatas.append({
                "path": key,
                "category": info.get("category", ""),
                "name": info.get("name", ""),
            })
            print("OK")

            if len(batch_ids) >= 50:
                collection.upsert(
                    ids=batch_ids,
                    embeddings=batch_embeddings,
                    documents=batch_documents,
                    metadatas=batch_metadatas,
                )
                batch_ids, batch_embeddings, batch_documents, batch_metadatas = [], [], [], []

        except Exception as e:
            print(f"ERROR: {e}")

    if batch_ids:
        collection.upsert(
            ids=batch_ids,
            embeddings=batch_embeddings,
            documents=batch_documents,
            metadatas=batch_metadatas,
        )

    print(f"\nembedding 生成完了！ChromaDB: {CHROMA_DIR}")


# ─── edit コマンド（画像編集・Pillow）──────────────────────

def cmd_edit(args):
    """
    画像編集コマンド。引数で指定した調整を適用して保存する。
    出力: JSON {"ok": true, "path": "..."} or {"ok": false, "error": "..."}
    """
    import json as _json
    from PIL import ImageEnhance, ImageOps, ImageFilter

    try:
        src_rel = args.path  # IMAGES_DIR からの相対パス
        src = BASE_DIR / src_rel

        if not src.exists():
            print(_json.dumps({"ok": False, "error": f"File not found: {src_rel}"}))
            return

        img = Image.open(src)
        if img.mode in ("P", "RGBA") and not args.rembg:
            img = img.convert("RGB")
        elif img.mode not in ("RGB", "RGBA", "L"):
            img = img.convert("RGB")

        # ── 調整 ────────────────────────────────────────────
        if args.brightness != 100:
            img = ImageEnhance.Brightness(img.convert("RGB")).enhance(args.brightness / 100)
        if args.contrast != 100:
            img = ImageEnhance.Contrast(img.convert("RGB")).enhance(args.contrast / 100)
        if args.saturation != 100:
            img = ImageEnhance.Color(img.convert("RGB")).enhance(args.saturation / 100)
        if args.sharpness != 100:
            img = ImageEnhance.Sharpness(img.convert("RGB")).enhance(args.sharpness / 100)

        # ── プリセットフィルター ─────────────────────────────
        if args.filter == "mono":
            img = ImageOps.grayscale(img).convert("RGB")
        elif args.filter == "sepia":
            img = ImageOps.grayscale(img).convert("RGB")
            w, h = img.size
            pixels = img.load()
            for y in range(h):
                for x in range(w):
                    r, g, b = pixels[x, y]  # type: ignore
                    pixels[x, y] = (  # type: ignore
                        min(255, int(r * 1.07 + g * 0.74 + b * 0.28)),
                        min(255, int(r * 0.95 + g * 0.88 + b * 0.48)),
                        min(255, int(r * 0.75 + g * 0.60 + b * 0.62)),
                    )
        elif args.filter == "vivid":
            img = ImageEnhance.Color(img.convert("RGB")).enhance(1.6)
            img = ImageEnhance.Contrast(img).enhance(1.1)
        elif args.filter == "cool":
            from PIL import ImageFilter as _IF
            img = img.convert("RGB")
        elif args.filter == "blur":
            img = img.filter(ImageFilter.GaussianBlur(radius=2))

        # ── 回転・反転 ───────────────────────────────────────
        if args.flip_h:
            img = ImageOps.mirror(img)
        if args.flip_v:
            img = ImageOps.flip(img)
        if args.rotation != 0:
            img = img.rotate(-args.rotation, expand=True)

        # ── トリミング ───────────────────────────────────────
        # crop = "x,y,w,h" (ピクセル値)
        if args.crop:
            try:
                cx, cy, cw, ch = map(int, args.crop.split(","))
                img = img.crop((cx, cy, cx + cw, cy + ch))
            except Exception as e:
                print(_json.dumps({"ok": False, "error": f"Invalid crop: {e}"}))
                return

        # ── リサイズ ─────────────────────────────────────────
        # resize = "w,h"
        if args.resize:
            try:
                rw, rh = map(int, args.resize.split(","))
                img = img.resize((rw, rh), Image.LANCZOS)
            except Exception as e:
                print(_json.dumps({"ok": False, "error": f"Invalid resize: {e}"}))
                return

        # ── 背景除去 ─────────────────────────────────────────
        if args.rembg:
            try:
                from rembg import remove as rembg_remove
                img = rembg_remove(img)
            except ImportError:
                print(_json.dumps({"ok": False, "error": "rembg not installed. Run: pip install rembg"}))
                return

        # ── 保存 ─────────────────────────────────────────────
        if args.save_as == "copy":
            stem = src.stem
            suffix = ".png" if args.rembg else src.suffix
            dest = src.parent / f"{stem}_edited{suffix}"
            # 重複回避
            counter = 1
            while dest.exists():
                dest = src.parent / f"{stem}_edited_{counter}{suffix}"
                counter += 1
        else:
            dest = src
            suffix = src.suffix

        save_fmt = "PNG" if (args.rembg or suffix.lower() == ".png") else "JPEG"
        save_kwargs: dict = {}
        if save_fmt == "JPEG":
            save_kwargs["quality"] = 92
            save_kwargs["optimize"] = True
            if img.mode != "RGB":
                img = img.convert("RGB")

        img.save(dest, format=save_fmt, **save_kwargs)

        dest_rel = str(dest.relative_to(BASE_DIR))
        print(_json.dumps({"ok": True, "path": dest_rel}))

    except Exception as e:
        import traceback
        print(_json.dumps({"ok": False, "error": str(e), "trace": traceback.format_exc()}))


# ─── palette コマンド（カラーパレット抽出）────────────────

def cmd_palette(args):
    """画像から主要カラーパレットを抽出してJSON出力"""
    import json as _json
    try:
        src = BASE_DIR / args.path
        if not src.exists():
            print(_json.dumps({"ok": False, "error": "File not found"}))
            return

        n = args.n  # 抽出色数（デフォルト5）

        with Image.open(src) as img:
            img = img.convert("RGB").resize((150, 150))
            pixels = list(img.getdata())

        # 簡易k-means: quantize で減色してから頻度順に並べる
        import numpy as _np
        from PIL import Image as _Img
        small = _Img.fromarray(
            _np.array(pixels, dtype="uint8").reshape(150, 150, 3)
        )
        quantized = small.quantize(colors=n, method=_Img.Quantize.MEDIANCUT)
        palette_raw = quantized.getpalette()[:n*3]
        colors = []
        for i in range(n):
            r, g, b = palette_raw[i*3], palette_raw[i*3+1], palette_raw[i*3+2]
            colors.append(f"#{r:02x}{g:02x}{b:02x}")

        print(_json.dumps({"ok": True, "colors": colors}))
    except Exception as e:
        print(_json.dumps({"ok": False, "error": str(e)}))


# ─── suggest コマンド（フォルダ内の誤分類を提案）───────────

# カテゴリ → 推奨フォルダ名のマッピング
CATEGORY_TO_FOLDER = {cat: cat for cat in CATEGORIES}

# フォルダ名から「期待されるカテゴリ群」へのマッピング
# キー: フォルダ名 (部分一致)、値: そのフォルダに適切な category リスト
FOLDER_EXPECTED_CATEGORIES: list[tuple[str, list[str]]] = [
    ("anime",       ["anime_illustration"]),
    ("illust",      ["anime_illustration"]),
    ("people",      ["photo_people"]),
    ("person",      ["photo_people"]),
    ("人物",         ["photo_people"]),
    ("portrait",    ["photo_people"]),
    ("landscape",   ["photo_landscape"]),
    ("nature",      ["photo_landscape"]),
    ("風景",         ["photo_landscape"]),
    ("food",        ["photo_food"]),
    ("食べ物",       ["photo_food"]),
    ("object",      ["photo_object"]),
    ("screenshot",  ["screenshot"]),
    ("screen",      ["screenshot"]),
    ("meme",        ["meme_funny"]),
    ("funny",       ["meme_funny"]),
    ("document",    ["document"]),
    ("doc",         ["document"]),
    ("artwork",     ["artwork"]),
    ("art",         ["artwork"]),
]


def _get_expected_categories(folder_name: str) -> list[str]:
    """フォルダ名から期待されるカテゴリリストを返す"""
    fn_lower = folder_name.lower()
    for key, cats in FOLDER_EXPECTED_CATEGORIES:
        if key in fn_lower:
            return cats
    return []


def _suggest_category_by_embedding(img_rel: str, k: int = 15) -> tuple[str | None, float]:
    """ChromaDB の embedding を使って k-NN 投票でカテゴリを推定する。
    Returns: (predicted_category, confidence 0-1)  どちらも None/0 なら embedding なし
    """
    try:
        import chromadb  # noqa: F401
    except ImportError:
        return None, 0.0

    try:
        collection = get_chroma_collection()
        total = collection.count()
        if total < 2:
            return None, 0.0

        # 自画像の embedding を取得
        result = collection.get(ids=[img_rel], include=["embeddings"])
        if not result["ids"]:
            return None, 0.0

        embedding = result["embeddings"][0]

        # k+1 件取得して自分自身を除外
        n = min(k + 1, total)
        results = collection.query(
            query_embeddings=[embedding],
            n_results=n,
            include=["metadatas", "distances"],
        )

        neighbors = [
            (meta, dist)
            for meta, dist in zip(results["metadatas"][0], results["distances"][0])
            if meta.get("path") != img_rel and meta.get("category")
        ][:k]

        if not neighbors:
            return None, 0.0

        # 距離の逆数で重み付き投票（cosine distance: 近いほど 0 に近い）
        votes: dict[str, float] = defaultdict(float)
        for meta, dist in neighbors:
            cat = meta["category"]
            weight = 1.0 / (0.001 + dist)
            votes[cat] += weight

        best_cat = max(votes, key=lambda c: votes[c])
        confidence = votes[best_cat] / sum(votes.values())
        return best_cat, round(confidence, 3)

    except Exception:
        return None, 0.0


def cmd_suggest(args):
    """フォルダ内の誤分類を検出して移動提案（JSON Lines）

    判定優先度:
      1. ChromaDB embedding による k-NN 投票（最も精度が高い）
      2. キャッシュの category フィールド（embedding がない場合）
      3. Ollama ビジョンモデルによる再分類（--force-classify 時）
    """
    import json as _json

    folder_name: str = args.folder
    force_classify: bool = getattr(args, "force_classify", False)
    knn_k: int = getattr(args, "knn_k", 15)
    confidence_threshold: float = getattr(args, "confidence", 0.55)

    target_dir = BASE_DIR / folder_name
    if not target_dir.exists():
        print(_json.dumps({"error": f"フォルダが見つかりません: {folder_name}"}), flush=True)
        sys.exit(1)

    expected_cats = _get_expected_categories(folder_name)

    images = find_images(target_dir, recursive=False)
    if not images:
        print(_json.dumps({"done": True, "total": 0, "suggestions": []}), flush=True)
        return

    # ChromaDB が使えるか確認
    chroma_available = False
    try:
        import chromadb  # noqa: F401
        col = get_chroma_collection()
        chroma_available = col.count() > 0
    except Exception:
        pass

    if chroma_available:
        print(_json.dumps({"log": f"ChromaDB embedding で k-NN 判定 (k={knn_k}, threshold={confidence_threshold})"}), flush=True)
    else:
        print(_json.dumps({"log": "ChromaDB embedding なし。キャッシュ category を使用"}), flush=True)

    # Ollama 生存確認
    ollama_ok = False
    try:
        resp = requests.get(f"{OLLAMA_URL}/api/tags", timeout=5)
        models = [m["name"] for m in resp.json().get("models", [])]
        ollama_ok = any(VISION_MODEL.split(":")[0] in m for m in models)
    except Exception:
        pass

    cache = load_cache()
    suggestions = []
    total = len(images)

    for i, img in enumerate(images):
        rel = get_cache_key(img)
        entry = cache.get(rel, {})

        print(_json.dumps({"progress": i + 1, "total": total, "file": img.name}), flush=True)

        category = None
        confidence = 0.0
        method = "unknown"

        # ── 1. k-NN embedding 判定 ────────────────────────────────
        if chroma_available:
            knn_cat, knn_conf = _suggest_category_by_embedding(rel, k=knn_k)
            if knn_cat and knn_conf >= confidence_threshold:
                category = knn_cat
                confidence = knn_conf
                method = f"embedding k-NN (conf={knn_conf:.0%})"

        # ── 2. キャッシュの category ──────────────────────────────
        if not category:
            cached_cat = entry.get("category")
            if cached_cat:
                category = cached_cat
                confidence = 0.5  # キャッシュは信頼度を中程度に
                method = "cache"

        # ── 3. Ollama ビジョン再分類 ──────────────────────────────
        if not category and (ollama_ok or force_classify):
            try:
                category = classify_image_with_ollama(img)
                if rel not in cache:
                    cache[rel] = {}
                cache[rel]["category"] = category
                cache[rel]["name"] = img.name
                confidence = 0.6
                method = "ollama vision"
            except Exception:
                pass

        if not category:
            continue  # 判定不能はスキップ

        # ── フォルダとのミスマッチ判定 ────────────────────────────
        is_mismatch = False
        if expected_cats:
            is_mismatch = category not in expected_cats
        else:
            is_mismatch = (folder_name.lower() != category.lower())

        if is_mismatch:
            suggested_folder = CATEGORY_TO_FOLDER.get(category, "other")
            suggestions.append({
                "path": rel,
                "filename": img.name,
                "current_folder": folder_name,
                "current_category": category,
                "current_category_label": CATEGORY_LABELS.get(category, category),
                "suggested_folder": suggested_folder,
                "confidence": confidence,
                "method": method,
            })

    save_cache(cache)

    # 信頼度降順でソート
    suggestions.sort(key=lambda s: s["confidence"], reverse=True)

    print(_json.dumps({
        "done": True,
        "total": total,
        "suggestions": suggestions,
        "chroma_used": chroma_available,
    }), flush=True)


# ─── tag コマンド（用途タグ自動付与）──────────────────────

def cmd_tag(args):
    """カテゴリをもとに usage_tags を自動付与する"""
    dry_run: bool = getattr(args, "dry_run", False)
    force: bool   = getattr(args, "force", False)

    cache  = load_cache()
    images = find_images()

    tagged     = 0
    skipped    = 0
    no_cat     = 0

    for img in images:
        key   = get_cache_key(img)
        entry = cache.get(key, {})
        category = entry.get("category")

        if not category:
            no_cat += 1
            continue

        # すでにタグがある場合は --force のときのみ上書き
        if entry.get("usage_tags") and not force:
            skipped += 1
            continue

        suggested = CATEGORY_TO_USAGE_TAGS.get(category, [])
        if not suggested:
            skipped += 1
            continue

        labels = " / ".join(USAGE_TAG_LABELS.get(t, t) for t in suggested)
        prefix = "[DRY]" if dry_run else "[TAG]"
        print(f"{prefix} {key}  →  {labels}")

        if not dry_run:
            if key not in cache:
                cache[key] = {}
            cache[key]["usage_tags"] = suggested

        tagged += 1

    if not dry_run and tagged > 0:
        save_cache(cache)

    mode = "プレビュー（変更なし）" if dry_run else "完了"
    print()
    print("=" * 50)
    print(f"  {mode}")
    print(f"  タグ付け : {tagged} 件")
    print(f"  スキップ : {skipped} 件（タグ済 or タグなしカテゴリ）")
    print(f"  未分類   : {no_cat} 件（category 未設定）")
    print("=" * 50)


# ─── analyze コマンド（一括処理）────────────────────────────

def cmd_analyze(args):
    """AI一括処理: 分類 → 品質チェック → キャプション → ベクトル化"""
    print("=" * 60)
    print("  AI一括処理")
    print("  分類 → 品質チェック → キャプション → ベクトル化")
    print("=" * 60)

    class _Args:
        force = False
        include_download = False
        folder = None
        source = None

    a = _Args()

    print("\n[1/4] AI分類中...\n")
    cmd_classify(a)

    print("\n[2/4] AI品質チェック中...\n")
    cmd_quality(a)

    print("\n[3/4] キャプション生成中...\n")
    cmd_caption(a)

    print("\n[4/4] ベクトル化中...\n")
    cmd_embed(a)

    print("\n" + "=" * 60)
    print("  AI一括処理 完了！")
    print("  Toolbar の ✦ AI ボタンでセマンティック検索が使えます。")
    print("=" * 60)


# ─── search コマンド ──────────────────────────────────────

def cmd_search(args):
    """セマンティック検索（JSON 出力）"""
    try:
        import chromadb  # noqa: F401
    except ImportError:
        print(json.dumps({"error": "chromadb not installed"}))
        return

    query = args.query
    n = getattr(args, "limit", 20)

    try:
        collection = get_chroma_collection()
        count = collection.count()
        if count == 0:
            print(json.dumps({"error": "No embeddings found. Run 'caption' then 'embed' first."}))
            return

        query_embedding = generate_embedding(query)
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=min(n, count),
            include=["documents", "metadatas", "distances"],
        )

        output = []
        for doc, meta, dist in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        ):
            output.append({
                "path": meta["path"],
                "score": round(1 - dist, 4),
                "caption": doc,
                "category": meta.get("category", ""),
                "name": meta.get("name", ""),
            })

        print(json.dumps(output, ensure_ascii=False))

    except Exception as e:
        print(json.dumps({"error": str(e)}))


# ─── similar コマンド ─────────────────────────────────────

def cmd_similar(args):
    """類似画像検索（JSON 出力）"""
    try:
        import chromadb  # noqa: F401
    except ImportError:
        print(json.dumps({"error": "chromadb not installed"}))
        return

    target_path = args.path
    n = getattr(args, "limit", 12)

    try:
        collection = get_chroma_collection()

        result = collection.get(ids=[target_path], include=["embeddings"])
        if not result["ids"]:
            print(json.dumps({"error": f"Image not embedded: {target_path}. Run 'embed' first."}))
            return

        target_embedding = result["embeddings"][0]
        total = collection.count()

        results = collection.query(
            query_embeddings=[target_embedding],
            n_results=min(n + 1, total),
            include=["documents", "metadatas", "distances"],
        )

        output = []
        for doc, meta, dist in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        ):
            if meta["path"] == target_path:
                continue
            output.append({
                "path": meta["path"],
                "score": round(1 - dist, 4),
                "caption": doc,
                "category": meta.get("category", ""),
                "name": meta.get("name", ""),
            })

        print(json.dumps(output[:n], ensure_ascii=False))

    except Exception as e:
        print(json.dumps({"error": str(e)}))


# ─── メイン ─────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description="imgtools - ローカル画像管理・AI自動分類ツール",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    sub = parser.add_subparsers(dest="command")

    # auto コマンド（最重要）
    sub.add_parser("auto", help="全自動: download → images → 分類 → 整理")

    # rename コマンド
    p_rename = sub.add_parser("rename", help="ファイル名を整理（カテゴリ_001.jpg形式）")
    p_rename.add_argument("--dry-run", action="store_true", help="プレビューのみ（リネームしない）")

    # scan コマンド
    p_scan = sub.add_parser("scan", help="画像の概要を表示")
    p_scan.add_argument("--source", help="スキャン対象ディレクトリ（デフォルト: IMAGES_DIR）")
    p_scan.add_argument("--include-download", action="store_true",
                        help=f"~/dev/download と ~/Downloads も対象にする")

    # dupes コマンド
    p_dupes = sub.add_parser("dupes", help="重複画像を検出")
    p_dupes.add_argument("--include-download", action="store_true",
                         help=f"~/dev/download と ~/Downloads も対象にする")

    # classify コマンド
    p_classify = sub.add_parser("classify", help="AIで画像を自動分類")
    p_classify.add_argument("--folder", help="対象フォルダを限定")
    p_classify.add_argument("--source", help="別ディレクトリを分類（例: /download）")
    p_classify.add_argument("--force", action="store_true", help="分類済みも再分類")
    p_classify.add_argument("--include-download", action="store_true",
                            help=f"~/dev/download と ~/Downloads も対象にする")

    # organize コマンド
    p_organize = sub.add_parser("organize", help="分類結果に基づいてフォルダ整理")
    p_organize.add_argument("--dry-run", action="store_true", help="プレビューのみ（移動しない）")

    # stats コマンド
    sub.add_parser("stats", help="分類結果の統計表示")

    # quality コマンド
    p_quality = sub.add_parser("quality", help="AIで不要画像を判定（ブレ・低品質）")
    p_quality.add_argument("--force", action="store_true", help="判定済みも再チェック")
    p_quality.add_argument("--include-download", action="store_true",
                           help=f"~/dev/download と ~/Downloads も対象にする")

    # purge コマンド
    p_purge = sub.add_parser("purge", help="quality で不要判定された画像を削除")
    p_purge.add_argument("--dry-run", action="store_true", help="プレビューのみ（削除しない）")

    # analyze コマンド
    sub.add_parser("analyze", help="AI一括処理: 分類 → 品質チェック → キャプション → ベクトル化")

    # edit コマンド
    p_edit = sub.add_parser("edit", help="画像編集（Pillow）")
    p_edit.add_argument("path", help="IMAGES_DIR からの相対パス")
    p_edit.add_argument("--brightness", type=int, default=100)
    p_edit.add_argument("--contrast",   type=int, default=100)
    p_edit.add_argument("--saturation", type=int, default=100)
    p_edit.add_argument("--sharpness",  type=int, default=100)
    p_edit.add_argument("--filter",     default="none",
                        choices=["none","mono","sepia","vivid","blur"])
    p_edit.add_argument("--rotation",   type=int, default=0)
    p_edit.add_argument("--flip-h",     action="store_true")
    p_edit.add_argument("--flip-v",     action="store_true")
    p_edit.add_argument("--crop",       help="x,y,w,h (px)")
    p_edit.add_argument("--resize",     help="w,h (px)")
    p_edit.add_argument("--rembg",      action="store_true")
    p_edit.add_argument("--save-as",    default="copy", choices=["copy","overwrite"])

    # palette コマンド
    p_palette = sub.add_parser("palette", help="画像からカラーパレットを抽出")
    p_palette.add_argument("path", help="IMAGES_DIR からの相対パス")
    p_palette.add_argument("--n", type=int, default=5, help="抽出色数")

    # suggest コマンド
    p_suggest = sub.add_parser("suggest", help="フォルダ内の誤分類画像を検出して移動提案（JSON Lines）")
    p_suggest.add_argument("folder", help="対象フォルダ名（IMAGES_DIR 内）")
    p_suggest.add_argument("--force-classify", action="store_true",
                           help="未分類画像を強制的に Ollama で分類する")
    p_suggest.add_argument("--knn-k", type=int, default=15, dest="knn_k",
                           help="k-NN の k 値（デフォルト: 15）")
    p_suggest.add_argument("--confidence", type=float, default=0.55,
                           help="k-NN 信頼度の閾値 0-1（デフォルト: 0.55）")

    # tag コマンド
    p_tag = sub.add_parser("tag", help="カテゴリをもとに用途タグを自動付与")
    p_tag.add_argument("--dry-run", action="store_true", help="プレビューのみ（変更しない）")
    p_tag.add_argument("--force", action="store_true", help="タグ済み画像も上書き")

    # caption コマンド
    p_caption = sub.add_parser("caption", help="llava:7b で画像のキャプションを生成")
    p_caption.add_argument("--force", action="store_true", help="生成済みも再生成")

    # embed コマンド
    p_embed = sub.add_parser("embed", help="キャプションから embedding を生成して ChromaDB に保存")
    p_embed.add_argument("--force", action="store_true", help="生成済みも再生成")

    # search コマンド
    p_search = sub.add_parser("search", help="セマンティック検索（JSON 出力）")
    p_search.add_argument("query", help="検索クエリ")
    p_search.add_argument("--limit", type=int, default=20, help="最大件数（デフォルト: 20）")

    # similar コマンド
    p_similar = sub.add_parser("similar", help="類似画像検索（JSON 出力）")
    p_similar.add_argument("path", help="基準画像のパス（IMAGES_DIR からの相対パス）")
    p_similar.add_argument("--limit", type=int, default=12, help="最大件数（デフォルト: 12）")

    # upscale コマンド
    p_upscale = sub.add_parser("upscale", help="Upscayl で画像を高画質化")
    p_upscale.add_argument("--model", default=UPSCAYL_DEFAULT_MODEL,
                           help=f"使用モデル (デフォルト: {UPSCAYL_DEFAULT_MODEL})")
    p_upscale.add_argument("--scale", type=int, default=4, choices=[2, 3, 4],
                           help="拡大倍率 (デフォルト: 4)")
    p_upscale.add_argument("--source", help="対象ディレクトリを直接指定")
    p_upscale.add_argument("--folder", help="IMAGES_DIR 内のサブフォルダを指定")
    p_upscale.add_argument("--output", "-o", help="出力先ディレクトリ (デフォルト: 元ファイルと同じ場所に _upscaled を付加)")
    p_upscale.add_argument("--no-recursive", action="store_true", help="サブフォルダを含めない")
    p_upscale.add_argument("--force", action="store_true", help="処理済みも再処理")
    p_upscale.add_argument("--dry-run", action="store_true", help="プレビューのみ")
    p_upscale.add_argument("--list-models", action="store_true", help="利用可能なモデル一覧を表示")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    commands = {
        "auto": cmd_auto,
        "rename": cmd_rename,
        "scan": cmd_scan,
        "dupes": cmd_dupes,
        "classify": cmd_classify,
        "organize": cmd_organize,
        "stats": cmd_stats,
        "quality": cmd_quality,
        "upscale": cmd_upscale,
        "analyze": cmd_analyze,
        "edit": cmd_edit,
        "palette": cmd_palette,
        "tag": cmd_tag,
        "caption": cmd_caption,
        "embed": cmd_embed,
        "search": cmd_search,
        "similar": cmd_similar,
        "suggest": cmd_suggest,
        "purge": cmd_purge,
    }

    commands[args.command](args)


if __name__ == "__main__":
    main()
