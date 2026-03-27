import { FormStructure, FormField } from "../types";

/**
 * Heuristic-based Excel structure analysis.
 * This replaces the Gemini AI logic to allow the app to work without an API key.
 */
export async function analyzeExcelStructure(
  contextRows: { rowNumber: number; values: any[] }[], 
  footerContext: { rowNumber: number; values: any[] }[]
): Promise<FormStructure> {
  console.log("Using Heuristic Analysis (No API Key)");

  // Keywords for detection
  const MACHINE_KEYWORDS = ["ลำดับ", "NO.", "NO", "MACHINE", "เครื่องจักร", "ชื่อเครื่อง", "NAME", "รายการ", "EQUIPMENT", "หมายเลขเครื่อง", "MODEL", "รุ่น", "TAG", "ID", "รหัส"];
  const LOCATION_KEYWORDS = ["LOCATION", "สถานที่", "AREA", "บริเวณ", "จุดติดตั้ง", "ZONE", "แผนก", "LINE", "ไลน์", "อาคาร", "BUILDING", "ชั้น", "FLOOR"];
  const PASS_KEYWORDS = ["ปกติ", "PASS", "OK", "RUN", "(/)", "GOOD", "YES", "ใช้งานได้", "เปิด", "ON"];
  const FAIL_KEYWORDS = ["ผิดปกติ", "FAIL", "NG", "STANDBY", "(X)", "BAD", "NO", "ไม่ปกติ", "ชำรุด", "ซ่อม", "ปิด", "OFF"];
  const NUMBER_KEYWORDS = ["TEMP", "PRESSURE", "AMP", "VOLT", "VALUE", "ค่า", "อุณหภูมิ", "แรงดัน", "กระแส", "ระดับ", "LEVEL", "BAR", "PSI", "KG/CM", "HZ", "RPM", "HOUR"];
  const NOTE_KEYWORDS = ["หมายเหตุ", "REMARK", "NOTE", "COMMENT", "รายละเอียด"];

  // 1. Identify Header Row
  let headerRowIndex = findHeaderRowIndex(contextRows);

  if (headerRowIndex === -1) headerRowIndex = 0;
  const headerRow = contextRows[headerRowIndex];
  const headerValues = headerRow.values.map(v => String(v || "").toUpperCase().trim());

  // 2. Identify Machine and Location Columns
  let machineNameColumnIndex = -1;
  let locationColumnIndex = -1;
  let noteColumnIndex = -1;

  const title = String(contextRows[0]?.values[0] || "").toUpperCase();
  const isDieselForm = title.includes("9.") || title.includes("DIESEL") || title.includes("AIR COMPRESSOR");

  // Priority keywords for machine name (exact match preferred)
  const STANDARD_MACHINE_KEYWORDS = ["MACHINE", "เครื่องจักร", "ชื่อเครื่อง", "NAME", "รายการ", "EQUIPMENT", "หมายเลขเครื่อง", "MODEL", "รุ่น", "TAG", "ID", "รหัส"];
  
  // For Diesel form, prioritize "ประเภท"
  if (isDieselForm) {
    headerValues.forEach((val, idx) => {
      if (machineNameColumnIndex === -1 && val.includes("ประเภท")) {
        machineNameColumnIndex = idx;
      }
    });
  }

  // If not Diesel or "ประเภท" not found, try standard keywords
  if (machineNameColumnIndex === -1) {
    headerValues.forEach((val, idx) => {
      if (machineNameColumnIndex === -1 && STANDARD_MACHINE_KEYWORDS.some(k => val === k)) {
        machineNameColumnIndex = idx;
      }
    });
  }

  headerValues.forEach((val, idx) => {
    if (machineNameColumnIndex === -1 && STANDARD_MACHINE_KEYWORDS.some(k => val.includes(k))) {
      machineNameColumnIndex = idx;
    }
    if (locationColumnIndex === -1 && LOCATION_KEYWORDS.some(k => val.includes(k))) {
      locationColumnIndex = idx;
    }
    if (noteColumnIndex === -1 && NOTE_KEYWORDS.some(k => val.includes(k))) {
      noteColumnIndex = idx;
    }
  });

  // Fallbacks if not found
  if (machineNameColumnIndex === -1) machineNameColumnIndex = 0;
  if (locationColumnIndex === -1) locationColumnIndex = -1;

  // 3. Identify Fields (Columns that are not machine/location and have headers)
  const fields: FormField[] = [];
  const metadataColumns: { index: number; label: string }[] = [];
  const DAY_KEYWORDS = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา", "MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

  // Detect if it's an Air Compressor file based on title or headers
  const isAirCompressor = title.includes("AIR COMPRESSOR") || title.includes("เครื่องอัดลม");

  headerValues.forEach((val, idx) => {
    // Skip machine, location, and empty headers
    if (idx === machineNameColumnIndex || idx === locationColumnIndex || !val) return;
    
    // Skip day-of-week columns
    if (DAY_KEYWORDS.some(k => val === k || val === k + ".")) return;

    // Skip note column for now, it's handled separately in the UI if needed
    if (idx === noteColumnIndex) return;

    // Metadata detection (e.g., Power, Max Amp)
    if (val.includes("KW") || val.includes("AMP") || val.includes("MAX") || val.includes("SPEC") || val.includes("MODEL")) {
      metadataColumns.push({ index: idx, label: headerRow.values[idx] });
      return;
    }

    // Determine field type
    let type: 'number' | 'pass-fail' | 'text' = 'text';
    if (NUMBER_KEYWORDS.some(k => val.includes(k))) {
      type = 'number';
    } else if (PASS_KEYWORDS.some(k => val.includes(k)) || FAIL_KEYWORDS.some(k => val.includes(k))) {
      type = 'pass-fail';
    }

    // Check for split pass/fail columns (e.g., Column A is "OK", Column B is "NG")
    const nextVal = headerValues[idx + 1] || "";
    let failColumnIndex: number | undefined = undefined;
    let passLabel = "ปกติ";
    let failLabel = "ผิดปกติ";

    if (PASS_KEYWORDS.some(k => val.includes(k)) && FAIL_KEYWORDS.some(k => nextVal.includes(k))) {
      type = 'pass-fail';
      failColumnIndex = idx + 1;
      passLabel = headerRow.values[idx];
      failLabel = headerRow.values[idx + 1];
    }

    // Special case for Air Compressor: everything is pass-fail
    if (isAirCompressor && type === 'text') {
      type = 'pass-fail';
    }

    // Try to find category from row above header
    let category = "General";
    if (headerRowIndex > 0) {
      const rowAbove = contextRows[headerRowIndex - 1];
      const categoryVal = String(rowAbove?.values[idx] || "").trim();
      if (categoryVal && categoryVal.length > 2) {
        category = categoryVal;
      } else {
        // Look left for merged category
        for (let j = idx - 1; j >= 0; j--) {
          const leftVal = String(rowAbove?.values[j] || "").trim();
          if (leftVal && leftVal.length > 2) {
            category = leftVal;
            break;
          }
        }
      }
    }

    fields.push({
      id: `field-${idx}`,
      label: headerRow.values[idx],
      type,
      columnIndex: idx,
      failColumnIndex,
      passLabel,
      failLabel,
      category,
      unit: val.match(/\((.*?)\)/)?.[1] || undefined,
      limit: val.match(/[<>≤≥]\s*[\d.]+/)?.[0] || undefined
    });
  });

  // 4. Determine if Vertical Form
  // (If many labels are in the first column and values are in the second)
  let isVerticalForm = false;
  let verticalLabelsCount = 0;
  contextRows.forEach(row => {
    const firstVal = String(row.values[0] || "").trim();
    const secondVal = String(row.values[1] || "").trim();
    
    // Heuristic: First column has a label-like string, second column has a value or is empty
    if (firstVal.length > 2 && firstVal.length < 50 && (firstVal.includes(":") || firstVal.includes("：") || MACHINE_KEYWORDS.some(k => firstVal.toUpperCase().includes(k)))) {
      verticalLabelsCount++;
    }
  });
  if (verticalLabelsCount > 3) isVerticalForm = true;

  // For vertical forms, try to find specific cells for machine and location
  let machineNameCell = "B2";
  let locationCell = "B3";
  
  if (isVerticalForm) {
    contextRows.forEach(row => {
      const firstVal = String(row.values[0] || "").toUpperCase();
      if (MACHINE_KEYWORDS.some(k => firstVal.includes(k))) {
        machineNameCell = `B${row.rowNumber}`;
      }
      if (LOCATION_KEYWORDS.some(k => firstVal.includes(k))) {
        locationCell = `B${row.rowNumber}`;
      }
    });
  }
  const footerFields: any[] = [];
  footerContext.forEach(row => {
    row.values.forEach((val, idx) => {
      const sVal = String(val || "").toUpperCase();
      if (sVal.includes("ลงชื่อ") || sVal.includes("SIGNATURE") || sVal.includes("ผู้ตรวจสอบ") || sVal.includes("ผู้อนุมัติ")) {
        footerFields.push({
          id: `footer-${row.rowNumber}-${idx}`,
          label: String(val).trim(),
          rowIndex: row.rowNumber,
          columnIndex: idx
        });
      }
    });
  });

  return {
    title: String(contextRows[0]?.values[0] || "PM Checklist"),
    dataStartRow: headerRow.rowNumber + 1,
    fields,
    machineNameColumnIndex,
    locationColumnIndex,
    metadataColumns,
    noteColumnIndex: noteColumnIndex !== -1 ? noteColumnIndex : undefined,
    footerFields: footerFields.length > 0 ? footerFields : undefined,
    isVerticalForm,
    machineNameCell,
    locationCell,
    itemLabelColumnIndex: isVerticalForm ? 0 : undefined,
    itemValueColumnIndex: isVerticalForm ? 1 : undefined
  };
}

