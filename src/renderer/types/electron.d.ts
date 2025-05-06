interface ElectronAPI {
  openFolder: () => Promise<{ path: string, name: string } | null>;
  openFile: () => Promise<{ path: string, name: string } | null>;
  readFile: (path: string) => Promise<{ content: string, language: string }>;
  saveFile: (path: string, content: string) => Promise<boolean>;
  getRecentProjects: () => Promise<Array<{ path: string, name: string, lastOpened: number }>>;
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