import React, { useEffect, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Editor, { Monaco } from '@monaco-editor/react';
import noncePlugin from '../MonacoNoncePlugin';
import { Button } from './ui/button';
import { ChatSidebar } from '@components/ChatSidebar';
import { ThreadList } from './assistant-ui/thread-list';
import { Thread } from './assistant-ui/thread';
import { ResizablePanel, ResizablePanelGroup, ResizableHandle } from './ui/resizable';

const MonacoEditor: React.FC = () => {
  const [content, setContent] = useState<string>('');
  const [language, setLanguage] = useState<string>('javascript');
  const [filePath, setFilePath] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Add nonces to any dynamically created script/style elements
  useEffect(() => {
    const cleanup = noncePlugin.applyNoncesToDynamicElements();
    return cleanup;
  }, []);

  useEffect(() => {
    const loadFile = async () => {
      const queryParams = new URLSearchParams(location.search);
      const path = queryParams.get('path');
      
      if (path) {
        try {
          setIsLoading(true);
          setError(null);
          setFilePath(path);
          
          const result = await window.electronAPI.readFile(path);
          
          if (result) {
            setContent(result.content);
            setLanguage(result.language);
          }
        } catch (err) {
          console.error('Error loading file:', err);
          setError(`Failed to load file: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          setIsLoading(false);
        }
      }
    };
    
    loadFile();
  }, [location.search]);

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setContent(value);
    }
  };

  const handleEditorDidMount = (editor: any, monaco: Monaco) => {
    console.log('Editor mounted successfully');
    // Apply nonces to Monaco's dynamic elements
    noncePlugin.afterEditorMount(editor, monaco);
    // You can customize editor here
    editor.focus();
  };

  const handleEditorWillMount = (monaco: Monaco) => {
    console.log('Editor will mount');
    // Apply nonces to Monaco before mounting
    noncePlugin.beforeEditorMount(monaco);
    // You can customize Monaco instance here before editor is mounted
  };

  const handleBackToHome = () => {
    setFilePath(null);
    setContent('');
    navigate('/');
  };

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-gray-100">
        <p className="text-lg">Loading file...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-gray-100 p-6">
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
    <div className="h-screen w-full flex flex-col">
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
      <div className="flex-grow flex">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          <ResizablePanel defaultSize={70} minSize={30}>
            <div className="h-full editor-container">
              <Editor
                height="100%"
                defaultLanguage={language}
                defaultValue={content}
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
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={30} minSize={20} maxSize={40}>
            <div className="h-full flex flex-col">
              <ThreadList />
              <Thread />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
};

export default MonacoEditor; 