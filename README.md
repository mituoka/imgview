# imgview

Local image library viewer with AI-powered classification, duplicate detection, and cleanup tools.

---

## Features

| | |
|---|---|
| Grid view | Folder navigation, hover overlay, variable column count (2–5) |
| Lightbox | Full-size display, arrow key / ESC navigation, slideshow mode |
| Search & sort | Filter by filename / folder / category, sort by date / size / name |
| Multi-select | Select multiple images, bulk delete |
| Cleanup | Duplicate detection (MD5 hash), AI quality flagging |
| imgtools | One-click execution from sidebar with real-time log streaming |
| Auto import | File watcher daemon monitors download folder and imports automatically |

---

## Stack

- **Next.js 14** — App Router, TypeScript, Tailwind CSS
- **Ollama** `llava:7b` — local AI vision model for classification and quality check
- **Python** — `tools/imgtools.py` for image management CLI
- **API** — Next.js Route Handlers (swappable with Rust/Axum backend)

---

## Setup

**1. Install dependencies**

```bash
npm install
```

**2. Set up Python environment**

```bash
cd tools
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

**3. Configure environment**

```bash
cp .env.example .env.local
```

```env
# Absolute path to your image library
IMAGES_DIR=/path/to/your/images

# Folders to exclude from the viewer (comma-separated)
# EXCLUDED_FOLDERS=screenshot,other

# Leave empty to use built-in Next.js API routes
# Set to Rust/Axum backend URL when switching
NEXT_PUBLIC_API_BASE_URL=
```

**4. Start**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## imgtools CLI

`tools/imgtools.py` manages the image library. Run from the sidebar or directly in terminal.

```bash
cd tools && source .venv/bin/activate

python imgtools.py scan        # show library stats
python imgtools.py classify    # AI classification with Ollama
python imgtools.py quality     # detect blurry / low-quality images
python imgtools.py organize    # move files into category folders
python imgtools.py auto        # full pipeline: import → classify → organize
python imgtools.py dupes       # find duplicate images
python imgtools.py stats       # classification statistics
```

**AI categories**

| key | description |
|---|---|
| `anime_illustration` | anime, manga, illustration, VTuber |
| `photo_people` | portraits, selfies |
| `photo_landscape` | scenery, nature, buildings |
| `photo_food` | food and drinks |
| `photo_object` | products, objects |
| `screenshot` | screen captures, UI |
| `meme_funny` | memes, reaction images |
| `document` | text documents, notes |
| `artwork` | digital art, paintings |
| `other` | uncategorized |

**Requires Ollama**

```bash
ollama pull llava:7b
ollama serve
```

Classification is skipped gracefully when Ollama is not running.

---

## Auto Import

The watcher daemon monitors the download folder and triggers `imgtools auto` when new images arrive.

Start / stop from the sidebar, or run manually:

```bash
python tools/watcher.py
```

---

## API Reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/images` | list images (`?folder=` filter) |
| `GET` | `/api/images/file/[...path]` | serve image file |
| `DELETE` | `/api/images/file/[...path]` | delete image file |
| `GET` | `/api/folders` | folder list with counts |
| `GET` | `/api/images/dupes` | duplicate image groups |
| `GET` | `/api/images/quality` | AI quality check results |
| `POST` | `/api/run-imgtools` | run imgtools command (SSE streaming) |
| `GET` | `/api/watcher` | watcher daemon status |
| `POST` | `/api/watcher` | start / stop watcher daemon |

---

## Rust Backend

Designed to swap the Next.js API routes for a Rust/Axum backend when heavier processing is needed (vector search, batch AI, etc.).

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8702
```

---

## Security

- Path traversal protection on all file API routes — requests outside `IMAGES_DIR` return 403
- `POST /api/run-imgtools` executes only allowlisted commands: `scan`, `classify`, `quality`, `auto`
