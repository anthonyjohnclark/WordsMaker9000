export type ThemeName =
  | "midnight"
  | "parchment"
  | "ocean"
  | "forest"
  | "typewriter";

export interface ThemeDefinition {
  label: string;
  description: string;
  variables: Record<string, string>;
}

export const themes: Record<ThemeName, ThemeDefinition> = {
  midnight: {
    label: "Midnight",
    description: "Dark, techy aesthetic",
    variables: {
      "--bg-primary": "#111827", // gray-900
      "--bg-secondary": "#000000", // black
      "--bg-input": "#374151", // gray-700
      "--bg-hover": "#374151", // gray-700
      "--text-primary": "#ffffff",
      "--text-secondary": "#9ca3af", // gray-400
      "--text-muted": "#6b7280", // gray-500
      "--accent": "#eab308", // yellow-500
      "--accent-hover": "#fde047", // yellow-300
      "--accent-bg": "#eab308", // yellow-500
      "--accent-bg-hover": "#facc15", // yellow-400
      "--border-color": "#374151", // gray-700
      "--editor-font-family": "Consolas, monospace",
      "--editor-bg": "#111827",
      "--editor-text": "#e5e7eb", // gray-200
      "--toolbar-active": "#eab308",
      "--btn-primary": "#3b82f6", // blue-500
      "--btn-primary-hover": "#60a5fa", // blue-400
      "--btn-success": "#22c55e", // green-500
      "--btn-success-hover": "#4ade80", // green-400
      "--btn-danger": "#ef4444", // red-500
      "--btn-danger-hover": "#f87171", // red-400
      "--card-bg": "#111827", // gray-900
      "--modal-bg": "#111827",
      "--btn-text": "#111827",
      "--accent-text": "#111827",
    },
  },
  parchment: {
    label: "Parchment",
    description: "Warm, literary feel",
    variables: {
      "--bg-primary": "#f5f0e8",
      "--bg-secondary": "#ede4d4",
      "--bg-input": "#e8dcc8",
      "--bg-hover": "#e0d4be",
      "--text-primary": "#3d2b1f",
      "--text-secondary": "#6b5744",
      "--text-muted": "#8b7355",
      "--accent": "#b45309", // amber-700
      "--accent-hover": "#92400e", // amber-800
      "--accent-bg": "#b45309",
      "--accent-bg-hover": "#d97706", // amber-600
      "--border-color": "#d4c4a8",
      "--editor-font-family": "Georgia, 'Times New Roman', serif",
      "--editor-bg": "#faf6ef",
      "--editor-text": "#3d2b1f",
      "--toolbar-active": "#b45309",
      "--btn-primary": "#1d4ed8", // blue-700
      "--btn-primary-hover": "#2563eb",
      "--btn-success": "#15803d", // green-700
      "--btn-success-hover": "#16a34a",
      "--btn-danger": "#b91c1c", // red-700
      "--btn-danger-hover": "#dc2626",
      "--card-bg": "#f0e8d8",
      "--modal-bg": "#f0e8d8",
      "--btn-text": "#ffffff",
      "--accent-text": "#ffffff",
    },
  },
  ocean: {
    label: "Ocean",
    description: "Cool, calm blue tones",
    variables: {
      "--bg-primary": "#0f172a", // slate-900
      "--bg-secondary": "#020617", // slate-950
      "--bg-input": "#1e293b", // slate-800
      "--bg-hover": "#1e293b",
      "--text-primary": "#e2e8f0", // slate-200
      "--text-secondary": "#94a3b8", // slate-400
      "--text-muted": "#64748b", // slate-500
      "--accent": "#22d3ee", // cyan-400
      "--accent-hover": "#67e8f9", // cyan-300
      "--accent-bg": "#0891b2", // cyan-600
      "--accent-bg-hover": "#06b6d4", // cyan-500
      "--border-color": "#334155", // slate-700
      "--editor-font-family": "'Merriweather', Georgia, serif",
      "--editor-bg": "#0f172a",
      "--editor-text": "#cbd5e1", // slate-300
      "--toolbar-active": "#22d3ee",
      "--btn-primary": "#6366f1", // indigo-500
      "--btn-primary-hover": "#818cf8",
      "--btn-success": "#14b8a6", // teal-500
      "--btn-success-hover": "#2dd4bf",
      "--btn-danger": "#f43f5e", // rose-500
      "--btn-danger-hover": "#fb7185",
      "--card-bg": "#1e293b",
      "--modal-bg": "#0f172a",
      "--btn-text": "#0f172a",
      "--accent-text": "#0f172a",
    },
  },
  forest: {
    label: "Forest",
    description: "Earthy, natural greens",
    variables: {
      "--bg-primary": "#1a2e1a",
      "--bg-secondary": "#0f1f0f",
      "--bg-input": "#2d4a2d",
      "--bg-hover": "#2d4a2d",
      "--text-primary": "#e2efe2",
      "--text-secondary": "#a3c9a3",
      "--text-muted": "#6b8f6b",
      "--accent": "#34d399", // emerald-400
      "--accent-hover": "#6ee7b7", // emerald-300
      "--accent-bg": "#059669", // emerald-600
      "--accent-bg-hover": "#10b981", // emerald-500
      "--border-color": "#2d4a2d",
      "--editor-font-family": "'Lora', Georgia, serif",
      "--editor-bg": "#1a2e1a",
      "--editor-text": "#d1e7d1",
      "--toolbar-active": "#34d399",
      "--btn-primary": "#8b5cf6", // violet-500
      "--btn-primary-hover": "#a78bfa",
      "--btn-success": "#22c55e",
      "--btn-success-hover": "#4ade80",
      "--btn-danger": "#ef4444",
      "--btn-danger-hover": "#f87171",
      "--card-bg": "#1a2e1a",
      "--modal-bg": "#1a2e1a",
      "--btn-text": "#0f1f0f",
      "--accent-text": "#0f1f0f",
    },
  },
  typewriter: {
    label: "Typewriter",
    description: "Retro, minimal look",
    variables: {
      "--bg-primary": "#f5f5f0",
      "--bg-secondary": "#eaeae5",
      "--bg-input": "#e0e0db",
      "--bg-hover": "#d5d5d0",
      "--text-primary": "#1f2937", // gray-800
      "--text-secondary": "#4b5563", // gray-600
      "--text-muted": "#6b7280", // gray-500
      "--accent": "#1f2937", // gray-800
      "--accent-hover": "#374151", // gray-700
      "--accent-bg": "#374151",
      "--accent-bg-hover": "#4b5563",
      "--border-color": "#d1d5db", // gray-300
      "--editor-font-family": "'Courier New', 'Courier', monospace",
      "--editor-bg": "#fafaf5",
      "--editor-text": "#1f2937",
      "--toolbar-active": "#1f2937",
      "--btn-primary": "#4b5563",
      "--btn-primary-hover": "#6b7280",
      "--btn-success": "#4b5563",
      "--btn-success-hover": "#6b7280",
      "--btn-danger": "#991b1b", // red-800
      "--btn-danger-hover": "#b91c1c",
      "--card-bg": "#ededea",
      "--modal-bg": "#ededea",
      "--btn-text": "#f5f5f0",
      "--accent-text": "#f5f5f0",
    },
  },
};

export const themeNames = Object.keys(themes) as ThemeName[];
