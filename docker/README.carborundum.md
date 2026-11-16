# Carborundum developer image

Build this repository-owned Environment image from the WordsMaker9000 root:

```powershell
docker build --platform linux/amd64 --file Dockerfile.carborundum --tag wordsmaker9000-dev:carborundum .
```

Select `wordsmaker9000-dev:carborundum` in Carborundum's Environment panel, then
create a bot with that Environment. The app adds its worker harness and coding
agent; this image deliberately contains neither. No persistent standalone
container is needed for image selection.

The image supplies Debian 12, Node 22/npm, the repository's Rust 1.88.0 toolchain
(with clippy, rustfmt and rust-analyzer), Tauri Linux libraries, cached npm
packages and vendored Cargo dependencies. Sources and toolchains are public
read-only image files. Dependency downloads happen during `docker build` only.
The runtime image configures npm and Cargo for offline operation.

Configure these repository Verification command steps, in order. Each value
shown in Arguments is a separate literal argument:

| Step ID | Linux executable | Arguments | Directory |
| --- | --- | --- | --- |
| prepare | `/usr/local/bin/wordsmaker9000-prepare` | none | `.` |
| install | `/usr/local/bin/npm` | `ci`, `--no-audit`, `--no-fund` | `.` |
| build | `/usr/local/bin/npm` | `run`, `build` | `.` |
| frontend-tests | `/usr/local/bin/npm` | `test`, `--`, `--runInBand` | `.` |
| rust-tests | `/usr/local/cargo/bin/cargo` | `test`, `--locked`, `--manifest-path`, `src-tauri/Cargo.toml` | `.` |

The first step initializes the verifier's private writable HOME from image files;
subsequent commands operate on the fresh reviewed snapshot. It does not copy a
baked application checkout over the snapshot. Cargo's configuration uses a
private writable vendor copy under HOME because some Tauri dependencies generate
permission schemas inside their own sources. Each preparation restores the
original image files before builds run. The image vendor tree remains read-only.
Existing unrelated Cargo configuration is preserved and reported as a setup failure.

Rebuild this image when dependency manifests, lockfiles or the Rust toolchain
change, then regenerate the bot worker from the new Environment image. A missing
new dependency will fail offline rather than enable network access. Keep the
Dockerfile's Rust base/toolchain version aligned with `rust-toolchain.toml`.

This image supports the Linux build and command-line verification recipe. It
does not launch a desktop display, perform Windows installer qualification or
include the optional Java/EPUBCheck publishing QA job.

## Image dependency check

On 2026-11-13, the built image successfully initialized a fresh source snapshot
as UID 10003 with a read-only root, private writable HOME and no network.
`npm ci --offline --no-audit --no-fund` installed 759 packages; locked offline
Cargo metadata resolved 645 Linux dependency packages, whose declared Rust
requirements were compatible with Rust 1.88. Node reported 22.23.5, npm 10.9.9,
Rust/Cargo 1.88.0 and WebKit 2.50.6. Application builds and test suites were not
run. This dependency check does not constitute bot deployment qualification.

For manual containers, a tmpfs workspace must explicitly allow execution
(`--tmpfs /work:rw,exec,...`); Docker's default tmpfs `noexec` setting prevents
installed tools such as esbuild from running. The bot uses its normal workspace
volume. Keep verification networking disabled.
