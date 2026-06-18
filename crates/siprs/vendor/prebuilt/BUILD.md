# Prebuilt PJSIP ライブラリの再ビルド手順

## 概要

`vendor/prebuilt/<target>/lib/*.a` は、macOS/Linux 向けに事前ビルドされた PJSIP 2.17 の
static library 群である。通常はこれらの prebuilt ライブラリが使用される（source build fallback
が有効な場合を除く）。

## なぜ source build ではなく prebuilt か

PJSIP 2.17 の伝統的な `./configure && make` ビルドには以下の問題がある：
- ビルドに 5〜10 分かかる
- OpenSSL、GnuTLS、ALSA 等のシステムライブラリへの依存がある
- 最新の macOS SDK では Darwin SSL の自動検出が壊れている（`SSLReHandshake` 削除のため）

Prebuilt はこれらの問題を回避し、CI や開発者のビルド時間を短縮する。

## macOS 向け再ビルド手順

### 前提条件

- CMake（`brew install cmake`）
- Xcode Command Line Tools（`xcode-select --install`）

### 手順

```bash
# 1. PJSIP ソースディレクトリに移動
cd crates/siprs/vendor/pjsip

# 2. pjlib/CMakeLists.txt を確認する
#    macOS では OpenSSL/GnuTLS/mbedTLS のソースをビルド対象から除外している
#    （ssl_sock_ossl.c, ssl_sock_gtls.c, ssl_sock_mbedtls.c が NOT APPLE 条件で追加）
#    この変更は Apple Security Framework のみを使用するためのものであり、
#    他の TLS バックエンドへの依存を排除する。

# 3. CMake 構成
mkdir -p build && cd build
cmake .. \
  -DCMAKE_INSTALL_PREFIX=./install \
  -DPJMEDIA_WITH_VIDEO=OFF \
  -DSRTP_WITH_OPENSSL=OFF \
  -G "Unix Makefiles"

# 4. ビルド（ライブラリターゲットのみ。テストバイナリは不足フレームワークのためリンクエラーになる可能性あり）
cmake --build . -j$(sysctl -n hw.logicalcpu)

# 5. ライブラリのインストール
cmake --install . --prefix ./install

# 6. 各ライブラリを prebuilt ディレクトリにコピー
#    ビルド成果物は build/<module>/lib<name>.a にある
ls build/*/lib*.a build/third_party/*/lib*.a

cp build/pjlib/libpjlib.a \
   build/pjlib-util/libpjlib-util.a \
   build/pjnath/libpjnath.a \
   build/pjmedia/libpjmedia*.a \
   build/pjsip/libpjsip*.a \
   build/pjsip/libpjsua*.a \
   build/third_party/*/lib*.a \
   vendor/prebuilt/aarch64-apple-darwin/lib/
```

### 検証

```bash
# OpenSSL シンボルが存在しないことを確認
for lib in vendor/prebuilt/aarch64-apple-darwin/lib/*.a; do
  nm -u "$lib" | grep -cE 'SSL_|X509_|EVP_|BIO_|PEM_' && echo "❌ $lib" || true
done

# Rust コンパイル検証
cd crates/siprs
cargo check --features pjsip
cargo test --lib
cargo test --features pjsip -- --ignored --list
```

### macOS バージョン更新時の注意

新しい macOS バージョンで prebuilt を再ビルドする際は、`build.rs` の macOS フレームワーク
リンク設定を確認すること：

```rust
// build.rs:63-69
"macos" => {
    println!("cargo:rustc-link-lib=framework=CoreAudio");
    println!("cargo:rustc-link-lib=framework=CoreFoundation");
    println!("cargo:rustc-link-lib=framework=CoreServices");
    println!("cargo:rustc-link-lib=framework=AudioToolbox");
    println!("cargo:rustc-link-lib=framework=Security");
}
```

不足しているフレームワークがあると、統合テストバイナリのリンク時に `symbol(s) not found for architecture arm64` が発生する。

### CMakeLists.txt のカスタマイズ

`vendor/pjsip/pjlib/CMakeLists.txt` には macOS 向けに以下の変更を加えている：

```cmake
# Non-Apple SSL backends (excluded on macOS to avoid OpenSSL dependency)
if(NOT APPLE)
  target_sources(pjlib PRIVATE
    src/pj/ssl_sock_gtls.c
    src/pj/ssl_sock_mbedtls.c
    src/pj/ssl_sock_ossl.c
  )
endif()
```

これにより OpenSSL 非依存の Apple Security Framework のみが使用される。
Linux 向けの prebuilt 再ビルド時はこの変更を適用しないこと（`if(NOT APPLE)` が
`if(APPLE)` の逆であることを確認すること）。
