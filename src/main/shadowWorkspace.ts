import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import * as os from "os";
import {app} from "electron";
import {exec} from "child_process";
import {promisify} from "util";

const execAsync = promisify(exec);

export interface ShadowWorkspaceInfo {
  originalPath: string;
  shadowPath: string;
}

class ShadowWorkspaceService {
  private static instance: ShadowWorkspaceService;
  private shadowWorkspaces: Map<string, ShadowWorkspaceInfo> = new Map();
  private shadowBasePath: string;

  private constructor() {
    // Create shadow workspace base directory under user's cache directory
    this.shadowBasePath = path.join(
      os.homedir(),
      ".cache",
      ".shadow_workspace"
    );

    // Ensure the shadow workspace base directory exists
    if (!fs.existsSync(this.shadowBasePath)) {
      fs.mkdirSync(this.shadowBasePath, {recursive: true});
    }

    // Clean up on app exit
    app.on("quit", () => {
      this.cleanupAllShadowWorkspaces();
    });
  }

  static getInstance(): ShadowWorkspaceService {
    if (!ShadowWorkspaceService.instance) {
      ShadowWorkspaceService.instance = new ShadowWorkspaceService();
    }
    return ShadowWorkspaceService.instance;
  }

  /**
   * Creates a shadow workspace for a project
   * @param projectPath Path to the original project
   * @param copyFiles Whether to copy file contents or just structure
   * @returns Information about the created shadow workspace
   */
  async createShadowWorkspace(
    projectPath: string,
    copyFiles: boolean = false
  ): Promise<ShadowWorkspaceInfo> {
    try {
      const rootDirName = path.basename(projectPath);
      const uniqueId = crypto.randomBytes(8).toString("hex");
      const timestamp = Date.now();
      const shadowDirName = `${rootDirName}-${uniqueId}-${timestamp}`;
      const shadowPath = path.join(this.shadowBasePath, shadowDirName);

      // Create the shadow directory
      fs.mkdirSync(shadowPath, {recursive: true});

      if (copyFiles) {
        // Copy the entire directory including files
        await this.copyDirectory(projectPath, shadowPath);
      } else {
        // Copy only the directory structure (without content)
        await this.copyDirectoryStructure(projectPath, shadowPath);
      }

      const workspaceInfo: ShadowWorkspaceInfo = {
        originalPath: projectPath,
        shadowPath: shadowPath,
      };

      // Store the workspace info
      this.shadowWorkspaces.set(projectPath, workspaceInfo);

      console.log(`Created shadow workspace: ${shadowPath} for ${projectPath}`);
      return workspaceInfo;
    } catch (error) {
      console.error(
        `Error creating shadow workspace for ${projectPath}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Copy directory structure from source to destination
   * This only copies the directory structure, not file contents
   */
  private async copyDirectoryStructure(
    source: string,
    destination: string
  ): Promise<void> {
    try {
      // Use system commands for fast copying of directory structure
      if (process.platform === "win32") {
        // Windows - use robocopy with empty file filter
        await execAsync(
          `robocopy "${source}" "${destination}" /e /xf * /r:0 /w:0`
        );
      } else {
        // Unix-based systems - use find and mkdir
        await execAsync(
          `find "${source}" -type d -exec mkdir -p "${destination}/{}" \\;`.replace(
            `"${destination}/${source}"`,
            `"${destination}"`
          )
        );
      }
    } catch (error) {
      console.error("Error copying directory structure:", error);
      // Fall back to manual directory structure creation
      await this.manualDirectoryStructureCopy(source, destination);
    }
  }

  /**
   * Copy the entire directory including file contents
   */
  private async copyDirectory(
    source: string,
    destination: string
  ): Promise<void> {
    try {
      // Use system commands for fast copying
      if (process.platform === "win32") {
        // Windows - use xcopy
        await execAsync(`xcopy "${source}" "${destination}" /E /I /H /Y`);
      } else {
        // Unix-based systems - use cp
        await execAsync(`cp -R "${source}/." "${destination}"`);
      }
    } catch (error) {
      console.error("Error copying directory:", error);
      // Fall back to manual directory copy
      await this.manualDirectoryCopy(source, destination);
    }
  }

  /**
   * Manual fallback method to copy directory structure
   */
  private async manualDirectoryStructureCopy(
    source: string,
    destination: string
  ): Promise<void> {
    const entries = fs.readdirSync(source, {withFileTypes: true});

    for (const entry of entries) {
      const srcPath = path.join(source, entry.name);
      const destPath = path.join(destination, entry.name);

      if (entry.isDirectory()) {
        fs.mkdirSync(destPath, {recursive: true});
        await this.manualDirectoryStructureCopy(srcPath, destPath);
      }
      // Skip files - we're only copying the directory structure
    }
  }

  /**
   * Manual fallback method to copy directory with files
   */
  private async manualDirectoryCopy(
    source: string,
    destination: string
  ): Promise<void> {
    const entries = fs.readdirSync(source, {withFileTypes: true});

    for (const entry of entries) {
      const srcPath = path.join(source, entry.name);
      const destPath = path.join(destination, entry.name);

      if (entry.isDirectory()) {
        fs.mkdirSync(destPath, {recursive: true});
        await this.manualDirectoryCopy(srcPath, destPath);
      } else {
        await this.copyFile(srcPath, destPath);
      }
    }
  }

  /**
   * Copy a single file
   */
  private async copyFile(source: string, destination: string): Promise<void> {
    try {
      fs.copyFileSync(source, destination);
    } catch (error) {
      console.error(`Error copying file ${source} to ${destination}:`, error);
      throw error;
    }
  }

  /**
   * Copy a specific file to the shadow workspace
   * @param originalFilePath Path to the original file
   * @returns Path to the file in the shadow workspace
   */
  async copyFileToShadowWorkspace(
    originalFilePath: string
  ): Promise<string | null> {
    try {
      // Get the directory of the file
      const dirPath = path.dirname(originalFilePath);

      // Find the workspace info for this path
      const workspaceInfo = this.findWorkspaceForPath(dirPath);

      if (!workspaceInfo) {
        console.error(
          `No shadow workspace found for file: ${originalFilePath}`
        );
        return null;
      }

      // Compute the relative path of the file within the original project
      const relativePath = path.relative(
        workspaceInfo.originalPath,
        originalFilePath
      );

      // Compute the destination path in the shadow workspace
      const shadowFilePath = path.join(workspaceInfo.shadowPath, relativePath);

      // Ensure the directory exists
      const shadowDir = path.dirname(shadowFilePath);
      if (!fs.existsSync(shadowDir)) {
        fs.mkdirSync(shadowDir, {recursive: true});
      }

      // Copy the file
      await this.copyFile(originalFilePath, shadowFilePath);

      return shadowFilePath;
    } catch (error) {
      console.error(
        `Error copying file to shadow workspace: ${originalFilePath}`,
        error
      );
      return null;
    }
  }

  /**
   * Find the workspace info for a path
   * @param filePath Path to check
   * @returns Shadow workspace info for the path
   */
  private findWorkspaceForPath(filePath: string): ShadowWorkspaceInfo | null {
    // Check if the path is directly a workspace
    if (this.shadowWorkspaces.has(filePath)) {
      return this.shadowWorkspaces.get(filePath)!;
    }

    // Check if the path is inside a workspace
    for (const [originalPath, info] of this.shadowWorkspaces.entries()) {
      if (filePath.startsWith(originalPath)) {
        return info;
      }
    }

    return null;
  }

  /**
   * Get the shadow workspace path for a project
   * @param originalPath Original project path
   * @returns Shadow workspace path or null if not found
   */
  getShadowWorkspace(originalPath: string): ShadowWorkspaceInfo | null {
    return this.shadowWorkspaces.get(originalPath) || null;
  }

  /**
   * Clean up a specific shadow workspace
   * @param originalPath Original project path
   */
  async cleanupShadowWorkspace(originalPath: string): Promise<boolean> {
    try {
      const workspaceInfo = this.shadowWorkspaces.get(originalPath);
      if (workspaceInfo) {
        await this.deleteDirectory(workspaceInfo.shadowPath);
        this.shadowWorkspaces.delete(originalPath);
        console.log(`Cleaned up shadow workspace for ${originalPath}`);
        return true;
      }
      return false;
    } catch (error) {
      console.error(
        `Error cleaning up shadow workspace for ${originalPath}:`,
        error
      );
      return false;
    }
  }

  /**
   * Clean up all shadow workspaces
   */
  private async cleanupAllShadowWorkspaces(): Promise<void> {
    const workspaces = Array.from(this.shadowWorkspaces.keys());
    for (const workspace of workspaces) {
      await this.cleanupShadowWorkspace(workspace);
    }
  }

  /**
   * Delete a directory recursively
   */
  private async deleteDirectory(dirPath: string): Promise<void> {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, {recursive: true, force: true});
    }
  }
}

// Export singleton instance
export const shadowWorkspaceService = ShadowWorkspaceService.getInstance();
