<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=2,12,20&height=180&section=header&text=imgview&fontSize=48&fontColor=fff&animation=twinkling&fontAlignY=32&desc=Local%20Image%20Library%20Viewer&descSize=18&descAlignY=52"/>

[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Ollama](https://img.shields.io/badge/Ollama-llava%3A7b-000?style=for-the-badge&logo=ollama&logoColor=white)](https://ollama.com/)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org/)

<p align="center">
  <b>ローカル画像ライブラリをブラウザで閲覧・管理。AI自動分類、重複検出、不要画像の一括削除に対応。</b>
</p>

[機能](#機能) • [セットアップ](#セットアップ) • [imgtools](#imgtools) • [API](#api) • [構成](#構成)

</div>

---

## 機能

<div align="center">

| 閲覧 | 管理 | AI |
|:---:|:---:|:---:|
| グリッド表示（2〜5列） | 複数選択・一括削除 | Ollama による自動分類 |
| ライトボックス | 重複検出（MD5） | 品質チェック（ブレ・低品質） |
| スライドショー | フォルダ除外設定 | AI品質フラグ付き一括削除 |
| フォルダナビ | 自動取り込み監視 | カテゴリ別フォルダ整理 |

</div>

<br>

```
┌─────────────────────────────────────────────────────────────────┐
│  検索         ファイル名 / フォルダ / カテゴリをリアルタイム絞り込み    │
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
# 画像ディレクトリの絶対パス
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

## imgtools

`tools/imgtools.py` は画像ライブラリを管理する Python CLI。Web UI のサイドバーから実行するか、ターミナルから直接呼び出せます。

```bash
cd tools && source .venv/bin/activate

python imgtools.py scan        # ライブラリの統計・概要を表示
python imgtools.py classify    # Ollama で未分類画像を AI 分類
python imgtools.py quality     # ブレ・低品質画像を AI で検出
python imgtools.py organize    # 分類結果に基づいてフォルダ整理
python imgtools.py auto        # 全自動: 取込 → 分類 → 整理
python imgtools.py dupes       # 重複画像を検出
python imgtools.py stats       # 分類結果の統計
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
| `document` | ドキュメント・テキスト画像 |
| `other` | その他 |

**Ollama のセットアップ**

```bash
ollama pull llava:7b
ollama serve
```

Ollama が起動していない場合、分類・品質チェックはスキップされます。

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
| `GET` | `/api/folders` | フォルダ一覧と枚数 |
| `GET` | `/api/images/dupes` | 重複画像グループ |
| `GET` | `/api/images/quality` | AI 品質チェック結果 |
| `POST` | `/api/run-imgtools` | imgtools コマンド実行（SSE ストリーミング） |
| `GET` | `/api/watcher` | 監視デーモンの状態確認 |
| `POST` | `/api/watcher` | 監視デーモンの起動・停止 |

---

## 構成

```
imgview/
├── app/
│   ├── api/
│   │   ├── images/           # 画像一覧・配信・削除
│   │   │   ├── dupes/        # 重複検出
│   │   │   ├── file/         # ファイル配信・削除
│   │   │   └── quality/      # AI 品質チェック結果
│   │   ├── folders/          # フォルダ一覧
│   │   ├── run-imgtools/     # imgtools 実行（SSE）
│   │   └── watcher/          # 監視デーモン制御
│   ├── cleanup/              # クリーンアップページ
│   └── page.tsx              # メインページ
├── components/
│   ├── ImageGrid.tsx         # グリッド表示
│   ├── Lightbox.tsx          # ライトボックス・スライドショー
│   ├── Sidebar.tsx           # フォルダナビ・ツール
│   ├── Toolbar.tsx           # 検索・ソート・列数・選択
│   └── RunImgtoolsPanel.tsx  # imgtools 実行パネル
├── lib/
│   └── config.ts             # 環境変数ヘルパー
├── tools/
│   ├── imgtools.py           # 画像管理 CLI
│   ├── watcher.py            # ファイル監視デーモン
│   └── requirements.txt
└── types/
    └── index.ts
```

---

## Rust バックエンドへの移行

AI 検索・類似画像検索など重い処理を追加する際は、Rust + Axum バックエンドに差し替え可能な設計になっています。

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8702
```

`.env.local` の変更だけで API の向き先を切り替えられます。

---

## セキュリティ

- ファイル配信・削除 API はパストラバーサル対策済み（`IMAGES_DIR` 外は 403）
- `POST /api/run-imgtools` は許可コマンドのみ実行（`scan` / `classify` / `quality` / `auto`）

---

<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=2,12,20&height=100&section=footer"/>

</div>
