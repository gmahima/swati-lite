const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const path = require('node:path');
const fs = require('fs');
const Store = require('electron-store');
const crypto = require('crypto');

// Initialize electron-store for persistent data
const store = new Store();

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

// Helper function to generate a secure nonce for CSP
// This creates a truly random nonce every time it's called
const generateNonce = () => {
  return crypto.randomBytes(32).toString('base64'); // Increased from 16 to 32 bytes for extra security
};

// Store for window-specific nonces
const windowNonces = new Map();

// Helper function to determine file language based on extension
const getLanguageFromPath = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  const languageMap = {
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.html': 'html',
    '.css': 'css',
    '.json': 'json',
    '.md': 'markdown',
    '.py': 'python',
    '.java': 'java',
    '.c': 'c',
    '.cpp': 'cpp',
    '.go': 'go',
    '.rs': 'rust',
    '.rb': 'ruby',
    '.php': 'php',
    '.sh': 'shell',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.xml': 'xml',
  };
  
  return languageMap[ext] || 'plaintext';
};

// Helper function to add a project to recent projects
const addToRecentProjects = (projectPath) => {
  const projectName = path.basename(projectPath);
  const recentProjects = store.get('recentProjects') || [];
  
  // Remove if already exists
  const filteredProjects = recentProjects.filter(p => p.path !== projectPath);
  
  // Add to front of array
  filteredProjects.unshift({
    path: projectPath,
    name: projectName,
    lastOpened: Date.now()
  });
  
  // Limit to 10 recent projects
  const limitedProjects = filteredProjects.slice(0, 10);
  
  store.set('recentProjects', limitedProjects);
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
    styleNonce
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
  const forceProduction = process.argv.includes('--force-production-csp');
  const isDevelopment = !forceProduction && (process.env.NODE_ENV === 'development' || !app.isPackaged);

  // Set Content Security Policy with environment-specific settings
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
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
          "default-src 'self'"
        ].join(' ');
        
        console.log('Using development CSP with unsafe-inline and unsafe-eval');
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
          `default-src 'self'`
        ].join(' ');
        
        console.log('Using production CSP with nonces');
      }
      
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [csp]
        }
      });
    } else {
      callback({ responseHeaders: details.responseHeaders });
    }
  });

  // and load the index.html of the app.
  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  // Clean up when window is closed
  mainWindow.on('closed', () => {
    windowNonces.delete(mainWindow.id);
  });

  // Open the DevTools during development to help debug issues
  mainWindow.webContents.openDevTools();
  
  // Expose nonces to the preload script
  ipcMain.handle('get-csp-nonces', (event) => {
    // Verify the sender to ensure security
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && windowNonces.has(win.id)) {
      return windowNonces.get(win.id);
    }
    // If we can't identify the window, generate new nonces
    return {
      scriptNonce: generateNonce(),
      styleNonce: generateNonce()
    };
  });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set up IPC handlers for file operations
  
  // Open folder dialog
  ipcMain.handle('dialog:openFolder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory']
    });
    
    if (!canceled && filePaths.length > 0) {
      const folderPath = filePaths[0];
      addToRecentProjects(folderPath);
      return {
        path: folderPath,
        name: path.basename(folderPath)
      };
    }
    
    return null;
  });
  
  // Open file dialog
  ipcMain.handle('dialog:openFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    
    if (!canceled && filePaths.length > 0) {
      const filePath = filePaths[0];
      addToRecentProjects(filePath);
      return {
        path: filePath,
        name: path.basename(filePath)
      };
    }
    
    return null;
  });
  
  // Read file contents
  ipcMain.handle('file:read', async (event, filePath) => {
    try {
      console.log('Reading file:', filePath);
      if (!fs.existsSync(filePath)) {
        console.error('File does not exist:', filePath);
        return { content: `Error: File does not exist: ${filePath}`, language: 'plaintext' };
      }
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        console.log('Path is a directory, not a file:', filePath);
        return { content: `Selected path is a directory: ${filePath}`, language: 'plaintext' };
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      const language = getLanguageFromPath(filePath);
      console.log('File read successfully, language:', language);
      return { content, language };
    } catch (error) {
      console.error('Error reading file:', error);
      return { content: `Error reading file: ${error.message}`, language: 'plaintext' };
    }
  });
  
  // Save file
  ipcMain.handle('file:save', async (event, filePath, content) => {
    try {
      fs.writeFileSync(filePath, content, 'utf-8');
      return true;
    } catch (error) {
      console.error('Error saving file:', error);
      return false;
    }
  });
  
  // Get recent projects
  ipcMain.handle('app:getRecentProjects', () => {
    return store.get('recentProjects') || [];
  });
  
  createWindow();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
