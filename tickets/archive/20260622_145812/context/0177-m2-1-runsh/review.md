# レビュー報告書: #177 M2-1 run.sh — サーバー・プロキシ起動スクリプト

## 検証結果サマリー

| チェック項目 | 結果 |
|------------|------|
| ユニットテスト (run.sh) | ✅ 17/17 パス |
| 既存テスト (common.sh) | ✅ 35/35 パス（後退なし） |
| 既存テスト (setup.sh) | ✅ 16/16 パス（後退なし） |
| 品質チェッカー | ✅ 0 issues |
| 構造整合性 | ✅ 新しい issue なし（81件は全て既存） |
| 翻訳可能性 | ✅ 全チェック通過 |
| Acceptance Criteria | ✅ 全 11 項目充足 |

## 翻訳可能性チェック

| 観点 | 結果 |
|------|------|
| 関数名（動詞句） | ✅ cleanup / check_port / detect_serve_cmd |
| 1文字変数 | ✅ なし（全変数がドメイン概念: PID_MTPLX, ABS_MODEL_DIR, SERVE_CMD 等） |
| マジックナンバー | ✅ 全て名前付き定数または env var（MTPLX_TIMEOUT, PROXY_TIMEOUT, ポート番号） |
| デバッグ出力 | ✅ なし |
| コメントの質 | ✅ 「なぜ」を説明（trap 二重実行の理由、kill エラー抑制の根拠など） |
| common.sh 依存 | ✅ source common.sh 不使用（設計判断通り） |

## スタブ評価

mycc/ ディレクトリのスタブ検索結果: **0件**。全スタブ（detect_serve_cmd / check_port / MTPLX readiness polling / Proxy readiness polling / cleanup trap）は本チケットで解決済み。

## 依存関係整合性

| チケット | 関係 | 状態 | 整合 |
|---------|------|------|------|
| #176 (M1-2 setup.sh) | 先行実装必須 | reviewed ✅ | `.env` と `models/` を正しく利用 |
| #174 (M1-1 doctor.sh) | 並列可能 | reviewed ✅ | 依存なし、干渉なし |
| #178 (M3-1 test.js) | 後続 | 未作成 | run.sh 起動後に test.js を実行する設計と整合 |

## 発見・修正された問題

1. **bash 3.2（macOS 標準）の set -u + UTF-8 全角文字バグ**: echo 文内で全角括弧 `（` `）` と `$PROXY_PORT` を併用すると、変数がバインド済みでも `unbound variable` エラーが発生。半角括弧 `(` `)` に変更して回避。

## 品質判定

**合否: PASS** — Blocker/Major の問題なし。全テスト通過、品質チェック通過、翻訳可能性要件充足。
