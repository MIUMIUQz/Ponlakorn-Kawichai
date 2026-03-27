import React, { useState, useRef } from 'react';
import { useRecords } from '../hooks/useRecords';
import { useExcel } from '../context/ExcelContext';
import { CheckCircle2, Upload, FileSpreadsheet, AlertCircle, ClipboardCheck, Loader2 } from 'lucide-react';
import ExcelJS from 'exceljs';
import { Machine, FormStructure } from '../types';
import { analyzeExcelStructure } from '../services/geminiService';

interface DashboardProps {
  onNavigate: (tab: 'dashboard' | 'checklist' | 'report') => void;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const { records, clearRecords } = useRecords();
  const { machines, setMachines, setOriginalFile, fileName, setFileName, setFormStructure } = useExcel();
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const today = new Date().toISOString().split('T')[0];
  const todayRecords = records.filter(r => r.date === today);
  const progress = machines.length > 0 ? Math.round((todayRecords.length / machines.length) * 100) : 0;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg('');
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setErrorMsg('กรุณาอัพโหลดไฟล์นามสกุล .xlsx เท่านั้น');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsUploading(true);
    try {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error('ไม่พบ API Key ในระบบ! กรุณาใส่ API Key ในแถบ Secrets และกดปุ่ม "Apply changes" เพื่อเริ่มทำงานใหม่ครับ');
      }
      setFileName(file.name);
      const buffer = await file.arrayBuffer();
      setOriginalFile(buffer);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      // Get first worksheet
      const sheet = workbook.worksheets[0];
      if (!sheet) throw new Error('No worksheet found');

