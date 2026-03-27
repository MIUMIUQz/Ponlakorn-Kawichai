import { FormStructure, FormField, FooterField } from "../types";

export function analyzeExcelStructureHeuristic(
  contextRows: { rowNumber: number; values: any[] }[], 
  footerContext: { rowNumber: number; values: any[] }[]
): FormStructure {
  // Default structure
  const structure: FormStructure = {
    title: "PM Checklist",
    fields: [],
    machineNameColumnIndex: -1,
    locationColumnIndex: -1,
    metadataColumns: [],
    dataStartRow: 1,
    isVerticalForm: false
  };

  // Keywords for detection
  const machineKeywords = ["MACHINE", "ชื่อเครื่องจักร", "NAME", "EQUIPMENT", "เครื่องจักร", "รายการ", "ASSET", "ID", "CODE", "รหัส", "เครื่อง", "หมายเลขเครื่อง"];
  const locationKeywords = ["LOCATION", "สถานที่", "AREA", "BUILDING", "โซน", "ชั้น", "FLOOR", "SITE", "PLANT", "โรงงาน", "แผนก", "DEPT", "ตำแหน่ง"];
  const labels = [
    "PRESSURE", "TEMP", "VIBRATION", "AMP", "VOLT", "LEVEL", "OIL", "CLEAN", "CHECK", "STATUS", "VIB", "VAC", "BAR", "PSI", "RPM", "HZ",
    "ความดัน", "อุณหภูมิ", "แรงดัน", "กระแส", "แรงสั่นสะเทือน", "ระดับน้ำมัน", "ความสะอาด", "ตรวจสอบ", "สถานะ", "ปกติ", "ผิดปกติ", "การทำงาน",
    "สภาพ", "ความร้อน", "เสียง", "รอยรั่ว", "ความตึง", "จาระบี", "หล่อลื่น", "รายการตรวจสอบ", "หัวข้อการตรวจ", "จุดที่ตรวจ"
  ];
  const metadataKeywords = ["POWER", "AMP", "KW", "MODEL", "S/N", "SERIAL", "SPEC", "CAPACITY", "รุ่น", "ขนาด", "กำลัง", "พิกัด"];
  const signatureKeywords = ["ลงชื่อ", "SIGNATURE", "ผู้ตรวจสอบ", "CHECKED", "APPROVED", "ผู้อนุมัติ", "พยาน", "WITNESS", "ผู้บันทึก", "RECORDED", "หัวหน้างาน"];
  const passFailKeywords = ["OK", "NG", "PASS", "FAIL", "ปกติ", "ผิดปกติ", "ผ่าน", "ไม่ผ่าน", "YES", "NO", "ดี", "ชำรุด"];

  const colToLetter = (col: number): string => {
    let letter = '';
    while (col > 0) {
      let temp = (col - 1) % 26;
      letter = String.fromCharCode(temp + 65) + letter;
      col = (col - temp - 1) / 26;
    }
    return letter;
  };

  // 1. Detect if it's a vertical form (checklist items in rows)
  let verticalScore = 0;
  const colCounts: Record<number, number> = {};
  const passFailColCounts: Record<number, number> = {};
  
  contextRows.forEach(row => {
    row.values.forEach((val, idx) => {
      if (typeof val === 'string') {
        const upper = val.toUpperCase();
        if (labels.some(l => upper.includes(l))) {
          verticalScore++;
          colCounts[idx] = (colCounts[idx] || 0) + 1;
        }
        if (passFailKeywords.some(k => upper.includes(k))) {
          passFailColCounts[idx] = (passFailColCounts[idx] || 0) + 1;
        }
      }
    });
  });

  // If many labels found in a single column, it's likely vertical
  let maxColCount = 0;
  let bestLabelCol = -1;
  Object.entries(colCounts).forEach(([col, count]) => {
    if (count > maxColCount) {
      maxColCount = count;
      bestLabelCol = Number(col);
    }
  });

  // If a single column has many labels, it's a vertical form
  if (maxColCount > 2) {
    structure.isVerticalForm = true;
    structure.itemLabelColumnIndex = bestLabelCol;
    
    // Find value column (usually next to label, or where OK/NG are found)
    let bestValueCol = bestLabelCol + 1;
    let maxPFCount = 0;
    Object.entries(passFailColCounts).forEach(([col, count]) => {
      const colIdx = Number(col);
      if (colIdx > bestLabelCol && count > maxPFCount) {
        maxPFCount = count;
        bestValueCol = colIdx;
      }
    });
    structure.itemValueColumnIndex = bestValueCol;
    
    // Find machine name and location cells in vertical form (usually near the top)
    for (const row of contextRows.slice(0, 20)) {
      row.values.forEach((val, idx) => {
        if (typeof val === 'string') {
          const upper = val.toUpperCase();
          if (machineKeywords.some(k => upper.includes(k)) && !structure.machineNameCell) {
            if (val.includes(':') || val.includes('：')) {
              structure.machineNameCell = `${colToLetter(idx + 1)}${row.rowNumber}`;
            } else {
              structure.machineNameCell = `${colToLetter(idx + 2)}${row.rowNumber}`;
            }
          }
          if (locationKeywords.some(k => upper.includes(k)) && !structure.locationCell) {
            if (val.includes(':') || val.includes('：')) {
              structure.locationCell = `${colToLetter(idx + 1)}${row.rowNumber}`;
            } else {
              structure.locationCell = `${colToLetter(idx + 2)}${row.rowNumber}`;
            }
          }
        }
      });
    }

    // Find data start row (first row with a label, skipping titles)
    for (const row of contextRows) {
      if (row.rowNumber < 3) continue; // Skip title area
      const val = row.values[bestLabelCol];
      if (typeof val === 'string' && labels.some(l => val.toUpperCase().includes(l))) {
        structure.dataStartRow = row.rowNumber;
        break;
      }
    }

    // Identify fields
    contextRows.forEach(row => {
      if (row.rowNumber >= structure.dataStartRow) {
        const label = row.values[bestLabelCol];
        if (typeof label === 'string' && label.trim().length > 1) {
          // Skip signature lines
          if (signatureKeywords.some(k => label.toUpperCase().includes(k))) return;
          // Skip rows that look like section headers (no value next to them)
          const valueCell = row.values[bestValueCol];
          if (!valueCell && label.length > 30) return;

          const field: FormField = {
            id: `field-${row.rowNumber}`,
            label: label.trim(),
            type: 'pass-fail',
            columnIndex: structure.itemValueColumnIndex!,
            rowIndex: row.rowNumber
          };
          
          const lower = label.toLowerCase();
          if (lower.includes('value') || lower.includes('ค่า') || lower.includes('temp') || lower.includes('amp') || lower.includes('bar') || lower.includes('psi') || lower.includes('volt') || lower.includes('hz')) {
            field.type = 'number';
          } else if (lower.includes('note') || lower.includes('remark') || lower.includes('หมายเหตุ')) {
            field.type = 'text';
          }
          
          structure.fields.push(field);
        }
      }
    });
  } else {
    // 2. Horizontal Table (one row per machine)
    let headerRowIndex = -1;
    
    // Find header row by looking for machine/location keywords
    // We look for a row that has a "Machine" keyword, but we also want to make sure
    // the column it points to actually contains machine names (not just repeated headers)
    for (const row of contextRows) {
      const values = row.values;
      const machineIndices = values
        .map((v, i) => (typeof v === 'string' && machineKeywords.some(k => v.toUpperCase().includes(k))) ? i : -1)
        .filter(i => i !== -1);

      if (machineIndices.length > 0) {
        // If we found multiple candidates, pick the one that seems most like a machine name column
        // (e.g., not a location column, and has unique values in subsequent rows)
        let bestMachineIdx = machineIndices[0];
        
        // If there's a location keyword in the same row, try to pick the other one for machine
        const locationIdx = values.findIndex(v => typeof v === 'string' && locationKeywords.some(k => v.toUpperCase().includes(k)));
        if (locationIdx !== -1 && machineIndices.includes(locationIdx)) {
          bestMachineIdx = machineIndices.find(i => i !== locationIdx) || machineIndices[0];
        }

        // Validate the chosen column by checking if it has unique values in the first few data rows
        // If it's 100% identical, it might be a category/department column
        const sampleRows = contextRows.filter(r => r.rowNumber > row.rowNumber).slice(0, 10);
        if (sampleRows.length > 2) {
          const sampleValues = sampleRows.map(r => r.values[bestMachineIdx]).filter(v => !!v);
          const uniqueValues = new Set(sampleValues);
          if (uniqueValues.size === 1 && sampleValues.length > 2) {
            // This column is likely a category/department. Try another candidate if available.
            const otherCandidate = machineIndices.find(i => i !== bestMachineIdx);
            if (otherCandidate !== undefined) {
              bestMachineIdx = otherCandidate;
            }
          }
        }

        structure.machineNameColumnIndex = bestMachineIdx;
        headerRowIndex = row.rowNumber;
        
        if (locationIdx !== -1) {
          structure.locationColumnIndex = locationIdx;
        }
        break;
      }
    }

    if (headerRowIndex !== -1) {
      structure.dataStartRow = headerRowIndex + 1;
      const headerRow = contextRows.find(r => r.rowNumber === headerRowIndex);
      
      if (headerRow) {
        headerRow.values.forEach((val, idx) => {
          if (idx === structure.machineNameColumnIndex || idx === structure.locationColumnIndex) return;
          if (!val || typeof val !== 'string') return;
          
          const label = val.trim();
          if (label.length < 2) return;
          
          // Skip frequency markers (Mon, Tue, etc.)
          const freqKeywords = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา", "MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN", "1", "2", "3", "4", "5", "6", "7"];
          if (freqKeywords.some(k => label.toUpperCase() === k)) return;

          if (metadataKeywords.some(k => label.toUpperCase().includes(k))) {
            structure.metadataColumns.push({ index: idx, label });
          } else {
            const field: FormField = {
              id: `field-${idx}`,
              label,
              type: 'pass-fail',
              columnIndex: idx
            };
            
            const lower = label.toLowerCase();
            if (lower.includes('value') || lower.includes('ค่า') || lower.includes('temp') || lower.includes('amp') || lower.includes('bar') || lower.includes('psi') || lower.includes('volt') || lower.includes('hz')) {
              field.type = 'number';
            } else if (lower.includes('note') || lower.includes('remark') || lower.includes('หมายเหตุ')) {
              field.type = 'text';
            }
            
            structure.fields.push(field);
          }
        });
      }
    }
  }

  // 3. Footer Fields (Signatures)
  footerContext.forEach(row => {
    row.values.forEach((val, idx) => {
      if (typeof val === 'string' && signatureKeywords.some(k => val.toUpperCase().includes(k))) {
        if (!structure.footerFields) structure.footerFields = [];
        // Avoid duplicates
        const label = val.trim().replace(/[:.(_)]/g, '');
        if (!structure.footerFields.some(f => f.label === label)) {
          structure.footerFields.push({
            id: `footer-${row.rowNumber}-${idx}`,
            label,
            rowIndex: row.rowNumber,
            columnIndex: idx
          });
        }
      }
    });
  });

  return structure;
}
