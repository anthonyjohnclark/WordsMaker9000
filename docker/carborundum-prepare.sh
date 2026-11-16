#!/bin/sh
# Run as the verification identity from a fresh WordsMaker9000 snapshot.
set -eu
umask 077
: "${HOME:?A writable private HOME is required}"
test -f package-lock.json && test -f src-tauri/Cargo.lock || {
    echo 'Run wordsmaker9000-prepare from the repository snapshot root.' >&2
    exit 1
}
vendor_home="$HOME/.cache/wordsmaker9000/vendor"
mkdir -p "$HOME/.cargo" "$HOME/.npm" "$vendor_home"
# Some Tauri dependencies generate permission schemas inside their own sources.
# Keep the image copy read-only and give this verifier its own writable sources.
python3 - "$vendor_home" "$HOME/.cargo/config.toml" <<'PY'
import json
from pathlib import Path
import sys

image_config = Path('/opt/wordsmaker9000/cargo-config.toml').read_text()
image_directory = 'directory = "/opt/wordsmaker9000/vendor"'
if image_config.count(image_directory) != 1:
    raise SystemExit('Unexpected image Cargo source configuration.')
private_config = image_config.replace(image_directory, 'directory = ' + json.dumps(sys.argv[1]))
config_path = Path(sys.argv[2])
if config_path.exists() and config_path.read_text() not in (image_config, private_config):
    raise SystemExit('Existing Cargo configuration differs; use a fresh verification HOME.')
config_path.write_text(private_config)
PY
# Restore pristine package bytes before every run, including schemas a prior build generated.
cp -R /opt/wordsmaker9000/vendor/. "$vendor_home/"
chmod -R u+rwX "$vendor_home"
cp -R /opt/wordsmaker9000/npm-cache/_cacache "$HOME/.npm/"
echo 'Prepared private writable npm cache and vendored Rust sources for offline verification.'
