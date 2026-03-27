/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Checklist } from './pages/Checklist';
import { Report } from './pages/Report';
import { ExcelProvider } from './context/ExcelContext';

export default function App() {
  const [currentTab, setCurrentTab] = useState<'dashboard' | 'checklist' | 'report'>('dashboard');

  return (
    <ExcelProvider>
      <Layout currentTab={currentTab} onTabChange={setCurrentTab}>
        {currentTab === 'dashboard' && <Dashboard onNavigate={setCurrentTab} />}
        {currentTab === 'checklist' && <Checklist />}
        {currentTab === 'report' && <Report />}
      </Layout>
    </ExcelProvider>
  );
}
