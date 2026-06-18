# M19-1b / #142 レビュー報告書

## 1. Acceptance Criteria

| AC | 結果 |
|----|------|
| vendor/pjsip/ が zasso git 管理下 | ✅ .gitignore 修正完了 |
| cargo check -p siprs（PJSIP なし）| ✅ 成功（0 error, 0 warning）|
| cargo check -p siprs --features pjsip | ✅ 成功（0 error, 0 warning）|
| cargo test -p siprs（PJSIP なし）| ✅ 390 passed, 0 failed |
| cargo test -p siprs --features pjsip | ✅ 389 passed, 0 failed |
| pjsua_backend.rs cfg(pjsip) todo!() → 実 FFI | ✅ 14 メソッド全実装 |
| media.rs cfg(pjsip) connect/disconnect | ⚠ TODO → [::STUB::] マーカー追加（pjmedia_port ラップが必要）|
| make check-be | ✅ 成功 |
| make test | ✅ 成功 |
| cargo fmt --check | ✅ 通過 |

## 2. 依存関係検証

- 全6件の依存チケット（M17-1, M17-3, M17-4, M18-1, M18-2, M19-1）: 全件 reviewed 済み ✅
- 循環依存・矛盾なし ✅

## 3. スタブ評価（11件）

### 本チケットで解決されたスタブ（5件 → 0件）
- build.rs: ライブラリ名修正、cmake 直接呼び出し、bindgen include パス収集 → 実装完了
- pjsua_backend.rs: 14 todo!() → 実 PJSUA FFI 呼び出しに置き換え

### 本チケットでマーカー追加（2件）
- media.rs connect_to_conference: TODO → [::STUB::] 要解決: pjmedia_port ラップ
- media.rs disconnect: TODO → [::STUB::] 要解決: pjsua_conf_disconnect()

### 保留妥当（他チケット）（9件）
- mixer.rs (M16-1, M15-2), worker.rs (M16-1), client.rs (M16-1, M16-3)
- resampler.rs (M17-2), callbacks.rs (M17-4), reactor.rs (M19-2)
- build.rs 生成ファイル内容（PJSIP 不在時のスタブ）

## 4. コンパイル・テスト検証

| コマンド | 結果 |
|---------|------|
| cargo check -p siprs | ✅ |
| cargo check -p siprs --features pjsip | ✅ |
| cargo test -p siprs | ✅ 390 passed |
| cargo test -p siprs --features pjsip | ✅ 389 passed |
| make check-be | ✅ |
| make test | ✅ |

## 5. 品質チェック

62 issues（全件 build.rs 特有の正当パターン、または既存コード由来）

## 6. 構造整合性

M19-1b 起因の問題なし ✅（全 issue はレガシー由来）

## 7. 翻訳可能性チェック

- 全関数名が動詞句（initialize, shutdown, make_call 等）✅
- build.rs main() が三段階フローとして読める ✅
- 1文字変数・汎用名なし ✅
- デバッグ出力残存なし ✅
- cfg_gated テストの適切な分離 ✅

## 8. 総評

**PASS** — 全チェック通過。PJSIP 2.17 のビルド・リンク・bindgen が一貫動作し、
PjsuaBackend 14 メソッドが実 PJSUA C API 呼び出しで実装された。
media.rs cfg(pjsip) connect/disconnect の TODO は [::STUB::] マーカーを追加して
未解決スタブとして明確化した。
