import React, { useEffect, useState, useCallback } from 'react';
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FilePlus,
  FolderPlus,
} from "lucide-react";
import {Button} from "./ui/button";
import {useAppContext} from "../contexts/AppContext";

interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
}

const FileExplorer: React.FC = () => {
  const {setFilePath} = useAppContext();
  const [fileTree, setFileTree] = useState<FileNode | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [workspaceRoot, setWorkspaceRoot] = useState<string>("");
  const [newItemParent, setNewItemParent] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState<string>("");
  const [newItemType, setNewItemType] = useState<"file" | "directory">("file");

  useEffect(() => {
    const loadFileTree = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Get workspace root from main process
        console.log("FileExplorer: Requesting workspace root...");
        const root = await window.electronAPI.getWorkspaceRoot();
        console.log("FileExplorer: Received workspace root:", root);
        console.log("FileExplorer: Root type:", typeof root);
        console.log("FileExplorer: Root length:", root ? root.length : 0);

        if (!root) {
          console.log("FileExplorer: No workspace root found");
          setError("No workspace selected. Please open a folder to begin.");
          setIsLoading(false);
          return;
        }

        setWorkspaceRoot(root);
        console.log("FileExplorer: Set workspace root state to:", root);

        // Load expanded directories from electron-store
        const savedExpandedDirs = await window.electronAPI.getExpandedDirs(
          root
        );
        setExpandedDirs(new Set(savedExpandedDirs));

        // Load the complete file tree from the workspace root
        const tree = await window.electronAPI.readDirectory(root);
        setFileTree(tree);
      } catch (err) {
        console.error("Error loading file tree:", err);
        setError(
          `Failed to load file tree: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      } finally {
        setIsLoading(false);
      }
    };

    loadFileTree();
  }, [workspaceRoot]);

  const refreshFileTree = async () => {
    try {
      if (!workspaceRoot) return;

      const tree = await window.electronAPI.readDirectory(workspaceRoot);
      setFileTree(tree);
    } catch (err) {
      console.error("Error refreshing file tree:", err);
      setError(
        `Failed to refresh file tree: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  };

  const toggleDirectory = useCallback(
    async (dirPath: string) => {
      setExpandedDirs((prev) => {
        const newExpandedDirs = new Set(prev);
        if (newExpandedDirs.has(dirPath)) {
          newExpandedDirs.delete(dirPath);
        } else {
          newExpandedDirs.add(dirPath);
        }

        // Save expanded directories to electron-store
        window.electronAPI.saveExpandedDirs(
          workspaceRoot,
          Array.from(newExpandedDirs)
        );

        return newExpandedDirs;
      });
    },
    [workspaceRoot]
  );

  const handleFileSelect = (path: string) => {
    setFilePath(path);
  };

  const startNewItemCreation = (
    parentPath: string,
    type: "file" | "directory"
  ) => {
    setNewItemParent(parentPath);
    setNewItemType(type);
    setNewItemName("");

    // Auto-expand the parent directory
    if (!expandedDirs.has(parentPath)) {
      toggleDirectory(parentPath);
    }
  };

  const cancelNewItemCreation = () => {
    setNewItemParent(null);
    setNewItemName("");
  };

  const createNewItem = async () => {
    if (!newItemParent || !newItemName) return;

    try {
      const newPath = `${newItemParent}/${newItemName}`;

      if (newItemType === "file") {
        await window.electronAPI.createFile(newPath);
        // Open the newly created file
        setFilePath(newPath);
      } else {
        await window.electronAPI.createDirectory(newPath);
      }

      // Refresh file tree
      await refreshFileTree();

      // Reset new item state
      setNewItemParent(null);
      setNewItemName("");
    } catch (err) {
      console.error(`Error creating ${newItemType}:`, err);
      setError(
        `Failed to create ${newItemType}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      createNewItem();
    } else if (e.key === "Escape") {
      cancelNewItemCreation();
    }
  };

  const renderNewItemInput = () => {
    if (!newItemParent) return null;

    return (
      <div className="flex items-center pl-12 py-1">
        {newItemType === "file" ? (
          <File className="h-4 w-4 mr-2 text-gray-500" />
        ) : (
          <Folder className="h-4 w-4 mr-2 text-blue-500" />
        )}
        <input
          type="text"
          className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`New ${newItemType} name...`}
          autoFocus
        />
      </div>
    );
  };

  const renderFileNode = (node: FileNode) => {
    const isExpanded = expandedDirs.has(node.path);
    const isCreatingNewItem = newItemParent === node.path;

    return (
      <div key={node.path} className="pl-4">
        <div className="flex items-center py-1 hover:bg-gray-100 rounded group">
          {node.type === "directory" ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => toggleDirectory(node.path)}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          ) : (
            <div className="w-6" />
          )}
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 justify-start px-2 h-6"
            onClick={() => {
              if (node.type === "file") {
                handleFileSelect(node.path);
              } else if (node.type === "directory") {
                toggleDirectory(node.path);
              }
            }}
          >
            {node.type === "directory" ? (
              <Folder className="h-4 w-4 mr-2 text-blue-500" />
            ) : (
              <File className="h-4 w-4 mr-2 text-gray-500" />
            )}
            <span className="truncate">{node.name}</span>
          </Button>

          {node.type === "directory" && (
            <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => startNewItemCreation(node.path, "file")}
                title="Create new file"
              >
                <FilePlus className="h-4 w-4 text-gray-500" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => startNewItemCreation(node.path, "directory")}
                title="Create new folder"
              >
                <FolderPlus className="h-4 w-4 text-blue-500" />
              </Button>
            </div>
          )}
        </div>

        {node.type === "directory" && isCreatingNewItem && renderNewItemInput()}

        {node.type === "directory" && isExpanded && node.children && (
          <div className="pl-2">
            {node.children.map((child) => renderFileNode(child))}
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-gray-500">Loading file tree...</div>
    );
  }

  if (error) {
    return <div className="p-4 text-sm text-red-500">{error}</div>;
  }

  if (!fileTree) {
    return <div className="p-4 text-sm text-gray-500">No files found</div>;
  }

  return (
    <div className="h-full overflow-auto p-2">
      <div className="flex justify-between items-center mb-2 px-2">
        <span className="text-sm font-semibold">Explorer</span>
        <div className="flex">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() =>
              workspaceRoot && startNewItemCreation(workspaceRoot, "file")
            }
            title="Create new file at root"
          >
            <FilePlus className="h-4 w-4 text-gray-500" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() =>
              workspaceRoot && startNewItemCreation(workspaceRoot, "directory")
            }
            title="Create new folder at root"
          >
            <FolderPlus className="h-4 w-4 text-blue-500" />
          </Button>
        </div>
      </div>

      {workspaceRoot && newItemParent === workspaceRoot && renderNewItemInput()}
      {renderFileNode(fileTree)}
    </div>
  );
};

export default FileExplorer; 