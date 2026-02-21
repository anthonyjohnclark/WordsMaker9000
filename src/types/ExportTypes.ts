export interface ExportFileNode {
  id: number;
  parent: number;
  text: string;
  file_type: string;
  content?: string;
}

export interface ExportOptions {
  title: string;
  author: string;
  front_matter?: string;
  back_matter?: string;
}

export interface ExportPayload {
  project_name: string;
  nodes: ExportFileNode[];
  options: ExportOptions;
}

export interface ExportResult {
  success: boolean;
  output_path?: string;
  error?: string;
}
