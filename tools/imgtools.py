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
  Download: ~/dev/download
  Images:   ~/dev/images
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

# ─── 設定 ───────────────────────────────────────────────
BASE_DIR = Path.home() / "dev" / "images"
DOWNLOAD_DIR = Path.home() / "dev" / "download"  # 固定のダウンロードフォルダ
CACHE_FILE = BASE_DIR / ".imgtools_cache.json"
OLLAMA_URL = "http://localhost:11434"
VISION_MODEL = "llava:7b"
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


# ─── ユーティリティ ─────────────────────────────────────
def find_images(target_dir: Path = BASE_DIR, recursive: bool = True) -> list[Path]:
    """画像ファイルを探す"""
    images = []
    pattern = "**/*" if recursive else "*"
    for p in target_dir.glob(pattern):
        if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS and not p.name.startswith("."):
            images.append(p)
    return sorted(images)


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


def image_to_base64(path: Path, max_size: int = 512) -> str:
    """画像をbase64に変換（リサイズしてOllamaに送る）"""
    with Image.open(path) as img:
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        img.thumbnail((max_size, max_size))
        from io import BytesIO
        buf = BytesIO()
        img.save(buf, format="JPEG", quality=80)
        return base64.b64encode(buf.getvalue()).decode()


def classify_image_with_ollama(path: Path) -> str:
    """Ollamaのビジョンモデルで画像を分類"""
    img_b64 = image_to_base64(path)

    prompt = f"""Classify this image into exactly ONE of the following categories.
Reply with ONLY the category name, nothing else.

Categories:
- anime_illustration (anime, manga, cartoon, illustration, VTuber)
- photo_people (real photos of people, portraits, selfies)
- photo_landscape (nature, scenery, buildings, outdoor photos)
- photo_food (food, drinks, cooking)
- photo_object (products, items, physical objects)
- screenshot (screen captures, UI, app screenshots)
- meme_funny (memes, funny images, reaction images)
- document (text documents, papers, notes, diagrams)
- artwork (digital art, paintings, abstract art - NOT anime style)
- other (anything that doesn't fit above)

Category:"""

    try:
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
        answer = resp.json()["response"].strip().lower()

        # カテゴリ名を抽出
        for cat in CATEGORIES:
            if cat in answer:
                return cat
        return "other"
    except Exception as e:
        print(f"  [ERROR] {path.name}: {e}")
        return "other"


# ─── コマンド ───────────────────────────────────────────
def cmd_scan(args):
    """画像の概要を表示"""
    target_dir = Path(args.source).resolve() if args.source else BASE_DIR
    images = find_images(target_dir)

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
        folder = img.parent.relative_to(BASE_DIR)
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
    images = find_images()
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
            rel = p.relative_to(BASE_DIR)
            print(f"    - {rel}")
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
    if args.source:
        target = Path(args.source).resolve()
    elif args.folder:
        target = BASE_DIR / args.folder
    else:
        target = BASE_DIR

    if not target.exists():
        print(f"Error: ディレクトリ '{target}' が見つかりません。")
        return

    images = find_images(target)
    cache = load_cache()

    # 未分類のみ
    if not args.force:
        images = [img for img in images if str(img.relative_to(BASE_DIR)) not in cache
                  or "category" not in cache.get(str(img.relative_to(BASE_DIR)), {})]

    if not images:
        print("分類する画像がありません（すべて分類済み）。--force で再分類できます。")
        return

    print(f"\n{len(images)} 画像を分類中... (model: {VISION_MODEL})\n")

    for i, img in enumerate(images):
        rel = str(img.relative_to(BASE_DIR))
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


def move_from_download(show_summary: bool = True) -> int:
    """downloadフォルダから画像を移動（内部用）"""
    source = DOWNLOAD_DIR
    dest = BASE_DIR

    if not source.exists():
        if show_summary:
            print(f"ℹ️  Download フォルダが空です: {source}")
        return 0

    dest.mkdir(parents=True, exist_ok=True)

    # 画像と動画を検出
    images = find_images(source, recursive=False)
    videos = []
    for p in source.glob("*"):
        if p.is_file() and p.suffix.lower() in VIDEO_EXTENSIONS:
            videos.append(p)

    if not images and not videos:
        if show_summary:
            print("ℹ️  移動するファイルがありません。")
        return 0

    if show_summary:
        print(f"\n📥 Download → Images")
        print(f"  画像: {len(images)}枚")
        print(f"  動画: {len(videos)}本")

    moved = 0
    # 画像を移動
    for img in images:
        try:
            dest_path = dest / img.name
            if dest_path.exists():
                if show_summary:
                    print(f"  [SKIP] {img.name} (already exists)")
                continue
            img.rename(dest_path)
            moved += 1
        except Exception as e:
            print(f"  [ERROR] {img.name}: {e}")

    # 動画を移動
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

    if show_summary:
        print(f"✅ {moved} ファイルを移動しました。\n")
    return moved


