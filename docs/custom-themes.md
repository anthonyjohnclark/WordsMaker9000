# Custom themes

Built-in theme names remain valid. Settings may also contain a `customThemes`
array and select one of its IDs through `theme`. IDs must start with `custom:`
and contain only letters, digits, underscores, or hyphens after that prefix.

For example, add these properties to the existing settings object (keep the
other settings):

```json
{
  "theme": "custom:warm-slate",
  "customThemes": [
    {
      "id": "custom:warm-slate",
      "label": "Warm Slate",
      "description": "Slate with a warmer accent",
      "baseTheme": "slate",
      "variables": {
        "--accent": "#dbb778",
        "--accent-hover": "#edca90",
        "--accent-bg": "#dbb778",
        "--accent-bg-hover": "#edca90",
        "--toolbar-active": "#dbb778"
      }
    }
  ]
}
```

Settings live in `User/settings.json` under the Tauri app data directory, or
`Dev_User/settings.json` in development. Close the app before editing the file.
Saved custom themes appear in the existing theme picker. A theme authoring UI
is not included yet.

Only variables defined by the built-in theme contract are accepted. Color
overrides accept browser-supported hex, numeric RGB/RGBA, numeric HSL/HSLA,
and named colors. Editor font families accept plain font lists. Resource URLs,
CSS variable references, arbitrary property names, and CSS-wide color keywords
are rejected. Invalid overrides and missing properties inherit from the base
preset; invalid definitions are ignored. Unknown selected IDs fall back to
Midnight. Logo colors are derived from the resolved background, accent, and
primary text colors.

The startup cache contains versioned resolved colors, rather than a second
preset table. Existing installs populate this cache when the full theme is next
applied. Until then, the splash uses CSS defaults before settings load.

## Manual checks

Run the normal project build yourself (`npm.cmd run build`), then launch the
desktop app (`npm.cmd run tauri dev`).

- Select each built-in theme, save, and restart. Check that Slate's splash
  matches its application colors after the cache is populated.
- Add the example custom theme to the development settings file while the app
  is closed. Launch, select it in the picker, save another setting, and restart.
  Check that the custom definition and selection are retained.
- Omit an override or give it an invalid value. Check that the base preset's
  value is used. Select an unknown ID and check the Midnight fallback.
- Remove or corrupt `wm9000:startup-theme` in localStorage. Check that startup
  still loads the settings and applies the selected theme.

No automated or runtime checks were performed as part of this change.
