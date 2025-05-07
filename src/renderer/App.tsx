import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { useLocalRuntime } from '@assistant-ui/react';
import HomePage from './components/HomePage';
import MonacoEditor from './components/Editor';
import { chatModelAdapter } from './lib/chat-model-adapter';

const AppContent: React.FC = () => {
  const runtime = useLocalRuntime(chatModelAdapter);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Router>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/editor" element={<MonacoEditor />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AssistantRuntimeProvider>
  );
};

export default AppContent;
