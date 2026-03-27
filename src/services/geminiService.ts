import { GoogleGenAI, Type } from "@google/genai";
import { FormStructure } from "../types";

export async function analyzeExcelStructure(
  contextRows: { rowNumber: number; values: any[] }[], 
  footerContext: { rowNumber: number; values: any[] }[]
): Promise<FormStructure> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'undefined' || apiKey === '') {
    throw new Error('ไม่พบ API Key ในระบบ! กรุณาใส่ API Key ในแถบ Secrets และกดปุ่ม "Apply changes" เพื่อให้ระบบเริ่มทำงานใหม่ครับ');
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = `
    Analyze the following Excel rows from a Preventive Maintenance (PM) checklist.
    
    Context Rows (first 30 rows): ${JSON.stringify(contextRows)}
    Footer Context (last few rows): ${JSON.stringify(footerContext)}
    
    Tasks:
    1. Identify if the form is a HORIZONTAL table (one row per machine) or a VERTICAL form (checklist items are in rows, one machine per sheet/area).
       - Set 'isVerticalForm' to true if items are in rows.
    2. For HORIZONTAL tables:
       - Identify the machine name column.
       - Identify the location column (if any). The location column specifies the area, building, or specific location of the machine. If no explicit location column exists, return -1 for locationColumnIndex.
    3. For VERTICAL forms:
       - Identify the 'machineNameCell' (e.g., "B2" or "C3") where the machine name or area is mentioned.
       - Identify the 'locationCell' (e.g., "B3" or "C4") if a specific location is mentioned in a cell.
       - Identify the 'itemLabelColumnIndex' (where item names/descriptions are).
       - Identify the 'itemValueColumnIndex' (where the primary check value or "Normal" tick is placed).
       - Identify the 'itemLimitColumnIndex' (if any) where standard values or limits are listed for each item.
       - IMPORTANT: If the status column is split into two sub-columns like "(/) ปกติ" and "(X) ไม่ปกติ", 'itemValueColumnIndex' should be the index of the first sub-column.
    4. Identify which rows are part of the HEADER (labels, merged cells, control values/limits) and which row is the FIRST DATA ROW (where actual machine data starts).
       - IMPORTANT: Rows containing ONLY control values or limits (e.g., "< 70°C", "≤ 7.0", "(Level > 50%)") should be considered part of the HEADER, not the data.
       - For VERTICAL forms, the 'dataStartRow' is the first row of the checklist table that contains an actual item to be checked.
    5. Identify metadata columns or cells (like Power, Max Amp, or "Control Value/ค่าควบคุม" columns that provide reference values for specific fields).
       - "ค่าควบคุม" or "Control Value" columns are HIGH PRIORITY metadata. They should always be captured if they exist.
       - DO NOT capture "ลำดับ", "No.", "Sequence" as metadata.
    6. Identify checklist fields. For each field:
       - For HORIZONTAL tables:
         - Determine the full label by combining merged headers from multiple rows.
         - Use the top-most merged header as the 'category'.
         - Every column that is not a machine name, location, or metadata should be a field.
       - For VERTICAL forms:
         - Each row in the checklist table (starting from 'dataStartRow') is a field.
         - The 'label' comes from the 'itemLabelColumnIndex'.
         - The 'limit' comes from the 'itemLimitColumnIndex' (if it exists).
         - Set 'rowIndex' for each field (use the 'rowNumber' from the provided context).
         - Set 'columnIndex' to 'itemValueColumnIndex'.
         - If the status is split into two columns (e.g., "ปกติ" and "ไม่ปกติ"), set 'failColumnIndex' to the index of the second sub-column.
         - IMPORTANT: Only include rows that are clearly checklist items. 
         - SKIP rows that are:
           - Empty or contain only whitespace.
           - Category headers (usually merged cells or bold text that doesn't have a value column).
           - Instructional text (e.g., "Note: ...", "Please check ...").
           - Part of the footer/signature area (e.g., "ลงชื่อ", "ผู้ตรวจสอบ", "ผู้อนุมัติ").
           - Rows that are just numbers (1, 2, 3) without a description.
           - Rows that contain the machine name, area, or location labels (e.g., "Machine Name:", "Area:", "สถานที่:").
           - Rows that are clearly headers for the checklist table itself (e.g., "รายการตรวจเช็ค", "สถานะการตรวจเช็ค", "ค่ามาตรฐาน", "หมายเหตุ").
       - Identify the type ('number', 'pass-fail', 'text').
       - IMPORTANT: If a field has two sub-columns like "ปกติ" and "ผิดปกติ" (or "Run" and "Standby", or similar pairs), identify it as ONE field of type 'pass-fail'.
         - Set 'columnIndex' to the index of the first sub-column (e.g., "ปกติ" or "Run").
         - Set 'failColumnIndex' to the index of the second sub-column (e.g., "ผิดปกติ" or "Standby").
         - Set 'passLabel' to the label of the first sub-column (e.g., "(/) ปกติ").
         - Set 'failLabel' to the label of the second sub-column (e.g., "(X) ไม่ปกติ").
       - If a field has only ONE column (like "Pressure"), but the user wants to check it as pass/fail, set it as 'pass-fail' type.
       - Capture any "Control Values" or "Limits" mentioned in the headers or the 'itemLimitColumnIndex'.
    7. Identify signature/footer fields.
    
    SPECIAL RULES FOR AIR COMPRESSOR FILES:
    - For "PM-Air Compressure-File" (Air Compressor) and "9.PM-Diesel Air Com-File" (Diesel Air Compressor), you MUST capture checklist fields in the EXACT order they appear.
    - For "9.PM-Diesel Air Com-File", use these specific labels for pass-fail fields:
      - passLabel: "(/) ปกติ"
      - failLabel: "(X) ไม่ปกติ"
    - For "PM-Air Compressure-File", you MUST capture EXACTLY these 8 fields in this EXACT order. DO NOT skip any:
      1. Category: "สถานะเครื่องจักร", Field Label: "สถานะเครื่องจักร" (Type: pass-fail, passLabel: "Run", failLabel: "Stanby")
      2. Category: "สภาพทั่วไป", Field Label: "สภาพทั่วไป" (Type: pass-fail, passLabel: "ปกติ", failLabel: "ผิดปกติ")
      3. Category: "Pressure", Field Label: "Pressure" (Type: pass-fail, Unit: "bar.")
      4. Category: "ระบบ Auto drain", Field Label: "ระบบ Auto drain" (Type: pass-fail, passLabel: "ปกติ", failLabel: "ผิดปกติ")
      5. Category: "ระดับน้ำมันหล่อลื่น", Field Label: "ระดับน้ำมันหล่อลื่น" (Type: pass-fail, Unit: "(40-60%)")
      6. Category: "เป่าทำความสะอาด", Field Label: "กรองอากาศ" (Type: pass-fail)
      7. Category: "เป่าทำความสะอาด", Field Label: "แผงระบายความร้อน" (Type: pass-fail)
      8. Category: "หมายเหตุ", Field Label: "หมายเหตุ" (Type: text)
    - IMPORTANT: The "Field Label" must match the sub-header if it exists (e.g., "กรองอากาศ", "แผงระบายความร้อน"), or the main header if there is no sub-header (e.g., "Pressure").
    - ALL fields (except "หมายเหตุ") MUST be of type 'pass-fail' for these specific file types.
    - Use the EXACT labels from the image: "Run", "Stanby", "ปกติ", "ผิดปกติ", "bar.", "(40-60%)", "กรองอากาศ", "แผงระบายความร้อน", "(/) ปกติ", "(X) ไม่ปกติ".
    
    CRITICAL EXCLUSION RULES:
    - DO NOT include signature lines, date lines, or approval fields in the 'fields' (checklist) array.
    - DO NOT capture "ลำดับ", "No.", "Sequence" as metadata or checklist fields.
    - DO NOT capture "หมายเหตุ", "Remark", "Note" as metadata. However, if "หมายเหตุ" is a column within the checklist table, capture it as a checklist field of type 'text'.
    - Specifically, patterns like "ลงชื่อ", "ผู้บันทึก", "ผู้อนุมัติ", "พยาน", "(....................)", "......../......../........", or any row containing ONLY dots/underscores for signatures MUST be excluded from the checklist fields.
    - These items should be placed in 'footerFields' if they are at the bottom of the form, or ignored if they are just decorative.
    - If a field label contains "ลงชื่อ" or "Signature" or "Date" or "วันที่", it is likely NOT a checklist item.
    
    IMPORTANT: 
    - The "Context Rows" contains both header and data. You MUST distinguish them. Data rows usually start with a number in the first column or have machine names.
    - Headers often span multiple rows (merged cells). Combine them vertically to get the full label.
    - IMPORTANT: Rows at the bottom of the sheet that contain "ลงชื่อ", "ผู้บันทึก", "ผู้อนุมัติ", "พยาน", or date lines (..../..../....) are NOT data rows. They should be ignored when determining 'dataStartRow'.
    - If a row looks like a signature line, it is NOT a machine/data row.
    - Columns that are meant to be filled by the user (measured values) MUST be identified as checklist fields.
    - Do NOT include columns that are just frequency markers (จ, อ, พ, พฤ, ศ, ส, อา).
    - Be very thorough. Every column that requires user input or measurement should be a checklist field.
    - For "PM-Air Compressure-File" (Air Compressor), the user explicitly wants to use "tick" (pass) and "cross" (fail) for ALL checklist fields. 
      - Therefore, identify ALL checklist fields in this file as 'pass-fail' type.
      - If a field has two sub-columns like "ปกติ" and "ผิดปกติ", set 'columnIndex' and 'failColumnIndex'.
      - If a field has only ONE column (like "Pressure"), still set it as 'pass-fail' type if it's in the Air Compressor file. In this case, 'pass' will write "/" and 'fail' will write "X" to that single column.
    - For other files, use the most appropriate type ('number', 'pass-fail', 'text') based on the headers.
    - Limits are often in the main header (e.g., "อุณหภูมิ (°C) < 70.0" or "Vibration (mm/s) < 7.0") but apply to all sub-columns (Motor, Gear, Head Shaft, etc.).
    - For "สารหล่อลื่น - ระดับน้ำมันเกียร์ 50 - 60 %", the limit is "50-60".
    - For "กระแสมอเตอร์", the sub-columns "Fullload (A)" and "Load (A)" are checklist fields.
    - IMPORTANT: Instructional rows like "1. ระดับน้ำมันต้องตรวจเช็คที่ตาแมว..." should be identified as checklist fields (usually 'pass-fail' or 'text' type) rather than being ignored or misidentified as data/locations.
    - If a row contains a long instruction instead of a machine name, it might be a global checklist item that applies to all machines or a specific category. Include it in the fields if it's meant to be checked.
    
    Return a JSON object representing the FormStructure.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          dataStartRow: { type: Type.INTEGER, description: "The 1-based row index where the actual machine data starts (after headers)" },
          fields: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                label: { type: Type.STRING },
                type: { type: Type.STRING, enum: ["number", "pass-fail", "text"] },
                unit: { type: Type.STRING, nullable: true },
                category: { type: Type.STRING, nullable: true },
                columnIndex: { type: Type.INTEGER },
                failColumnIndex: { type: Type.INTEGER, nullable: true },
                passLabel: { type: Type.STRING, nullable: true },
                failLabel: { type: Type.STRING, nullable: true },
                limit: { type: Type.STRING, nullable: true },
                limitMetadataKey: { type: Type.STRING, nullable: true },
                rowIndex: { type: Type.INTEGER, nullable: true }
              },
              required: ["id", "label", "type", "columnIndex"]
            }
          },
          machineNameColumnIndex: { type: Type.INTEGER },
          locationColumnIndex: { type: Type.INTEGER },
          isVerticalForm: { type: Type.BOOLEAN, nullable: true },
          machineNameCell: { type: Type.STRING, nullable: true },
          locationCell: { type: Type.STRING, nullable: true },
          itemLabelColumnIndex: { type: Type.INTEGER, nullable: true },
          itemValueColumnIndex: { type: Type.INTEGER, nullable: true },
          itemLimitColumnIndex: { type: Type.INTEGER, nullable: true },
          metadataColumns: { 
            type: Type.ARRAY, 
            items: { 
              type: Type.OBJECT,
              properties: {
                index: { type: Type.INTEGER },
                label: { type: Type.STRING }
              },
              required: ["index", "label"]
            }
          },
          noteColumnIndex: { type: Type.INTEGER, nullable: true },
          footerFields: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                label: { type: Type.STRING },
                rowIndex: { type: Type.INTEGER },
                columnIndex: { type: Type.INTEGER }
              },
              required: ["id", "label", "rowIndex", "columnIndex"]
            },
            nullable: true
          }
        },
        required: ["title", "dataStartRow", "fields", "machineNameColumnIndex", "locationColumnIndex", "metadataColumns"]
      }
    }
  });

  return JSON.parse(response.text);
}
