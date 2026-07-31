import {
  defaultPrintInteriorPdfSettings,
  formatPublishFailure,
  outlineNodeRole,
  parsePublishFailure,
  printInteriorSettingsErrors,
  printInteriorSettingsFromProfiles,
  profileForFormat,
  progressForExport,
  scopeForSelection,
} from "./publishingForm";
import type {
  PublishingOutlineNode,
  PublishProgress,
} from "../types/PublishingTypes";

describe("publishing form decisions", () => {
  test("keeps one valid profile for the selected format", () => {
    expect(profileForFormat("pdf", { docx: "clean_handoff" })).toBe(
      "proof_pdf",
    );
    expect(profileForFormat("pdf", { pdf: "print_interior" })).toBe(
      "print_interior",
    );
    expect(profileForFormat("docx", { docx: "clean_handoff" })).toBe(
      "clean_handoff",
    );
    expect(profileForFormat("docx", { docx: "unknown" })).toBe(
      "standard_manuscript",
    );
    expect(profileForFormat("epub", { docx: "clean_handoff" })).toBe(
      "reflowable_epub",
    );
  });

  test("loads saved print settings without trusting malformed profile values", () => {
    expect(
      printInteriorSettingsFromProfiles({
        print_interior: {
          ...defaultPrintInteriorPdfSettings(),
          trim_size: "five_by_eight",
          gutter_inches: 0.25,
          running_headers: false,
        },
      }),
    ).toEqual({
      ...defaultPrintInteriorPdfSettings(),
      trim_size: "five_by_eight",
      gutter_inches: 0.25,
      running_headers: false,
    });

    expect(
      printInteriorSettingsFromProfiles({
        print_interior: {
          trim_size: null,
          gutter_inches: "wide",
          running_headers: null,
        },
      }),
    ).toEqual(defaultPrintInteriorPdfSettings());
  });

  test("rejects print margins that exceed the selected trim", () => {
    const settings = {
      ...defaultPrintInteriorPdfSettings(),
      trim_size: "five_by_eight" as const,
      inside_margin_inches: 2,
      outside_margin_inches: 2,
      gutter_inches: 1,
    };

    expect(printInteriorSettingsErrors(settings)).toContain(
      "Horizontal settings leave too little page width.",
    );
    expect(
      printInteriorSettingsErrors(defaultPrintInteriorPdfSettings()),
    ).toEqual([]);
  });

  test("builds type-appropriate scopes without dropping the selected node", () => {
    expect(scopeForSelection("single_work", 12)).toEqual({
      type: "single_work",
      node_id: 12,
    });
    expect(scopeForSelection("single_installment", 14)).toEqual({
      type: "single_installment",
      node_id: 14,
    });
    expect(scopeForSelection("selected_nodes", 9)).toEqual({
      type: "selected_nodes",
      node_ids: [9],
    });
  });

  test("uses the inferred role for synthetic outline nodes with null IDs", () => {
    const frontMatter: PublishingOutlineNode = {
      id: null,
      title: "Front matter",
      role: "front_matter",
      inclusion: { type: "all_formats" },
      children: [],
    };

    expect(outlineNodeRole(frontMatter, {})).toBe("front_matter");
  });

  test("uses role overrides for source-backed outline nodes", () => {
    const chapter: PublishingOutlineNode = {
      id: 42,
      title: "Chapter One",
      role: "chapter",
      inclusion: { type: "all_formats" },
      children: [],
    };

    expect(
      outlineNodeRole(chapter, {
        "42": {
          role: "volume",
          inclusion: { type: "all_formats" },
        },
      }),
    ).toBe("volume");
  });

  test("ignores progress emitted by another publication job", () => {
    const progress: PublishProgress = {
      export_id: "other",
      phase: "render",
      message: "Rendering",
      current: 3,
      total: 6,
      severity: "info",
    };
    expect(progressForExport("active", progress)).toBeNull();
    expect(progressForExport("other", progress)).toBe(progress);
  });

  test("retains structured diagnostics from command failures", () => {
    const failure = parsePublishFailure(
      JSON.stringify({
        message: "Preflight failed",
        diagnostics: [
          {
            code: "PUBLISH_TITLE_REQUIRED",
            severity: "error",
            message: "A title is required.",
          },
        ],
      }),
    );
    expect(failure.message).toBe("Preflight failed");
    expect(failure.diagnostics[0].code).toBe("PUBLISH_TITLE_REQUIRED");
  });

  test("formats publish diagnostics and remediation without repeating the message", () => {
    expect(
      formatPublishFailure({
        message:
          'File "Unsupported Table" (node 1): Unsupported Quill block element <table>',
        diagnostics: [
          {
            code: "PUBLISH_UNSUPPORTED_CONTENT",
            severity: "error",
            message:
              'File "Unsupported Table" (node 1): Unsupported Quill block element <table>',
            remediation: "Resolve the named source or outline problem and retry.",
          },
        ],
      }),
    ).toBe(
      'PUBLISH_UNSUPPORTED_CONTENT: File "Unsupported Table" (node 1): Unsupported Quill block element <table>\nResolve the named source or outline problem and retry.',
    );
  });
});
