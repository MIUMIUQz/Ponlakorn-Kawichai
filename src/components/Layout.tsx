import React from 'react';
import { ClipboardCheck, LayoutDashboard, FileSpreadsheet, BarChart3 } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  currentTab: 'dashboard' | 'checklist' | 'report' | 'summary';
  onTabChange: (tab: 'dashboard' | 'checklist' | 'report' | 'summary') => void;
}

export function Layout({ children, currentTab, onTabChange }: LayoutProps) {
  return (
    <div className="min-h-screen bg-white flex flex-col md:flex-row transition-colors duration-500">
      {/* Sidebar for tablet/desktop, Bottom nav for mobile */}
      <nav className="bg-slate-50 border-r border-slate-100 w-full md:w-64 flex-shrink-0 flex md:flex-col justify-around md:justify-start p-4 md:p-6 fixed bottom-0 md:relative z-10 shadow-[0_-4px_6px_-1px_rgb(0,0,0,0.05)] md:shadow-none">
        <div className="hidden md:block mb-8">
          <h1 className="text-xl font-bold text-emerald-700">MAC-PM-ME_Checklist</h1>
          <p className="text-sm text-slate-500 font-medium">Test Run & PM</p>
        </div>
        
        <NavItem 
          icon={<LayoutDashboard size={24} />} 
          label="หน้าแรก" 
          active={currentTab === 'dashboard'} 
          onClick={() => onTabChange('dashboard')} 
        />
        <NavItem 
          icon={<ClipboardCheck size={24} />} 
          label="เช็คลิสต์" 
          active={currentTab === 'checklist'} 
          onClick={() => onTabChange('checklist')} 
        />
        <NavItem 
          icon={<FileSpreadsheet size={24} />} 
          label="รายงาน" 
          active={currentTab === 'report'} 
          onClick={() => onTabChange('report')} 
        />
        <NavItem 
          icon={<BarChart3 size={24} />} 
          label="สรุปผล" 
          active={currentTab === 'summary'} 
          onClick={() => onTabChange('summary')} 
        />
      </nav>

      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8 overflow-y-auto w-full bg-white">
        {children}
      </main>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col md:flex-row items-center md:space-x-3 p-3 md:p-4 rounded-xl transition-all md:mb-2 ${
        active 
          ? 'bg-white text-emerald-700 font-bold shadow-sm ring-1 ring-slate-200' 
          : 'text-slate-500 hover:bg-white hover:text-slate-700 font-medium hover:shadow-sm'
      }`}
    >
      {icon}
      <span className="text-[10px] md:text-base mt-1 md:mt-0">{label}</span>
    </button>
  );
}
