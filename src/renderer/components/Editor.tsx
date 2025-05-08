import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Editor, { Monaco } from '@monaco-editor/react';
import noncePlugin from '../MonacoNoncePlugin';
import { Button } from './ui/button';
import AiChat from './AiChat';
import { ResizablePanel, ResizablePanelGroup, ResizableHandle } from './ui/resizable';
import FileExplorer from './FileExplorer';
import { useAppContext } from '../contexts/AppContext';

// FilePreview component handles just the editor functionality
const FilePreview: React.FC = () => {
  const { content, language, filePath, isLoading, error, updateContent } = useAppContext();
  const navigate = useNavigate();

  // Add nonces to any dynamically created script/style elements
  useEffect(() => {
    const cleanup = noncePlugin.applyNoncesToDynamicElements();
    return cleanup;
  }, []);

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      updateContent(value);
    }
  };

  const handleEditorDidMount = (editor: any, monaco: Monaco) => {
    console.log('Editor mounted successfully');
    noncePlugin.afterEditorMount(editor, monaco);
    editor.focus();
  };

  const handleEditorWillMount = (monaco: Monaco) => {
    console.log('Editor will mount');
    noncePlugin.beforeEditorMount(monaco);
  };

  const handleBackToHome = () => {
    navigate('/');
  };

  if (isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <p className="text-lg">Loading file...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center p-6">
        <div className="bg-white p-6 rounded-lg shadow-md max-w-2xl w-full">
          <h2 className="text-xl font-bold text-red-600 mb-4">Error</h2>
          <p className="text-gray-700 mb-4">{error}</p>
          <Button
            onClick={handleBackToHome}
            variant="default"
          >
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {filePath && (
        <div className="bg-gray-100 p-2 text-sm text-gray-700 border-b flex justify-between items-center">
          <span>{filePath}</span>
          <Button
            onClick={handleBackToHome}
            variant="ghost"
            size="sm"
            className="text-blue-600 hover:text-blue-800"
          >
            Back to Home
          </Button>
        </div>
      )}
      <div className="flex-grow">
        <Editor
          height="100%"
          defaultLanguage={language}
          value={content}
          theme="vs-light"
          onChange={handleEditorChange}
          onMount={handleEditorDidMount}
          beforeMount={handleEditorWillMount}
          loading={<p className="p-4">Loading editor...</p>}
          options={{
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
            automaticLayout: true,
          }}
        />
      </div>
    </div>
  );
};

// Main Editor layout component
const MonacoEditor: React.FC = () => {
  return (
    <div className="h-screen w-full flex flex-col">
      <div className="flex-grow flex min-h-0">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
            <div className="h-full border-r border-gray-200">
              <FileExplorer />
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={50} minSize={30}>
            <div className="h-full editor-container">
              <FilePreview />
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={30} minSize={20} maxSize={40}>
            <div className="h-full flex flex-col">
              <AiChat />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
};

export default MonacoEditor; 