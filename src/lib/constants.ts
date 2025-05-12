// User ID constant for temporary usage until multi-user system is implemented
export const TEMPORARY_USER_ID = "default-user";

// File extensions to track for embedding
export const EMBEDDABLE_FILE_EXTENSIONS = [
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".py",
  ".java",
  ".cpp",
  ".c",
  ".go",
  ".rb",
  ".rs",
  ".php",
  ".md",
  ".html",
  ".css",
  ".sol",
  ".json",
];

// Directories to ignore in file watching and embedding
export const IGNORED_DIRECTORIES = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
];

// UI/Display language mapping (for syntax highlighting, etc.)
export const UI_LANGUAGE_MAP: Record<string, string> = {
  ".js": "javascript",
  ".jsx": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mjs": "javascript",
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

// Language types used by LangChain's RecursiveCharacterTextSplitter
export type EmbeddingLanguageType =
  | "cpp"
  | "go"
  | "java"
  | "js"
  | "php"
  | "proto"
  | "python"
  | "rst"
  | "ruby"
  | "rust"
  | "scala"
  | "swift"
  | "markdown"
  | "latex"
  | "html"
  | "sol";

// Embedding language mapping (for language-specific text splitters)
export const EMBEDDING_LANGUAGE_MAP: Record<string, EmbeddingLanguageType> = {
  ".js": "js",
  ".jsx": "js",
  ".ts": "js",
  ".tsx": "js",
  ".mjs": "js",
  ".py": "python",
  ".java": "java",
  ".cpp": "cpp",
  ".c": "cpp",
  ".go": "go",
  ".rb": "ruby",
  ".rs": "rust",
  ".php": "php",
  ".md": "markdown",
  ".html": "html",
  ".sol": "sol",
};

// Get embedding language with appropriate fallback
export function getEmbeddingLanguage(extension: string): EmbeddingLanguageType {
  return EMBEDDING_LANGUAGE_MAP[extension.toLowerCase()] || "js";
}

// Get UI language with appropriate fallback
export function getUILanguage(extension: string): string {
  return UI_LANGUAGE_MAP[extension.toLowerCase()] || "plaintext";
}
