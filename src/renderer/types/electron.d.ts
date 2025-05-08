interface ElectronAPI {
  openFolder: () => Promise<{ path: string } | null>;
  openFile: () => Promise<{ path: string } | null>;
  readFile: (path: string) => Promise<{ content: string; language: string }>;
  saveFile: (path: string, content: string) => Promise<void>;
  getRecentProjects: () => Promise<any[]>;
  getCspNonces: () => Promise<{ scriptNonce: string; styleNonce: string }>;
  readDirectory: (path: string) => Promise<any>;
  getStats: (path: string) => Promise<any>;
  getExpandedDirs: (rootPath: string) => Promise<string[]>;
  saveExpandedDirs: (rootPath: string, expandedDirs: string[]) => Promise<void>;
  getWorkspaceRoot: () => Promise<string>;
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