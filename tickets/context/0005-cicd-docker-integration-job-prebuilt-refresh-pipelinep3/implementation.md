# 実装サマリ: #5 CI/CD — Docker Integration Job + Prebuilt Refresh Pipeline（P3）

## 変更ファイル

| ファイル | 種別 | 内容 |
|---------|------|------|
| .github/workflows/integration-test.yml | 新規作成 | Docker Asterisk 統合テスト CI（RFC02 §11.1 準拠） |
| .github/workflows/prebuilt-refresh.yml | 新規作成 | PJSIP prebuilt 自動ビルド pipeline（RFC02 §11.2 準拠） |

## 実装内容

### integration-test.yml
- runs-on: ubuntu-22.04
- サービスコンテナ: asterisk:20.6.0（5060/udp, 5061/tcp）
- dtolnay/rust-toolchain@stable で Rust 環境構築
- actions/cache@v4 で PJSIP ビルドキャッシュ（初回以外のビルド時間短縮）
- cargo build --features pjsip → cargo test --features pjsip --test integration_test -- --ignored --test-threads=1
- トリガー: push(main/master), pull_request, workflow_dispatch

### prebuilt-refresh.yml
- runs-on: macos-14（Apple Silicon）
- CMake インストール確認（brew install cmake）
- PJSIP 2.17 cmake ビルド（OpenSSL オフ、shared libs オフ）
- build.rs の required_libraries() 一覧と一致する全ライブラリを vendor/prebuilt/aarch64-apple-darwin/lib/ にコピー
- OpenSSL シンボル不在確認（Apple Security Framework のみ使用の検証）
- actions/upload-artifact@v4 で prebuilt アーティファクト保存（90日間保持）
- トリガー: workflow_dispatch + 月次 schedule（cron: '0 6 1 * *'）

## 設計からの逸脱
- actions/cache@v4 を integration-test.yml に追加（RFC02 にはないが、PJSIP source build の 5〜10分を短縮するために有用）
- prebuilt コピー先を RFC02 の vendor/prebuilt/macos/ から vendor/prebuilt/aarch64-apple-darwin/ に修正（実際のディレクトリ構造に合わせた）
- アーティファクト保存期間 retention-days: 90 を明示

## 検証結果
- make check-be: PASS（0.16s）
- make test: 14 passed, 0 failed
- run-quality-checks: 0 issues
- crime scan: 0 records