      // Get headers (first 10 rows for context)
      // Get first 30 rows for context
      let contextRows: { rowNumber: number; values: any[] }[] = [];
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber <= 30) {
          contextRows.push({
            rowNumber,
            values: Array.isArray(row.values) ? row.values.slice(1) : []
          });
        }
      });

      // Get footer context (last 10 rows)
      let footerContext: any[] = [];
      const totalRows = sheet.rowCount;
      for (let i = Math.max(1, totalRows - 10); i <= totalRows; i++) {
        const row = sheet.getRow(i);
        footerContext.push({
          rowNumber: i,
          values: Array.isArray(row.values) ? row.values.slice(1) : []
        });
      }

      if (contextRows.length === 0) throw new Error('Could not find context rows');

      // Analyze structure with Gemini
      const analysis = await analyzeExcelStructure(contextRows, footerContext);
      
      const { title, fields, machineNameColumnIndex, locationColumnIndex, metadataColumns, noteColumnIndex, dataStartRow, isVerticalForm, machineNameCell, locationCell, itemLabelColumnIndex, itemValueColumnIndex, itemLimitColumnIndex } = analysis;
      
      setFormStructure(analysis);

      const EXCLUDE_PATTERNS = [
        'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา', 
        'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN',
        'ความถี่', 'ลงชื่อ', 'ผู้บันทึก', 'ผู้อนุมัติ', 'พยาน', 
        'SIGNATURE', 'DATE', 'วันที่', 'ลำดับ', 'NO.', 'SEQUENCE',
        '....', '____', '(....', '....)'
      ];

      const parsedMachines: Machine[] = [];
      const seenMachines = new Set<string>();
      
      workbook.worksheets.forEach(wSheet => {
        if (isVerticalForm) {
          // Handle Vertical Form: One machine per sheet
          let machineName = wSheet.name;
          if (machineNameCell) {
            const cell = wSheet.getCell(machineNameCell);
            if (cell && cell.text) {
              machineName = cell.text.trim();
            }
          }

          let location = wSheet.name;
          if (locationCell) {
            const cell = wSheet.getCell(locationCell);
            if (cell && cell.text) {
              location = cell.text.trim();
            }
          }

          // Skip if machine name looks like a generic header
          if (machineName.includes('แบบฟอร์ม') || machineName.includes('CHECKLIST')) {
            machineName = wSheet.name;
          }

          const machineKey = `vertical-${wSheet.name}-${machineName}`;
          if (!seenMachines.has(machineKey)) {
            seenMachines.add(machineKey);
            
            parsedMachines.push({
              id: `sheet-${wSheet.name}`,
              rowIndex: 0, // Not applicable for vertical
              sheetName: wSheet.name,
              location: location,
              name: machineName,
              metadata: {}
            });
          }
        } else {
          // Handle Horizontal Table: Multiple machines per sheet
          wSheet.eachRow((row, rowNumber) => {
            // Skip header rows
            if (rowNumber < dataStartRow) return;

            const machineName = row.getCell(machineNameColumnIndex + 1).text?.trim();
            
            // Skip rows that look like instructions, headers, or signatures
            const isSignatureOrDate = (text: string) => {
              const upper = text.toUpperCase();
              return upper.includes('ลงชื่อ') || 
                     upper.includes('ผู้บันทึก') || 
                     upper.includes('ผู้อนุมัติ') || 
                     upper.includes('พยาน') ||
                     upper.includes('APPROVE') ||
                     upper.includes('CHECKED BY') ||
                     upper.includes('หมายเหตุ :') ||
                     upper.includes('REMARK :') ||
                     text.includes('....') || 
                     text.includes('____') ||
                     text.includes('/..../') ||
                     (text.includes('(') && text.includes(')') && text.includes('...'));
            };

            if (machineName && (
              machineName.match(/^\d+\./) || 
              machineName.length > 60 || 
              machineName === 'Location' || 
              machineName === 'สถานที่' ||
              isSignatureOrDate(machineName)
            )) return;

            let location = 'General';
            if (locationColumnIndex !== -1) {
              const locVal = row.getCell(locationColumnIndex + 1).text?.trim() || 'General';
              // If location looks like an instruction, header, or signature, skip this row
              if (locVal.match(/^\d+\./) || locVal.length > 60 || locVal === 'Location' || locVal === 'สถานที่' || isSignatureOrDate(locVal)) return;
              location = locVal;
            } else {
              // Fallback to sheet name if no location column
              location = wSheet.name;
            }
            
            if (machineName && machineName !== '' && machineName !== '(.......................................................)') {
              const machineKey = `${wSheet.name}-${location}-${machineName}-${rowNumber}`;

              if (!seenMachines.has(machineKey)) {
                seenMachines.add(machineKey);
                
                const metadata: Record<string, any> = {};
                metadataColumns.forEach((col: { index: number; label: string }) => {
                  const labelUpper = col.label.toUpperCase();
                  if (EXCLUDE_PATTERNS.some(p => labelUpper.includes(p.toUpperCase()))) return;
                  
                  const val = row.getCell(col.index + 1).value;
                  metadata[col.label] = (val && typeof val === 'object' && 'result' in val) ? val.result : val;
                });

                parsedMachines.push({
                  id: `row-${wSheet.name}-${rowNumber}`,
                  rowIndex: rowNumber,
                  sheetName: wSheet.name,
                  location: location,
                  name: machineName,
                  metadata
                });
              }
            }
          });
        }
      });

      if (parsedMachines.length === 0) {
        setErrorMsg('ไม่พบข้อมูลเครื่องจักรในไฟล์ที่อัปโหลด กรุณาตรวจสอบรูปแบบไฟล์');
        setMachines([]);
      } else {
        setMachines(parsedMachines);
      }
    } catch (error: any) {
      console.error('Error parsing Excel file:', error);
      setErrorMsg(error.message || 'เกิดข้อผิดพลาดในการอ่านไฟล์ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <header className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 flex items-center justify-center space-x-4 shadow-sm">
        <div className="p-3 bg-emerald-600 text-white rounded-2xl shadow-sm">
          <ClipboardCheck size={32} />
        </div>
        <h2 className="text-xl md:text-3xl font-bold text-slate-900 leading-tight">
          แบบฟอร์มบันทึกรายงาน PM รายวันผ่านแท็บเล็ต
        </h2>
      </header>

      {!machines.length ? (
        <div className="bg-white p-12 rounded-3xl shadow-sm border border-slate-200 text-center flex flex-col items-center justify-center space-y-6">
          <div className="w-24 h-24 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center">
            <FileSpreadsheet size={48} />
          </div>
          <div className="space-y-2">
            <h3 className="text-2xl font-bold text-slate-900">อัพโหลดไฟล์ฟอร์มต้นฉบับ</h3>
            <p className="text-slate-600 max-w-md mx-auto">
              กรุณาอัพโหลดไฟล์ Excel (.xlsx) ที่เป็นฟอร์มต้นฉบับ เพื่อให้ระบบอ่านรายชื่อเครื่องจักรและสร้างแบบฟอร์มเช็คลิสต์
            </p>
            <p className="text-slate-400 text-xs mt-1 font-medium">
              * รองรับการเลือกไฟล์จาก OneDrive, Google Drive และ Files ในแท็บเล็ต
            </p>
          </div>
          
          {errorMsg && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm text-left whitespace-pre-line max-w-md mx-auto">
              <div className="flex items-start">
                <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            </div>
          )}

          <label className="relative cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-4 rounded-xl font-bold text-lg shadow-sm transition-colors flex flex-col items-center space-y-1">
            <div className="flex items-center space-x-3">
              <Upload size={24} />
              <span>{isUploading ? 'กำลังอ่านไฟล์...' : 'เลือกไฟล์ Excel'}</span>
            </div>
            <span className="text-[10px] opacity-80 font-normal">
              (รองรับ OneDrive / Google Drive / Files)
            </span>
            <input 
              ref={fileInputRef}
              type="file" 
              accept=".xlsx, .xls, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" 
              className="hidden" 
              onChange={handleFileUpload}
              disabled={isUploading}
            />
          </label>
        </div>
      ) : (
        <>
          <div className="bg-emerald-50 p-4 rounded-xl flex items-center justify-between border border-emerald-100">
            <div className="flex items-center space-x-3">
              <FileSpreadsheet className="text-emerald-600" size={24} />
              <div>
                <p className="text-sm text-emerald-600 font-medium">ไฟล์ปัจจุบัน</p>
                <p className="text-slate-900 font-semibold">{fileName}</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <label className="cursor-pointer text-sm bg-white border border-emerald-200 text-emerald-600 px-4 py-2 rounded-lg font-bold hover:bg-emerald-50 transition-colors shadow-sm">
                เปลี่ยนไฟล์
                <input 
                  type="file" 
                  accept=".xlsx" 
                  className="hidden" 
                  onChange={handleFileUpload}
                  disabled={isUploading}
                />
              </label>
              <button 
                onClick={() => setShowDeleteConfirm(true)}
                className="text-sm bg-white border border-red-200 text-red-600 px-4 py-2 rounded-lg font-bold hover:bg-red-50 transition-colors shadow-sm"
              >
                ลบไฟล์
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4 mt-8">
            <button 
              onClick={() => onNavigate('checklist')}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-5 rounded-2xl font-bold text-xl shadow-md transition-all hover:scale-[1.02] active:scale-95 text-center"
            >
              เริ่มตรวจเช็คเครื่องจักร
            </button>
            <button 
              onClick={() => onNavigate('report')}
              className="flex-1 bg-white hover:bg-slate-50 text-slate-700 border-2 border-slate-200 px-8 py-5 rounded-2xl font-bold text-xl shadow-sm transition-all hover:scale-[1.02] active:scale-95 text-center"
            >
              ดูรายงาน
            </button>
          </div>
        </>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle size={32} />
            </div>
            <h3 className="text-2xl font-bold text-slate-800 text-center mb-2">ยืนยันการลบไฟล์</h3>
            <p className="text-slate-600 text-center mb-6 leading-relaxed">
              คุณต้องการลบไฟล์นี้และข้อมูลเครื่องจักรทั้งหมดใช่หรือไม่?<br/>
              <span className="text-red-500 font-medium block mt-2">ข้อมูลการตรวจเช็คที่บันทึกไว้แล้วจะถูกลบด้วยทั้งหมด</span>
            </p>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-center gap-3">
              <button 
                onClick={() => setShowDeleteConfirm(false)}
                className="w-full sm:w-auto px-6 py-3 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold transition-colors"
              >
                ยกเลิก
              </button>
              <button 
                onClick={() => {
                  setMachines([]);
                  setOriginalFile(null);
                  setFileName('');
                  clearRecords();
                  setShowDeleteConfirm(false);
                }}
                className="w-full sm:w-auto px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-colors shadow-sm"
              >
                ลบข้อมูลทั้งหมด
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

