import React, { useState, useMemo } from 'react';
import { useRecords } from '../hooks/useRecords';
import { useExcel } from '../context/ExcelContext';
import { 
  BarChart3, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Search, 
  ChevronRight,
  Filter,
  Calendar as CalendarIcon,
  ArrowRight,
  Save,
  Check,
  RotateCcw,
  Trash2
} from 'lucide-react';
import { Machine, FormField, CheckRecord } from '../types';

export function Summary() {
  const { records, saveRecord, clearRecords } = useRecords();
  const { 
    machines: currentMachines, 
    formStructure: currentFormStructure, 
    fileName: currentFileName,
    dailySnapshots,
    saveDailySnapshot,
    clearDailySnapshot,
    uploadHistory,
    clearUploadHistory
  } = useExcel();
  
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showClearHistoryConfirm, setShowClearHistoryConfirm] = useState(false);
  const [viewingUploadId, setViewingUploadId] = useState<string | null>(null);

  // Determine which data to use
  const snapshot = dailySnapshots[selectedDate];
  const activeUpload = viewingUploadId ? uploadHistory.find(h => h.id === viewingUploadId) : null;

  const machines = activeUpload 
    ? activeUpload.machines 
    : (snapshot ? snapshot.machines : currentMachines);
    
  const formStructure = activeUpload 
    ? activeUpload.formStructure 
    : (snapshot ? snapshot.formStructure : currentFormStructure);
    
  const fileName = activeUpload 
    ? activeUpload.fileName 
    : (snapshot ? snapshot.fileName : currentFileName);

  const fields = formStructure?.fields || [];

  const handleSaveToDate = () => {
    const currentRecords = records.filter(r => r.date === 'current');
    if (currentRecords.length === 0 || !currentMachines.length || !currentFormStructure) return;

    // Save records
    currentRecords.forEach(record => {
      saveRecord({
        ...record,
        date: selectedDate
      });
    });

    // Save snapshot of the structure used
    saveDailySnapshot(selectedDate, currentMachines, currentFormStructure, currentFileName);

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleClearDate = () => {
    // Clear records for this date
    const otherRecords = records.filter(r => r.date !== selectedDate);
    localStorage.setItem('machine_records', JSON.stringify(otherRecords));
    window.location.reload(); // Simple way to refresh records from localStorage
  };

  // Helper to check if a value is abnormal
  const isAbnormal = (field: FormField, value: string | undefined, machine: Machine) => {
    if (!value || value.trim() === '' || value === '-' || value === 'pass') return false;
    if (value === 'fail') return true;

    const v = Number(value);
    if (isNaN(v)) return false;

    let limitStr = '';
    if (field.limitMetadataKey && machine.metadata[field.limitMetadataKey]) {
      limitStr = String(machine.metadata[field.limitMetadataKey]).trim();
    } else if (field.limit) {
      limitStr = String(field.limit).trim();
    }

    if (!limitStr) return false;

    // Range check
    const rangeMatch = limitStr.match(/([\d.]+)\s*-\s*([\d.]+)/);
    if (rangeMatch) {
      const min = Number(rangeMatch[1]);
      const max = Number(rangeMatch[2]);
      return v < min || v > max;
    }

    // <= check
    const lessThanEqualMatch = limitStr.match(/(?:<=|≤)\s*([\d.]+)/);
    if (lessThanEqualMatch) return v > Number(lessThanEqualMatch[1]);

    // >= check
    const greaterThanEqualMatch = limitStr.match(/(?:>=|≥)\s*([\d.]+)/);
    if (greaterThanEqualMatch) return v < Number(greaterThanEqualMatch[1]);

    // < check
    const lessThanMatch = limitStr.match(/<\s*([\d.]+)/);
    if (lessThanMatch) return v >= Number(lessThanMatch[1]);

    // > check
    const greaterThanMatch = limitStr.match(/>\s*([\d.]+)/);
    if (greaterThanMatch) return v <= Number(greaterThanMatch[1]);

    return false;
  };

  const stats = useMemo(() => {
    const dateRecords = records.filter(r => r.date === selectedDate);
    const total = machines.length;
    const completed = dateRecords.length;
    
    let abnormalCount = 0;
    const abnormalMachines: { machine: Machine; issues: string[] }[] = [];

    dateRecords.forEach(record => {
      const machine = machines.find(m => m.id === record.machineId);
      if (!machine) return;

      const issues: string[] = [];
      fields.forEach(field => {
        if (isAbnormal(field, record.values[field.id], machine)) {
          issues.push(`${field.label}: ${record.values[field.id]} (Limit: ${field.limit || 'N/A'})`);
        }
      });

      if (issues.length > 0) {
        abnormalCount++;
        abnormalMachines.push({ machine, issues });
      }
    });

    return {
      total,
      completed,
      pending: total - completed,
      abnormalCount,
      abnormalMachines,
      dateRecords
    };
  }, [records, machines, selectedDate, fields]);

  if (!machines.length && !currentMachines.length) {
    return (
      <div className="max-w-4xl mx-auto py-12 text-center">
        <div className="bg-white p-12 rounded-3xl shadow-sm border border-slate-200">
          <BarChart3 size={64} className="mx-auto text-slate-300 mb-4" />
          <h2 className="text-2xl font-bold text-slate-800 mb-2">ยังไม่มีข้อมูลโครงสร้างฟอร์ม</h2>
          <p className="text-slate-500">กรุณาอัพโหลดไฟล์ Excel ต้นฉบับที่หน้าภาพรวมก่อน</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      {/* Header & Date Picker */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-emerald-600 text-white rounded-2xl shadow-sm">
            <BarChart3 size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">สรุปรายงานสถานะรายวัน</h1>
            <p className="text-slate-500 font-medium">Daily Status Summary</p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center gap-4">
          <div className="relative group w-full md:w-auto">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-emerald-600">
              <CalendarIcon size={20} />
            </div>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="pl-12 pr-6 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all font-bold text-slate-900 shadow-inner w-full"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <button
              onClick={handleSaveToDate}
              disabled={records.filter(r => r.date === 'current').length === 0 || !currentMachines.length}
              className={`flex-1 md:flex-none flex items-center justify-center space-x-2 px-6 py-3 rounded-2xl font-bold transition-all shadow-sm ${
                saveSuccess 
                  ? 'bg-emerald-100 text-emerald-700 border-2 border-emerald-200' 
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white disabled:bg-slate-200 disabled:text-slate-400'
              }`}
            >
              {saveSuccess ? <Check size={20} /> : <Save size={20} />}
              <span>{saveSuccess ? 'บันทึกสำเร็จ' : 'บันทึกลงวันที่นี้'}</span>
            </button>

            {stats.dateRecords.length > 0 && (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="p-3 bg-white border-2 border-red-100 text-red-500 hover:bg-red-50 rounded-2xl transition-all shadow-sm"
                title="ล้างข้อมูลวันนี้"
              >
                <RotateCcw size={20} />
              </button>
            )}
          </div>
        </div>
      </div>

      {activeUpload && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-center justify-between animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-3 text-amber-700">
            <Clock size={20} />
            <span className="text-sm font-bold">
              กำลังดูข้อมูลจากประวัติการอัพโหลด: <span className="underline">{activeUpload.fileName}</span> ({new Date(activeUpload.timestamp).toLocaleString('th-TH')})
            </span>
          </div>
          <button 
            onClick={() => setViewingUploadId(null)}
            className="text-xs bg-amber-200 hover:bg-amber-300 text-amber-800 px-3 py-1 rounded-lg font-bold transition-colors"
          >
            กลับสู่ข้อมูลปัจจุบัน
          </button>
        </div>
      )}

      {snapshot && !activeUpload && (
        <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl flex items-center justify-between">
          <div className="flex items-center gap-3 text-blue-700">
            <Clock size={20} />
            <span className="text-sm font-bold">
              ข้อมูลนี้บันทึกจากไฟล์: <span className="underline">{snapshot.fileName}</span> เมื่อ {new Date(snapshot.timestamp).toLocaleString('th-TH')}
            </span>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          icon={<Clock className="text-blue-600" />} 
          label="เครื่องจักรทั้งหมด" 
          value={stats.total} 
          subLabel="Total Machines"
          color="blue"
        />
        <StatCard 
          icon={<CheckCircle2 className="text-emerald-600" />} 
          label="ตรวจเช็คแล้ว" 
          value={stats.completed} 
          subLabel={`${Math.round((stats.completed / stats.total) * 100 || 0)}% Completed`}
          color="emerald"
        />
        <StatCard 
          icon={<AlertCircle className="text-red-600" />} 
          label="พบความผิดปกติ" 
          value={stats.abnormalCount} 
          subLabel="Abnormal Found"
          color="red"
        />
        <StatCard 
          icon={<RotateCcw className="text-amber-600" />} 
          label="รอดำเนินการ" 
          value={stats.pending} 
          subLabel="Pending Review"
          color="amber"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Abnormal List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <AlertCircle className="text-red-500" size={24} />
              รายการเครื่องจักรที่พบความผิดปกติ
            </h3>
            <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold">
              {stats.abnormalMachines.length} เครื่อง
            </span>
          </div>

          <div className="space-y-4">
            {stats.abnormalMachines.length > 0 ? (
              stats.abnormalMachines.map(({ machine, issues }, idx) => (
                <div key={machine.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all group">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h4 className="text-lg font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">{machine.name}</h4>
                      <p className="text-sm text-slate-500 font-medium">สถานที่: {machine.location}</p>
                    </div>
                    <span className="text-[10px] font-black bg-red-50 text-red-600 px-2 py-1 rounded-lg uppercase tracking-tighter">
                      Abnormal
                    </span>
                  </div>
                  <div className="space-y-2">
                    {issues.map((issue, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-red-600 bg-red-50/50 p-2 rounded-xl border border-red-100">
                        <ArrowRight size={14} className="mt-1 flex-shrink-0" />
                        <span className="font-medium">{issue}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-white p-12 rounded-3xl border border-dashed border-slate-300 text-center">
                <CheckCircle2 size={48} className="mx-auto text-emerald-200 mb-4" />
                <p className="text-slate-400 font-medium">ไม่พบความผิดปกติในวันที่เลือก</p>
              </div>
            )}
          </div>
        </div>

        {/* Summary List by Location & Upload History */}
        <div className="space-y-8">
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Filter className="text-slate-400" size={24} />
              สรุปตามสถานที่
            </h3>
            
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
                <span>สถานที่</span>
                <span>สถานะ (ตรวจแล้ว/ทั้งหมด)</span>
              </div>
              <div className="divide-y divide-slate-100">
                {(Object.entries(
                  machines.reduce((acc, m) => {
                    if (!acc[m.location]) acc[m.location] = { total: 0, done: 0 };
                    acc[m.location].total++;
                    if (stats.dateRecords.some(r => r.machineId === m.id)) acc[m.location].done++;
                    return acc;
                  }, {} as Record<string, { total: number; done: number }>)
                ) as [string, { total: number; done: number }][]).map(([loc, data]) => (
                  <div key={loc} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <span className="font-bold text-slate-700">{loc}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-emerald-500 transition-all duration-500" 
                          style={{ width: `${(data.done / data.total) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-bold text-slate-900">
                        {data.done}/{data.total}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Upload History Log */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Clock className="text-slate-400" size={24} />
                ประวัติการอัพโหลดไฟล์
              </h3>
              {uploadHistory.length > 0 && (
                <button 
                  onClick={() => setShowClearHistoryConfirm(true)}
                  className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                  title="ล้างประวัติทั้งหมด"
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>
            <div className="space-y-3">
              {uploadHistory.length > 0 ? (
                uploadHistory.map((entry) => {
                  // Calculate stats for this specific upload entry on the selected date
                  const dateRecords = records.filter(r => r.date === selectedDate);
                  let done = 0;
                  let abnormal = 0;
                  
                  entry.machines.forEach(m => {
                    const record = dateRecords.find(r => r.machineId === m.id);
                    if (record) {
                      done++;
                      const hasIssue = entry.formStructure.fields.some(f => 
                        isAbnormal(f, record.values[f.id], m)
                      );
                      if (hasIssue) abnormal++;
                    }
                  });

                  return (
                    <button 
                      key={entry.id} 
                      onClick={() => setViewingUploadId(entry.id === viewingUploadId ? null : entry.id)}
                      className={`w-full text-left bg-white p-4 rounded-2xl border transition-all hover:shadow-md ${
                        viewingUploadId === entry.id 
                          ? 'border-amber-400 ring-2 ring-amber-100 shadow-sm' 
                          : 'border-slate-100 shadow-sm hover:border-emerald-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-bold text-slate-900 truncate max-w-[150px]">{entry.fileName}</span>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {new Date(entry.timestamp).toLocaleDateString('th-TH')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 mb-2">
                        <span>{entry.machines.length} เครื่องจักร</span>
                        <span>{new Date(entry.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.</span>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-1">
                        <div className="flex flex-col items-center p-1 bg-emerald-50 rounded-lg">
                          <span className="text-[10px] font-black text-emerald-600">{done - abnormal}</span>
                          <span className="text-[8px] text-emerald-500 uppercase font-bold">ปกติ</span>
                        </div>
                        <div className="flex flex-col items-center p-1 bg-red-50 rounded-lg">
                          <span className="text-[10px] font-black text-red-600">{abnormal}</span>
                          <span className="text-[8px] text-red-500 uppercase font-bold">ผิดปกติ</span>
                        </div>
                        <div className="flex flex-col items-center p-1 bg-slate-50 rounded-lg">
                          <span className="text-[10px] font-black text-slate-400">{entry.machines.length - done}</span>
                          <span className="text-[8px] text-slate-400 uppercase font-bold">รอตรวจ</span>
                        </div>
                      </div>
                    </button>
                  );
                })
              ) : (
                <p className="text-center text-slate-400 text-sm py-4">ไม่มีประวัติการอัพโหลด</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Clear Confirm Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle size={32} />
            </div>
            <h3 className="text-2xl font-bold text-slate-800 text-center mb-2">ยืนยันการล้างข้อมูล</h3>
            <p className="text-slate-600 text-center mb-6">
              คุณต้องการลบข้อมูลการตรวจเช็คทั้งหมดของวันที่ <span className="font-bold text-slate-900">{new Date(selectedDate).toLocaleDateString('th-TH')}</span> ใช่หรือไม่?
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold"
              >
                ยกเลิก
              </button>
              <button 
                onClick={() => {
                  handleClearDate();
                  setShowClearConfirm(false);
                }}
                className="flex-1 px-6 py-3 bg-red-600 text-white rounded-xl font-bold"
              >
                ล้างข้อมูล
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear History Confirm Modal */}
      {showClearHistoryConfirm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 size={32} />
            </div>
            <h3 className="text-2xl font-bold text-slate-800 text-center mb-2">ยืนยันการล้างประวัติ</h3>
            <p className="text-slate-600 text-center mb-6">
              คุณต้องการลบประวัติการอัพโหลดไฟล์ทั้งหมดใช่หรือไม่? <br/>
              <span className="text-red-500 text-sm font-bold">การดำเนินการนี้ไม่สามารถย้อนกลับได้</span>
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowClearHistoryConfirm(false)}
                className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold"
              >
                ยกเลิก
              </button>
              <button 
                onClick={() => {
                  clearUploadHistory();
                  setViewingUploadId(null);
                  setShowClearHistoryConfirm(false);
                }}
                className="flex-1 px-6 py-3 bg-red-600 text-white rounded-xl font-bold"
              >
                ล้างประวัติ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, subLabel, color }: { icon: React.ReactNode, label: string, value: number, subLabel: string, color: string }) {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-100',
    emerald: 'bg-emerald-50 border-emerald-100',
    red: 'bg-red-50 border-red-100',
    amber: 'bg-amber-50 border-amber-100',
  };

  return (
    <div className={`p-6 rounded-3xl border ${colorClasses[color]} shadow-sm space-y-4`}>
      <div className="flex items-center justify-between">
        <div className="p-3 bg-white rounded-2xl shadow-sm">
          {icon}
        </div>
        <span className="text-3xl font-black text-slate-900">{value}</span>
      </div>
      <div>
        <p className="text-sm font-bold text-slate-600">{label}</p>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{subLabel}</p>
      </div>
    </div>
  );
}
