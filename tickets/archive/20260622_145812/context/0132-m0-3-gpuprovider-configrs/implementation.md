# 実装サマリ: M0-3 — GpuProvider 列挙型 (config.rs)

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| `crates/ggufrs/src/config.rs` | **修正** | GpuProvider enum（5バリアント）+ GpuConfig struct + Default 手動 impl + ユニットテスト11件 + 日本語コメント |

## 定義した型

### GpuProvider（5バリアント、derive: Debug/Clone/Copy/PartialEq/Default/Serialize/Deserialize）
| バリアント | 対応環境 |
|-----------|---------|
| Auto | 全環境 — 自動検出（デフォルト） |
| Metal | macOS — Apple GPU |
| DirectML | Windows — DirectML（将来拡張） |
| Cuda | Linux/Windows — NVIDIA GPU |
| Cpu | 全環境 — CPU フォールバック |

### GpuConfig（2フィールド）
| フィールド | 型 | デフォルト |
|-----------|-----|-----------|
| provider | GpuProvider | Auto |
| cpu_only | bool | false |

## 検証結果

| 検証項目 | 結果 |
|---------|------|
| `make check-ggufrs` | ✅ 通過 (0 warnings, 0 errors) |
| `cargo test` (ggufrs) | ✅ 22 passed, 0 failed（前回11 + 今回11） |
| 品質チェック (run-quality-checks.js) | ⚠️ 10件のunwrap検出 — 全件テストコード内の正当な使用 |

## ユニットテスト詳細

11テスト全件通過:
1. gpu_provider_default_is_auto
2. gpu_provider_all_variants_roundtrip_json
3-7. gpu_provider_{auto,metal,directml,cuda,cpu}_serializes_to_*
8. gpu_provider_deserialize_invalid_variant
9. gpu_config_default_returns_auto_and_cpu_only_false
10. gpu_config_roundtrip_json
11. gpu_config_all_fields_serialize

## スタブ解決状況

- ◐ config.rs の STUB [M0-3, M0-5] のうち **M0-3 部分を解決**
- ⏳ M0-5（GgufConfig 等）および M1-1/M1-2/M1-4 の STUB は未解決（後続チケット）
- ✅ `[::STUB::]` 未付与のスタブなし

## 残課題

なし。次は M0-4（GgufError）または M0-5（設定構造体定義）に進むこと。
