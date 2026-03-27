import React, { useState } from 'react';
import { useRecords } from '../hooks/useRecords';
import { useExcel } from '../context/ExcelContext';
import { Download, FileSpreadsheet, AlertCircle, CheckCircle2, RotateCcw } from 'lucide-react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';

export function Report() {
  const { records, saveRecord } = useRecords();
  const { machines, originalFiles, fileName, formStructure } = useExcel();
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedLocation, setSelectedLocation] = useState<string>('All');
  const [isDateFocused, setIsDateFocused] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  if (!formStructure) {
    return (
      <div className="max-w-7xl mx-auto py-12 text-center">
        <div className="bg-white p-12 rounded-3xl shadow-sm border border-slate-200">
          <FileSpreadsheet size={64} className="mx-auto text-slate-300 mb-4" />
          <h2 className="text-2xl font-bold text-slate-800 mb-2">ยังไม่มีข้อมูลโครงสร้างฟอร์ม</h2>
          <p className="text-slate-500">กรุณาอัพโหลดไฟล์ Excel ต้นฉบับที่หน้าภาพรวมก่อน</p>
        </div>
      </div>
    );
  }

  const { fields, footerFields } = formStructure;
  const [footerValues, setFooterValues] = useState<Record<string, string>>(() => {
    const stored = localStorage.getItem('footer_values');
    return stored ? JSON.parse(stored) : {};
  });

  React.useEffect(() => {
    localStorage.setItem('footer_values', JSON.stringify(footerValues));
  }, [footerValues]);

  const dailyRecords = records.filter(r => r.date === 'current');
  const locations = Array.from(new Set(machines?.map(m => m.location) || [])).filter(Boolean);
  
  const filteredMachines = selectedLocation === 'All' 
    ? machines 
    : machines?.filter(m => m.location === selectedLocation);

  const machinesByLocation = (filteredMachines || []).reduce((acc, machine) => {
    const loc = machine.location || 'อื่นๆ';
    if (!acc[loc]) acc[loc] = [];
    acc[loc].push(machine);
    return acc;
  }, {} as Record<string, typeof machines[0][]>);

  const locationNames = Object.keys(machinesByLocation);

  const getStatusColor = (field: any, value: string | undefined, machine: any) => {
    if (!value || value.trim() === '' || value === '-') return null;
    const v = Number(value);
    if (isNaN(v)) return null;

    let limitStr = '';
    if (field.limitMetadataKey && machine.metadata[field.limitMetadataKey]) {
      limitStr = String(machine.metadata[field.limitMetadataKey]).trim();
    } else if (field.limit) {
      limitStr = String(field.limit).trim();
    }

    if (limitStr) {
      const lessThanEqualMatch = limitStr.match(/(?:<=|≤)\s*([\d.]+)/);
      if (lessThanEqualMatch) {
        const limitVal = Number(lessThanEqualMatch[1]);
        if (v <= limitVal) return { argb: 'FF92D050', hex: '#92D050', text: 'text-slate-800' };
        return { argb: 'FFFF0000', hex: '#FF0000', text: 'text-white' };
      }

      const greaterThanEqualMatch = limitStr.match(/(?:>=|≥)\s*([\d.]+)/);
      if (greaterThanEqualMatch) {
        const limitVal = Number(greaterThanEqualMatch[1]);
        if (v >= limitVal) return { argb: 'FF92D050', hex: '#92D050', text: 'text-slate-800' };
        return { argb: 'FFFF0000', hex: '#FF0000', text: 'text-white' };
      }

      const lessThanMatch = limitStr.match(/<\s*([\d.]+)/);
      if (lessThanMatch) {
        const limitVal = Number(lessThanMatch[1]);
        if (v < limitVal) return { argb: 'FF92D050', hex: '#92D050', text: 'text-slate-800' };
        return { argb: 'FFFF0000', hex: '#FF0000', text: 'text-white' };
      }

      const greaterThanMatch = limitStr.match(/>\s*([\d.]+)/);
      if (greaterThanMatch) {
        const limitVal = Number(greaterThanMatch[1]);
        if (v > limitVal) return { argb: 'FF92D050', hex: '#92D050', text: 'text-slate-800' };
        return { argb: 'FFFF0000', hex: '#FF0000', text: 'text-white' };
      }

      const rangeMatch = limitStr.match(/([\d.]+)\s*-\s*([\d.]+)/);
      if (rangeMatch) {
        const min = Number(rangeMatch[1]);
        const max = Number(rangeMatch[2]);
        if (v >= min && v <= max) return { argb: 'FF92D050', hex: '#92D050', text: 'text-slate-800' };
        return { argb: 'FFFF0000', hex: '#FF0000', text: 'text-white' };
      }
    }

    const label = field.label.toLowerCase();

    if (label.includes('vacuum') || label.includes('vac')) {
      const controlVal = Number(machine.metadata['ค่าควบคุม'] || machine.metadata['Control Value'] || 0);
      if (controlVal > 0) {
        if (v >= controlVal) return { argb: 'FF92D050', hex: '#92D050', text: 'text-slate-800' };
        return { argb: 'FFFF0000', hex: '#FF0000', text: 'text-white' };
      }
    }
    
    if (label.includes('amp') || label.includes('กระแส')) {
      const maxAmp = Number(machine.metadata['Max Amp'] || machine.metadata['Max Amp (Amp)'] || 0);
      if (maxAmp > 0) {
        if (v <= maxAmp) return { argb: 'FF92D050', hex: '#92D050', text: 'text-slate-800' };
        return { argb: 'FFFF0000', hex: '#FF0000', text: 'text-white' };
      }
    }

    if (label.includes('vibration') || label.includes('vib') || label.includes('การสั่นสะเทือน')) {
      const powerKW = Number(machine.metadata['Power (kW)'] || machine.metadata['Power'] || 0);
      if (powerKW >= 300) {
        if (v <= 2.3) return { argb: 'FF92D050', hex: '#92D050', text: 'text-slate-800' };
        if (v <= 4.5) return { argb: 'FFFFFF00', hex: '#FFFF00', text: 'text-slate-800' };
        if (v <= 7.1) return { argb: 'FFFFC000', hex: '#FFC000', text: 'text-slate-800' };
        return { argb: 'FFFF0000', hex: '#FF0000', text: 'text-white' };
      } else {
        if (v <= 1.4) return { argb: 'FF92D050', hex: '#92D050', text: 'text-slate-800' };
        if (v <= 2.8) return { argb: 'FFFFFF00', hex: '#FFFF00', text: 'text-slate-800' };
        if (v <= 4.5) return { argb: 'FFFFC000', hex: '#FFC000', text: 'text-slate-800' };
        return { argb: 'FFFF0000', hex: '#FF0000', text: 'text-white' };
      }
    }

    if (label.includes('temp') || label.includes('อุณหภูมิ')) {
      if (v <= 70) return { argb: 'FF92D050', hex: '#92D050', text: 'text-slate-800' };
      return { argb: 'FFFF0000', hex: '#FF0000', text: 'text-white' };
    }

    return null;
  };

  const handleManualSave = () => {
    if (!selectedDate) {
      setErrorMsg('กรุณาเลือกวันที่ก่อนทำการบันทึก');
      return;
    }

    try {
      dailyRecords.forEach(record => {
        saveRecord({
          ...record,
          date: selectedDate
        });
      });
      
      setSaveSuccess(true);
      setErrorMsg('');
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Error saving records:', error);
      setErrorMsg('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    }
  };

  const exportToExcel = async () => {
    const fileNames = Object.keys(originalFiles);
    if (fileNames.length === 0) {
      setErrorMsg('กรุณาอัพโหลดไฟล์ Excel ต้นฉบับในหน้าภาพรวมก่อนทำการส่งออก');
      return;
    }
    if (!selectedDate) {
      setErrorMsg('กรุณาเลือกวันที่ก่อนทำการส่งออก');
      return;
    }
    setErrorMsg('');
    setIsExporting(true);

    try {
      dailyRecords.forEach(record => {
        saveRecord({
          ...record,
          date: selectedDate
        });
      });

      const zip = new JSZip();
      const [y, m, d] = selectedDate.split('-');
      const dateStr = `${d}/${m}/${y}`;
      const formattedDate = selectedDate.split('-').reverse().join('-');

      for (const fName of fileNames) {
        const buffer = originalFiles[fName];
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);

        workbook.worksheets.forEach(sheet => {
          for (let r = 1; r <= 30; r++) {
            const row = sheet.getRow(r);
            for (let c = 1; c <= 30; c++) {
              const cell = row.getCell(c);
              let cellValue = '';
              if (typeof cell.value === 'string') {
                cellValue = cell.value;
              } else if (cell.value && typeof cell.value === 'object' && 'richText' in cell.value) {
                cellValue = (cell.value.richText as any[]).map(rt => rt.text).join('');
              }

              if (cellValue.includes('วันที่')) {
                if (cellValue.includes(':')) {
                  cell.value = cellValue.split(':')[0] + ': ' + dateStr;
                } else if (cellValue.includes(' ')) {
                  cell.value = cellValue.split(' ')[0] + ' ' + dateStr;
                } else {
                  cell.value = `วันที่ ${dateStr}`;
                }
              }
            }
          }

          if (footerFields && footerFields.length > 0) {
            footerFields.forEach(field => {
              const val = footerValues[field.id];
              if (val) {
                const cell = sheet.getRow(field.rowIndex).getCell(field.columnIndex + 1);
                cell.value = `(${val})`;
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
                cell.font = { name: 'Arial', size: 10, bold: true };
              }
            });
          }
        });

        const machinesInThisFile = machines?.filter(m => m.fileName === fName);
        machinesInThisFile?.forEach(m => {
          const r = dailyRecords.find(rec => rec.machineId === m.id);
          if (r) {
            const sheet = workbook.getWorksheet(m.sheetName) || 
                          workbook.worksheets.find(s => s.name.trim() === m.sheetName.trim());
            
            if (!sheet) return;
            
            const safeNumber = (val: string | undefined) => {
              if (val === undefined || val === null || val === '' || isNaN(Number(val))) {
                return val || '';
              }
              return Number(val);
            };

            fields.forEach(field => {
              const val = r.values[field.id];
              let targetRow;
              let targetCol;

              // Use machine-specific column index if available
              const mappedColIdx = m.fieldMapping?.[field.id];
              if (typeof mappedColIdx !== 'number' && !formStructure.isVerticalForm) return;
              
              const colIdx = typeof mappedColIdx === 'number' ? mappedColIdx : field.columnIndex;

              if (formStructure.isVerticalForm) {
                if (typeof field.rowIndex !== 'number' || typeof formStructure.itemValueColumnIndex !== 'number') return;
                targetRow = sheet.getRow(field.rowIndex);
                targetCol = formStructure.itemValueColumnIndex + 1;
              } else {
                targetRow = sheet.getRow(m.rowIndex);
                targetCol = colIdx + 1;
              }

              if (field.type === 'pass-fail') {
                if (typeof field.failColumnIndex === 'number') {
                  // If we have a mapped column, the fail column is usually the next one
                  const currentFailColIdx = typeof mappedColIdx === 'number' 
                    ? mappedColIdx + (field.failColumnIndex - field.columnIndex)
                    : field.failColumnIndex;

                  const passCell = targetRow.getCell(colIdx + 1);
                  const failCell = targetRow.getCell(currentFailColIdx + 1);
                  passCell.value = val === 'pass' ? '/' : '';
                  failCell.value = val === 'fail' ? '/' : '';
                  passCell.font = { name: 'Arial', size: 12, bold: true };
                  failCell.font = { name: 'Arial', size: 12, bold: true };
                  passCell.alignment = { vertical: 'middle', horizontal: 'center' };
                  failCell.alignment = { vertical: 'middle', horizontal: 'center' };
                  if (val === 'pass') {
                    passCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4EDDA' } };
                    failCell.fill = { type: 'pattern', pattern: 'none' };
                  } else if (val === 'fail') {
                    failCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8D7DA' } };
                    passCell.fill = { type: 'pattern', pattern: 'none' };
                  } else {
                    passCell.fill = { type: 'pattern', pattern: 'none' };
                    failCell.fill = { type: 'pattern', pattern: 'none' };
                  }
                } else {
                  const cell = targetRow.getCell(targetCol);
                  cell.value = val === 'pass' ? '/' : val === 'fail' ? 'X' : '';
                  cell.font = { name: 'Arial', size: 12, bold: true };
                  cell.alignment = { vertical: 'middle', horizontal: 'center' };
                  if (val === 'pass') {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4EDDA' } };
                  } else if (val === 'fail') {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8D7DA' } };
                  }
                }
              } else if (field.type === 'text') {
                const cell = targetRow.getCell(targetCol);
                cell.value = val || '';
                cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
              } else {
                const cell = targetRow.getCell(targetCol);
                cell.value = safeNumber(val);
                const status = getStatusColor(field, val, m);
                if (status) {
                  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: status.argb } };
                } else {
                  cell.fill = { type: 'pattern', pattern: 'none' };
                }
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
              }
            });

            if (!formStructure.isVerticalForm && typeof formStructure.noteColumnIndex === 'number' && formStructure.noteColumnIndex >= 0) {
              const row = sheet.getRow(m.rowIndex);
              const noteCell = row.getCell(formStructure.noteColumnIndex + 1);
              noteCell.value = r.note || '';
              noteCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
            }
          }
        });

        const outBuffer = await workbook.xlsx.writeBuffer();
        const cleanFName = fName.replace(/\.xlsx$/i, '');
        zip.file(`${cleanFName}_${formattedDate}.xlsx`, outBuffer);
      }

      const zipContent = await zip.generateAsync({ type: 'blob' });
      const finalZipName = fileNames.length === 1 
        ? `${fileNames[0].replace(/\.xlsx$/i, '')}_${formattedDate}.xlsx`
        : `PM_Reports_${formattedDate}.zip`;
      
      if (fileNames.length === 1) {
        const singleBuffer = await zip.file(Object.keys(zip.files)[0])?.async('blob');
        if (singleBuffer) saveAs(singleBuffer, finalZipName);
      } else {
        saveAs(zipContent, finalZipName);
      }
    } catch (error) {
      console.error('Error exporting Excel:', error);
      setErrorMsg('เกิดข้อผิดพลาดในการสร้างไฟล์ Excel');
    } finally {
      setIsExporting(false);
    }
  };

  const renderCell = (field: any, val: string | undefined, machine: any) => {
    const key = `cell-${machine.id}-${field.id}`;
    if (field.type === 'pass-fail') {
      return (
        <td key={key} className="px-2 py-2 border-r border-slate-100 text-center font-bold text-sm">
          {val === 'pass' ? <span className="text-emerald-500">/</span> : val === 'fail' ? <span className="text-red-500">X</span> : '-'}
        </td>
      );
    }

    const status = getStatusColor(field, val, machine);
    const isText = field.type === 'text' || 
                  field.label.toLowerCase().includes('remark') || 
                  field.label.toLowerCase().includes('note') || 
                  field.label.toLowerCase().includes('comment') ||
                  field.label.toLowerCase().includes('description');

    return (
      <td 
        key={key}
        className={`px-2 py-2 border-r border-slate-100 font-bold ${isText ? 'text-left whitespace-normal min-w-[150px]' : 'text-center'} ${status ? status.text : 'text-slate-600'}`}
        style={status ? { backgroundColor: status.hex } : {}}
      >
        {val || '-'}
      </td>
    );
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="bg-emerald-50 border border-emerald-100 rounded-3xl p-6 shadow-sm">
        <div className="flex items-start space-x-4">
          <div className="p-3 bg-emerald-600 text-white rounded-2xl shadow-sm">
            <AlertCircle size={24} />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-emerald-900">ขั้นตอนการส่งออกรายงาน (Export Guide)</h3>
            <ul className="text-emerald-800 text-sm space-y-1 list-decimal list-inside font-medium">
              <li>เลือกวันที่ที่ต้องการตรวจสอบข้อมูลที่ช่องด้านขวา</li>
              <li>ตรวจสอบข้อมูลในตารางด้านล่างว่าถูกต้องและครบถ้วน</li>
              <li>หากข้อมูลถูกต้องแล้ว กดปุ่ม <span className="bg-emerald-600 text-white px-2 py-0.5 rounded text-[10px] uppercase">Export</span> เพื่อรับไฟล์ Excel ที่กรอกข้อมูลลงในฟอร์มต้นฉบับ</li>
              <li className="text-red-600 font-bold">** สำคัญ: กรุณาบันทึกข้อมูลในหน้า "เช็คลิสต์" ให้เรียบร้อยก่อนทำการส่งออก **</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="bg-white p-4 md:p-6 rounded-3xl border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm">
        <div className="flex items-center space-x-4">
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
            <FileSpreadsheet size={24} />
          </div>
          <div className="flex items-baseline space-x-2">
            <h2 className="text-xl font-bold text-slate-900 whitespace-nowrap">รายงานการตรวจเช็ค</h2>
            <p className="text-slate-500 text-xs whitespace-nowrap">ข้อมูลตารางสรุปผลการตรวจเช็คประจำวัน</p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
          <div className="relative">
            <input 
              type={isDateFocused ? "date" : "text"}
              value={isDateFocused ? selectedDate : (selectedDate ? selectedDate.split('-').reverse().join('/') : 'วว/ดด/ปปปป')}
              onFocus={() => setIsDateFocused(true)}
              onBlur={() => setIsDateFocused(false)}
              onChange={(e) => setSelectedDate(e.target.value)}
              placeholder="วว/ดด/ปปปป"
              className="p-1.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-xs text-slate-900 bg-slate-50 cursor-pointer w-32 text-center shadow-inner"
            />
          </div>
          <button 
            onClick={handleManualSave}
            className={`flex items-center justify-center space-x-2 px-4 py-1.5 rounded-lg font-bold text-xs transition-all shadow-sm ${
              saveSuccess ? 'bg-emerald-500 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {saveSuccess ? <CheckCircle2 size={16} /> : <RotateCcw size={16} />}
            <span>{saveSuccess ? 'บันทึกค่าแล้ว' : 'บันทึกค่า'}</span>
          </button>
          <button 
            onClick={exportToExcel}
            disabled={isExporting}
            className={`flex flex-col items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 rounded-lg transition-colors shadow-sm ${isExporting ? 'opacity-50 cursor-not-allowed' : ''}`}
            title="Export Excel (.xlsx)"
          >
            <div className="flex items-center space-x-2">
              <Download size={16} className={isExporting ? 'animate-bounce' : ''} />
              <span className="font-bold text-xs">{isExporting ? 'Exporting...' : 'Export'}</span>
            </div>
            <span className="text-[8px] opacity-80 font-medium leading-none mt-0.5">
              (เพื่อเปิดใน Excel)
            </span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs text-left whitespace-pre-line">
          <div className="flex items-start">
            <span className="font-bold mr-2">ข้อผิดพลาด:</span>
            <span>{errorMsg}</span>
          </div>
        </div>
      )}

      <div className="space-y-8">
        {locationNames.length === 0 ? (
          <div className="bg-white p-12 rounded-2xl shadow-sm border border-slate-100 text-center">
            <p className="text-slate-500 font-medium">ไม่มีข้อมูลเครื่องจักร กรุณาอัพโหลดไฟล์ Excel ต้นฉบับในหน้าภาพรวม</p>
          </div>
        ) : (
          locationNames.map(locName => (
            <div key={locName} className="space-y-3">
              <div className="flex items-center gap-2 px-2">
                <div className="h-4 w-1 bg-emerald-500 rounded-full"></div>
                <h3 className="text-base font-bold text-slate-900">{locName}</h3>
                <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  {machinesByLocation[locName].length} ITEMS
                </span>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] text-left whitespace-nowrap">
                    <thead className="text-[10px] text-slate-700 uppercase bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 border-r border-slate-200 font-bold min-w-[180px]">ชื่อเครื่องจักร</th>
                        {/* Metadata Columns */}
                        {machinesByLocation[locName][0] && Object.keys(machinesByLocation[locName][0].metadata).map(key => (
                          <th key={key} className="px-2 py-2 border-r border-slate-200 text-center font-bold">{key}</th>
                        ))}
                        {/* Dynamic Fields */}
                        {fields.map(field => (
                          <th key={field.id} className="px-2 py-2 border-r border-slate-200 text-center font-bold">
                            <div className="flex flex-col items-center">
                              <span>{field.label}</span>
                              {field.unit && <span className="text-[9px] font-medium opacity-70">({field.unit})</span>}
                              {field.limit && <span className="text-[9px] font-medium text-emerald-600 mt-0.5">{field.limit}</span>}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {machinesByLocation[locName].map((m, i) => {
                        const r = dailyRecords.find(rec => rec.machineId === m.id);
                        const isChecked = !!r;
                        return (
                          <tr key={m.id} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${isChecked ? 'bg-emerald-50/20' : ''}`}>
                            <td className="px-3 py-2 border-r border-slate-100 font-bold text-slate-900">{m.name}</td>
                            
                            {/* Metadata Values */}
                            {Object.values(m.metadata).map((val, idx) => (
                              <td key={idx} className="px-2 py-2 border-r border-slate-100 text-center text-slate-500">
                                {val && !isNaN(Number(val)) && val !== 'NaN' ? Math.round(Number(val)) : (val === 'NaN' ? '-' : String(val || '-'))}
                              </td>
                            ))}

                            {/* Dynamic Field Values */}
                            {fields.map(field => renderCell(field, r?.values[field.id], m))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer Fields (Signatures) */}
      {footerFields && footerFields.length > 0 && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center space-x-3 mb-2">
            <div className="p-2 bg-slate-50 text-slate-600 rounded-xl">
              <CheckCircle2 size={20} />
            </div>
            <h3 className="text-lg font-bold text-slate-900">ลงชื่อผู้ตรวจสอบ (Signatures)</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {footerFields.map(field => (
              <div key={field.id} className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">
                  {field.label}
                </label>
                <input
                  type="text"
                  value={footerValues[field.id] || ''}
                  onChange={(e) => setFooterValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                  placeholder={`ระบุชื่อ${field.label}`}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-sm transition-all"
                />
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 font-medium italic">
            * ข้อมูลส่วนนี้จะถูกนำไปใส่ในช่องลายเซ็นท้ายตารางในไฟล์ Excel
          </p>
        </div>
      )}
    </div>
  );
}


