import { useState, useEffect } from 'react';
import { CheckRecord } from '../types';

export function useRecords() {
  const [records, setRecords] = useState<CheckRecord[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem('machine_records');
    if (stored) {
      try {
        setRecords(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse records', e);
      }
    }
  }, []);

  const saveRecord = (record: CheckRecord) => {
    setRecords(prev => {
      const existingIdx = prev.findIndex(r => r.machineId === record.machineId && r.date === record.date);
      let newRecords;
      if (existingIdx >= 0) {
        newRecords = [...prev];
        newRecords[existingIdx] = record;
      } else {
        newRecords = [...prev, record];
      }
      localStorage.setItem('machine_records', JSON.stringify(newRecords));
      return newRecords;
    });
  };

  const clearRecords = () => {
    setRecords([]);
    localStorage.removeItem('machine_records');
  };

  const clearCurrentRecords = () => {
    setRecords(prev => {
      const newRecords = prev.filter(r => r.date !== 'current');
      localStorage.setItem('machine_records', JSON.stringify(newRecords));
      return newRecords;
    });
  };

  return { records, saveRecord, clearRecords, clearCurrentRecords };
}
