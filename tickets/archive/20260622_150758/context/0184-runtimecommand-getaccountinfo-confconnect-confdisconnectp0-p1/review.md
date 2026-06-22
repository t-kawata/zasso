# レビュー報告書: RuntimeCommand 新設 — GetAccountInfo / ConfConnect / ConfDisconnect（P0-P1）

## 検証結果サマリー

| 項目 | 結果 |
|------|------|
| コンパイル検証（siprs） | ✅ 成功 |
| コンパイル検証（zasso main） | ✅ `make check-be` 成功 |
| 全テスト | ✅ 407 passed + 2 doc-test |
| 犯罪スキャン | ✅ 0 件 |
| スタブ検索 | ✅ 0 件 |
| 品質チェック | ✅ 33 issues（全既存コード由来、新規 0） |
| 構造整合性 | ✅ 81 issues（全既存、チケット184への影響なし） |
| 翻訳可能性（関数名） | ✅ 全関数が動詞句 |
| 翻訳可能性（1文字変数） | ✅ なし |
| 翻訳可能性（マジックナンバー） | ✅ テスト内定数のみ |

## 変更ファイル一覧とレビュー所見

| ファイル | 所見 |
|---------|------|
| `command.rs` | `MediaDirection` enum（Inbound/Outbound/Both）、`AccountInfoSnapshot` struct、3 新バリアント追加。型定義は spec 通り。4 テスト実装済。 |
| `backend.rs` | `SipBackend::get_account_info()` 追加（`&self` 読み取り専用）。MockBackend 実装 + 5 テスト。 |
| `reactor.rs` | 3 ハンドラ + 3 helper 関数。Shutdown ポリシー実装（GetAccountInfo 許可）。`#![allow(dead_code)]` 復帰（M12 結合までの暫定）。7 テスト。 |
| `pjsua_backend.rs` | PjsuaBackendRef 委譲 + pjsip FFI（`pjsua_acc_get_info`）+ non-pjsip スタブ。 |

## 改善点（レビューで修正済み）

| 問題 | 修正 |
|------|------|
| `#![allow(dead_code)]` 削除により他関数に波及 | 同上〜再追加（M12 結合時に解除予定とコメント） |

## 結論

spec の Acceptance Criteria 11 項目を全て充足。コード品質・翻訳可能性・テスト網羅性に問題なし。
チケット M20-2 は **reviewed** として承認可能。
