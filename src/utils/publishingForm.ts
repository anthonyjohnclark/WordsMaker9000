import type {
  Diagnostic,
  NodePublishingOverride,
  PublicationScope,
  PrintInteriorPdfSettings,
  PublishFailure,
  PublishFormat,
  PublishProfileId,
  PublishProgress,
  PublishingOutlineNode,
  SectionRole,
} from "../types/PublishingTypes";

export function profileForFormat(
  format: PublishFormat,
  configuredProfiles: {
    pdf?: string;
    docx?: string;
  } = {},
): PublishProfileId {
  if (format === "pdf") {
    return configuredProfiles.pdf === "print_interior"
      ? "print_interior"
      : "proof_pdf";
  }
  if (format === "epub") return "reflowable_epub";
  return configuredProfiles.docx === "clean_handoff"
    ? "clean_handoff"
    : "standard_manuscript";
}

export function defaultPrintInteriorPdfSettings(): PrintInteriorPdfSettings {
  return {
    trim_size: "six_by_nine",
    top_margin_inches: 0.75,
    bottom_margin_inches: 0.75,
    inside_margin_inches: 0.75,
    outside_margin_inches: 0.625,
    gutter_inches: 0.125,
    chapter_start: "recto",
    running_headers: true,
    front_matter_page_numbers: true,
    body_page_numbers: true,
  };
}

export function printInteriorSettingsFromProfiles(
  profiles: Record<string, unknown>,
): PrintInteriorPdfSettings {
  const fallback = defaultPrintInteriorPdfSettings();
  const value = profiles.print_interior;
  if (typeof value !== "object" || value === null) return fallback;
  const profile = value as Record<string, unknown>;
  const trimSizes = new Set<PrintInteriorPdfSettings["trim_size"]>([
    "five_by_eight",
    "five_point_two_five_by_eight",
    "five_point_five_by_eight_point_five",
    "six_by_nine",
  ]);
  const chapterStarts = new Set<PrintInteriorPdfSettings["chapter_start"]>([
    "next_page",
    "recto",
  ]);
  const number = (
    key: keyof PrintInteriorPdfSettings,
    defaultValue: number,
  ) =>
    typeof profile[key] === "number" && Number.isFinite(profile[key])
      ? (profile[key] as number)
      : defaultValue;
  const boolean = (
    key: keyof PrintInteriorPdfSettings,
    defaultValue: boolean,
  ) => (typeof profile[key] === "boolean" ? profile[key] : defaultValue);

  return {
    trim_size: trimSizes.has(
      profile.trim_size as PrintInteriorPdfSettings["trim_size"],
    )
      ? (profile.trim_size as PrintInteriorPdfSettings["trim_size"])
      : fallback.trim_size,
    top_margin_inches: number(
      "top_margin_inches",
      fallback.top_margin_inches,
    ),
    bottom_margin_inches: number(
      "bottom_margin_inches",
      fallback.bottom_margin_inches,
    ),
    inside_margin_inches: number(
      "inside_margin_inches",
      fallback.inside_margin_inches,
    ),
    outside_margin_inches: number(
      "outside_margin_inches",
      fallback.outside_margin_inches,
    ),
    gutter_inches: number("gutter_inches", fallback.gutter_inches),
    chapter_start: chapterStarts.has(
      profile.chapter_start as PrintInteriorPdfSettings["chapter_start"],
    )
      ? (profile.chapter_start as PrintInteriorPdfSettings["chapter_start"])
      : fallback.chapter_start,
    running_headers: boolean(
      "running_headers",
      fallback.running_headers,
    ),
    front_matter_page_numbers: boolean(
      "front_matter_page_numbers",
      fallback.front_matter_page_numbers,
    ),
    body_page_numbers: boolean(
      "body_page_numbers",
      fallback.body_page_numbers,
    ),
  };
}

export function printInteriorSettingsErrors(
  settings: PrintInteriorPdfSettings,
): string[] {
  const errors: string[] = [];
  const margins: Array<[string, number]> = [
    ["Top margin", settings.top_margin_inches],
    ["Bottom margin", settings.bottom_margin_inches],
    ["Inside margin", settings.inside_margin_inches],
    ["Outside margin", settings.outside_margin_inches],
  ];
  for (const [label, value] of margins) {
    if (!Number.isFinite(value) || value < 0.25 || value > 2) {
      errors.push(`${label} must be between 0.25 and 2 inches.`);
    }
  }
  if (
    !Number.isFinite(settings.gutter_inches) ||
    settings.gutter_inches < 0 ||
    settings.gutter_inches > 1
  ) {
    errors.push("Gutter must be between 0 and 1 inch.");
  }

  const [width, height] = {
    five_by_eight: [5, 8],
    five_point_two_five_by_eight: [5.25, 8],
    five_point_five_by_eight_point_five: [5.5, 8.5],
    six_by_nine: [6, 9],
  }[settings.trim_size];
  if (
    width -
      settings.inside_margin_inches -
      settings.outside_margin_inches -
      settings.gutter_inches <
    2
  ) {
    errors.push("Horizontal settings leave too little page width.");
  }
  if (
    height - settings.top_margin_inches - settings.bottom_margin_inches <
    2
  ) {
    errors.push("Vertical settings leave too little page height.");
  }
  return errors;
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

export function selectionForScope(scope: PublicationScope): {
  mode: PublicationScope["type"];
  selectedNodeId: number | null;
} {
  switch (scope.type) {
    case "selected_nodes":
      return {
        mode: scope.type,
        selectedNodeId: scope.node_ids[0] ?? null,
      };
    case "single_work":
    case "single_installment":
    case "volume":
      return { mode: scope.type, selectedNodeId: scope.node_id };
    default:
      return { mode: "full_project", selectedNodeId: null };
  }
}

export function diagnosticsBySeverity(diagnostics: Diagnostic[]): {
  error: Diagnostic[];
  warning: Diagnostic[];
  info: Diagnostic[];
} {
  return {
    error: diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
    warning: diagnostics.filter(
      (diagnostic) => diagnostic.severity === "warning",
    ),
    info: diagnostics.filter((diagnostic) => diagnostic.severity === "info"),
  };
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

export function formatPublishFailure(failure: PublishFailure): string {
  const details = failure.diagnostics.map((diagnostic) => {
    const remediation = diagnostic.remediation?.trim();
    return `${diagnostic.code}: ${diagnostic.message}${
      remediation ? `\n${remediation}` : ""
    }`;
  });
  const message = failure.message.trim();
  const messageAlreadyIncluded = failure.diagnostics.some(
    (diagnostic) => diagnostic.message.trim() === message,
  );
  if (message && !messageAlreadyIncluded) {
    details.push(message);
  }
  return details.join("\n\n") || "Publishing failed.";
}
