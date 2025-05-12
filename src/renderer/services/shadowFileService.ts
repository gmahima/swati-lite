import EventEmitter from "events";

/**
 * Service for managing shadow workspace operations
 * This service provides methods to interact with the shadow workspace from the renderer process
 */
class ShadowFileService extends EventEmitter {
  private static instance: ShadowFileService;

  private constructor() {
    super();
  }

  static getInstance(): ShadowFileService {
    if (!ShadowFileService.instance) {
      ShadowFileService.instance = new ShadowFileService();
    }
    return ShadowFileService.instance;
  }

  /**
   * Get the shadow workspace path for an original path
   * @param originalPath Path in the original workspace
   * @returns Path in the shadow workspace or null if not found
   */
  async getShadowWorkspacePath(originalPath: string): Promise<string | null> {
    try {
      return await window.electronAPI.getShadowWorkspacePath(originalPath);
    } catch (error) {
      console.error("Error getting shadow workspace path:", error);
      return null;
    }
  }

  /**
   * Copy a file to the shadow workspace
   * @param originalFilePath Path to the original file
   * @returns Path to the file in the shadow workspace or null if copy failed
   */
  async copyFileToShadowWorkspace(
    originalFilePath: string
  ): Promise<string | null> {
    try {
      return await window.electronAPI.copyFileToShadowWorkspace(
        originalFilePath
      );
    } catch (error) {
      console.error("Error copying file to shadow workspace:", error);
      return null;
    }
  }

  /**
   * Clean up a shadow workspace
   * @param originalPath Original workspace path
   * @returns Whether cleanup was successful
   */
  async cleanupShadowWorkspace(originalPath: string): Promise<boolean> {
    try {
      return await window.electronAPI.cleanupShadowWorkspace(originalPath);
    } catch (error) {
      console.error("Error cleaning up shadow workspace:", error);
      return false;
    }
  }

  /**
   * Checks if a path has a corresponding shadow workspace
   * @param originalPath Original path to check
   * @returns Whether a shadow workspace exists for the path
   */
  async hasShadowWorkspace(originalPath: string): Promise<boolean> {
    const shadowPath = await this.getShadowWorkspacePath(originalPath);
    return shadowPath !== null;
  }

  /**
   * Get the corresponding shadow path for an original file path
   * This computes the equivalent path in the shadow workspace without checking if it exists
   * @param originalFilePath Original file path
   * @returns Corresponding path in the shadow workspace or null if no shadow workspace exists
   */
  async getCorrespondingShadowPath(
    originalFilePath: string
  ): Promise<string | null> {
    try {
      // Simply delegate to the main process which now handles this correctly
      return await window.electronAPI.getShadowWorkspacePath(originalFilePath);
    } catch (error) {
      console.error("Error getting corresponding shadow path:", error);
      return null;
    }
  }
}

// Export singleton instance
export default ShadowFileService.getInstance();
