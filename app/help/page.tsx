import Link from "next/link";

const COMMANDS = [
  {
    section: "ライブラリ",
    items: [
      {
        name: "スキャン",
        cmd: "scan",
        desc: "画像ライブラリの統計情報を表示します。枚数・合計サイズ・フォーマット別内訳・フォルダ別内訳・分類済み数を確認できます。",
      },
      {
        name: "全自動更新",
        cmd: "auto",
        desc: "~/dev/download と ~/Downloads から画像を取り込み、未分類の画像をAIで分類し、カテゴリフォルダに整理するまでを一括で実行します。",
      },
      {
        name: "誤分類チェック",
        cmd: "suggest",
        desc: "選択したフォルダ内の画像を分析し、カテゴリが合っていない可能性のある画像を検出して移動先を提案します。ChromaDB の embedding がある場合はより精度の高い k-NN 判定を使用します。",
      },
    ],
  },
  {
    section: "AI処理",
    items: [
      {
        name: "AI一括処理",
        cmd: "analyze",
        desc: "分類 → 品質チェック → キャプション生成 → ベクトル化の4ステップを順番に実行します。初回セットアップや全画像を再解析したいときに使います。セマンティック検索を使うにはこの処理が必要です。",
      },
      {
        name: "用途タグ自動付与",
        cmd: "tag",
        desc: "分類済みの画像にカテゴリをもとに用途タグ（スマホ壁紙・SNS・Web素材など）を自動で付与します。ツールバーの用途フィルターで絞り込めるようになります。",
      },
    ],
  },
  {
    section: "編集",
    items: [
      {
        name: "高画質化",
        cmd: "upscale",
        desc: "Upscayl を使って画像を最大4倍に拡大・高画質化します。写真向け・イラスト向けなど複数のモデルから選択できます。Upscayl アプリのインストールが必要です。",
      },
    ],
  },
  {
    section: "クリーンアップ",
    items: [
      {
        name: "クリーンアップ",
        cmd: "—",
        desc: "重複画像の検出と削除、AIによる低品質画像（ブレ・暗すぎ・内容なし）の検出と削除を行います。重複チェックはモーダルを開いた時点で自動スキャン。品質チェックはモーダル内から直接実行できます。",
      },
    ],
  },
];

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">
            ← 戻る
          </Link>
          <h1 className="text-xl font-semibold">コマンド説明</h1>
        </div>

        <div className="space-y-8">
          {COMMANDS.map((group) => (
            <div key={group.section}>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                {group.section}
              </h2>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <div key={item.name} className="bg-gray-900 rounded-lg px-4 py-3">
                    <div className="flex items-baseline gap-3 mb-1">
                      <span className="text-sm font-medium text-gray-100">{item.name}</span>
                      <code className="text-xs text-gray-600">{item.cmd}</code>
                    </div>
                    <p className="text-sm text-gray-400 leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
