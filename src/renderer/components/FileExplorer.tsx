import React, { useEffect, useState, useCallback } from 'react';
import { ChevronRight, ChevronDown, File, Folder } from 'lucide-react';
import { Button } from './ui/button';

interface FileExplorerProps {
  rootPath: string;
  onFileSelect: (path: string) => void;
}

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

const FileExplorer: React.FC<FileExplorerProps> = ({ rootPath, onFileSelect }) => {
  // Keep the entire file tree in memory
  const [fileTree, setFileTree] = useState<FileNode | null>(null);
  // Only track which directories are expanded
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Load the entire file tree when rootPath changes
  useEffect(() => {
    const loadFileTree = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Load expanded directories from electron-store
        const savedExpandedDirs = await window.electronAPI.getExpandedDirs(rootPath);
        setExpandedDirs(new Set(savedExpandedDirs));
        
        // Only load the file tree if we don't have it yet
        if (!fileTree) {
          const tree = await window.electronAPI.readDirectory(rootPath);
          setFileTree(tree);
        }
      } catch (err) {
        console.error('Error loading file tree:', err);
        setError(`Failed to load file tree: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadFileTree();
  }, [rootPath, fileTree]);

  const toggleDirectory = useCallback(async (dirPath: string) => {
    setExpandedDirs(prev => {
      const newExpandedDirs = new Set(prev);
      if (newExpandedDirs.has(dirPath)) {
        newExpandedDirs.delete(dirPath);
      } else {
        newExpandedDirs.add(dirPath);
      }
      
      // Save expanded directories to electron-store
      window.electronAPI.saveExpandedDirs(rootPath, Array.from(newExpandedDirs));
      
      return newExpandedDirs;
    });
  }, [rootPath]);

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
            onClick={() => node.type === 'file' && onFileSelect(node.path)}
          >
            {node.type === 'directory' ? (
              <Folder className="h-4 w-4 mr-2 text-blue-500" />
            ) : (
              <File className="h-4 w-4 mr-2 text-gray-500" />
            )}
            <span className="truncate">{node.name}</span>
          </Button>
        </div>
        {/* Only toggle visibility, don't modify the tree structure */}
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