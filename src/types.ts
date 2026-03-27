export type FormField = {
  id: string;
  label: string;
  type: 'number' | 'pass-fail' | 'text';
  unit?: string;
  category?: string;
  columnIndex: number;
  failColumnIndex?: number;
  passLabel?: string;
  failLabel?: string;
  limit?: string;
  limitMetadataKey?: string;
  rowIndex?: number; // For vertical forms: which row this field is in
};

export type Machine = {
  id: string;
  rowIndex: number;
  sheetName: string;
  fileName: string; // Which file this machine belongs to
  location: string;
  name: string;
  metadata: Record<string, any>; // Store other columns like powerKW, maxAmp
  fieldMapping?: Record<string, number>; // Map field ID to column index for this specific file
};

export type CheckRecord = {
  id: string;
  date: string;
  machineId: string;
  values: Record<string, string>; // Dynamic field values
  note: string;
  timestamp: number;
};

export type FooterField = {
  id: string;
  label: string;
  rowIndex: number;
  columnIndex: number;
};

export type FormStructure = {
  fields: FormField[];
  title: string;
  machineNameColumnIndex: number;
  locationColumnIndex: number;
  metadataColumns: { index: number; label: string }[];
  dataStartRow: number;
  noteColumnIndex?: number;
  footerFields?: FooterField[];
  isVerticalForm?: boolean; // True if checklist items are in rows, not columns
  machineNameCell?: string; // For vertical forms: cell address like "B2"
  locationCell?: string; // For vertical forms: cell address like "B3"
  itemLabelColumnIndex?: number; // For vertical forms: column index for item labels
  itemValueColumnIndex?: number; // For vertical forms: column index for item values
  itemLimitColumnIndex?: number; // For vertical forms: column index for standard values/limits
};

