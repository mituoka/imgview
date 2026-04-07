# imgview

ローカル画像ライブラリをブラウザで閲覧・管理する Web アプリ。Instagram ライクなグリッド表示、AI自動分類、重複検出、不要画像の削除に対応。

## スクリーンショット

| グリッドビュー | クリーンアップ |
|---|---|
| フォルダ別サイドナビ + 3カラムグリッド | 重複検出 / AI品質チェック |

## 機能

- **グリッドビュー** — フォルダ別フィルタ、ホバーでファイル情報表示
- **ライトボックス** — フルサイズ表示、←→キー / ESC ナビゲーション
- **削除** — グリッドホバー / ライトボックスから確認ダイアログ付きで削除
- **imgtools 実行** — サイドバーからワンクリックでバックグラウンド実行、ログをリアルタイム表示
- **クリーンアップページ** — 重複検出（MD5）と AI品質チェック結果の一括削除

## 技術スタック

- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **API**: Next.js Route Handlers（将来的に Rust/Axum へ差し替え可能）
- **AI**: Ollama `llava:7b`（ローカル実行）
- **Python ツール**: `tools/imgtools.py`（画像分類・整理 CLI）

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. Python 環境のセットアップ

```bash
cd tools
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

### 3. 環境変数の設定

`.env.local` を作成:

```bash
cp .env.example .env.local
```

`.env.local` を編集:

```env
# 画像ディレクトリの絶対パス
IMAGES_DIR=/path/to/your/images

# Rust/Axum バックエンドに切り替える場合（空 = Next.js API を使用）
NEXT_PUBLIC_API_BASE_URL=
```

### 4. 起動

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) を開く。

## 画像ディレクトリ構造

`IMAGES_DIR` に指定したディレクトリは以下の構造を想定しています。

```
images/
├── anime_illustration/   # アニメ・イラスト
├── artwork/              # アートワーク・デジタルアート
├── design/               # デザイン素材
├── meme_funny/           # ミーム・面白画像
├── other/                # その他
├── photo_people/         # 人物写真
├── screenshot/           # スクリーンショット
├── photo_landscape/      # 風景写真（imgtools で自動作成）
├── photo_food/           # 食べ物写真（imgtools で自動作成）
├── photo_object/         # 物撮り写真（imgtools で自動作成）
└── .imgtools_cache.json  # AI分類・品質チェック結果のキャッシュ
```

サブディレクトリは `imgtools.py classify → organize` で自動作成されます。任意のフォルダ構成でも動作します。

### 対応フォーマット

`.jpg` / `.jpeg` / `.png` / `.gif` / `.webp` / `.bmp` / `.tiff` / `.heic` / `.svg`

## imgtools

`tools/imgtools.py` は画像ライブラリを管理する Python CLI です。Web UI のサイドバーから実行するか、ターミナルから直接呼び出せます。

```bash
cd tools
source .venv/bin/activate

python imgtools.py scan        # 画像の統計・概要を表示
python imgtools.py classify    # Ollama で未分類画像をAI分類
python imgtools.py quality     # ブレ・低品質画像をAIで検出
python imgtools.py organize    # 分類結果に基づいてフォルダ整理
python imgtools.py auto        # 全自動: 取込 → 分類 → 整理
python imgtools.py dupes       # 重複画像を検出
python imgtools.py stats       # 分類結果の統計
```

### AI分類のカテゴリ

| カテゴリ名 | 内容 |
|---|---|
| `anime_illustration` | アニメ・マンガ・イラスト・VTuber |
| `photo_people` | 人物写真・ポートレート |
| `photo_landscape` | 風景・自然・建物 |
| `photo_food` | 食べ物・飲み物 |
| `photo_object` | 物撮り・商品写真 |
| `screenshot` | スクリーンショット・UI |
| `meme_funny` | ミーム・面白画像 |
| `document` | ドキュメント・テキスト画像 |
| `artwork` | デジタルアート・絵画 |
| `other` | その他 |

### AI機能の前提条件（Ollama）

```bash
# Ollama のインストール: https://ollama.com
ollama pull llava:7b
ollama serve
```

分類・品質チェックは Ollama が起動していない場合スキップされます。

## API エンドポイント

| メソッド | パス | 説明 |
|---|---|---|
| `GET` | `/api/images` | 画像一覧（`?folder=` でフィルタ） |
| `GET` | `/api/images/file/[...path]` | 画像ファイル配信 |
| `DELETE` | `/api/images/file/[...path]` | 画像ファイル削除 |
| `GET` | `/api/folders` | フォルダ一覧と枚数 |
| `GET` | `/api/images/dupes` | 重複画像グループ |
| `GET` | `/api/images/quality` | AI品質チェック結果 |
| `POST` | `/api/run-imgtools` | imgtools コマンド実行（SSE ストリーミング） |

## 将来の拡張（Rust バックエンド）

AI 検索・類似画像検索など重い処理を追加する際は、Rust + Axum バックエンドに差し替え可能な設計になっています。

`.env.local` の `NEXT_PUBLIC_API_BASE_URL` に Axum サーバーの URL を設定するだけで切り替えられます。

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8702
```

## セキュリティ

- 画像配信・削除 API はパストラバーサル対策済み（`IMAGES_DIR` 外へのアクセスは 403）
- `POST /api/run-imgtools` は許可コマンドのみ実行（`scan` / `classify` / `quality` / `auto`）
