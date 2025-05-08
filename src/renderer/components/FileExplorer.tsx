import React, { useEffect, useState, useCallback } from 'react';
import { ChevronRight, ChevronDown, File, Folder } from 'lucide-react';
import { Button } from './ui/button';
import { useAppContext } from '../contexts/AppContext';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

const FileExplorer: React.FC = () => {
  const { setFilePath } = useAppContext();
  const [fileTree, setFileTree] = useState<FileNode | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [workspaceRoot, setWorkspaceRoot] = useState<string>('');

  useEffect(() => {
    const loadFileTree = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Get workspace root from main process
        console.log('FileExplorer: Requesting workspace root...');
        const root = await window.electronAPI.getWorkspaceRoot();
        console.log('FileExplorer: Received workspace root:', root);
        console.log('FileExplorer: Root type:', typeof root);
        console.log('FileExplorer: Root length:', root ? root.length : 0);
        
        if (!root) {
          console.log('FileExplorer: No workspace root found');
          setError('No workspace selected. Please open a folder to begin.');
          setIsLoading(false);
          return;
        }
        
        setWorkspaceRoot(root);
        console.log('FileExplorer: Set workspace root state to:', root);
        
        // Load expanded directories from electron-store
        const savedExpandedDirs = await window.electronAPI.getExpandedDirs(root);
        setExpandedDirs(new Set(savedExpandedDirs));
        
        // Load the complete file tree from the workspace root
        const tree = await window.electronAPI.readDirectory(root);
        setFileTree(tree);
      } catch (err) {
        console.error('Error loading file tree:', err);
        setError(`Failed to load file tree: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadFileTree();
  }, [workspaceRoot]);

  const toggleDirectory = useCallback(async (dirPath: string) => {
    setExpandedDirs(prev => {
      const newExpandedDirs = new Set(prev);
      if (newExpandedDirs.has(dirPath)) {
        newExpandedDirs.delete(dirPath);
      } else {
        newExpandedDirs.add(dirPath);
      }
      
      // Save expanded directories to electron-store
      window.electronAPI.saveExpandedDirs(workspaceRoot, Array.from(newExpandedDirs));
      
      return newExpandedDirs;
    });
  }, [workspaceRoot]);

  const handleFileSelect = (path: string) => {
    setFilePath(path);
  };

  const renderFileNode = (node: FileNode) => {
    const isExpanded = expandedDirs.has(node.path);
    
    return (
      <div key={node.path} className="pl-4">
        <div className="flex items-center py-1 hover:bg-gray-100 rounded">
          {node.type === 'directory' ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => toggleDirectory(node.path)}
            >
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          ) : (
            <div className="w-6" />
          )}
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 justify-start px-2 h-6"
            onClick={() => {
              if (node.type === 'file') {
                handleFileSelect(node.path);
              }
            }}
          >
            {node.type === 'directory' ? (
              <Folder className="h-4 w-4 mr-2 text-blue-500" />
            ) : (
              <File className="h-4 w-4 mr-2 text-gray-500" />
            )}
            <span className="truncate">{node.name}</span>
          </Button>
        </div>
        {node.type === 'directory' && isExpanded && node.children && (
          <div className="pl-2">
            {node.children.map(child => renderFileNode(child))}
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-gray-500">
        Loading file tree...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-red-500">
        {error}
      </div>
    );
  }

  if (!fileTree) {
    return (
      <div className="p-4 text-sm text-gray-500">
        No files found
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-2">
      {renderFileNode(fileTree)}
    </div>
  );
};

export default FileExplorer; 