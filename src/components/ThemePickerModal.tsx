import React from "react";
import { themes, themeNames, ThemeName } from "../themes";

interface ThemePickerModalProps {
  selectedTheme: ThemeName;
  onSelect: (theme: ThemeName) => void;
  onClose: () => void;
}

const ThemePickerModal: React.FC<ThemePickerModalProps> = ({
  selectedTheme,
  onSelect,
  onClose,
}) => {
  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60]"
      onClick={onClose}
    >
      <div
        className="rounded-xl shadow-2xl p-8 w-[720px] max-h-[85vh] overflow-y-auto"
        style={{
          background: "var(--modal-bg)",
          color: "var(--text-primary)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Choose a Theme</h2>
          <button
            onClick={onClose}
            className="text-xl px-2 py-1 rounded"
            style={{ color: "var(--text-muted)" }}
          >
            &#10005;
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {themeNames.map((name) => {
            const theme = themes[name];
            const isSelected = selectedTheme === name;
            const vars = theme.variables;

            return (
              <button
                key={name}
                type="button"
                onClick={() => {
                  onSelect(name);
                  onClose();
                }}
                className="rounded-xl p-0 overflow-hidden text-left transition-all"
                style={{
                  border: isSelected
                    ? `3px solid ${vars["--accent"]}`
                    : "3px solid transparent",
                  boxShadow: isSelected
                    ? `0 0 16px ${vars["--accent"]}50`
                    : "0 2px 8px rgba(0,0,0,0.2)",
                }}
              >
                {/* Mini app preview */}
                <div
                  className="flex"
                  style={{
                    background: vars["--bg-secondary"],
                    minHeight: "120px",
                  }}
                >
                  {/* Sidebar preview */}
                  <div
                    className="w-36 p-3 flex flex-col gap-2 shrink-0"
                    style={{ background: vars["--bg-primary"] }}
                  >
                    <div
                      className="text-sm font-bold truncate"
                      style={{ color: vars["--text-primary"] }}
                    >
                      {theme.label}
                    </div>
                    <div
                      className="text-xs"
                      style={{ color: vars["--text-secondary"] }}
                    >
                      {theme.description}
                    </div>
                    {/* Fake tree items */}
                    <div className="mt-2 flex flex-col gap-1">
                      <div className="flex items-center gap-1">
                        <span style={{ fontSize: "10px" }}>📁</span>
                        <span
                          className="text-[10px]"
                          style={{ color: vars["--text-primary"] }}
                        >
                          Chapter 1
                        </span>
                      </div>
                      <div className="flex items-center gap-1 ml-3">
                        <span style={{ fontSize: "10px" }}>📄</span>
                        <span
                          className="text-[10px]"
                          style={{ color: vars["--text-primary"] }}
                        >
                          Scene 1
                        </span>
                      </div>
                      <div className="flex items-center gap-1 ml-3">
                        <span
                          className="text-[10px]"
                          style={{ color: vars["--btn-success"] }}
                        >
                          + new file
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Editor preview */}
                  <div className="flex-1 flex flex-col">
                    {/* Toolbar */}
                    <div
                      className="flex items-center gap-3 px-3 py-1.5 text-[10px]"
                      style={{
                        background: vars["--bg-primary"],
                        borderBottom: `1px solid ${vars["--border-color"]}`,
                      }}
                    >
                      <span
                        className="font-bold"
                        style={{ color: vars["--toolbar-active"] }}
                      >
                        B
                      </span>
                      <span
                        className="italic"
                        style={{ color: vars["--text-secondary"] }}
                      >
                        I
                      </span>
                      <span
                        className="underline"
                        style={{ color: vars["--text-secondary"] }}
                      >
                        U
                      </span>
                    </div>
                    {/* Text area */}
                    <div
                      className="flex-1 p-3"
                      style={{ background: vars["--editor-bg"] }}
                    >
                      <p
                        className="text-xs leading-relaxed"
                        style={{
                          fontFamily: vars["--editor-font-family"],
                          color: vars["--editor-text"],
                        }}
                      >
                        The quick brown fox jumps over the lazy dog. She sells
                        seashells by the seashore.
                      </p>
                      <p
                        className="text-xs leading-relaxed mt-2 opacity-60"
                        style={{
                          fontFamily: vars["--editor-font-family"],
                          color: vars["--editor-text"],
                        }}
                      >
                        A second paragraph to preview the writing experience
                        with this theme.
                      </p>
                    </div>
                    {/* Bottom bar */}
                    <div
                      className="flex items-center justify-between px-3 py-1"
                      style={{
                        background: vars["--bg-primary"],
                        borderTop: `1px solid ${vars["--border-color"]}`,
                      }}
                    >
                      <span
                        className="text-[9px]"
                        style={{ color: vars["--text-muted"] }}
                      >
                        Font: {vars["--editor-font-family"].split(",")[0].replace(/'/g, "")}
                      </span>
                      {/* Color palette dots */}
                      <div className="flex gap-1">
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ background: vars["--accent"] }}
                          title="Accent"
                        />
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ background: vars["--btn-primary"] }}
                          title="Primary"
                        />
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ background: vars["--btn-success"] }}
                          title="Success"
                        />
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ background: vars["--btn-danger"] }}
                          title="Danger"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Selected indicator */}
                {isSelected && (
                  <div
                    className="text-center text-xs font-bold py-1"
                    style={{
                      background: vars["--accent"],
                      color: vars["--bg-primary"],
                    }}
                  >
                    Currently Selected
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ThemePickerModal;