/**
 * Finds the index of the header row in a set of context rows.
 */
export function findHeaderRowIndex(contextRows: { rowNumber: number; values: any[] }[]): number {
  const MACHINE_KEYWORDS = ["ลำดับ", "NO.", "NO", "MACHINE", "เครื่องจักร", "ชื่อเครื่อง", "NAME", "รายการ", "EQUIPMENT", "หมายเลขเครื่อง", "MODEL", "รุ่น", "TAG", "ID", "รหัส"];
  const DIESEL_KEYWORDS = ["ประเภท"];
  const LOCATION_KEYWORDS = ["LOCATION", "สถานที่", "AREA", "บริเวณ", "จุดติดตั้ง", "ZONE", "แผนก", "LINE", "ไลน์", "อาคาร", "BUILDING", "ชั้น", "FLOOR"];
  const PASS_KEYWORDS = ["ปกติ", "PASS", "OK", "RUN", "(/)", "GOOD", "YES", "ใช้งานได้", "เปิด", "ON"];

  let headerRowIndex = -1;
  let maxScore = -1;
  
  const title = String(contextRows[0]?.values[0] || "").toUpperCase();
  const isDieselForm = title.includes("9.") || title.includes("DIESEL") || title.includes("AIR COMPRESSOR");

  for (let i = 0; i < Math.min(contextRows.length, 40); i++) {
    const nonEmpties = contextRows[i].values.filter(v => v !== null && v !== undefined && v !== "").length;
    if (nonEmpties < 2) continue;

    let keywordCount = 0;
    contextRows[i].values.forEach(v => {
      const s = String(v || "").toUpperCase().trim();
      if (!s) return;
      if (MACHINE_KEYWORDS.some(k => s === k || s.includes(k))) keywordCount++;
      if (isDieselForm && DIESEL_KEYWORDS.some(k => s === k || s.includes(k))) keywordCount++;
      if (LOCATION_KEYWORDS.some(k => s === k || s.includes(k))) keywordCount++;
      if (PASS_KEYWORDS.some(k => s === k || s.includes(k))) keywordCount++;
    });

    // Score = keywordCount * 10 + nonEmpties
    const score = (keywordCount * 10) + nonEmpties;

    if (score > maxScore) {
      maxScore = score;
      headerRowIndex = i;
    }
  }

  return headerRowIndex === -1 ? 0 : headerRowIndex;
}

