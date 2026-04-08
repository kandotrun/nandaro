# Nandaro

Nandaro は、**画像をブラウザだけで圧縮する**シンプルな Web サービスです。

サーバーに画像をアップロードせず、ユーザーの端末上でそのまま再エンコードします。静的ホスティング向けの構成で、Cloudflare Pages のような配信基盤と相性がいいです。

## Product spec

### Scope

Nandaro は **画像圧縮専用** です。

やること:
- 複数画像の一括圧縮
- 出力形式の切り替え
- 画質の調整
- 最大辺のリサイズ
- 個別ダウンロード / ZIP 一括ダウンロード

やらないこと:
- 音声変換
- 動画変換
- サーバーサイド圧縮
- ログイン、保存、クラウド同期

## How it works

- 入力画像をブラウザで読み込む
- Canvas 上でリサイズと再エンコードを行う
- 圧縮後ファイルをその場でプレビュー、保存する
- 変換処理はクライアント側で完結する

つまり、**ファイルは圧縮のためにサーバーへ送信されません**。

## Current features

- 画像のドラッグ&ドロップ対応
- 複数画像の同時処理
- 対応入力: 一般的な `image/*` ファイル
- 出力形式:
  - `Auto`
  - `WebP`
  - `JPEG`
- 画質調整
  - range: `45` - `95`
  - default: `78`
- 最大辺の調整
  - `0` = 元サイズ維持
  - `1024 / 1600 / 2048 / 2560 / 3840`
- 圧縮結果の一覧表示
- 個別ダウンロード
- ZIP 一括ダウンロード
- 画像プレビュー modal

## Output rules

### Auto

- WebP が使えるブラウザでは WebP を優先
- 使えない環境では JPEG にフォールバック

### JPEG

- 透明情報は保持できません
- 透明部分は白背景で描画されます

### Metadata

- Canvas 再エンコードのため、EXIF などのメタデータは基本的に削除されます

## Runtime / deployment spec

### Frontend

- Vite
- React
- TypeScript
- JSZip

### Hosting

想定は **静的配信** です。

- Cloudflare Pages
- Vercel Static
- Netlify
- S3 + CDN
- 任意の静的ホスティング

### Important

Nandaro の圧縮処理は **Edge Functions / Workers 上では動かしません**。

正しい構成はこれです:
- 静的アセットを CDN / Pages で配信する
- 圧縮処理はユーザーのブラウザで実行する

## UX notes

- 最短で画像を軽くすることを優先
- 設定は必要最小限
- 画像圧縮フローが主役
- サービス名の元ネタとして、Litty の「Nandaro?」をページ下部に埋め込み表示

## Limitations

- 巨大画像や大量処理では端末のメモリと CPU を使う
- PNG 専用の最適化はしていない
- AVIF 出力は未対応
- ブラウザ依存のエンコード差はあり得る
- 画質とファイルサイズの最適解は画像内容によって変わる

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
npm run preview
```

## Deploy

```bash
npm run build
```

配信対象は `dist/` です。

Cloudflare Pages なら、build command は以下で十分です。

```bash
npm run build
```

output directory:

```bash
dist
```

## Project structure

```txt
src/App.tsx     # main UI and compression flow
src/App.css     # landing page and component styles
src/index.css   # global styles
```

## Roadmap candidates

優先順はこのあたりです。

1. PNG 圧縮の改善
2. AVIF 対応
3. プリセット追加（Web / SNS / Thumbnail）
4. 大量処理時の体感改善
5. 差分比較 UI

## Name origin

- service name: **Nandaro**
- origin track: **Litty - Nandaro?**
- Spotify: https://open.spotify.com/track/2x7eU1kw78pVAW9MGNWhp7
