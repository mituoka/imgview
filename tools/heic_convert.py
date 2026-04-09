#!/usr/bin/env python3
"""
heic_convert - HEIC/HEIF → JPEG 一括変換ツール

使い方:
  python heic_convert.py                        # ~/dev/images 内を変換
  python heic_convert.py /path/to/dir           # 指定フォルダを変換
  python heic_convert.py --dry-run              # プレビューのみ
  python heic_convert.py --keep                 # 元の HEIC ファイルを残す
  python heic_convert.py --quality 90           # JPEG品質 (デフォルト: 85)
"""

import argparse
import os
import sys
from pathlib import Path

try:
    import pillow_heif
    from PIL import Image
    pillow_heif.register_heif_opener()
except ImportError:
    print("Error: pillow-heif が必要です。")
    print("  pip install pillow-heif")
    sys.exit(1)


def convert_heic(src: Path, quality: int = 85, keep: bool = False, dry_run: bool = False) -> bool:
    """1ファイルを変換。成功時 True を返す。"""
    dest = src.with_suffix(".jpg")

    if dest.exists():
        print(f"  [SKIP] {src.name} → {dest.name} (already exists)")
        return False

    if dry_run:
        print(f"  [DRY]  {src.name} → {dest.name}")
        return True

    try:
        with Image.open(src) as img:
            rgb = img.convert("RGB")
            rgb.save(dest, "JPEG", quality=quality)
        size_before = src.stat().st_size
        size_after = dest.stat().st_size
        ratio = size_after / size_before * 100
        print(f"  ✓ {src.name} → {dest.name}  ({_fmt(size_before)} → {_fmt(size_after)}, {ratio:.0f}%)")
        if not keep:
            src.unlink()
        return True
    except Exception as e:
        print(f"  [ERROR] {src.name}: {e}")
        # 失敗したら中途半端なファイルを削除
        if dest.exists():
            dest.unlink()
        return False


def _fmt(n: int) -> str:
    if n < 1024 * 1024:
        return f"{n / 1024:.0f} KB"
    return f"{n / 1024 / 1024:.1f} MB"


def main():
    parser = argparse.ArgumentParser(
        description="HEIC/HEIF → JPEG 一括変換",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("dir", nargs="?", default=str(Path.home() / "dev" / "images"),
                        help="変換対象ディレクトリ (デフォルト: ~/dev/images)")
    parser.add_argument("--dry-run", action="store_true", help="プレビューのみ（変換しない）")
    parser.add_argument("--keep", action="store_true", help="元の HEIC ファイルを残す")
    parser.add_argument("--quality", type=int, default=85, metavar="N",
                        help="JPEG 品質 1-95 (デフォルト: 85)")
    args = parser.parse_args()

    target = Path(args.dir).resolve()
    if not target.exists():
        print(f"Error: ディレクトリが見つかりません: {target}")
        sys.exit(1)

    heic_files = sorted(target.rglob("*.[Hh][Ee][Ii][Cc]")) + sorted(target.rglob("*.[Hh][Ee][Ii][Ff]"))

    if not heic_files:
        print(f"HEIC/HEIF ファイルが見つかりませんでした: {target}")
        return

    print(f"\n{'=' * 55}")
    print(f"  HEIC → JPEG 変換: {len(heic_files)} ファイル")
    print(f"  対象: {target}")
    if args.dry_run:
        print(f"  [DRY RUN]")
    if args.keep:
        print(f"  元ファイルを残す: ON")
    print(f"{'=' * 55}\n")

    converted = 0
    for f in heic_files:
        if convert_heic(f, quality=args.quality, keep=args.keep, dry_run=args.dry_run):
            converted += 1

    print(f"\n完了: {converted}/{len(heic_files)} ファイルを変換しました。")


if __name__ == "__main__":
    main()