/**
 * Merges multiple FormStructure objects into a single unified structure.
 */
export function mergeFormStructures(structures: FormStructure[]): FormStructure {
  if (structures.length === 0) throw new Error("No structures to merge");
  if (structures.length === 1) return structures[0];

  const base = structures[0];
  const allFields: FormField[] = [...base.fields];
  const allMetadata: { index: number; label: string }[] = [...base.metadataColumns];
  const allFooter: any[] = [...(base.footerFields || [])];

  for (let i = 1; i < structures.length; i++) {
    const s = structures[i];
    
    // Merge fields by label
    s.fields.forEach(f => {
      if (!allFields.some(existing => existing.label.toUpperCase().trim() === f.label.toUpperCase().trim())) {
        allFields.push(f);
      }
    });

    // Merge metadata by label
    s.metadataColumns.forEach(m => {
      if (!allMetadata.some(existing => existing.label.toUpperCase().trim() === m.label.toUpperCase().trim())) {
        allMetadata.push(m);
      }
    });

    // Merge footer fields by label
    if (s.footerFields) {
      s.footerFields.forEach(f => {
        if (!allFooter.some(existing => existing.label.toUpperCase().trim() === f.label.toUpperCase().trim())) {
          allFooter.push(f);
        }
      });
    }
  }

  return {
    ...base,
    fields: allFields,
    metadataColumns: allMetadata,
    footerFields: allFooter.length > 0 ? allFooter : undefined
  };
}
