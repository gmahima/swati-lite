// renderer/services/FileService.ts
import {ipcRenderer} from "electron";
import EventEmitter from "events";
import {FileChangeType} from "../../main/fileWatcher";

export interface FileChange {
  path: string;
  type: FileChangeType;
}

class FileService extends EventEmitter {
  private static instance: FileService;
  private watchedDirectories = new Set<string>();

  private constructor() {
    super();

    // Listen for file change events from main process
    ipcRenderer.on("file:changed", (_, change: FileChange) => {
      this.emit("fileChange", change);

      // Also emit type-specific events
      switch (change.type) {
        case FileChangeType.ADDED:
          this.emit("fileAdded", change);
          break;
        case FileChangeType.UPDATED:
          this.emit("fileUpdated", change);
          break;
        case FileChangeType.DELETED:
          this.emit("fileDeleted", change);
          break;
      }
    });

    // Clean up when window is unloaded
    window.addEventListener("beforeunload", () => {
      ipcRenderer.send("file:cleanup-watchers");
    });
  }

  static getInstance(): FileService {
    if (!FileService.instance) {
      FileService.instance = new FileService();
    }
    return FileService.instance;
  }

  // Watch a directory for file changes
  async watchDirectory(dirPath: string): Promise<boolean> {
    try {
      const result = await ipcRenderer.invoke("file:watch-directory", dirPath);
      if (result) {
        this.watchedDirectories.add(dirPath);
      }
      return result;
    } catch (error) {
      console.error("Error watching directory:", error);
      return false;
    }
  }

  // Stop watching a directory
  async unwatchDirectory(dirPath: string): Promise<boolean> {
    try {
      const result = await ipcRenderer.invoke(
        "file:unwatch-directory",
        dirPath
      );
      if (result) {
        this.watchedDirectories.delete(dirPath);
      }
      return result;
    } catch (error) {
      console.error("Error unwatching directory:", error);
      return false;
    }
  }

  // Read file content
  async readFile(filePath: string): Promise<string> {
    try {
      return await ipcRenderer.invoke("file:read", filePath);
    } catch (error) {
      throw new Error(
        `Failed to read file: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  // Write file content
  async writeFile(filePath: string, content: string): Promise<boolean> {
    try {
      return await ipcRenderer.invoke("file:write", filePath, content);
    } catch (error) {
      throw new Error(
        `Failed to write file: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  // List directory contents
  async listDirectory(
    dirPath: string
  ): Promise<Array<{name: string; isDirectory: boolean; path: string}>> {
    try {
      return await ipcRenderer.invoke("file:list-directory", dirPath);
    } catch (error) {
      throw new Error(
        `Failed to list directory: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  // Event listeners
  onFileChange(callback: (change: FileChange) => void): () => void {
    this.on("fileChange", callback);
    return () => {
      this.off("fileChange", callback);
    };
  }

  onFileAdded(callback: (change: FileChange) => void): () => void {
    this.on("fileAdded", callback);
    return () => {
      this.off("fileAdded", callback);
    };
  }

  onFileUpdated(callback: (change: FileChange) => void): () => void {
    this.on("fileUpdated", callback);
    return () => {
      this.off("fileUpdated", callback);
    };
  }

  onFileDeleted(callback: (change: FileChange) => void): () => void {
    this.on("fileDeleted", callback);
    return () => {
      this.off("fileDeleted", callback);
    };
  }
}

export default FileService.getInstance();
