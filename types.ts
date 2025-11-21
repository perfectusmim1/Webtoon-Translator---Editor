
export enum AppState {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  ERROR = 'ERROR',
}

export interface BoundingBox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

export interface TextBubble {
  id: string;
  text: string; // The translated text
  originalText?: string;
  box: BoundingBox; // Normalized 0-1000 based on Gemini output
  isManual?: boolean; // Created manually by user?
  textColor?: string; // Hex code
  backgroundColor?: string; // Hex code
  shape?: 'rectangle' | 'ellipse'; // Shape of the bubble
  fontSizeScale?: number; // Multiplier for font size (default 1)
  fontFamily?: string; // Selected font family
}

export interface UploadedImage {
  id: string;
  url: string;
  width: number;
  height: number;
  file?: File;
}