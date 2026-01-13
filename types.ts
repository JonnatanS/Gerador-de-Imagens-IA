
export interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  base64: string;
}

export enum AppState {
  IDLE = 'IDLE',
  GENERATING = 'GENERATING',
  SELECTING = 'SELECTING',
  EDITING = 'EDITING',
  VIEWING = 'VIEWING'
}

export type AspectRatio = "1:1" | "4:3" | "3:4" | "16:9" | "9:16";
export type ImageQuality = "Standard" | "HD" | "Ultra";
export type FileExtension = "png" | "jpg";
export type FilterType = "None" | "Grayscale" | "Sepia" | "Invert" | "Vintage";

export interface GenerationConfig {
  aspectRatio: AspectRatio;
  quality: ImageQuality;
  extension: FileExtension;
}
