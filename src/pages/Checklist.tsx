import React, { useState, useEffect } from 'react';
import { useExcel } from '../context/ExcelContext';
import { useRecords } from '../hooks/useRecords';
import { CheckCircle2, Circle, AlertCircle, FileSpreadsheet, XCircle, RotateCcw, Info, ClipboardList, Check, X, Download, Loader2 } from 'lucide-react';
import { CheckRecord, Machine, FormField } from '../types';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

export function Checklist() {
  const { machines, formStructure, fileName, originalFile } = useExcel();
  const { records, saveRecord } = useRecords();
  
  // Derive LOCATIONS dynamically from parsed machines (maintain sheet order)
  const LOCATIONS = Array.from(new Set(machines.map(m => m.location)))
    .filter(loc => loc && loc !== 'Location' && loc !== 'สถานที่');
  
  const [selectedLocation, setSelectedLocation] = useState<string>('All');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [isDateFocused, setIsDateFocused] = useState(false);
  const [exportError, setExportError] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [saveIndicator, setSaveIndicator] = useState(false);

  if (machines.length === 0 || !formStructure) {
    return (
      <div className="h-[calc(100vh-8rem)] flex items-center justify-center">
        <div className="bg-white p-12 rounded-2xl shadow-sm border border-slate-100 text-center flex flex-col items-center justify-center space-y-6 max-w-lg">
          <div className="w-24 h-24 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center">
            <FileSpreadsheet size={48} />
          </div>
          <div className="space-y-2">
            <h3 className="text-2xl font-bold text-slate-800">ยังไม่มีข้อมูลเครื่องจักร</h3>
            <p className="text-slate-500">
              กรุณากลับไปที่หน้า "ภาพรวม" และอัพโหลดไฟล์ Excel ต้นฉบับก่อนเริ่มการตรวจเช็ค
            </p>
          </div>
        </div>
      </div>
    );
  }

  const filteredMachines = selectedLocation === 'All' 
    ? machines 
    : machines.filter(m => m.location === selectedLocation);

  const handleValueChange = (machineId: string, fieldId: string, value: string) => {
    const existingRecord = records.find(r => r.machineId === machineId && r.date === selectedDate);
    
    const newValues = existingRecord 
      ? { ...existingRecord.values, [fieldId]: value }
      : { [fieldId]: value };

    saveRecord({
      id: existingRecord?.id || crypto.randomUUID(),
      machineId,
      date: selectedDate,
      values: newValues,
      note: existingRecord?.note || '',
      timestamp: Date.now()
    });

    setSaveIndicator(true);
    setTimeout(() => setSaveIndicator(false), 2000);
  };

  const handleNoteChange = (machineId: string, note: string) => {
    const existingRecord = records.find(r => r.machineId === machineId && r.date === selectedDate);
    
    saveRecord({
      id: existingRecord?.id || crypto.randomUUID(),
      machineId,
      date: selectedDate,
      values: existingRecord?.values || {},
      note: note,
      timestamp: Date.now()
    });

    setSaveIndicator(true);
    setTimeout(() => setSaveIndicator(false), 2000);
  };

  const validateValue = (machine: Machine, field: FormField, value: string) => {
    if (!value || value.trim() === '' || value === '-' || field.type === 'pass-fail' || field.type === 'text') return null;
    
    const numVal = Number(value);
    if (isNaN(numVal)) return null;

    let limitStr = '';
    if (field.limitMetadataKey && machine.metadata[field.limitMetadataKey]) {
      limitStr = String(machine.metadata[field.limitMetadataKey]).trim();
    } else if (field.limit) {
      limitStr = String(field.limit).trim();
    }

    if (!limitStr) return null;

    const lessThanEqualMatch = limitStr.match(/(?:<=|≤)\s*([\d.]+)/);
    if (lessThanEqualMatch) return numVal <= Number(lessThanEqualMatch[1]) ? 'pass' : 'fail';

    const greaterThanEqualMatch = limitStr.match(/(?:>=|≥)\s*([\d.]+)/);
    if (greaterThanEqualMatch) return numVal >= Number(greaterThanEqualMatch[1]) ? 'pass' : 'fail';

    const lessThanMatch = limitStr.match(/<\s*([\d.]+)/);
    if (lessThanMatch) return numVal < Number(lessThanMatch[1]) ? 'pass' : 'fail';

    const greaterThanMatch = limitStr.match(/>\s*([\d.]+)/);
    if (greaterThanMatch) return numVal > Number(greaterThanMatch[1]) ? 'pass' : 'fail';

    const rangeMatch = limitStr.match(/([\d.]+)\s*-\s*([\d.]+)/);
    if (rangeMatch) {
      const min = Number(rangeMatch[1]);
      const max = Number(rangeMatch[2]);
      return (numVal >= min && numVal <= max) ? 'pass' : 'fail';
    }

    return null;
  };

  const exportToExcel = async () => {
    if (!originalFile) {
      setExportError('กรุณาอัพโหลดไฟล์ Excel ต้นฉบับก่อน');
      return;
    }
    setExportError('');
    setIsExporting(true);

    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(originalFile);

      const footerValues = JSON.parse(localStorage.getItem('footer_values') || '{}');

      workbook.worksheets.forEach(sheet => {
        for (let r = 1; r <= 30; r++) {
          const row = sheet.getRow(r);
          for (let c = 1; c <= 30; c++) {
            const cell = row.getCell(c);
            let cellValue = '';
            if (typeof cell.value === 'string') cellValue = cell.value;
            else if (cell.value && typeof cell.value === 'object' && 'richText' in cell.value) {
              cellValue = (cell.value.richText as any[]).map(rt => rt.text).join('');
            }

            if (cellValue.includes('วันที่')) {
              const [y, m, d] = selectedDate.split('-');
              const dateStr = `${d}/${m}/${y}`;
              if (cellValue.includes(':')) cell.value = cellValue.split(':')[0] + ': ' + dateStr;
              else if (cellValue.includes(' ')) cell.value = cellValue.split(' ')[0] + ' ' + dateStr;
              else cell.value = `วันที่ ${dateStr}`;
            }
          }
        }

        if (formStructure.footerFields) {
          formStructure.footerFields.forEach(field => {
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

      machines.forEach(m => {
        const r = records.find(rec => rec.machineId === m.id && rec.date === selectedDate);
        if (r) {
          const sheet = workbook.getWorksheet(m.sheetName) || 
                        workbook.worksheets.find(s => s.name.trim() === m.sheetName.trim());
          if (!sheet) return;

          formStructure.fields.forEach(field => {
            const val = r.values[field.id];
            let targetRow = formStructure.isVerticalForm ? sheet.getRow(field.rowIndex) : sheet.getRow(m.rowIndex);
            let targetCol = formStructure.isVerticalForm ? (formStructure.itemValueColumnIndex || 0) + 1 : field.columnIndex + 1;

            if (field.type === 'pass-fail') {
              if (typeof field.failColumnIndex === 'number') {
                const passCell = targetRow.getCell(field.columnIndex + 1);
                const failCell = targetRow.getCell(field.failColumnIndex + 1);
                passCell.value = val === 'pass' ? '/' : '';
                failCell.value = val === 'fail' ? '/' : '';
              } else {
                const cell = targetRow.getCell(targetCol);
                cell.value = val === 'pass' ? '/' : val === 'fail' ? 'X' : '';
              }
            } else {
              const cell = targetRow.getCell(targetCol);
              cell.value = !isNaN(Number(val)) && val !== '' ? Number(val) : (val || '');
            }
          });

          if (!formStructure.isVerticalForm && typeof formStructure.noteColumnIndex === 'number') {
            const row = sheet.getRow(m.rowIndex);
            const noteCell = row.getCell(formStructure.noteColumnIndex + 1);
            noteCell.value = r.note || '';
          }
        }
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const cleanFileName = fileName?.replace(/\.xlsx$/i, '') || 'PM_Report';
      const formattedDate = selectedDate.split('-').reverse().join('-');
      saveAs(blob, `${cleanFileName}_${formattedDate}.xlsx`);
    } catch (error) {
      console.error('Export error:', error);
      setExportError('เกิดข้อผิดพลาดในการส่งออกไฟล์');
    } finally {
      setIsExporting(false);
    }
  };

  const locations = selectedLocation === 'All' ? LOCATIONS : [selectedLocation];

  return (
    <div className="h-[calc(100vh-8rem)] md:h-[calc(100vh-4rem)] flex flex-col gap-6">
      {/* Top Panel: Selection & Export */}
      <div className="w-full bg-white rounded-3xl border border-slate-200 p-4 md:p-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
            <ClipboardList size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">บันทึกข้อมูลการตรวจเช็ค (Daily Checklist)</h2>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">กรอกข้อมูลลงในตารางตามรูปแบบฟอร์มต้นฉบับ</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
          <div className="flex-1 md:w-64">
            <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-widest ml-1">สถานที่ (Location)</label>
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="w-full p-2.5 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-sm font-bold bg-slate-50 text-slate-900"
            >
              <option value="All">-- ทั้งหมด --</option>
              {LOCATIONS.map(loc => (
                <option key={loc} value={loc}>{loc}</option>
              ))}
            </select>
          </div>

          <div className="w-32">
            <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-widest ml-1">วันที่ (Date)</label>
            <input 
              type={isDateFocused ? "date" : "text"}
              value={isDateFocused ? selectedDate : (selectedDate ? selectedDate.split('-').reverse().join('/') : 'วว/ดด/ปปปป')}
              onFocus={() => setIsDateFocused(true)}
              onBlur={() => setIsDateFocused(false)}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full p-2.5 border-2 border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-sm text-slate-900 bg-slate-50 text-center"
            />
          </div>

          <button 
            onClick={exportToExcel}
            disabled={isExporting}
            className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white px-6 py-2.5 rounded-xl transition-all shadow-sm font-bold text-sm h-[46px] mt-5"
          >
            {isExporting ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
            <span>{isExporting ? 'Exporting...' : 'Export'}</span>
          </button>
        </div>
      </div>

      {saveIndicator && (
        <div className="fixed bottom-24 md:bottom-8 right-8 bg-slate-900 text-white px-4 py-2 rounded-full text-xs font-bold shadow-lg flex items-center space-x-2 animate-in fade-in slide-in-from-bottom-4 duration-300 z-50">
          <Check size={14} className="text-emerald-400" />
          <span>บันทึกข้อมูลเรียบร้อยแล้ว</span>
        </div>
      )}

      {exportError && (
        <div className="px-6 py-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-xs font-bold">
          {exportError}
        </div>
      )}

      {/* Bottom Panel: Table View */}
      <div className="w-full flex-1 bg-white rounded-3xl border border-slate-200 overflow-hidden flex flex-col shadow-sm">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="sticky top-0 z-20 bg-slate-100 border-b border-slate-200">
              <tr>
                <th className="px-4 py-4 border-r border-slate-200 font-black text-slate-900 uppercase tracking-tighter min-w-[60px] text-center sticky left-0 bg-slate-100 z-30">
                  ลำดับ
                </th>
                <th className="px-4 py-4 border-r border-slate-200 font-black text-slate-900 uppercase tracking-tighter min-w-[200px] sticky left-[60px] bg-slate-100 z-30">
                  เครื่องจักร (Machine)
                </th>
                {/* Metadata Columns */}
                {filteredMachines[0] && Object.keys(filteredMachines[0].metadata).map(key => (
                  <th key={key} className="px-4 py-4 border-r border-slate-200 text-center font-bold text-slate-600 min-w-[100px]">
                    {key}
                  </th>
                ))}
                {/* Dynamic Fields */}
                {formStructure.fields.map(field => (
                  <th key={field.id} className="px-4 py-4 border-r border-slate-200 text-center min-w-[140px]">
                    <div className="flex flex-col items-center space-y-1">
                      <span className="text-xs font-bold text-slate-800 leading-tight">{field.label}</span>
                      {field.unit && <span className="text-[10px] font-medium text-slate-400">({field.unit})</span>}
                      {field.limit && (
                        <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                          {field.limit}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
                <th className="px-4 py-4 border-r border-slate-200 font-black text-slate-900 uppercase tracking-tighter min-w-[200px]">
                  หมายเหตุ (Remark)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {locations.map(location => {
                const locationMachines = filteredMachines.filter(m => m.location === location);
                if (locationMachines.length === 0) return null;

                return (
                  <React.Fragment key={location}>
                    <tr className="bg-slate-50/80">
                      <td 
                        colSpan={3 + Object.keys(filteredMachines[0]?.metadata || {}).length + formStructure.fields.length} 
                        className="px-4 py-2 font-black text-[10px] text-emerald-600 uppercase tracking-[0.2em] border-b border-slate-200"
                      >
                        {location}
                      </td>
                    </tr>
                    {locationMachines.map((machine, index) => {
                      const record = records.find(r => r.machineId === machine.id && r.date === selectedDate);
                      const isChecked = !!record && Object.keys(record.values).length > 0;

                      return (
                        <tr key={machine.id} className={`hover:bg-emerald-50/30 transition-colors ${isChecked ? 'bg-emerald-50/10' : ''}`}>
                          <td className="px-4 py-4 border-r border-slate-100 text-center font-bold text-slate-400 sticky left-0 bg-white z-10">
                            {index + 1}
                          </td>
                          <td className="px-4 py-4 border-r border-slate-100 font-bold text-slate-900 sticky left-[60px] bg-white z-10">
                            <div className="flex items-center space-x-2">
                              {isChecked && <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />}
                              <span className="truncate">{machine.name}</span>
                            </div>
                          </td>
                          {/* Metadata Values */}
                          {Object.values(machine.metadata).map((val, idx) => (
                            <td key={idx} className="px-4 py-4 border-r border-slate-100 text-center text-slate-500 font-medium">
                              {val && !isNaN(Number(val)) && val !== 'NaN' ? Math.round(Number(val)) : (val === 'NaN' ? '-' : String(val || '-'))}
                            </td>
                          ))}
                          {/* Dynamic Field Values */}
                          {formStructure.fields.map(field => {
                            const value = record?.values[field.id] || '';
                            const validation = validateValue(machine, field, value);

                            return (
                              <td key={field.id} className="px-2 py-2 border-r border-slate-100">
                                {field.type === 'pass-fail' ? (
                                  <div className="flex items-center justify-center space-x-2">
                                    <button
                                      onClick={() => handleValueChange(machine.id, field.id, 'pass')}
                                      className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center transition-all ${
                                        value === 'pass' 
                                          ? 'bg-emerald-500 border-emerald-600 text-white shadow-sm' 
                                          : 'bg-white border-slate-200 text-slate-300 hover:border-emerald-300 hover:text-emerald-500'
                                      }`}
                                    >
                                      <Check size={20} />
                                    </button>
                                    <button
                                      onClick={() => handleValueChange(machine.id, field.id, 'fail')}
                                      className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center transition-all ${
                                        value === 'fail' 
                                          ? 'bg-red-500 border-red-600 text-white shadow-sm' 
                                          : 'bg-white border-slate-200 text-slate-300 hover:border-red-300 hover:text-red-500'
                                      }`}
                                    >
                                      <X size={20} />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="relative">
                                    <input
                                      type={field.type === 'number' ? 'number' : 'text'}
                                      value={value}
                                      onChange={(e) => handleValueChange(machine.id, field.id, e.target.value)}
                                      className={`w-full p-2 border-2 rounded-lg outline-none transition-all text-center font-bold text-sm ${
                                        validation === 'fail' 
                                          ? 'bg-red-50 border-red-200 text-red-900 focus:ring-2 focus:ring-red-500' 
                                          : validation === 'pass'
                                          ? 'bg-emerald-50 border-emerald-200 text-emerald-900 focus:ring-2 focus:ring-emerald-500'
                                          : 'bg-slate-50 border-slate-200 text-slate-900 focus:ring-2 focus:ring-emerald-500'
                                      }`}
                                    />
                                  </div>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-2 py-2">
                            <input
                              type="text"
                              value={record?.note || ''}
                              onChange={(e) => handleNoteChange(machine.id, e.target.value)}
                              placeholder="หมายเหตุ..."
                              className="w-full p-2 border-2 border-slate-100 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50 text-xs font-medium"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

