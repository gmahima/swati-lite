import {app, ipcMain, BrowserWindow} from "electron";
import * as fs from "fs";
import * as path from "path";
import * as chokidar from "chokidar";
import {EventEmitter} from "events";

export enum FileChangeType {
  ADDED = 1,
  DELETED = 2,
  UPDATED = 3,
}

export interface FileChange {
  type: FileChangeType;
  path: string;
}

class FileWatcherService extends EventEmitter {
  private watchers = new Map<string, chokidar.FSWatcher>();
  private subscribers = new Map<string, Set<string>>();

  constructor() {
    super();
    // Set up IPC handlers when service is created
    this.setupIPCHandlers();
  }

  // Helper function to determine file language based on extension
  private getLanguageFromPath(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const languageMap: Record<string, string> = {
      ".js": "javascript",
      ".jsx": "javascript",
      ".ts": "typescript",
      ".tsx": "typescript",
      ".html": "html",
      ".css": "css",
      ".json": "json",
      ".md": "markdown",
      ".py": "python",
      ".java": "java",
      ".c": "c",
      ".cpp": "cpp",
      ".go": "go",
      ".rs": "rust",
      ".rb": "ruby",
      ".php": "php",
      ".sh": "shell",
      ".yaml": "yaml",
      ".yml": "yaml",
      ".xml": "xml",
    };

    return languageMap[ext] || "plaintext";
  }

  // Read directory contents recursively
  private async readDirectoryRecursive(dirPath: string): Promise<any> {
    try {
      const stats = await fs.promises.stat(dirPath);
      if (!stats.isDirectory()) {
        throw new Error("Path is not a directory");
      }

      const items = await fs.promises.readdir(dirPath, {withFileTypes: true});
      const children: any[] = await Promise.all(
        items.map(async (item: any) => {
          const fullPath = path.join(dirPath, item.name);
          const stats = await fs.promises.stat(fullPath);

          if (stats.isDirectory()) {
            // Recursively read subdirectories
            return this.readDirectoryRecursive(fullPath);
          } else {
            return {
              name: item.name,
              path: fullPath,
              type: "file",
            };
          }
        })
      );

      // Sort directories first, then files, both alphabetically
      children.sort((a: any, b: any) => {
        if (a.type === b.type) {
          return a.name.localeCompare(b.name);
        }
        return a.type === "directory" ? -1 : 1;
      });

      return {
        name: path.basename(dirPath),
        path: dirPath,
        type: "directory",
        children,
      };
    } catch (error) {
      console.error(`Error reading directory ${dirPath}:`, error);
      throw error;
    }
  }

  private setupIPCHandlers() {
    // File watcher handlers
    ipcMain.handle("file:watch-directory", (event, dirPath: string) => {
      const windowId = event.sender.id.toString();
      return this.watchDirectory(dirPath, windowId);
    });

    // Unwatch directory request from renderer
    ipcMain.handle("file:unwatch-directory", (event, dirPath: string) => {
      const windowId = event.sender.id.toString();
      return this.unwatchDirectory(dirPath, windowId);
    });

    // Clean up when window is closed
    ipcMain.on("file:cleanup-watchers", (event) => {
      const windowId = event.sender.id.toString();
      this.cleanupWatchers(windowId);
    });

    // Read file content
    ipcMain.handle("file:read", async (_, filePath: string) => {
      try {
        console.log("Reading file:", filePath);
        if (!fs.existsSync(filePath)) {
          console.error("File does not exist:", filePath);
          return {
            content: `Error: File does not exist: ${filePath}`,
            language: "plaintext",
          };
        }
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
          console.log("Path is a directory, not a file:", filePath);
          return {
            content: `Selected path is a directory: ${filePath}`,
            language: "plaintext",
          };
        }
        const content = fs.readFileSync(filePath, "utf-8");
        const language = this.getLanguageFromPath(filePath);
        console.log("File read successfully, language:", language);
        return {content, language};
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to read file: ${errorMessage}`);
      }
    });

    // Write file
    ipcMain.handle(
      "file:write",
      async (_, filePath: string, content: string) => {
        try {
          await fs.promises.writeFile(filePath, content);
          return true;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          throw new Error(`Failed to write file: ${errorMessage}`);
        }
      }
    );

    // List directory contents
    ipcMain.handle("file:list-directory", async (_, dirPath: string) => {
      try {
        const files = await fs.promises.readdir(dirPath, {withFileTypes: true});
        return files.map((file) => ({
          name: file.name,
          isDirectory: file.isDirectory(),
          path: `${dirPath}/${file.name}`,
        }));
      } catch (error) {
        throw new Error(
          `Failed to list directory: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    });

    // Save file
    ipcMain.handle(
      "file:save",
      async (_, filePath: string, content: string) => {
        try {
          fs.writeFileSync(filePath, content, "utf-8");
          return true;
        } catch (error) {
          console.error("Error saving file:", error);
          return false;
        }
      }
    );

    // Get file/directory stats
    ipcMain.handle("file:getStats", async (_, filePath: string) => {
      try {
        const stats = fs.statSync(filePath);
        return {
          isDirectory: stats.isDirectory(),
        };
      } catch (error) {
        console.error("Error getting file stats:", error);
        throw error;
      }
    });
  }

