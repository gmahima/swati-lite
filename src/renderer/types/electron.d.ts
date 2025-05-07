interface ElectronAPI {
  openFolder: () => Promise<{ path: string, name: string } | null>;
  openFile: () => Promise<{ path: string, name: string } | null>;
  readFile: (path: string) => Promise<{ content: string, language: string }>;
  saveFile: (path: string, content: string) => Promise<boolean>;
  getRecentProjects: () => Promise<Array<{ path: string, name: string, lastOpened: number }>>;
  getCspNonces: () => Promise<{ scriptNonce: string, styleNonce: string }>;
  chat: (messages: { role: 'user' | 'assistant' | 'system'; content: string }[]) => Promise<string>;
  readDirectory: (path: string) => Promise<{
    name: string;
    path: string;
    type: 'file' | 'directory';
    children?: Array<{
      name: string;
      path: string;
      type: 'file' | 'directory';
    }>;
  }>;
  getStats: (path: string) => Promise<{ isDirectory: boolean }>;
  getExpandedDirs: (rootPath: string) => Promise<string[]>;
  saveExpandedDirs: (rootPath: string, expandedDirs: string[]) => Promise<boolean>;
  ipcRenderer: {
    on: (channel: string, listener: (event: any, ...args: any[]) => void) => void;
    once: (channel: string, listener: (event: any, ...args: any[]) => void) => void;
    send: (channel: string, ...args: any[]) => void;
    removeListener: (channel: string, listener: (event: any, ...args: any[]) => void) => void;
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