import React, { createContext, useState, useContext, ReactNode } from 'react';
import { Machine, FormStructure } from '../types';

interface ExcelContextType {
  originalFiles: Record<string, ArrayBuffer>;
  setOriginalFiles: (files: Record<string, ArrayBuffer>) => void;
  machines: Machine[];
  setMachines: (machines: Machine[]) => void;
  formStructure: FormStructure | null;
  setFormStructure: (structure: FormStructure | null) => void;
  fileName: string;
  setFileName: (name: string) => void;
}

export const ExcelContext = createContext<ExcelContextType | undefined>(undefined);

export function ExcelProvider({ children }: { children: ReactNode }) {
  const [originalFiles, setOriginalFiles] = useState<Record<string, ArrayBuffer>>({});
  const [machines, setMachines] = useState<Machine[]>([]);
  const [formStructure, setFormStructure] = useState<FormStructure | null>(null);
  const [fileName, setFileName] = useState<string>('');

  return (
    <ExcelContext.Provider value={{ 
      originalFiles, setOriginalFiles, 
      machines, setMachines, 
      formStructure, setFormStructure,
      fileName, setFileName 
    }}>
      {children}
    </ExcelContext.Provider>
  );
}

export function useExcel() {
  const context = useContext(ExcelContext);
  if (!context) throw new Error('useExcel must be used within ExcelProvider');
  return context;
}
