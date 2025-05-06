import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import noncePlugin from '../MonacoNoncePlugin';

const MonacoEditor: React.FC = () => {
  const [content, setContent] = useState<string>('');
  const [language, setLanguage] = useState<string>('plaintext');
  const [filePath, setFilePath] = useState<string>('');
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
      // Optionally auto-save changes
      // window.electronAPI.saveFile(filePath, value);
    }
  };

  const handleEditorDidMount = (editor: any, monaco: any) => {
    console.log('Editor mounted successfully');
    // Apply nonces to Monaco's dynamic elements
    noncePlugin.afterEditorMount(editor, monaco);
    // You can customize editor here
    editor.focus();
  };

  const handleEditorWillMount = (monaco: any) => {
    console.log('Editor will mount');
    // Apply nonces to Monaco before mounting
    noncePlugin.beforeEditorMount(monaco);
    // You can customize Monaco instance here before editor is mounted
  };

  const handleBackToHome = () => {
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
          <button
            onClick={handleBackToHome}
            className="bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex flex-col">
      {filePath && (
        <div className="bg-gray-100 p-2 text-sm text-gray-700 border-b flex justify-between items-center">
          <span>{filePath}</span>
          <button
            onClick={handleBackToHome}
            className="text-blue-600 hover:text-blue-800 text-sm"
          >
            Back to Home
          </button>
        </div>
      )}
      <div className="flex-grow editor-container">
        <Editor
          height="100%"
          defaultLanguage={language}
          defaultValue={content}
          theme="vs-dark"
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

export default MonacoEditor; 