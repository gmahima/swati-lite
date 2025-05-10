import {app, ipcMain} from "electron";
import * as fs from "fs";
import * as path from "path";
import * as chokidar from "chokidar";

export enum FileChangeType {
  ADDED = 1,
  DELETED = 2,
  UPDATED = 3,
}

export interface FileChange {
  type: FileChangeType;
  path: string;
}

class FileWatcherService {
  private watchers = new Map<string, chokidar.FSWatcher>();
  private subscribers = new Map<string, Set<string>>();
  constructor() {
    // Set up IPC handlers when service is created
    this.setupIPCHandlers();
  }
  private setupIPCHandlers() {
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

    // Read file
    ipcMain.handle("file:read", async (_, filePath: string) => {
      try {
        return await fs.promises.readFile(filePath, "utf-8");
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

    const subscribers = this.subscribers.get(dirPath);
    if (!subscribers) return;
    for (const subscriberId of subscribers) {
      const windows = require("electron").BrowserWindow.getAllWindows();
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
