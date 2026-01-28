export enum CellType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE'
}

export interface GridCell {
  id: string;
  type: CellType;
  content: string; // Text content or Image URL (base64 or http)
  isGenerating?: boolean; // Loading state for AI generation
}

export interface GridRow {
  id: string;
  height: number;
  cells: Record<string, GridCell>; // keyed by column ID
}

export interface GridColumn {
  id: string;
  label: string;
  width: number;
}

export interface GridState {
  columns: GridColumn[];
  rows: GridRow[];
}
