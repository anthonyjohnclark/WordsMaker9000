export type ImagePresentation = "block" | "full_width";

export interface ProjectAsset {
  id: string;
  display_name: string;
  relative_path: string;
  media_type: string;
  byte_size: number;
  width_px: number | null;
  height_px: number | null;
  sha256: string;
}

export interface ProjectImageValue {
  assetId: string;
  alt: string;
  caption: string;
  decorative: boolean;
  presentation: ImagePresentation;
}
