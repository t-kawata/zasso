# M3-3: Endpoint handlers skeleton — 品質レビュー報告書

## Acceptance Criteria 充足状況

| # | 項目 | 結果 |
|---|------|------|
| 1 | GET /healthz → 200 + {"status":"ok"} | ✅ routes.rs healthz |
| 2 | GET /v1/models → 200 + ソート済み一覧 + 拡張フィールド | ✅ routes.rs list_models + 5テスト |
| 3 | disabled model は除外 | ✅ テスト確認 |
| 4 | POST /v1/messages 不正 model → 400 + invalid_request_error | ✅ handle_messages + テスト |
| 5 | 存在しない provider → 400 + UnknownProvider | ✅ テスト確認 |
| 6 | handle_messages が request_id を生成 | ✅ generate_request_id 呼び出し＋テスト |
| 7 | register_metrics / record_request が実装 | ✅ observability/metrics.rs |
| 8 | 残存 [::STUB::] は provider 処理のみ | ✅ 2件（M3-4/M3-5 待ち） |
| 9 | make check-be 通過 | ✅ |
| 10 | 全テスト 135 passed | ✅ |
| 11 | clippy 警告ゼロ | ✅ |
| 12 | 翻訳可能性 | ✅ |

## コンパイル検証

| 条件 | 結果 |
|------|------|
| default features | ✅ cargo check 通過、警告ゼロ |
| --no-default-features | ✅ cargo check 通過 |

## テスト結果

| 条件 | 単体テスト | 結果 |
|------|-----------|------|
| default features | **135 passed** (+16 new) | ✅ |
| --no-default-features | **95 passed** | ✅ |

## 品質チェック (run-quality-checks.js)

指摘 8 件 — 全件テストコード内の .unwrap() で許容範囲

## スタブ解決状況

| スタブ | 状態 |
|--------|------|
| healthz → StatusCode::OK のみ | ✅ 解決 |
| metrics_handler → {"metrics":{}} | ✅ 解決 |
| list_models → {"data":[]} | ✅ 解決 |
| handle_messages → 固定JSON | ✅ 解決（routing解決まで） |
| handle_messages provider 処理 (2件) | ⏳ M3-4/M3-5 待ち |

## 翻訳可能性チェック

| 観点 | 結果 |
|------|------|
| 動詞句の関数名 | healthz/metrics_handler/list_models/handle_messages ✅ |
| 1文字変数 | なし ✅ |
| デバッグ出力 | なし ✅ |
| #[allow] 抑制 | 新規コードに該当なし ✅ |

## 総評

全 Acceptance Criteria を充足。4 つのスタブを解決し、observability モジュールの骨格も整備。クオリティゲート通過。
