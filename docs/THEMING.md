# Theming Guide

This document explains how the theming system works, how to create a new theme, and how to verify accessibility contrast.

## Architecture

Themes are defined in `src/themes.ts`. Each theme is a set of CSS custom properties (variables) that control colors and fonts across the entire application. The active theme's variables are applied to `document.documentElement` at runtime by `UserSettingsContext`.

### Key files

- **`src/themes.ts`** — Theme definitions (names, labels, CSS variable maps)
- **`src/index.css`** — Default CSS variable values in `:root`, plus Quill editor overrides
- **`src/contexts/global/UserSettingsContext.tsx`** — Applies theme variables on theme change
- **`src/utils/fileManager.ts`** — `UserSettings` interface includes `theme: ThemeName`
- **`index.html`** — Google Fonts links for serif fonts used by some themes
- **`check-contrast.mjs`** — WCAG contrast ratio checker

## CSS Variables Reference

| Variable | Purpose |
|---|---|
| `--bg-primary` | Main panel/sidebar backgrounds |
| `--bg-secondary` | Page-level background |
| `--bg-input` | Input/select field backgrounds |
| `--bg-hover` | Hover state backgrounds |
| `--text-primary` | Primary text color |
| `--text-secondary` | Secondary/muted text |
| `--text-muted` | Least prominent text (hints, helpers) |
| `--accent` | Accent color for highlights, links |
| `--accent-hover` | Accent hover state |
| `--accent-bg` | Accent used as a background (e.g. header bar) |
| `--accent-bg-hover` | Accent background hover state |
| `--accent-text` | Text color on `--accent-bg` backgrounds |
| `--border-color` | Border/divider color |
| `--editor-font-family` | Font family for the editor and app UI |
| `--editor-bg` | Editor writing area background |
| `--editor-text` | Editor text color |
| `--toolbar-active` | Active toolbar button color |
| `--btn-primary` | Primary action button background |
| `--btn-primary-hover` | Primary button hover |
| `--btn-success` | Success/confirm button background |
| `--btn-success-hover` | Success button hover |
| `--btn-danger` | Danger/delete button background |
| `--btn-danger-hover` | Danger button hover |
| `--btn-text` | Text color on all colored button backgrounds |
| `--card-bg` | Card/list item backgrounds |
| `--modal-bg` | Modal dialog backgrounds |

## Creating a New Theme

### 1. Add the theme name to the `ThemeName` type

In `src/themes.ts`, add your theme name to the union type:

```ts
export type ThemeName =
  | "midnight"
  | "parchment"
  | "ocean"
  | "forest"
  | "typewriter"
  | "your-theme-name";
```

### 2. Add the theme definition

Add a new entry to the `themes` record in `src/themes.ts`:

```ts
"your-theme-name": {
  label: "Your Theme",
  description: "Short description of the theme",
  variables: {
    "--bg-primary": "#...",
    "--bg-secondary": "#...",
    "--bg-input": "#...",
    "--bg-hover": "#...",
    "--text-primary": "#...",
    "--text-secondary": "#...",
    "--text-muted": "#...",
    "--accent": "#...",
    "--accent-hover": "#...",
    "--accent-bg": "#...",
    "--accent-bg-hover": "#...",
    "--accent-text": "#...",
    "--border-color": "#...",
    "--editor-font-family": "'Your Font', fallback, generic",
    "--editor-bg": "#...",
    "--editor-text": "#...",
    "--toolbar-active": "#...",
    "--btn-primary": "#...",
    "--btn-primary-hover": "#...",
    "--btn-success": "#...",
    "--btn-success-hover": "#...",
    "--btn-danger": "#...",
    "--btn-danger-hover": "#...",
    "--btn-text": "#...",
    "--card-bg": "#...",
    "--modal-bg": "#...",
  },
},
```

**Every variable must be provided.** Missing variables will fall back to the `:root` defaults in `index.css`, which may not match your theme.

### 3. Choose `--btn-text` and `--accent-text` carefully

These two variables control text rendered **on top of colored button/accent backgrounds**. They must contrast well against all button colors:

- **Dark themes** (dark backgrounds, light text): Use a dark color for `--btn-text` and `--accent-text` (e.g. `--bg-primary` or `--bg-secondary`)
- **Light themes** (light backgrounds, dark text): Use `#ffffff` for `--btn-text` and `--accent-text`

### 4. Add Google Fonts (if needed)

If your theme uses a custom font, add a `<link>` tag to `index.html`:

```html
<link
  href="https://fonts.googleapis.com/css2?family=Your+Font:wght@400;700&display=swap"
  rel="stylesheet"
/>
```

### 5. Update the contrast checker

Add your theme's variables to `check-contrast.mjs` in the `themes` object so it can be validated.

## Checking Contrast (Accessibility)

The project includes a WCAG contrast ratio checker at `check-contrast.mjs`. It validates all critical foreground/background color pairs against WCAG AA standards:

- **4.5:1** minimum for normal body text
- **3.0:1** minimum for large text, UI components, and decorative text

### Running the checker

```bash
node check-contrast.mjs
```

### Output

- ✅ indicates a passing pair
- ❌ FAIL indicates a pair that does not meet the minimum contrast ratio

**All themes must pass before merging.** If a pair fails, adjust the relevant color in `src/themes.ts` and re-run the checker.

### What it checks

| Pair | Min Ratio | Why |
|---|---|---|
| `text-primary` on all backgrounds | 4.5:1 | Body text readability |
| `text-secondary` on backgrounds | 4.5:1 | Secondary text readability |
| `text-muted` on `bg-primary` | 3.0:1 | Helper/hint text (large text rule) |
| `editor-text` on `editor-bg` | 4.5:1 | Writing area readability |
| Button/accent colors on backgrounds | 3.0:1 | Colored text as UI indicators |
| `btn-text` on button backgrounds | 3.0:1 | Button label readability |
| `accent-text` on `accent-bg` | 3.0:1 | Accent bar text readability |
| `text-primary` on `bg-input` | 4.5:1 | Form input readability |

## Tips

- Use an existing theme as a starting point and adjust colors from there.
- Test your theme in both the home page and the editor view.
- Check fullscreen mode (F11) — the editor uses `--editor-bg` as its background.
- The `.futuristic-font` CSS class uses `--editor-font-family`, so headings will match your theme font.
