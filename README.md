# BUS_navi_app

## プロジェクト概要
- 名称: ポケバス (BUS_navi_app)
- バージョン: 0.9.0
- 最終更新日: 2026-01-15
- フレームワーク: Next.js 15 / TypeScript / Firebase

## 動作環境
- Node.js 20 以降
- npm 10 以降
- Firebase プロジェクト (Firestore / Authentication 有効)
- Google Maps JavaScript API キー

## セットアップ手順
1. 依存パッケージをインストール
	```bash
	npm install
	```
2. 必要な環境変数を `.env.local` に設定
	```bash
	NEXT_PUBLIC_GOOGLE_MAPS_API_KEY="..."
	NEXT_PUBLIC_FIREBASE_CONFIG="..."
	```
3. 開発サーバーを起動
	```bash
	npm run dev
	```
	-> http://localhost:3000 で動作確認

## ビルドとデプロイ
- 本番ビルド
  ```bash
  npm run build
  npm run start
  ```
- Firebase Hosting などにデプロイする場合は、各サービスの CLI に従ってください。

## ディレクトリガイド
- `pokebus_app/src/app/search/` : 検索・地図画面
- `pokebus_app/src/app/ranking/` : ランキング画面
- `pokebus_app/src/app/gacha/` : クーポンガチャ画面
- `pokebus_app/public/naha_*` : GTFS ベースの時刻表データ
- `pokebus_app/lib/` : Firebase 設定・GTFS 読み込みユーティリティ

## テスト / 品質管理
- ESLint: `npm run lint`
- 型チェック: `npm run type-check`