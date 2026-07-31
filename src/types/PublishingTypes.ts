import type { ProjectType } from "../utils/fileManager";

export type PublishFormat = "pdf" | "docx" | "epub";
export type PdfProfileId = "proof_pdf" | "print_interior";
export type DocxProfileId = "standard_manuscript" | "clean_handoff";
export type PublishProfileId =
  | PdfProfileId
  | DocxProfileId
  | "reflowable_epub";
export type PrintTrimSize =
  | "five_by_eight"
  | "five_point_two_five_by_eight"
  | "five_point_five_by_eight_point_five"
  | "six_by_nine";
export type ChapterStartSide = "next_page" | "recto";

export interface PrintInteriorPdfSettings {
  trim_size: PrintTrimSize;
  top_margin_inches: number;
  bottom_margin_inches: number;
  inside_margin_inches: number;
  outside_margin_inches: number;
  gutter_inches: number;
  chapter_start: ChapterStartSide;
  running_headers: boolean;
  front_matter_page_numbers: boolean;
  body_page_numbers: boolean;
}
export type SectionRole =
  | "front_matter"
  | "part"
  | "chapter"
  | "scene"
  | "work"
  | "installment"
  | "volume"
  | "back_matter"
  | "unassigned";

export type SectionInclusion =
  | { type: "all_formats" }
  | { type: "selected_formats"; formats: ("pdf" | "docx" | "epub")[] }
  | { type: "excluded" };

export type PublicationScope =
  | { type: "full_project" }
  | { type: "selected_nodes"; node_ids: number[] }
  | { type: "single_work"; node_id: number }
  | { type: "single_installment"; node_id: number }
  | { type: "volume"; node_id: number };

export interface ContactInformation {
  author_name: string;
  email: string;
  phone: string;
  mailing_address: string;
  header_surname: string;
  short_title: string;
}

export interface EbookCover {
  source: string;
  alt_text: string;
}

export interface EbookMetadata {
  identifier?: string;
  publisher?: string;
  description?: string;
  rights?: string;
  cover?: EbookCover;
  page_progression_direction?: "left_to_right" | "right_to_left";
  include_front_matter: boolean;
  include_back_matter: boolean;
}

export interface PublishingMetadata {
  title: string;
  subtitle?: string;
  author: string;
  language?: string;
  front_matter?: string;
  back_matter?: string;
  contact: ContactInformation;
  ebook: EbookMetadata;
}

export interface NodePublishingOverride {
  role: SectionRole;
  inclusion: SectionInclusion;
}

export interface PublishRequest {
  export_id: string;
  project_name: string;
  project_type: ProjectType;
  scope: PublicationScope;
  format: PublishFormat;
  profile_id: PublishProfileId;
  pdf_settings: PrintInteriorPdfSettings;
  metadata: PublishingMetadata;
  node_overrides: Record<string, NodePublishingOverride>;
  outline_confirmed: boolean;
  include_shared_matter: boolean;
  destination?: string;
}

export interface Diagnostic {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  node_id?: number;
  remediation?: string;
}

export interface PublishProgress {
  export_id: string;
  phase:
    | "snapshot"
    | "compile"
    | "preflight"
    | "render"
    | "validate"
    | "copy";
  message: string;
  current: number;
  total: number;
  severity: "error" | "warning" | "info";
}

export interface PublishResult {
  export_id: string;
  manifest_path: string;
  primary_artifact_path: string;
  diagnostics: Diagnostic[];
}

export interface PublishingOutlineNode {
  id: number | null;
  title: string | null;
  role: SectionRole;
  inclusion: SectionInclusion;
  children: PublishingOutlineNode[];
}

export interface PublishingConfig {
  schema_version: number;
  project_type_strategy: {
    project_type: ProjectType;
    version: number;
    confirmed: boolean;
  };
  book_metadata: PublishingMetadata;
  node_roles: Record<string, NodePublishingOverride>;
  profiles: Record<string, unknown>;
  default_profile_by_format: Record<string, string>;
}

export interface PublishingSetup {
  config: PublishingConfig;
  project_type: ProjectType;
  outline: PublishingOutlineNode[];
}

export interface PublishFailure {
  message: string;
  diagnostics: Diagnostic[];
}
