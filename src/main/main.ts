import { app, BrowserWindow, ipcMain, dialog, session } from 'electron';
import 'dotenv/config';
import * as path from 'node:path';
import * as fs from 'fs';
import Store from 'electron-store';
import * as crypto from 'crypto';
import { ChatGroq } from "@langchain/groq";
import {
  checkFileExists,
  embedFile,
  generateRagResponse,
  handleFileChange,
} from "./ragService";
// Import services from the centralized services file to avoid circular dependencies
import {
  fileWatcherService,
  fileWatcherEmbeddingService,
  shadowWorkspaceService,
  FileChangeType,
  initializeServices,
} from "./services";

// Initialize services early on
initializeServices();

// Declare types for webpack constants
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_WEBPACK_ENTRY: string;

const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Import specific Store types
import {Schema} from "electron-store";

// Define schema for electron-store
const schema: Schema<any> = {
  recentProjects: {
    type: "array",
    items: {
      type: "object",
      properties: {
        path: {type: "string"},
        name: {type: "string"},
        lastOpened: {type: "number"},
      },
      required: ["path", "name", "lastOpened"],
    },
    default: [],
  },
  expandedDirs: {
    type: "object",
    additionalProperties: {
      type: "array",
      items: {type: "string"},
      default: [],
    },
    default: {},
  },
  workspaceRoot: {
    type: "string",
    default: "",
  },
};

// Initialize electron-store with schema
const store = new Store({schema});

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

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require("electron-squirrel-startup")) {
  app.quit();
}

// Helper function to generate a secure nonce for CSP
// This creates a truly random nonce every time it's called
const generateNonce = () => {
  return crypto.randomBytes(32).toString("base64"); // Increased from 16 to 32 bytes for extra security
};

// Store for window-specific nonces
const windowNonces = new Map();


// Helper function to add a project to recent projects
const addToRecentProjects = (projectPath: string) => {
  const projectName = path.basename(projectPath);
  const recentProjects = store.get("recentProjects") || [];

  // Remove if already exists
  const filteredProjects = recentProjects.filter(
    (p: any) => p.path !== projectPath
  );

  // Add to front of array
  filteredProjects.unshift({
    path: projectPath,
    name: projectName,
    lastOpened: Date.now(),
  });

  // Limit to 10 recent projects
  const limitedProjects = filteredProjects.slice(0, 10);

  store.set("recentProjects", limitedProjects);
  return limitedProjects;
};

const createWindow = () => {
  // Generate unique secure nonces for this window session
  const scriptNonce = generateNonce();
  const styleNonce = generateNonce();

  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      nodeIntegration: false,
      contextIsolation: true, // Keep this true for security
      sandbox: true, // Keep sandbox enabled for better security
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  // Store nonces for this window instance
  windowNonces.set(mainWindow.id, {
    scriptNonce,
    styleNonce,
  });

  // Make nonces available to the preload script
  mainWindow.webContents.executeJavaScript(`
    window.cspNoncesValues = {
      scriptNonce: "${scriptNonce}",
      styleNonce: "${styleNonce}"
    };
  `);

  // Determine if we're in development or production
  // Allow forcing production mode via command line argument for testing
  const forceProduction = process.argv.includes("--force-production-csp");
  const isDevelopment =
    !forceProduction &&
    (process.env.NODE_ENV === "development" || !app.isPackaged);

  // Set Content Security Policy with environment-specific settings
  session.defaultSession.webRequest.onHeadersReceived(
    (details: any, callback: any) => {
      // Only apply CSP to our app's pages
      if (details.url.indexOf(MAIN_WINDOW_WEBPACK_ENTRY) !== -1) {
        let csp;

        if (isDevelopment) {
          // Relaxed CSP for development
          csp = [
            // Allow scripts from self, jsdelivr CDN, and with unsafe-inline/unsafe-eval
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net;",
            // Allow workers from blob (needed by Monaco)
            "worker-src 'self' blob:;",
            // Allow styles from self, jsdelivr CDN, and with unsafe-inline
            "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;",
            // Other defaults
            "font-src 'self' https://cdn.jsdelivr.net;",
            "img-src 'self' data: https://cdn.jsdelivr.net;",
            "default-src 'self'",
          ].join(" ");

          console.log(
            "Using development CSP with unsafe-inline and unsafe-eval"
          );
        } else {
          // Strict CSP for production with nonces
          csp = [
            // Allow scripts from self and with correct nonce
            `script-src 'self' 'nonce-${scriptNonce}';`,
            // Allow workers from blob (needed by Monaco)
            `worker-src 'self' blob:;`,
            // Allow styles from self and with correct nonce
            `style-src 'self' 'nonce-${styleNonce}';`,
            // Other defaults
            `font-src 'self';`,
            `img-src 'self' data:;`,
            `default-src 'self'`,
          ].join(" ");

          console.log("Using production CSP with nonces");
        }

        callback({
          responseHeaders: {
            ...details.responseHeaders,
            "Content-Security-Policy": [csp],
          },
        });
      } else {
        callback({responseHeaders: details.responseHeaders});
      }
    }
  );

  // and load the index.html of the app.
  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  // Clean up when window is closed
  mainWindow.on("closed", () => {
    windowNonces.delete(mainWindow.id);
  });

  // Open the DevTools during development to help debug issues
  mainWindow.webContents.openDevTools();

  // Expose nonces to the preload script
  ipcMain.handle("get-csp-nonces", (event: any) => {
    // Verify the sender to ensure security
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && windowNonces.has(win.id)) {
      return windowNonces.get(win.id);
    }
    // If we can't identify the window, generate new nonces
    return {
      scriptNonce: generateNonce(),
      styleNonce: generateNonce(),
    };
  });
};

