import type { ProjectType } from "../utils/fileManager";

export type PublishFormat = "pdf" | "docx" | "epub";
export type PdfProfileId =
  | "proof_pdf"
  | "print_interior"
  | "large_print"
  | "hardcover";
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

export type LargePrintTrimSize =
  | "six_by_nine"
  | "seven_by_ten"
  | "eight_by_ten";

export interface LargePrintPdfSettings {
  trim_size: LargePrintTrimSize;
  top_margin_inches: number;
  bottom_margin_inches: number;
  inside_margin_inches: number;
  outside_margin_inches: number;
  gutter_inches: number;
  base_font_size_points: number;
  line_spacing: number;
  max_line_length_characters: number;
  heading_scale: number;
  paragraph_spacing_points: number;
  running_headers: boolean;
  front_matter_page_numbers: boolean;
  body_page_numbers: boolean;
  page_furniture_size_points: number;
}

export type HardcoverTrimSize =
  | "five_point_five_by_eight_point_five"
  | "six_by_nine"
  | "seven_by_ten";

export interface HardcoverPdfSettings {
  trim_size: HardcoverTrimSize;
  top_margin_inches: number;
  bottom_margin_inches: number;
  inside_margin_inches: number;
  outside_margin_inches: number;
  gutter_inches: number;
  chapter_start: ChapterStartSide;
  intentional_blank_pages: boolean;
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

export interface MatterTemplateSelection {
  template_id: string;
  template_version: number;
  variables: Record<string, string>;
}

export interface MasterPageSelection {
  template_id: string;
  template_version: number;
}

export interface MatterTemplateVariableDefinition {
  key: string;
  label: string;
  required: boolean;
  multiline: boolean;
  default_from?: "title" | "subtitle" | "author" | null;
  default_value?: string | null;
}

export interface MatterTemplateDefinition {
  id: string;
  version: number;
  label: string;
  output_title: string;
  description: string;
  placement: "front" | "back";
  variables: MatterTemplateVariableDefinition[];
}

export interface MasterPageDefinition {
  id: string;
  version: number;
  label: string;
  description: string;
  settings?: MasterPageSettings | null;
  intentional_blank_pages: boolean;
}

export interface MasterPageSettings {
  chapter_start: ChapterStartSide;
  running_headers: boolean;
  front_matter_page_numbers: boolean;
  body_page_numbers: boolean;
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
  large_print_settings: LargePrintPdfSettings;
  hardcover_settings: HardcoverPdfSettings;
  metadata: PublishingMetadata;
  node_overrides: Record<string, NodePublishingOverride>;
  outline_confirmed: boolean;
  include_shared_matter: boolean;
  matter_templates: MatterTemplateSelection[];
  master_page: MasterPageSelection;
  destination?: string;
}

export type PublishRecipe = Omit<
  PublishRequest,
  "export_id" | "project_name" | "destination"
>;

export interface SavedPublishingProfile {
  id: string;
  name: string;
  recipe: PublishRecipe;
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
  saved_profiles: SavedPublishingProfile[];
  matter_templates: MatterTemplateSelection[];
  master_page: MasterPageSelection;
}

export interface PublishingSetup {
  config: PublishingConfig;
  project_type: ProjectType;
  outline: PublishingOutlineNode[];
  matter_template_catalog: MatterTemplateDefinition[];
  master_page_catalog: MasterPageDefinition[];
}

export interface PublishFailure {
  message: string;
  diagnostics: Diagnostic[];
}

export interface ArtifactHistoryEntry {
  export_id: string | null;
  filename: string;
  path: string;
  modified: string;
  format: PublishFormat;
  profile_id: string | null;
  legacy: boolean;
  diagnostics: Diagnostic[];
  can_regenerate: boolean;
}
