# Publish QA 90 — Expected Failure: Unsupported HTML

Opening Publish should fail during compilation and name `Unsupported Table` plus the `<table>` element. No successful result, artifact manifest, or destination file should be created. This proves unsupported content is blocked instead of silently omitted.
