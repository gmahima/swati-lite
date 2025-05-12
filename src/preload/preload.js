// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

const { contextBridge, ipcRenderer } = require('electron');

// Do NOT set sandbox options here - they should be in the main process BrowserWindow config

// Expose the Electron API to the renderer process
contextBridge.exposeInMainWorld("electronAPI", {
  openFolder: () => ipcRenderer.invoke("dialog:openFolder"),
  openFile: () => ipcRenderer.invoke("dialog:openFile"),
  readFile: (path) => ipcRenderer.invoke("file:read", path),
  saveFile: (path, content) => ipcRenderer.invoke("file:save", path, content),
  createFile: (path) => ipcRenderer.invoke("file:create", path),
  createDirectory: (path) => ipcRenderer.invoke("directory:create", path),
  getRecentProjects: () => ipcRenderer.invoke("app:getRecentProjects"),
  openRecentProject: (path) =>
    ipcRenderer.invoke("app:openRecentProject", path),
  getCspNonces: () => ipcRenderer.invoke("get-csp-nonces"),
  // chat: (messages) => ipcRenderer.invoke('chat:send', messages),
  readDirectory: (path) => ipcRenderer.invoke("directory:read", path),
  getStats: (path) => ipcRenderer.invoke("file:getStats", path),
  getExpandedDirs: (rootPath) =>
    ipcRenderer.invoke("directory:getExpandedDirs", rootPath),
  saveExpandedDirs: (rootPath, expandedDirs) =>
    ipcRenderer.invoke("directory:saveExpandedDirs", rootPath, expandedDirs),
  getWorkspaceRoot: () => ipcRenderer.invoke("app:getWorkspaceRoot"),
  // RAG features
  ragIndexFile: (filePath) => ipcRenderer.invoke("rag:indexFile", filePath),
  ragQuery: (query, filePath) =>
    ipcRenderer.invoke("rag:query", query, filePath),
  ragToggleWatchPath: (dirPath, shouldWatch) =>
    ipcRenderer.invoke("rag:toggleWatchPath", dirPath, shouldWatch),
  ragGetWatchedPaths: () => ipcRenderer.invoke("rag:getWatchedPaths"),
  // Shadow workspace features
  getShadowWorkspacePath: (originalPath) =>
    ipcRenderer.invoke("shadow:getPath", originalPath),
  cleanupShadowWorkspace: (originalPath) =>
    ipcRenderer.invoke("shadow:cleanup", originalPath),
  copyFileToShadowWorkspace: (originalFilePath) =>
    ipcRenderer.invoke("shadow:copyFile", originalFilePath),
  // Shadow file write tools
  writeToShadowFile: (filePath, content) =>
    ipcRenderer.invoke("shadow:writeToFile", filePath, content),
  appendToShadowFile: (filePath, contentToAppend) =>
    ipcRenderer.invoke("shadow:appendToFile", filePath, contentToAppend),
  // IPC for events
  ipcRenderer: {
    on: (channel, listener) => ipcRenderer.on(channel, listener),
    once: (channel, listener) => ipcRenderer.once(channel, listener),
    send: (channel, ...args) => ipcRenderer.send(channel, ...args),
    removeListener: (channel, listener) =>
      ipcRenderer.removeListener(channel, listener),
  },
});

// When this preload script runs, get nonces from window object
// Note: these should have been injected by the main process before page load
contextBridge.exposeInMainWorld('cspNonces', {
  get scriptNonce() {
    return window.cspNoncesValues?.scriptNonce || '';
  },
  get styleNonce() {
    return window.cspNoncesValues?.styleNonce || '';
  }
});

// Expose console for debugging
contextBridge.exposeInMainWorld('electronConsole', {
  log: (...args) => console.log(...args),
  error: (...args) => console.error(...args),
});

// Add script to document to apply nonces to dynamically created elements
window.addEventListener('DOMContentLoaded', () => {
  if (window.cspNoncesValues) {
    const { scriptNonce, styleNonce } = window.cspNoncesValues;
    
    const applyNoncesToElement = (node) => {
      if (node.nodeName === 'SCRIPT' && !node.nonce && scriptNonce) {
        node.setAttribute('nonce', scriptNonce);
      }
      if (node.nodeName === 'STYLE' && !node.nonce && styleNonce) {
        node.setAttribute('nonce', styleNonce);
      }
    };
    
    document.querySelectorAll('script, style').forEach(applyNoncesToElement);
    
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(applyNoncesToElement);
        }
      });
    });
    
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }
});
