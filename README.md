<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=2,12,20&height=180&section=header&text=imgview&fontSize=48&fontColor=fff&animation=twinkling&fontAlignY=32&desc=Local%20Image%20Library%20Viewer&descSize=18&descAlignY=52"/>

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Ollama](https://img.shields.io/badge/Ollama-llava%3A7b-000?style=for-the-badge&logo=ollama&logoColor=white)](https://ollama.com/)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org/)
[![ChromaDB](https://img.shields.io/badge/ChromaDB-Vector%20DB-FF6B35?style=for-the-badge)](https://www.trychroma.com/)

<p align="center">
  <b>ローカル画像ライブラリをブラウザで閲覧・管理。AI 自動分類、セマンティック検索、類似画像検索、重複検出に対応。</b>
</p>

[機能](#機能) • [セットアップ](#セットアップ) • [AI検索](#ai検索セマンティック検索--類似画像) • [imgtools](#imgtools) • [API](#api) • [構成](#構成)

</div>

---

## 機能

<div align="center">

| 閲覧 | 管理 | AI |
|:---:|:---:|:---:|
| グリッド表示（2〜5列） | 複数選択・一括削除 | 自動分類（10カテゴリ） |
| ライトボックス＋ズーム | 重複検出（MD5） | 品質チェック（ブレ・低品質） |
| スライドショー | フォルダ除外設定 | **セマンティック検索** |
| フォルダナビ | 自動取り込み監視 | **類似画像検索** |
| QR コード共有 | 高画質化（Upscayl） | キャプション自動生成 |

</div>

<br>

```
┌─────────────────────────────────────────────────────────────────┐
│  通常検索     ファイル名 / フォルダ / カテゴリをリアルタイム絞り込み    │
├─────────────────────────────────────────────────────────────────┤
│  AI 検索     自然言語でライブラリ全体を横断検索（例: 夕日の海）        │
├─────────────────────────────────────────────────────────────────┤
│  類似検索     ライトボックスから「類似を探す」でそのまま表示           │
├─────────────────────────────────────────────────────────────────┤
│  ソート       日付 / サイズ / 名前、昇降順トグル                     │
├─────────────────────────────────────────────────────────────────┤
│  スライドショー  Space キーで開始・停止、プログレスバー表示           │
├─────────────────────────────────────────────────────────────────┤
│  自動取り込み  download/ を監視し新規画像を自動 import              │
└─────────────────────────────────────────────────────────────────┘
```

---

## セットアップ

**1. 依存関係のインストール**

```bash
npm install
```

**2. Python 環境のセットアップ**

```bash
cd tools
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

**3. 環境変数の設定**

```bash
cp .env.example .env.local
```

```env
# 画像ディレクトリの絶対パス（必須）
IMAGES_DIR=/path/to/your/images

# 除外するフォルダ名（カンマ区切り）
# EXCLUDED_FOLDERS=screenshot,other

# Rust/Axum バックエンドに切り替える場合（空 = Next.js API を使用）
NEXT_PUBLIC_API_BASE_URL=
```

**4. 起動**

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) を開く。

---

## AI 検索（セマンティック検索 & 類似画像）

自然言語でライブラリを検索したり、選択した画像と似た画像を探す機能です。  
事前に Ollama モデルを用意して、サイドバーの **AI一括処理** を一度実行するだけで使えるようになります。

**必要なモデル**

```bash
ollama pull llava:7b          # キャプション生成（分類・品質チェックにも使用）
ollama pull nomic-embed-text  # ベクトル化
ollama serve
```

**初回セットアップ**

サイドバー → `imgtools 実行` → **AI一括処理** を実行する。  
内部で以下を順番に処理します：

```
1. AI分類          未分類画像をカテゴリ分け
2. AI品質チェック  ブレ・低品質画像を検出
3. キャプション生成 llava:7b で各画像の説明文を生成
4. ベクトル化       nomic-embed-text で ChromaDB に保存
```

完了後、Toolbar の **✦ AI** ボタンからセマンティック検索が使えます。

**使い方**

| 操作 | 方法 |
|:---|:---|
| セマンティック検索 | Toolbar の `✦ AI` をオン → 自然言語で入力 → Enter |
| 類似画像検索 | ライトボックスの「類似を探す」ボタン |

**データの保存先**

| データ | 場所 |
|:---|:---|
| キャプション | `IMAGES_DIR/.imgtools_cache.json`（既存キャッシュに追記） |
| ベクトル DB | `IMAGES_DIR/.imgvec/`（ChromaDB、ローカル永続） |

画像をフォルダ整理（`organize`）した際は ChromaDB のパスも自動で更新されます。

---

## imgtools

`tools/imgtools.py` は画像ライブラリを管理する Python CLI。Web UI のサイドバーから実行するか、ターミナルから直接呼び出せます。

**Web UI から実行できるコマンド**

| コマンド | 内容 |
|:---|:---|
| **スキャン** | ライブラリの統計・概要を表示 |
| **全自動更新** | 移動 → 分類 → フォルダ整理 |
| **AI一括処理** | 分類 → 品質チェック → キャプション → ベクトル化 |
| **高画質化** | Upscayl でアップスケール |

**ターミナルから直接実行**

```bash
cd tools && source .venv/bin/activate

# 基本操作
python imgtools.py scan        # ライブラリの統計・概要
python imgtools.py auto        # 全自動: 取込 → 分類 → 整理
python imgtools.py dupes       # 重複画像を検出
python imgtools.py stats       # 分類結果の統計

# AI処理（個別実行）
python imgtools.py classify    # 未分類画像を AI 分類
python imgtools.py quality     # ブレ・低品質画像を AI で検出
python imgtools.py caption     # キャプション生成（AI検索の準備）
python imgtools.py embed       # ベクトル化して ChromaDB に保存
python imgtools.py analyze     # 上記 4 つを一括実行

# AI 検索（CLIから）
python imgtools.py search "夕日の海" --limit 20
python imgtools.py similar "photo_landscape/sunset.jpg" --limit 12

# その他
python imgtools.py organize    # 分類結果に基づいてフォルダ整理
python imgtools.py upscale     # 高画質化
```

**AI 分類カテゴリ**

| key | description |
|:---|:---|
| `anime_illustration` | アニメ・マンガ・イラスト・VTuber |
| `photo_people` | 人物写真・ポートレート |
| `photo_landscape` | 風景・自然・建物 |
| `photo_food` | 食べ物・飲み物 |
| `photo_object` | 物撮り・商品写真 |
| `artwork` | デジタルアート・絵画 |
| `meme_funny` | ミーム・面白画像 |
| `screenshot` | スクリーンショット |
| `document` | ドキュメント・テキスト画像 |
| `other` | その他 |

---

## 自動取り込み

`tools/watcher.py` が `~/dev/download/` を監視し、新しい画像が追加されると `imgtools auto` を自動実行します。

サイドバーのトグルボタンから起動・停止、またはターミナルから直接実行：

```bash
python tools/watcher.py
```

---

## API

| Method | Path | Description |
|:---:|:---|:---|
| `GET` | `/api/images` | 画像一覧（`?folder=` でフィルタ） |
| `GET` | `/api/images/file/[...path]` | 画像ファイル配信 |
| `DELETE` | `/api/images/file/[...path]` | 画像ファイル削除 |
| `GET` | `/api/images/search?q=` | **セマンティック検索**（`?limit=` で件数指定） |
| `GET` | `/api/images/similar?path=` | **類似画像検索**（`?limit=` で件数指定） |
| `GET` | `/api/folders` | フォルダ一覧と枚数 |
| `GET` | `/api/images/dupes` | 重複画像グループ |
| `GET` | `/api/images/quality` | AI 品質チェック結果 |
| `POST` | `/api/run-imgtools` | imgtools コマンド実行（SSE ストリーミング） |
| `GET` | `/api/watcher` | 監視デーモンの状態確認 |
| `POST` | `/api/watcher` | 監視デーモンの起動・停止 |
| `GET` | `/api/local-ip` | ローカル IP アドレス取得（QR 共有用） |

---

## 構成

```
imgview/
├── app/
│   ├── api/
│   │   ├── images/
│   │   │   ├── dupes/        # 重複検出
│   │   │   ├── file/         # ファイル配信・削除
│   │   │   ├── quality/      # AI 品質チェック結果
│   │   │   ├── search/       # セマンティック検索
│   │   │   └── similar/      # 類似画像検索
│   │   ├── folders/          # フォルダ一覧
│   │   ├── local-ip/         # ローカル IP 取得
│   │   ├── run-imgtools/     # imgtools 実行（SSE）
│   │   └── watcher/          # 監視デーモン制御
│   ├── cleanup/              # クリーンアップページ
│   └── page.tsx              # メインページ
├── components/
│   ├── ImageGrid.tsx         # グリッド表示
│   ├── Lightbox.tsx          # ライトボックス・スライドショー・類似検索
│   ├── Sidebar.tsx           # フォルダナビ・ツール
│   ├── Toolbar.tsx           # 検索・AI検索・ソート・列数・選択
│   └── RunImgtoolsPanel.tsx  # imgtools 実行パネル
├── lib/
│   └── config.ts             # 環境変数ヘルパー
├── tools/
│   ├── imgtools.py           # 画像管理 CLI（分類・検索・RAG）
│   ├── watcher.py            # ファイル監視デーモン
│   ├── heic_convert.py       # HEIC → JPEG 変換
│   └── requirements.txt
└── types/
    └── index.ts
```

**データファイル（`IMAGES_DIR` 以下）**

```
IMAGES_DIR/
├── .imgtools_cache.json  # 分類・品質・キャプション キャッシュ
└── .imgvec/              # ChromaDB（ベクトル DB、AI検索用）
```

---

## セキュリティ

- ファイル配信・削除 API はパストラバーサル対策済み（`IMAGES_DIR` 外は 403）
- `POST /api/run-imgtools` は許可コマンドのみ実行
- 類似画像検索 API もパストラバーサル対策済み

---

<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=2,12,20&height=100&section=footer"/>

</div>
