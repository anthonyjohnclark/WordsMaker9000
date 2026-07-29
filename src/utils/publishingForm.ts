import type {
  Diagnostic,
  NodePublishingOverride,
  PublicationScope,
  PublishFailure,
  PublishFormat,
  PublishProfileId,
  PublishProgress,
  PublishingOutlineNode,
  SectionRole,
} from "../types/PublishingTypes";

export function profileForFormat(
  format: PublishFormat,
  configuredDocxProfile?: string,
): PublishProfileId {
  if (format === "pdf") return "proof_pdf";
  if (format === "epub") return "reflowable_epub";
  return configuredDocxProfile === "clean_handoff"
    ? "clean_handoff"
    : "standard_manuscript";
}

export function scopeForSelection(
  mode: string,
  selectedNodeId: number | null,
): PublicationScope {
  if (selectedNodeId === null || mode === "full_project") {
    return { type: "full_project" };
  }
  switch (mode) {
    case "single_work":
      return { type: "single_work", node_id: selectedNodeId };
    case "single_installment":
      return { type: "single_installment", node_id: selectedNodeId };
    case "volume":
      return { type: "volume", node_id: selectedNodeId };
    default:
      return { type: "selected_nodes", node_ids: [selectedNodeId] };
  }
}

export function outlineNodeRole(
  node: PublishingOutlineNode,
  overrides: Record<string, NodePublishingOverride>,
): SectionRole {
  if (node.id === null) return node.role;
  return overrides[node.id.toString()]?.role ?? node.role;
}

export function progressForExport(
  activeExportId: string | null,
  progress: PublishProgress,
): PublishProgress | null {
  return progress.export_id === activeExportId ? progress : null;
}

export function parsePublishFailure(error: unknown): PublishFailure {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return {
      message: error.message,
      diagnostics:
        "diagnostics" in error && Array.isArray(error.diagnostics)
          ? (error.diagnostics as Diagnostic[])
          : [],
    };
  }
  if (typeof error === "string") {
    try {
      return parsePublishFailure(JSON.parse(error));
    } catch {
      return { message: error, diagnostics: [] };
    }
  }
  return { message: String(error), diagnostics: [] };
}
