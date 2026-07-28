import {
  parsePublishFailure,
  profileForFormat,
  progressForExport,
  scopeForSelection,
} from "./publishingForm";
import type { PublishProgress } from "../types/PublishingTypes";

describe("publishing form decisions", () => {
  test("keeps one valid profile for the selected format", () => {
    expect(profileForFormat("pdf", "clean_handoff")).toBe("proof_pdf");
    expect(profileForFormat("docx", "clean_handoff")).toBe("clean_handoff");
    expect(profileForFormat("docx", "unknown")).toBe(
      "standard_manuscript",
    );
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
});