// async function streamChat(messages, onToken) {
//   const result = await streamText({
//     model: groq('llama3-8b-8192'),
//     messages
//   });
//   for await (const delta of result.textStream) {
//     // Each delta is a token/chunk
//     onToken(delta);
//   }
// }

// Read directory contents
ipcMain.handle("directory:read", async (event: any, dirPath: string) => {
  try {
    return await readDirectoryRecursive(dirPath);
  } catch (error) {
    console.error("Error reading directory:", error);
    throw error;
  }
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set up IPC handlers for file operations

  // Get workspace root
  ipcMain.handle("app:getWorkspaceRoot", () => {
    const root = store.get("workspaceRoot");
    console.log("Getting workspace root from store:", root);
    console.log("Store contents:", store.store);
    return root || "";
  });

  // Open folder dialog
  ipcMain.handle("dialog:openFolder", async () => {
    const {canceled, filePaths} = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });

    if (!canceled && filePaths.length > 0) {
      const folderPath = filePaths[0];
      console.log("About to save workspace root:", folderPath);
      // Save the workspace root
      store.set("workspaceRoot", folderPath);
      console.log("Workspace root saved. Current store contents:", store.store);
      console.log(
        "Verifying saved workspace root:",
        store.get("workspaceRoot")
      );

      // Create shadow workspace for this project
      try {
        // We can optionally copy files too if needed with copyFiles: true
        const shadowInfo = await shadowWorkspaceService.createShadowWorkspace(
          folderPath
        );
        console.log(
          `Created shadow workspace: ${shadowInfo.shadowPath} for ${folderPath}`
        );
      } catch (error) {
        console.error(
          `Error creating shadow workspace for ${folderPath}:`,
          error
        );
        // Continue even if shadow workspace creation fails - it's not critical
      }

      // Emit project open event to trigger embedding via the event system
      fileWatcherService.notifyProjectOpen(folderPath);

      addToRecentProjects(folderPath);
      return {
        path: folderPath,
        name: path.basename(folderPath),
      };
    }

    return null;
  });

  // Open file dialog
  ipcMain.handle("dialog:openFile", async () => {
    const {canceled, filePaths} = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{name: "All Files", extensions: ["*"]}],
    });

    if (!canceled && filePaths.length > 0) {
      const filePath = filePaths[0];
      addToRecentProjects(filePath);
      return {
        path: filePath,
        name: path.basename(filePath),
      };
    }

    return null;
  });

  // Get recent projects
  ipcMain.handle("app:getRecentProjects", () => {
    return store.get("recentProjects") || [];
  });

  // Handle opening a recent project to ensure indexing
  ipcMain.handle("app:openRecentProject", async (_, projectPath: string) => {
    try {
      // Verify path exists
      const pathStats = await fs.promises.stat(projectPath);

      if (pathStats.isDirectory()) {
        // Create shadow workspace for this project
        try {
          // We can optionally copy files too if needed with copyFiles: true
          const shadowInfo = await shadowWorkspaceService.createShadowWorkspace(
            projectPath
          );
          console.log(
            `Created shadow workspace: ${shadowInfo.shadowPath} for ${projectPath}`
          );
        } catch (error) {
          console.error(
            `Error creating shadow workspace for ${projectPath}:`,
            error
          );
          // Continue even if shadow workspace creation fails - it's not critical
        }

        // Emit project open event for recent project to trigger embedding via the event system
        fileWatcherService.notifyProjectOpen(projectPath);

        // Update the workspace root
        store.set("workspaceRoot", projectPath);

        // Refresh recent projects
        addToRecentProjects(projectPath);

        return {
          success: true,
          path: projectPath,
          name: path.basename(projectPath),
        };
      } else if (pathStats.isFile()) {
        // Just add to recent projects, no need to index directory
        addToRecentProjects(projectPath);

        return {
          success: true,
          path: projectPath,
          name: path.basename(projectPath),
        };
      }
    } catch (error) {
      console.error(`Error opening recent project ${projectPath}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Handle RAG queries
  ipcMain.on("chat:send", async (event: any, payload: any) => {
    try {
      console.log("Received chat request in main process:", payload);

      const {message, fileContext} = payload;

      // Check if we have file context with a file path, use RAG if available
      if (fileContext && fileContext.filePath) {
        const filePath = fileContext.filePath;
        console.log(`Using RAG for file ${filePath}`);

        // Generate RAG response using the file path for filtering
        // We don't need to trigger embedding here since the file watcher handles that
        const ragResponse = await generateRagResponse({
          query: message.content,
          filePath,
        });

        // Send response back to renderer
        event.sender.send("chat:response", ragResponse.response);
        return;
      }

      // If no file context, use the regular chat model
      const model = new ChatGroq({
        model: "llama3-8b-8192",
        temperature: 0.7,
        maxTokens: 1000,
        apiKey: GROQ_API_KEY,
      });

      // For regular flow, just use the message directly without any file context
      console.log("Sending to model:", message);
      const response = await model.invoke([message]);

      console.log("response============================================");
      event.sender.send("chat:response", response.content);
      console.log("response.content", response.content);
      console.log("sent response============================================");
    } catch (error: unknown) {
      console.error("Error in chat:send:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      event.sender.send("chat:response", `Error: ${errorMessage}`);
    }
  });

  // Get expanded directories for a root path
  ipcMain.handle(
    "directory:getExpandedDirs",
    async (event: any, rootPath: string) => {
      try {
        const expandedDirs = store.get(`expandedDirs.${rootPath}`) || [];
        return expandedDirs;
      } catch (error) {
        console.error("Error getting expanded directories:", error);
        return [];
      }
    }
  );

  // Save expanded directories for a root path
  ipcMain.handle(
    "directory:saveExpandedDirs",
    async (event: any, rootPath: string, expandedDirs: string[]) => {
      try {
        store.set(`expandedDirs.${rootPath}`, expandedDirs);
        return true;
      } catch (error) {
        console.error("Error saving expanded directories:", error);
        return false;
      }
    }
  );

  // Explicit file indexing handler
  ipcMain.handle("rag:indexFile", async (_, filePath) => {
    // Check if file exists in the vector store
    const fileExists = await checkFileExists({filePath});
    if (fileExists.exists) {
      return {success: true, message: "File already indexed"};
    }

    // Use the same file change handler that the watcher uses
    // This ensures consistent behavior and takes advantage of
    // the smart chunking and debouncing
    return await handleFileChange({
      filePath,
      changeType: FileChangeType.ADDED,
    });
  });

  // RAG query handler
  ipcMain.handle("rag:query", async (_, query, filePath) => {
    return await generateRagResponse({query, filePath});
  });

  // Toggle auto-indexing for a directory
  ipcMain.handle("rag:toggleWatchPath", async (_, dirPath, shouldWatch) => {
    if (shouldWatch) {
      return await fileWatcherEmbeddingService.watchPathForEmbedding(dirPath);
    } else {
      return fileWatcherEmbeddingService.unwatchPathForEmbedding(dirPath);
    }
  });

  // Get list of watched paths
  ipcMain.handle("rag:getWatchedPaths", () => {
    return fileWatcherEmbeddingService.getWatchedPaths();
  });

  // Get list of ignored directories
  ipcMain.handle("rag:getIgnoredDirectories", () => {
    return fileWatcherEmbeddingService.getIgnoredDirectories();
  });

  // Add a directory to the ignored list
  ipcMain.handle("rag:addIgnoredDirectory", (_, dirName: string) => {
    fileWatcherEmbeddingService.addIgnoredDirectory(dirName);
    return true;
  });

  // Remove a directory from the ignored list
  ipcMain.handle("rag:removeIgnoredDirectory", (_, dirName: string) => {
    return fileWatcherEmbeddingService.removeIgnoredDirectory(dirName);
  });

  // Shadow workspace IPC handlers
  ipcMain.handle("shadow:getPath", async (_, originalPath: string) => {
    // Use the shadow workspace service's direct path lookup method
    return shadowWorkspaceService.getShadowPath(originalPath);
  });

  // Create shadow workspace
  ipcMain.handle("shadow:cleanup", async (_, originalPath: string) => {
    return await shadowWorkspaceService.cleanupShadowWorkspace(originalPath);
  });

  // Copy a file to the shadow workspace
  ipcMain.handle("shadow:copyFile", async (_, originalFilePath: string) => {
    return await shadowWorkspaceService.copyFileToShadowWorkspace(
      originalFilePath
    );
  });

  createWindow();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

// Add app exit handlers to ensure cleanup of shadow workspaces
app.on("quit", async () => {
  console.log("Application is quitting, cleaning up resources...");

  // Note: The shadowWorkspaceService already has a cleanup handler attached to app.on('quit'),
  // but we're adding this as a backup

  // Get all recent projects and clean up their shadow workspaces
  try {
    const recentProjects = store.get("recentProjects") || [];
    for (const project of recentProjects) {
      try {
        await shadowWorkspaceService.cleanupShadowWorkspace(project.path);
      } catch (error) {
        console.error(
          `Error cleaning up shadow workspace for ${project.path}:`,
          error
        );
      }
    }
    console.log("Shadow workspace cleanup completed on app exit");
  } catch (error) {
    console.error("Error during exit cleanup:", error);
  }
});

// Helper function to recursively scan and embed important files in a directory
// Removed as this functionality has been moved to FileWatcherEmbeddingService
// async function scanAndEmbedDirectory(dirPath: string) { ... }
