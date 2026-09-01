import { applyTheme, themes, themeNames } from "./themes";

describe("applyTheme", () => {
  const setProperty = jest.fn();

  beforeEach(() => {
    setProperty.mockClear();
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        documentElement: {
          style: { setProperty },
        },
      },
    });
  });

  afterAll(() => {
    Reflect.deleteProperty(globalThis, "document");
  });

  it.each(themeNames)("maps the %s theme onto the logo palette", (themeName) => {
    applyTheme(themeName);

    const variables = themes[themeName].variables;
    expect(setProperty).toHaveBeenCalledWith(
      "--wm-logo-background",
      variables["--bg-secondary"],
    );
    expect(setProperty).toHaveBeenCalledWith(
      "--wm-logo-ink",
      variables["--accent"],
    );
    expect(setProperty).toHaveBeenCalledWith(
      "--wm-logo-lettering",
      variables["--text-primary"],
    );
    expect(setProperty).toHaveBeenCalledWith(
      "--wm-logo-outline",
      variables["--bg-secondary"],
    );
  });
});