  private watchDirectory(dirPath: string, subscriberId: string): boolean {
    try {
      dirPath = path.normalize(dirPath);
      if (!this.watchers.has(dirPath)) {
        const watcher = chokidar.watch(dirPath, {
          ignored: /(^|[\/\\])\../, // Ignore dotfiles
          persistent: true,
          ignoreInitial: true,
          awaitWriteFinish: {
            stabilityThreshold: 300,
            pollInterval: 100,
          },
        });
        watcher.on("add", (path) =>
          this.sendChangeEvent(dirPath, path, FileChangeType.ADDED)
        );
        watcher.on("change", (path) =>
          this.sendChangeEvent(dirPath, path, FileChangeType.UPDATED)
        );
        watcher.on("unlink", (path) =>
          this.sendChangeEvent(dirPath, path, FileChangeType.DELETED)
        );

        this.watchers.set(dirPath, watcher);
      }
      return true;
    } catch (error) {
      console.error(`Error watching directory ${dirPath}:`, error);
      return false;
    }
  }
  // Stop watching a directory for a specific subscriber
  unwatchDirectory(dirPath: string, subscriberId: string): boolean {
    try {
      dirPath = path.normalize(dirPath);

      if (this.subscribers.has(dirPath)) {
        // Remove subscriber
        const subscribers = this.subscribers.get(dirPath);
        if (subscribers) {
          subscribers.delete(subscriberId);

          // If no subscribers left, remove watcher
          if (subscribers.size === 0) {
            this.subscribers.delete(dirPath);

            if (this.watchers.has(dirPath)) {
              const watcher = this.watchers.get(dirPath);
              if (watcher) {
                watcher.close();
                this.watchers.delete(dirPath);
              }
            }
          }
        }
      }

      return true;
    } catch (error) {
      console.error(`Error unwatching directory ${dirPath}:`, error);
      return false;
    }
  }
  // Clean up all watchers for a specific subscriber (when window closes)
  cleanupWatchers(subscriberId: string): void {
    for (const [dirPath, subscribers] of this.subscribers.entries()) {
      if (subscribers.has(subscriberId)) {
        this.unwatchDirectory(dirPath, subscriberId);
      }
    }
  }

  private sendChangeEvent(
    dirPath: string,
    filePath: string,
    changeType: FileChangeType
  ): void {
    if (!this.subscribers.has(dirPath)) return;

    const change: FileChange = {
      type: changeType,
      path: filePath,
    };

    // Emit the change event for our internal services
    this.emit("file:change", change);

    // Send to UI windows
    const subscribers = this.subscribers.get(dirPath);
    if (!subscribers) return;
    for (const subscriberId of subscribers) {
      const windows = BrowserWindow.getAllWindows();
      const window = windows.find(
        (window: Electron.BrowserWindow) =>
          window.webContents.id.toString() === subscriberId
      );
      if (window && !window.isDestroyed()) {
        window.webContents.send("file:change", change);
      }
    }
  }
}
// Export singleton instance
export const fileWatcherService = new FileWatcherService();
