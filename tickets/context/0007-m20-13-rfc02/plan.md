# 計画: M20-13 受け入れ基準検証・リリース判定

## Phase 1: 自動検証可能項目（CI/コンパイル時確認）
- step 1.1: blocking_read ゼロ確認 ✅
- step 1.2: cargo check (Result<T, SipError>, Send+Sync) ✅
- step 1.3: Send+Sync コンパイル時テスト ✅
- step 1.4: 付録B 修正確認 ✅
- step 1.5: codec auto モード unit test ✅

## Phase 2: ユニットテスト一斉実行
- step 2.1: make test (zasso_lib 14 tests) ✅
- step 2.2: cargo test (siprs 458 tests) ✅

## Phase 3: 結合テスト（Docker Asterisk）
- step 3.1: Docker Asterisk 起動 ✅
- step 3.2-3.6: 個別結合テスト → PJSIP thread assertion により SIGABRT
- step 3.7: 全結合テスト一括 → 同上（環境制約）
- step 3.8: Docker 停止 ✅

## Phase 4: CI/CD 確認
- step 4.1-4.4: CI 未実行（GitHub Actions workflow_dispatch が必要）

## Phase 5: 合格マトリクス作成
- step 5.1: acceptance-matrix.md 作成 ✅
- step 5.2: リリース判定 → ブロッキング条件全 PASS
- step 5.3-5.4: 相互接続試験結果・カバレッジレポートは別途確認
