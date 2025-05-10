import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@ui/button';

interface RecentProject {
  path: string;
  name: string;
  lastOpened: number;
}

const HomePage: React.FC = () => {
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const loadRecentProjects = async () => {
      try {
        setIsLoading(true);
        setError(null);
        // Load recent projects from electron-store
        const projects = await window.electronAPI.getRecentProjects();
        setRecentProjects(projects || []);
      } catch (err) {
        console.error('Error loading recent projects:', err);
        setError(`Failed to load recent projects: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadRecentProjects();
  }, []);

  const handleOpenFolder = async () => {
    try {
      setError(null);
      const result = await window.electronAPI.openFolder();
      if (result) {
        navigate(`/editor?path=${encodeURIComponent(result.path)}`);
      }
    } catch (err) {
      console.error('Error opening folder:', err);
      setError(`Failed to open folder: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleOpenFile = async () => {
    try {
      setError(null);
      const result = await window.electronAPI.openFile();
      if (result) {
        navigate(`/editor?path=${encodeURIComponent(result.path)}`);
      }
    } catch (err) {
      console.error('Error opening file:', err);
      setError(`Failed to open file: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleOpenRecentProject = async (path: string) => {
    try {
      setError(null);
      setIsLoading(true);
      // Use the new method that ensures embedding
      const result = await window.electronAPI.openRecentProject(path);

      if (result && result.success) {
        navigate(`/editor?path=${encodeURIComponent(path)}`);
      } else if (result && !result.success) {
        setError(result.error || "Failed to open project");
      }
    } catch (err) {
      console.error("Error opening recent project:", err);
      setError(
        `Failed to open recent project: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen flex flex-col items-center justify-center bg-gray-50 p-8">
      <div className="max-w-2xl w-full">
        <h1 className="text-3xl font-bold text-blue-600 mb-8 text-center">Welcome to Swati-Lite</h1>
        
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg mb-8">
            <p>{error}</p>
          </div>
        )}
        
        <div className="bg-white p-6 rounded-lg shadow-md mb-8">
          <div className="flex flex-col gap-4">
            <Button
              onClick={handleOpenFolder}
              variant="default"
              disabled={isLoading}
            >
              {isLoading ? 'Loading...' : 'Open Folder'}
            </Button>
            <Button
              onClick={handleOpenFile}
              variant="secondary"
              disabled={isLoading}
            >
              {isLoading ? 'Loading...' : 'Open File'}
            </Button>
          </div>
        </div>

        {recentProjects.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-4">Recent Projects</h2>
            <ul className="divide-y divide-gray-200">
              {recentProjects.map((project) => (
                <li key={project.path} className="py-3">
                  <Button
                    onClick={() => handleOpenRecentProject(project.path)}
                    variant="ghost"
                    className="w-full text-left hover:bg-gray-50 p-2 rounded transition-colors justify-start"
                    disabled={isLoading}
                  >
                    <div>
                      <p className="font-medium text-blue-600">{project.name}</p>
                      <p className="text-sm text-gray-500 truncate">{project.path}</p>
                      <p className="text-xs text-gray-400">
                        Last opened: {new Date(project.lastOpened).toLocaleDateString()}
                      </p>
                    </div>
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default HomePage; 