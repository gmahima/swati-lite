import {ipcMain} from "electron";
import {fileWatcherService} from "./fileWatcher";
import * as fs from "fs";
import * as path from "path";

// Read directory contents recursively
const readDirectoryRecursive = async (dirPath: string): Promise<any> => {
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
          return readDirectoryRecursive(fullPath);
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
};

// Helper function to determine file language based on extension
const getLanguageFromPath = (filePath: string) => {
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
};

// Read directory contents recursively
ipcMain.handle("directory:read", async (_, dirPath: string) => {
  try {
    return await readDirectoryRecursive(dirPath);
  } catch (error) {
    console.error("Error reading directory:", error);
    throw error;
  }
});

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
    console.error(`Error listing directory ${dirPath}:`, error);
    throw error;
  }
});

// Read file contents
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
    const language = getLanguageFromPath(filePath);
    console.log("File read successfully, language:", language);
    return {content, language};
  } catch (error: unknown) {
    console.error("Error reading file:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: `Error reading file: ${errorMessage}`,
      language: "plaintext",
    };
  }
});

// Save file
ipcMain.handle("file:save", async (_, filePath: string, content: string) => {
  try {
    fs.writeFileSync(filePath, content, "utf-8");
    return true;
  } catch (error) {
    console.error("Error saving file:", error);
    return false;
  }
});

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
