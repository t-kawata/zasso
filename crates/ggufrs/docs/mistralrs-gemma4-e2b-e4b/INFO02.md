---
## mistralrs 調査依頼

### 環境
- **ライブラリ**: mistralrs v0.8.1
- **OS**: macOS (Apple Silicon, 24GB RAM)
- **モデル**: `mistralrs-community/gemma-4-E2B-it-UQFF` (q4k-0.uqff, ~1GB on disk)
- **ビルダー**: `UqffMultimodalModelBuilder`
- **モード**: CPU-only（GPU なし）

### 質問

**Q1. `UqffMultimodalModelBuilder` で CPU ビルド時にメモリ不足エラーが出るのはなぜか**

`UqffMultimodalModelBuilder::new(repo, vec![path]).build().await` を CPU-only 環境で実行すると以下のエラーが発生します。`default-features` でビルドしています（GPU 関連 feature なし）。

```
This model does not fit on the devices ["cpu (avail: 0MB)", "cpu (avail: 0MB)"],
and exceeds total capacity by 6423MB.
Auto device mapping params:
  multimodal[max_seq_len: 4096, max_batch_size: 1,
             max_image_shape: (1024, 1024), max_num_images: 1]
```

この環境の RAM は 24GB で、`GgufModelBuilder` を使った GGUF モデル（Qwen3.5-2B, ~2GB）は問題なくロードできます。なぜ `GgufModelBuilder` ではメモリが正しく検出されるのに、`UqffMultimodalModelBuilder` では `cpu (avail: 0MB)` と報告されるのでしょうか？

**Q2. `UqffMultimodalModelBuilder` の CPU メモリ検出を修正する方法はあるか**

`cpu (avail: 0MB)` という値は明らかに誤っています。この値は mistralrs のどこで決定され、どのように修正できますか？ 例えば以下は有効でしょうか？

- `MistralRsBuilder` の `with_loader_config(ModelLoaderConfig { max_seq_len: ... })` を明示的に設定する
- `TokenSource` や `IsqType` の指定
- `candle_core::Device` の明示的指定
- 環境変数によるメモリ制限の指定

**Q3. テキスト専用タスクでメモリ使用量を削減する方法はあるか**

Gemma4 E2B はマルチモーダルモデルですが、テキスト推論のみに使用します。以下の設定でメモリ使用量を削減できますか？

- `MultimodalModelBuilder` の `with_max_edge(u32)` で画像最大解像度を小さくする
- コンテキストサイズ（max_seq_len）を明示的に小さく設定する方法
- ISQ（In-Situ Quantization）を適用する方法
- バッチサイズを 1 に制限する方法

**Q4. `GgufModelBuilder` にはあるが `UqffMultimodalModelBuilder` にはないメソッドがある**

GgufModelBuilder には `with_force_cpu()` や `with_chat_template()` メソッドがありますが、`UqffMultimodalModelBuilder` には同様のメソッドが生えていないようです。これらはモデルビルダーの種別によらず共通のトレイト等で利用可能でしょうか？
---

ソースコードの詳細な調査結果をもとに、4つの質問すべてに回答します。

***

## Q1. `cpu (avail: 0MB)` と報告される根本原因

これは **CPU デバイスが `avail` リストに二重追加されるバグ**と、**Gemma4 マルチモーダルの activation size 推計が UQFF パスで過大になる問題**の複合です。

