import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import HomePage from './components/HomePage';
import MonacoEditor from './components/Editor';
import { AppProvider } from './contexts/AppContext';

const AppContent: React.FC = () => {
  return (
    <Router>
      <AppProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/editor" element={<MonacoEditor />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppProvider>
    </Router>
  );
};

export default AppContent;