def cmd_auto(args):
    """全自動処理: download → images → 分類 → 整理"""
    print("=" * 60)
    print("  🤖 imgtools - 全自動モード")
    print("=" * 60)
    print(f"  Download: {DOWNLOAD_DIR}")
    print(f"  Images  : {BASE_DIR}")
    print("=" * 60)

    # ステップ1: 移動
    print("\n[1/3] 📥 ファイル移動中...")
    moved = move_from_download(show_summary=True)

    if moved == 0:
        print("\n✅ 新しいファイルがありません。処理を終了します。")
        return

    # ステップ2: 分類
    print("\n[2/3] 🔍 AI分類中...")
    try:
        resp = requests.get(f"{OLLAMA_URL}/api/tags", timeout=5)
        models = [m["name"] for m in resp.json().get("models", [])]
        if not any(VISION_MODEL.split(":")[0] in m for m in models):
            print(f"⚠️  Ollamaモデル '{VISION_MODEL}' がありません。分類をスキップします。")
            return
    except requests.ConnectionError:
        print("⚠️  Ollama未起動。分類をスキップします。")
        return

    # 未分類の画像のみ分類
    images = find_images(BASE_DIR)
    cache = load_cache()
    unclassified = [img for img in images if str(img.relative_to(BASE_DIR)) not in cache
                    or "category" not in cache.get(str(img.relative_to(BASE_DIR)), {})]

    if unclassified:
        print(f"  {len(unclassified)}枚の画像を分類中...\n")
        for i, img in enumerate(unclassified):
            rel = str(img.relative_to(BASE_DIR))
            print(f"  [{i + 1}/{len(unclassified)}] {img.name} ... ", end="", flush=True)

            try:
                category = classify_image_with_ollama(img)
                label = CATEGORY_LABELS.get(category, category)
                print(f"→ {label}")

                if rel not in cache:
                    cache[rel] = {}
                cache[rel]["category"] = category
                cache[rel]["name"] = img.name

                if (i + 1) % 10 == 0:
                    save_cache(cache)
            except Exception as e:
                print(f"ERROR: {e}")

        save_cache(cache)
        print("\n✅ 分類完了！")
    else:
        print("  すべて分類済みです。")

    # ステップ3: 整理
    print("\n[3/3] 📁 フォルダ整理中...")

    classified = {k: v for k, v in cache.items() if "category" in v}
    moves = []
    for rel_path, info in classified.items():
        src = BASE_DIR / rel_path
        if not src.exists():
            continue

        category = info["category"]
        parent_name = src.parent.name
        if parent_name == category:
            continue

        dest_dir = BASE_DIR / category
        dest = dest_dir / src.name

        if dest.exists():
            stem = dest.stem
            suffix = dest.suffix
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

    images = find_images(BASE_DIR)
    cache = load_cache()

    if not args.force:
        images = [img for img in images if "quality_ok" not in cache.get(str(img.relative_to(BASE_DIR)), {})]

    if not images:
        print("チェックする画像がありません（すべて判定済み）。--force で再判定できます。")
        return

    print(f"\n{len(images)} 画像の品質をチェック中... (model: {VISION_MODEL})\n")

    flagged = 0
    for i, img in enumerate(images):
        rel = str(img.relative_to(BASE_DIR))
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

            # JSON部分を抽出
            import re
            match = re.search(r'\{[^}]+\}', raw)
            if match:
                result = json.loads(match.group())
                keep = bool(result.get("keep", True))
                reason = str(result.get("reason", ""))
            else:
                keep = True
                reason = ""

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
    print("Web UIの「クリーンアップ」ページで確認・削除できます。")


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
    p_scan.add_argument("--source", help="スキャン対象ディレクトリ（デフォルト: カレント）")

    # dupes コマンド
    sub.add_parser("dupes", help="重複画像を検出")

    # classify コマンド
    p_classify = sub.add_parser("classify", help="AIで画像を自動分類")
    p_classify.add_argument("--folder", help="対象フォルダを限定")
    p_classify.add_argument("--source", help="別ディレクトリを分類（例: /download）")
    p_classify.add_argument("--force", action="store_true", help="分類済みも再分類")

    # organize コマンド
    p_organize = sub.add_parser("organize", help="分類結果に基づいてフォルダ整理")
    p_organize.add_argument("--dry-run", action="store_true", help="プレビューのみ（移動しない）")

    # stats コマンド
    sub.add_parser("stats", help="分類結果の統計表示")

    # quality コマンド
    p_quality = sub.add_parser("quality", help="AIで不要画像を判定（ブレ・低品質）")
    p_quality.add_argument("--force", action="store_true", help="判定済みも再チェック")

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
    }

    commands[args.command](args)


if __name__ == "__main__":
    main()