`auto_device_map.rs` の該当コード ([source](https://raw.githubusercontent.com/EricLBuehler/mistral.rs/master/mistralrs-core/src/pipeline/loaders/auto_device_map.rs)) を追跡すると:

```rust
// devices = [Device::Cpu]  (GPU feature なしビルドの場合)
let has_unified_memory = devices.iter().any(crate::utils::normal::is_integrated_gpu);
// → Device::Cpu は is_integrated_gpu = false なので has_unified_memory = false

for dev in devices {                          // ① Device::Cpu を push
    let a = MemoryUsage.query(dev)?.available();
    avail.push((a, dev.clone()));
}
if !has_unified_memory {                      // ② さらに Device::Cpu を push (重複!)
    let a = MemoryUsage.query(&Device::Cpu)?.available();
    avail.push((a, Device::Cpu));
}
```

エラーメッセージの `["cpu (avail: 0MB)", "cpu (avail: 0MB)"]` が2エントリある理由はまさにこれです。

**なぜ `0MB` になるか** — `MemoryUsage.query(Device::Cpu)` は `sysinfo::System::new_all()` を呼びますが、`available_memory()` が macOS Apple Silicon 環境で `0` を返すケースがあります。`sysinfo` v0.36.1 には macOS ARM で `available_memory` が正しく取れない既知の問題があります ([memory_usage.rs 参照](https://raw.githubusercontent.com/EricLBuehler/mistral.rs/master/mistralrs-core/src/utils/memory_usage.rs))。

**GGUF が問題ない理由** — `GgufModelBuilder` は Metal feature なしでも `best_device(force_cpu=false)` → `Device::cuda_if_available(0)` → `Device::Cpu` となり、パスが同じように見えますが、GGUF ローダーはマルチモーダルの `non_mapped_max_act_size_elems`（vision encoder の activation）を計算しないため、必要メモリ推計値が大幅に小さくなります。Gemma4 の vision encoder activation は `max_image_shape (1024, 1024) × max_num_images=1` ベースで計算されるため、~6GB 超に膨らみます。

***

## Q2. `cpu (avail: 0MB)` を回避する方法

**最も確実な回避策は `DeviceMapSetting::Map` を明示的に指定して Auto device map をバイパスすること**です。

```rust
use mistralrs::{
    UqffMultimodalModelBuilder,
    DeviceMapSetting, DeviceMapMetadata,
};

let model = UqffMultimodalModelBuilder::new(repo, vec![path])
    .with_device_mapping(DeviceMapSetting::Map(DeviceMapMetadata::dummy()))
    // または force_cpu を明示してデバイスを固定
    .with_force_cpu()
    .build()
    .await?;
```

`DeviceMapMetadata::dummy()` は全レイヤーを `device_layers=None` でマップし、`into_mapper` が `DummyDeviceMapper` を返してメモリフィット計算を完全スキップします。

**他のアプローチ（有効性の評価）:**

| 手法 | 有効性 | 備考 |
|------|--------|------|
| `.with_force_cpu()` 単独 | △ | device は Cpu になるが Auto map は依然実行される |
| `.with_device_mapping(DeviceMapSetting::Map(...))` | ✅ | Auto map をスキップできる |
| `ModelLoaderConfig` の max_seq_len 指定 | △ | `MistralRsBuilder` 側の設定で Auto map の *params* には影響しない |
| `IsqType` 指定 | ✗ | メモリ検出ロジックとは無関係 |
| `MISTRALRS_IGPU_MEMORY_FRACTION` | ✗ | CUDA iGPU 専用、CPU には適用されない |

`DeviceMapSetting::dummy()` はインターナルには `Map(DeviceMapMetadata::dummy())` のショートカットです：

```rust
// DeviceMapSetting のヘルパー（mod.rs より）
pub fn dummy() -> Self {
    Self::Map(DeviceMapMetadata::dummy())
}
```

***

## Q3. テキスト専用でのメモリ削減方法

`UqffMultimodalModelBuilder` は `MultimodalModelBuilder` の薄いラッパーで `DerefMut` を実装しているため、**`common_builder_methods!` マクロで展開された全メソッドが直接呼び出せます**。

### 有効な組み合わせ

```rust
use mistralrs::{
    UqffMultimodalModelBuilder, DeviceMapSetting,
    AutoDeviceMapParams,
};

let auto_params = AutoDeviceMapParams::Multimodal {
    max_seq_len: 512,        // ← デフォルト 4096 → 大幅削減
    max_batch_size: 1,
    max_image_shape: (64, 64), // ← テキストのみなら最小値に
    max_num_images: 1,
};

let model = UqffMultimodalModelBuilder::new(repo, vec![path])
    .with_device_mapping(DeviceMapSetting::Auto(auto_params))
    .with_force_cpu()
    .build()
    .await?;
```

**各パラメータの効果:**

- **`max_image_shape` を小さく**: `non_mapped_max_act_size_elems` の計算値が `H × W × channels` に比例するため、`(64, 64)` にするだけで vision activation 推計が ~256倍削減されます
- **`max_seq_len` を小さく**: KV cache サイズ計算 `batch × kv_heads × seq_len × head_dim` が直接削減されます  
- **ISQ**: UQFF モデルはすでに量子化済みのため `.with_isq()` は不要（むしろ warning が出ます）。UQFF パスでは `weight_pack_factor = reader.pack_factor(dtype)` が自動適用されます

> **注意**: これらは Auto device map の *推計パラメータ* であり、ランタイムの実際の制限ではありません。 実際のメモリ使用量は推論時の実入力に依存します。

***

## Q4. `GgufModelBuilder` と `UqffMultimodalModelBuilder` のメソッド差異

**結論: `with_force_cpu()` も `with_chat_template()` も `UqffMultimodalModelBuilder` で使用できます。**

`builder_macros.rs` に定義された `common_builder_methods!()` マクロが `MultimodalModelBuilder` の `impl` ブロック内で展開されており、`UqffMultimodalModelBuilder` は `DerefMut<Target = MultimodalModelBuilder>` を実装しているため、全メソッドが透過的に利用できます。

```rust
impl DerefMut for UqffMultimodalModelBuilder {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0  // MultimodalModelBuilder への透過的委譲
    }
}
```

`common_builder_methods!` に含まれる主要メソッド:

```rust
// すべて UqffMultimodalModelBuilder から直接呼び出せる
.with_force_cpu()          // force_cpu = true → best_device が Device::Cpu を返す
.with_chat_template(s)     // Jinja テンプレート文字列 or .json パス
.with_isq(IsqType::Q4K)   // UQFF の場合は意味なし (ただしコンパイルは通る)
.with_device_mapping(...)  // DeviceMapSetting を直接注入
.with_dtype(ModelDType::F32)
.with_max_num_seqs(1)
.with_logging()
.with_device(Device::Cpu)  // candle_core::Device を明示指定
```

***

## まとめ: 推奨コード（CPU-only, テキスト専用）

```rust
use mistralrs::{
    UqffMultimodalModelBuilder, DeviceMapSetting,
    AutoDeviceMapParams,
};
use std::path::PathBuf;

let model = UqffMultimodalModelBuilder::new(
    "mistralrs-community/gemma-4-E2B-it-UQFF",
    vec![PathBuf::from("q4k-0.uqff")],
)
// ① Auto map を使う場合は vision activation 推計を最小化
.with_device_mapping(DeviceMapSetting::Auto(
    AutoDeviceMapParams::Multimodal {
        max_seq_len: 512,
        max_batch_size: 1,
        max_image_shape: (64, 64),  // テキストのみ → 最小値
        max_num_images: 1,
    }
))
// ② または Auto map を完全バイパス（より確実）
// .with_device_mapping(DeviceMapSetting::dummy())
.with_force_cpu()
.with_logging()
.build()
.await?;
```

`sysinfo` の macOS ARM 上の `available_memory = 0` 問題はライブラリ側のバグであり、upstream ([mistral.rs issues](https://github.com/EricLBuehler/mistral.rs)) への報告も検討に値します。 `DeviceMapSetting::dummy()` による Auto map バイパスが現時点での最も堅牢な回避策です。
