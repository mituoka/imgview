#!/usr/bin/env python3
"""
watcher.py — download/ フォルダを監視して新しい画像が来たら自動取り込み

使い方:
  python tools/watcher.py          # フォアグラウンドで実行
  python tools/watcher.py &        # バックグラウンドで実行

停止:
  kill $(cat tools/.watcher.pid)   # PIDファイルから停止
"""

import os
import sys
import time
import subprocess
import logging
from pathlib import Path

try:
    from watchdog.observers import Observer
    from watchdog.events import FileSystemEventHandler, FileCreatedEvent
except ImportError:
    print("ERROR: watchdog が必要です。pip install watchdog")
    sys.exit(1)

# ─── 設定 ───────────────────────────────────────────────
TOOLS_DIR = Path(__file__).parent.resolve()
DOWNLOAD_DIR = Path.home() / "dev" / "download"
PYTHON = TOOLS_DIR / ".venv" / "bin" / "python"
SCRIPT = TOOLS_DIR / "imgtools.py"
PID_FILE = TOOLS_DIR / ".watcher.pid"

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff", ".heic", ".svg"}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [watcher] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


class DownloadHandler(FileSystemEventHandler):
    def __init__(self):
        self._pending = False

    def on_created(self, event: FileCreatedEvent):
        if event.is_directory:
            return
        path = Path(event.src_path)
        if path.suffix.lower() not in IMAGE_EXTENSIONS:
            return

        log.info(f"新しいファイルを検出: {path.name}")

        # 少し待ってからコピー完了を確認（大きいファイル対策）
        time.sleep(1)
        if not self._pending:
            self._pending = True
            self._run_auto()

    def _run_auto(self):
        log.info("imgtools auto を実行中...")
        try:
            env = {**os.environ, "IMAGES_DIR": os.environ.get("IMAGES_DIR", str(Path.home() / "dev" / "images"))}
            result = subprocess.run(
                [str(PYTHON), str(SCRIPT), "auto"],
                capture_output=True,
                text=True,
                env=env,
            )
            if result.stdout:
                for line in result.stdout.strip().splitlines():
                    log.info(line)
            if result.returncode != 0 and result.stderr:
                log.error(result.stderr.strip())
        except Exception as e:
            log.error(f"実行エラー: {e}")
        finally:
            self._pending = False


def main():
    # PIDファイルに自身のPIDを書き込む
    PID_FILE.write_text(str(os.getpid()))

    if not DOWNLOAD_DIR.exists():
        DOWNLOAD_DIR.mkdir(parents=True)
        log.info(f"作成: {DOWNLOAD_DIR}")

    handler = DownloadHandler()
    observer = Observer()
    observer.schedule(handler, str(DOWNLOAD_DIR), recursive=False)
    observer.start()

    log.info(f"監視開始: {DOWNLOAD_DIR}")
    log.info(f"停止するには: kill {os.getpid()} または Ctrl+C")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    finally:
        observer.join()
        if PID_FILE.exists():
            PID_FILE.unlink()
        log.info("監視を停止しました")


if __name__ == "__main__":
    main()
