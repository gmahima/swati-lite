// services.ts - This file initializes all services in the correct order
// to avoid circular dependency issues

// First, import and export the FileWatcher service
import {fileWatcherService, FileChangeType, FileChange} from "./fileWatcher";

// Then, import and export the FileWatcherEmbeddingService
import {fileWatcherEmbeddingService} from "./fileWatcherEmbeddingService";

// Import the shadow workspace service
import {shadowWorkspaceService} from "./shadowWorkspace";

// Export everything for convenience
export {
  fileWatcherService,
  fileWatcherEmbeddingService,
  shadowWorkspaceService,
  FileChangeType,
  FileChange,
};

// This function should be called during app initialization
export function initializeServices() {
  // Log that services are being initialized
  console.log("[Services] Initializing services...");

  // Any setup code that needs both services can go here
  console.log(
    "[Services] FileWatcher, FileWatcherEmbeddingService, and ShadowWorkspaceService initialized"
  );

  return {
    fileWatcherService,
    fileWatcherEmbeddingService,
    shadowWorkspaceService,
  };
}
