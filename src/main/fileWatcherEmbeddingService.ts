import {fileWatcherService, FileChangeType, FileChange} from "./fileWatcher";
import {handleFileChange} from "./ragService";
import * as path from "path";
import {TEMPORARY_USER_ID} from "../lib/constants.ts";
import {ipcMain} from "electron";

// Debounce helper function
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function (...args: Parameters<T>): void {
    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      func(...args);
      timeout = null;
    }, wait);
  };
}

class FileWatcherEmbeddingService {
  private static instance: FileWatcherEmbeddingService;
  private watchedPaths = new Set<string>();
  private fileExtensions = new Set([
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".py",
    ".java",
    ".cpp",
    ".c",
    ".go",
    ".rb",
    ".rs",
    ".php",
    ".md",
    ".html",
    ".sol",
    ".json",
  ]);

  // Pending file changes - used to avoid processing the same file multiple times
  private pendingChanges = new Map<string, FileChangeType>();

  // Rate limiting settings
  private debounceTimeout = 5000; // 5 seconds debounce timeout
  private maxConcurrentEmbeddings = 1; // Maximum concurrent embeddings
  private activeEmbeddings = 0; // Current number of active embeddings
  private embeddingQueue: Array<{
    filePath: string;
    changeType: FileChangeType;
  }> = [];

  private constructor() {
    // Setup event listeners for file changes
    this.setupEventListeners();
  }

  static getInstance(): FileWatcherEmbeddingService {
    if (!FileWatcherEmbeddingService.instance) {
      FileWatcherEmbeddingService.instance = new FileWatcherEmbeddingService();
    }
    return FileWatcherEmbeddingService.instance;
  }

  private setupEventListeners() {
    // Listen for file changes through the IPC channel
    ipcMain.on("file:change", (_, change: FileChange) => {
      // Use debounced function to handle file changes
      this.debouncedHandleFileChangeEvent(change);
    });
  }

  // Debounced version of handleFileChangeEvent
  private debouncedHandleFileChangeEvent = debounce((change: FileChange) => {
    this.processPendingChange(change);
  }, this.debounceTimeout);

  private processPendingChange(change: FileChange) {
    const {path: filePath, type} = change;

    // Skip if the file extension is not in our list
    const ext = path.extname(filePath).toLowerCase();
    if (!this.fileExtensions.has(ext)) {
      return;
    }

    // Check if the changed file is in one of our watched paths
    const isInWatchedPath = Array.from(this.watchedPaths).some((watchedPath) =>
      filePath.startsWith(watchedPath)
    );

    if (isInWatchedPath) {
      // Update the pending changes map with the most recent change type
      this.pendingChanges.set(filePath, type);
      this.processPendingChanges();
    }
  }

  private processPendingChanges() {
    // If we're at capacity for concurrent embeddings, don't process more
    if (this.activeEmbeddings >= this.maxConcurrentEmbeddings) {
      return;
    }

    // Process pending changes up to our concurrency limit
    const pendingEntries = Array.from(this.pendingChanges.entries());

    for (
      let i = 0;
      i < pendingEntries.length &&
      this.activeEmbeddings < this.maxConcurrentEmbeddings;
      i++
    ) {
      const [filePath, changeType] = pendingEntries[i];

      // Remove from pending map
      this.pendingChanges.delete(filePath);

      // Process the change
      this.processFileChange(filePath, changeType);
    }
  }

  private async processFileChange(
    filePath: string,
    changeType: FileChangeType
  ) {
    console.log(
      `Handling file change for embedding: ${filePath}, type: ${changeType}`
    );

    this.activeEmbeddings++;

    try {
      const result = await handleFileChange({
        filePath,
        changeType,
        userId: TEMPORARY_USER_ID,
      });

      if (result.success) {
        console.log(`Successfully updated embeddings for ${filePath}`);
      } else {
        console.error(
          `Failed to update embeddings for ${filePath}:`,
          "error" in result ? result.error : "Unknown error"
        );
      }
    } catch (error) {
      console.error(
        `Error handling file change for embedding: ${filePath}`,
        error
      );
    } finally {
      this.activeEmbeddings--;

      // Check if there are more pending changes to process
      if (this.pendingChanges.size > 0) {
        this.processPendingChanges();
      }
    }
  }

  /**
   * Start monitoring a directory for file changes to update embeddings
   */
  async watchPathForEmbedding(dirPath: string): Promise<boolean> {
    try {
      // Normalize path
      const normalizedPath = path.normalize(dirPath);

      // Add to watched paths
      this.watchedPaths.add(normalizedPath);

      // Make sure it's being watched by the file watcher service
      return true;
    } catch (error) {
      console.error(`Error watching path for embedding: ${dirPath}`, error);
      return false;
    }
  }

  /**
   * Stop monitoring a directory for embedding updates
   */
  unwatchPathForEmbedding(dirPath: string): boolean {
    try {
      const normalizedPath = path.normalize(dirPath);
      this.watchedPaths.delete(normalizedPath);
      return true;
    } catch (error) {
      console.error(`Error unwatching path for embedding: ${dirPath}`, error);
      return false;
    }
  }

  /**
   * Get list of currently watched paths
   */
  getWatchedPaths(): string[] {
    return Array.from(this.watchedPaths);
  }

  /**
   * Update the debounce timeout settings
   */
  setDebounceTimeout(timeoutMs: number): void {
    this.debounceTimeout = timeoutMs;
    // Recreate the debounced function with the new timeout
    this.debouncedHandleFileChangeEvent = debounce((change: FileChange) => {
      this.processPendingChange(change);
    }, this.debounceTimeout);
  }

  /**
   * Update the max concurrent embeddings setting
   */
  setMaxConcurrentEmbeddings(max: number): void {
    this.maxConcurrentEmbeddings = max;
  }
}

// Export singleton instance
export const fileWatcherEmbeddingService =
  FileWatcherEmbeddingService.getInstance();
