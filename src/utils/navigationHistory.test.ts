import {
  canNavigateBack,
  canNavigateForward,
  createNavigationHistory,
  updateNavigationHistory,
} from "./navigationHistory";

describe("title-bar navigation history", () => {
  test("navigates Home to Project, Back to Home, and Forward to Project", () => {
    const home = createNavigationHistory("home-1");
    const project = updateNavigationHistory(home, "PUSH", "project-1");

    expect(canNavigateBack(project)).toBe(true);
    expect(canNavigateForward(project)).toBe(false);

    const backAtHome = updateNavigationHistory(project, "POP", "home-1");
    expect(canNavigateBack(backAtHome)).toBe(false);
    expect(canNavigateForward(backAtHome)).toBe(true);

    const forwardAtProject = updateNavigationHistory(
      backAtHome,
      "POP",
      "project-1",
    );
    expect(canNavigateBack(forwardAtProject)).toBe(true);
    expect(canNavigateForward(forwardAtProject)).toBe(false);
  });

  test("allows Back to reopen a project after Home is pushed", () => {
    const home = createNavigationHistory("home-1");
    const project = updateNavigationHistory(home, "PUSH", "project-1");
    const pushedHome = updateNavigationHistory(project, "PUSH", "home-2");
    const reopenedProject = updateNavigationHistory(
      pushedHome,
      "POP",
      "project-1",
    );

    expect(reopenedProject.index).toBe(1);
    expect(canNavigateBack(reopenedProject)).toBe(true);
    expect(canNavigateForward(reopenedProject)).toBe(true);
  });

  test("discards the forward branch when a new project is pushed", () => {
    const home = createNavigationHistory("home-1");
    const firstProject = updateNavigationHistory(home, "PUSH", "project-1");
    const backAtHome = updateNavigationHistory(
      firstProject,
      "POP",
      "home-1",
    );
    const secondProject = updateNavigationHistory(
      backAtHome,
      "PUSH",
      "project-2",
    );

    expect(secondProject).toEqual({
      entries: ["home-1", "project-2"],
      index: 1,
    });
    expect(canNavigateForward(secondProject)).toBe(false);
  });

  test("replaces the current entry without changing its position", () => {
    const home = createNavigationHistory("home-1");
    const project = updateNavigationHistory(home, "PUSH", "project-1");
    const replaced = updateNavigationHistory(
      project,
      "REPLACE",
      "project-replaced",
    );

    expect(replaced).toEqual({
      entries: ["home-1", "project-replaced"],
      index: 1,
    });
  });

  test("resets safely when a pop reaches an unknown entry", () => {
    const home = createNavigationHistory("home-1");
    const project = updateNavigationHistory(home, "PUSH", "project-1");
    const unknown = updateNavigationHistory(project, "POP", "unknown");

    expect(unknown).toEqual({ entries: ["unknown"], index: 0 });
    expect(canNavigateBack(unknown)).toBe(false);
    expect(canNavigateForward(unknown)).toBe(false);
  });
});
