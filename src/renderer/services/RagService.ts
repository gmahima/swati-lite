import {EventEmitter} from "events";

interface RagServiceEvents {
  on(event: "indexing-start", listener: (filePath: string) => void): this;
  on(event: "indexing-complete", listener: (result: any) => void): this;
  on(event: "indexing-error", listener: (error: any) => void): this;
  on(event: "query-start", listener: (query: string) => void): this;
  on(event: "query-complete", listener: (result: any) => void): this;
  on(event: "query-error", listener: (error: any) => void): this;
  emit(event: "indexing-start", filePath: string): boolean;
  emit(event: "indexing-complete", result: any): boolean;
  emit(event: "indexing-error", error: any): boolean;
  emit(event: "query-start", query: string): boolean;
  emit(event: "query-complete", result: any): boolean;
  emit(event: "query-error", error: any): boolean;
}

class RagService extends EventEmitter implements RagServiceEvents {
  private static instance: RagService;
  private watchedPaths: string[] = [];

  private constructor() {
    super();
    this.initWatchedPaths();
  }

  static getInstance(): RagService {
    if (!RagService.instance) {
      RagService.instance = new RagService();
    }
    return RagService.instance;
  }

  private async initWatchedPaths() {
    try {
      this.watchedPaths = await window.electronAPI.ragGetWatchedPaths();
    } catch (error) {
      console.error("Failed to initialize watched paths:", error);
      this.watchedPaths = [];
    }
  }

  /**
   * Get the current list of watched paths
   */
  getWatchedPaths(): string[] {
    return [...this.watchedPaths];
  }

  /**
   * Index a file in the RAG system
   */
  async indexFile(filePath: string): Promise<any> {
    try {
      this.emit("indexing-start", filePath);
      const result = await window.electronAPI.ragIndexFile(filePath);
      this.emit("indexing-complete", result);
      return result;
    } catch (error) {
      this.emit("indexing-error", error);
      throw error;
    }
  }

  /**
   * Query the RAG system
   */
  async query(query: string, filePath?: string): Promise<any> {
    try {
      this.emit("query-start", query);
      const result = await window.electronAPI.ragQuery(query, filePath);
      this.emit("query-complete", result);
      return result;
    } catch (error) {
      this.emit("query-error", error);
      throw error;
    }
  }

  /**
   * Start watching a directory for file changes
   */
  async watchDirectory(dirPath: string): Promise<boolean> {
    try {
      const result = await window.electronAPI.ragToggleWatchPath(dirPath, true);
      if (result && !this.watchedPaths.includes(dirPath)) {
        this.watchedPaths.push(dirPath);
      }
      return result;
    } catch (error) {
      console.error("Error watching directory:", error);
      return false;
    }
  }

  /**
   * Stop watching a directory
   */
  async unwatchDirectory(dirPath: string): Promise<boolean> {
    try {
      const result = await window.electronAPI.ragToggleWatchPath(
        dirPath,
        false
      );
      if (result) {
        this.watchedPaths = this.watchedPaths.filter(
          (path) => path !== dirPath
        );
      }
      return result;
    } catch (error) {
      console.error("Error unwatching directory:", error);
      return false;
    }
  }

  /**
   * Check if a path is being watched
   */
  isWatched(dirPath: string): boolean {
    return this.watchedPaths.some((path) => dirPath.startsWith(path));
  }
}

// TypeScript declaration for window.electronAPI
declare global {
  interface Window {
    // electronAPI properties are already defined in electron.d.ts
  }
}

export default RagService.getInstance();
