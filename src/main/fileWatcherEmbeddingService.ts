import {
  fileWatcherService,
  FileChangeType,
  FileChange,
  ProjectEvent,
  ProjectEventType,
} from "./fileWatcher";
import {handleFileChange, checkFileExists} from "./ragService";
import * as path from "path";
import {
  TEMPORARY_USER_ID,
  EMBEDDABLE_FILE_EXTENSIONS,
  IGNORED_DIRECTORIES,
  getEmbeddingLanguage,
  EMBEDDING_LANGUAGE_MAP,
} from "../lib/constants";
import {ipcMain} from "electron";
import * as fs from "fs/promises";

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
  private fileExtensions = new Set<string>();
  private ignoredDirectories = new Set<string>();

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
    // Initialize sets from imported constants
    this.fileExtensions = new Set(EMBEDDABLE_FILE_EXTENSIONS);
    this.ignoredDirectories = new Set(IGNORED_DIRECTORIES);

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

    // Listen for internal file change events from fileWatcherService
    fileWatcherService.on("file:change", (change: FileChange) => {
      console.log(
        `[FileWatcherEmbeddingService] Received internal file change event: ${change.path}`
      );
      // Use debounced function to handle file changes
      this.debouncedHandleFileChangeEvent(change);
    });

    // Listen for project open events
    fileWatcherService.on("project:open", (event: ProjectEvent) => {
      console.log(
        `[FileWatcherEmbeddingService] Received project:open event for ${event.path}`
      );

      // Add the folder to watched paths
      this.watchPathForEmbedding(event.path)
        .then(() => {
          // Scan and embed files
          this.scanAndEmbedDirectory(event.path);
        })
        .catch((error) => {
          console.error(
            `[FileWatcherEmbeddingService] Error processing project:open event: ${error}`
          );
        });
    });

    // Also listen for file saves from the editor to trigger embedding updates
    // ipcMain.handle(
    //   "file:save",
    //   async (_, filePath: string, content: string) => {
    //     // After the file is saved, process it as a change for embedding
    //     this.debouncedHandleFileChangeEvent({
    //       path: filePath,
    //       type: FileChangeType.UPDATED,
    //     });

    //     // Let the original handler continue (don't return anything here)
    //     return;
    //   }
    // );
  }

  // Debounced version of handleFileChangeEvent
  private debouncedHandleFileChangeEvent = debounce((change: FileChange) => {
    this.processPendingChange(change);
  }, this.debounceTimeout);

  // Public method that can be called directly from other services
  public handleFileChange(
    filePath: string,
    changeType: FileChangeType = FileChangeType.UPDATED
  ) {
    this.debouncedHandleFileChangeEvent({
      path: filePath,
      type: changeType,
    });
  }

  // Check if a file path should be ignored for embedding
  private shouldIgnorePath(filePath: string): boolean {
    // Check if the file is in an ignored directory
    const pathParts = filePath.split(path.sep);

    for (const dir of this.ignoredDirectories) {
      if (pathParts.includes(dir)) {
        console.log(
          `[FileWatcherEmbeddingService] Ignoring file in excluded directory: ${filePath}`
        );
        return true;
      }
    }

    // Check if the file extension is not in our list
    const ext = path.extname(filePath).toLowerCase();
    if (!this.fileExtensions.has(ext)) {
      return true;
    }

    return false;
  }

  private processPendingChange(change: FileChange) {
    const {path: filePath, type} = change;

    // Skip if the file should be ignored
    if (this.shouldIgnorePath(filePath)) {
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
   * Recursively scan and embed files in a directory
   * @param dirPath Directory to scan
   */
  public async scanAndEmbedDirectory(dirPath: string): Promise<void> {
    try {
      console.log(
        `[FileWatcherEmbeddingService] Scanning directory for indexing: ${dirPath}`
      );

      // Get all files in the directory
      const entries = await fs.readdir(dirPath, {withFileTypes: true});

      // Process each entry
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // Skip ignored directories
          if (this.ignoredDirectories.has(entry.name)) {
            console.log(
              `[FileWatcherEmbeddingService] Skipping ignored directory: ${entry.name}`
            );
            continue;
          }

          // Recursively scan subdirectories
          await this.scanAndEmbedDirectory(fullPath);
        } else if (entry.isFile()) {
          // Check if the file has an embeddable extension
          const ext = path.extname(fullPath).toLowerCase();
          if (this.fileExtensions.has(ext)) {
            // Check if the file is already indexed
            const fileExists = await checkFileExists({filePath: fullPath});

            if (!fileExists.exists) {
              // New file that hasn't been indexed before
              console.log(
                `[FileWatcherEmbeddingService] Embedding new file: ${fullPath}`
              );
              await this.processFileChange(fullPath, FileChangeType.ADDED);
            } else {
              // File exists - check for changes and update if needed
              console.log(
                `[FileWatcherEmbeddingService] Checking existing file for changes: ${fullPath}`
              );
              await this.processFileChange(fullPath, FileChangeType.UPDATED);
            }
          }
        }
      }

      console.log(
        `[FileWatcherEmbeddingService] Completed scanning directory: ${dirPath}`
      );
    } catch (error) {
      console.error(
        `[FileWatcherEmbeddingService] Error scanning directory ${dirPath}:`,
        error
      );
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
      const watchResult = fileWatcherService.watchDirectoryForService(
        normalizedPath,
        "embedding-service"
      );
      console.log(
        `[FileWatcherEmbeddingService] Directory ${normalizedPath} watch result: ${watchResult}`
      );

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

  /**
   * Add a directory to the ignored list
   */
  addIgnoredDirectory(dirName: string): void {
    this.ignoredDirectories.add(dirName);
  }

  /**
   * Remove a directory from the ignored list
   */
  removeIgnoredDirectory(dirName: string): boolean {
    return this.ignoredDirectories.delete(dirName);
  }

  /**
   * Get the current list of ignored directories
   */
  getIgnoredDirectories(): string[] {
    return Array.from(this.ignoredDirectories);
  }

  /**
   * Add a file extension to the embeddable list
   */
  addFileExtension(extension: string): void {
    // Ensure the extension starts with a dot
    const ext = extension.startsWith(".") ? extension : `.${extension}`;
    this.fileExtensions.add(ext.toLowerCase());
  }

  /**
   * Remove a file extension from the embeddable list
   */
  removeFileExtension(extension: string): boolean {
    const ext = extension.startsWith(".") ? extension : `.${extension}`;
    return this.fileExtensions.delete(ext.toLowerCase());
  }

  /**
   * Get the current list of embeddable file extensions
   */
  getFileExtensions(): string[] {
    return Array.from(this.fileExtensions);
  }
}

// Export singleton instance
export const fileWatcherEmbeddingService =
  FileWatcherEmbeddingService.getInstance();
