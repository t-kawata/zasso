# 実装計画: test-run に --engine local 対応

## 要件
test-run に --engine local を追加し、make run-local / make run-local-no-denoiser で Qwen3-ASR を起動できるようにする。

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|---------|------|------|
| crates/voiput/src/binary/test-run.rs | 修正 | CLI パーサー + ConfigBuilder に Local 分岐追加 |
| crates/voiput/Makefile | 修正 | run-local / run-local-no-denoiser ターゲット追加 |

## Boy Scout 改善
なし（開発用バイナリ、スコープ外に改善対象なし）

## テスト計画
- 新規テストコードなし（test-run は自動テスト対象外）
- 既存 cargo test --lib (voiput) 169件通過でクレート側影響を確認

## 実装手順
1. test-run.rs: use インポート追加
2. test-run.rs: CLI パーサーに "local" 追加
3. test-run.rs: build_voiput_config() に Local 分岐追加
4. Makefile: run-local / run-local-no-denoiser ターゲット追加
5. コンパイル検証 (make check-be)
6. 既存テスト確認 (cargo test --lib)

## 物理的レビュー方法
- make check-be 通過
- cargo test --lib 169件通過
- run-quality-checks.js
- 翻訳可能性 grep

## リスク
なし（プロダクションコード不変、デフォルト動作不変）
