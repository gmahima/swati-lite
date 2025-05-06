// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

const { contextBridge, ipcRenderer } = require('electron');

// Do NOT set sandbox options here - they should be in the main process BrowserWindow config

// Expose the Electron API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  readFile: (path) => ipcRenderer.invoke('file:read', path),
  saveFile: (path, content) => ipcRenderer.invoke('file:save', path, content),
  getRecentProjects: () => ipcRenderer.invoke('app:getRecentProjects'),
  getCspNonces: () => ipcRenderer.invoke('get-csp-nonces'),
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
