# 実装サマリ: M0-5 — 設定構造体定義 (config.rs)

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| `crates/ggufrs/src/config.rs` | **修正** | ModelConfig/ServerConfig/GgufConfig/ConfigLayer 追加 + テスト10件 + STUB解決 + imports追加 |

## 定義した型

| 型 | 種別 | フィールド/バリアント |
|---|------|----------------------|
| `ModelConfig` | struct | name, model_path, lazy_load, context_size?, gpu_layers?, batch_size?, chat_template? |
| `ServerConfig` | struct | bind(SocketAddr), models(Vec\<String\>), auto_start_server + Default手動impl |
| `GgufConfig` | struct | models(Vec\<ModelConfig\>), server(ServerConfig), gpu(GpuConfig) |
| `ConfigLayer` | enum | Code(GgufConfig), JsonStr(String), File(PathBuf) |

## 検証結果

| 検証項目 | 結果 |
|---------|------|
| `make check-ggufrs` | ✅ 通過 (0 warnings, 0 errors) |
| `cargo test` (ggufrs) | ✅ **43 passed**, 0 failed（累積） |
| 品質チェック | ⚠️ 24件のunwrap — 全件テストコード内の正当な使用 |

## ユニットテスト追加分

10テスト全件通過:
1. model_config_roundtrip_json
2. model_config_default_lazy_load_is_false
3. model_config_default_context_size_is_none
4. server_config_default_uses_loopback_and_default_rt_port
5. server_config_default_auto_start_is_false
6. server_config_roundtrip_json
7. gguf_config_roundtrip_json
8. config_layer_code_roundtrip_json
9. config_layer_json_str_roundtrip
10. config_layer_file_roundtrip

## スタブ解決状況

- ✅ config.rs の `[::STUB::] M0-5` を解決
- ⏳ M1-1/M1-2/M1-4 の STUB は未解決

## 残課題

なし。M0 マイルストーン最終チケット（M0-6）に進むこと。
