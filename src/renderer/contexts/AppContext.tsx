import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

interface AppContextType {
  filePath: string | null;
  content: string;
  language: string;
  isLoading: boolean;
  error: string | null;
  setFilePath: (path: string | null) => void;
  updateContent: (content: string) => void;
  saveFile: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [filePath, setFilePathState] = useState<string | null>(null);
  const [content, setContent] = useState<string>('');
  const [language, setLanguage] = useState<string>('javascript');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Sync URL with filePath when filePath changes
  const setFilePath = (path: string | null) => {
    setFilePathState(path);
    
    // Update URL when filePath changes
    if (path) {
      if (location.pathname !== '/editor') {
        navigate(`/editor?path=${encodeURIComponent(path)}`);
      } else {
        // If we're already on the editor page, just update the query param
        const searchParams = new URLSearchParams(location.search);
        searchParams.set('path', path);
        navigate(`/editor?${searchParams.toString()}`, { replace: true });
      }
    } else if (location.pathname === '/editor') {
      // If filePath is cleared and we're on the editor page, go back to home
      navigate('/');
    }
  };

  // Load file content when filePath changes
  useEffect(() => {
    const loadFileContent = async () => {
      if (!filePath) {
        setContent('');
        return;
      }
      
      try {
        setIsLoading(true);
        setError(null);
        
        const result = await window.electronAPI.readFile(filePath);
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
    };
    
    loadFileContent();
  }, [filePath]);

  // Initialize filePath from URL on mount
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const path = searchParams.get('path');
    
    if (path && path !== filePath) {
      setFilePathState(path);
    }
  }, [location.search, filePath]);

  const updateContent = (newContent: string) => {
    setContent(newContent);
  };

  const saveFile = async () => {
    if (!filePath) return;
    
    try {
      await window.electronAPI.saveFile(filePath, content);
    } catch (err) {
      console.error('Error saving file:', err);
      setError(`Failed to save file: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const value = {
    filePath,
    content,
    language,
    isLoading,
    error,
    setFilePath,
    updateContent,
    saveFile
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}; 