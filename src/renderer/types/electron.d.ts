interface ElectronAPI {
  openFolder: () => Promise<{path: string} | null>;
  openFile: () => Promise<{path: string} | null>;
  readFile: (path: string) => Promise<{content: string; language: string}>;
  saveFile: (path: string, content: string) => Promise<void>;
  getRecentProjects: () => Promise<any[]>;
  openRecentProject: (path: string) => Promise<{
    success: boolean;
    path?: string;
    name?: string;
    error?: string;
  }>;
  getCspNonces: () => Promise<{scriptNonce: string; styleNonce: string}>;
  readDirectory: (path: string) => Promise<any>;
  getStats: (path: string) => Promise<any>;
  getExpandedDirs: (rootPath: string) => Promise<string[]>;
  saveExpandedDirs: (rootPath: string, expandedDirs: string[]) => Promise<void>;
  getWorkspaceRoot: () => Promise<string>;
  // RAG API methods
  ragIndexFile: (filePath: string) => Promise<any>;
  ragQuery: (query: string, filePath?: string) => Promise<any>;
  ragToggleWatchPath: (
    dirPath: string,
    shouldWatch: boolean
  ) => Promise<boolean>;
  ragGetWatchedPaths: () => Promise<string[]>;
  // Shadow workspace methods
  getShadowWorkspacePath: (originalPath: string) => Promise<string | null>;
  cleanupShadowWorkspace: (originalPath: string) => Promise<boolean>;
  copyFileToShadowWorkspace: (
    originalFilePath: string
  ) => Promise<string | null>;
  // Shadow file write tools
  writeToShadowFile: (
    filePath: string,
    content: string
  ) => Promise<{
    success: boolean;
    shadowPath: string | null;
    message: string;
  }>;
  appendToShadowFile: (
    filePath: string,
    contentToAppend: string
  ) => Promise<{
    success: boolean;
    shadowPath: string | null;
    message: string;
  }>;
  ipcRenderer: {
    on: (channel: string, listener: Function) => void;
    once: (channel: string, listener: Function) => void;
    send: (channel: string, ...args: any[]) => void;
    removeListener: (channel: string, listener: Function) => void;
  };
}

interface CSPNonces {
  scriptNonce: string;
  styleNonce: string;
}

interface ElectronConsole {
  log: (...args: any[]) => void;
  error: (...args: any[]) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    cspNonces: CSPNonces;
    electronConsole: ElectronConsole;
  }
}

export {}; 