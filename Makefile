run:
	cargo tauri dev

build-mac:
	cargo tauri build --bundles dmg

build-win:
	cargo tauri build --bundles nsis

build-linux:
	cargo tauri build --bundles appimage
