# CARBO-0303 DOM test image

Added exact dev dependencies jest-environment-jsdom 29.7.0 and @testing-library/react 14.3.1 and updated package-lock.json.

## Build

From the WordsMaker9000 repository root:

```powershell
docker build -f docker/Dockerfile.dom-tests -t wordsmaker9000-dev:carbo-0303-dom-tests .
```

The local base wordsmaker9000-dev:carborundum used for this build resolved to sha256:b44f64848343a5cc86e88517940a3c00809aadd817af03ac79f7eb869c8f29a1.
It supplies the existing Rust/Tauri tools, vendored Rust dependencies and wordsmaker9000-prepare command. The new layer refreshes the offline npm cache from the committed lockfile.

## Smoke check

```powershell
docker run --rm --network none --user 10001:10001 --env HOME=/tmp/dom-home --mount type=bind,source=C:/source/carborundum/wordsmaker9000,target=/repository,readonly --entrypoint sh wordsmaker9000-dev:carbo-0303-dom-tests -c 'mkdir -p /tmp/dom-home /tmp/dom-smoke && cd /tmp/dom-smoke && sed "s/\r$//" /repository/docker/smoke-dom-tests.sh > /tmp/dom-smoke.sh && sh /tmp/dom-smoke.sh'
```

Observed on 2026-11-17: offline npm ci installed 819 packages, both test packages imported, and the React render/click Jest test passed (1 suite, 1 test). This check used UID/GID 10001 and a read-only source mount.

Built image ID: sha256:036f225fde873aa423f8dcafed10521fac3ab43fecadc4b15ac8e914e42ec53f.

## Bot deployment

Review and commit the manifest, lockfile and docker files. In Carborundum Bots, refresh local developer images, select wordsmaker9000-dev:carbo-0303-dom-tests as the replacement developer image, and deploy the worker. Record successful worker readiness before marking the DevOps Slice Done.

The image is available in local Docker. Bot replacement and product regression tests remain pending. CARBO-0304 can implement the Search & Replace tests after this preparation is deployed and CARBO-0303 is Done.
