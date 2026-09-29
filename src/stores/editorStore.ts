import { create } from "zustand";
import { SearchMatch } from "../types";
import { api } from "../services/api";

interface EditorState {
  filePath: string | null;
  fileName: string;
  isRemote: boolean;
  content: string;
  startLine: number;
  lineCount: number;
  totalLines: number | null;
  totalSize: number;
  eof: boolean;
  isLoading: boolean;
  isDirty: boolean;
  syntaxType: "xml" | "json" | "text" | "csv" | "log";
  validationResult: { valid: boolean; error: string | null } | null;

  // Search in file
  searchQuery: string;
  isRegex: boolean;
  caseSensitive: boolean;
  wholeWord: boolean;
  searchMatches: SearchMatch[];
  currentMatchIndex: number;
  isSearching: boolean;

  openFile: (path: string, fileName: string, isRemote: boolean) => Promise<void>;
  loadPage: (startLine: number) => Promise<void>;
  setContent: (content: string) => void;
  formatContent: () => Promise<void>;
  validateContent: () => Promise<void>;
  saveFile: () => Promise<void>;
  searchInFile: (query: string) => Promise<void>;
  nextMatch: () => void;
  prevMatch: () => void;
  goToLine: (line: number) => Promise<void>;
  setSearchOptions: (opts: { isRegex?: boolean; caseSensitive?: boolean; wholeWord?: boolean }) => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  filePath: null,
  fileName: "",
  isRemote: false,
  content: "",
  startLine: 1,
  lineCount: 0,
  totalLines: null,
  totalSize: 0,
  eof: true,
  isLoading: false,
  isDirty: false,
  syntaxType: "text",
  validationResult: null,

  searchQuery: "",
  isRegex: false,
  caseSensitive: false,
  wholeWord: false,
  searchMatches: [],
  currentMatchIndex: -1,
  isSearching: false,

  openFile: async (path, fileName, isRemote) => {
    try {
      set({
        filePath: path,
        fileName,
        isRemote,
        isLoading: true,
        isDirty: false,
        validationResult: null,
        searchMatches: [],
        currentMatchIndex: -1,
      });

      // Detect syntax type
      const ext = fileName.split(".").pop()?.toLowerCase();
      let syntaxType: "xml" | "json" | "text" | "csv" | "log" = "text";
      if (ext === "xml" || ext === "xsl" || ext === "xslt" || ext === "svg") {
        syntaxType = "xml";
      } else if (ext === "json") {
        syntaxType = "json";
      } else if (ext === "csv" || ext === "tsv") {
        syntaxType = "csv";
      } else if (ext === "log") {
        syntaxType = "log";
      }

      if (isRemote) {
        // Remote peek 64KB chunk
        const res = await api.readRemoteChunk(path, 0, 64 * 1024);
        set({
          content: res.content,
          startLine: 1,
          lineCount: res.content.split("\n").length,
          totalLines: null,
          totalSize: res.chunk_size,
          eof: res.eof,
          isLoading: false,
          syntaxType,
        });
      } else {
        // Local fast line seek (load first 500 lines)
        const res = await api.readFileLines(path, 1, 500);
        set({
          content: res.content,
          startLine: res.start_line,
          lineCount: res.line_count,
          totalLines: res.total_lines ?? null,
          totalSize: res.total_size,
          eof: res.eof,
          isLoading: false,
          syntaxType,
        });
      }
    } catch (e: any) {
      set({
        isLoading: false,
        content: `Error opening file: ${e.toString()}`,
      });
    }
  },

  loadPage: async (startLine) => {
    const { filePath, isRemote } = get();
    if (!filePath || isRemote) return;
    try {
      set({ isLoading: true });
      const res = await api.readFileLines(filePath, startLine, 500);
      set({
        content: res.content,
        startLine: res.start_line,
        lineCount: res.line_count,
        totalLines: res.total_lines ?? get().totalLines,
        eof: res.eof,
        isLoading: false,
        isDirty: false,
      });
    } catch (e) {
      set({ isLoading: false });
    }
  },

  setContent: (content) => set({ content, isDirty: true }),

  formatContent: async () => {
    const { content, syntaxType } = get();
    try {
      if (syntaxType === "xml") {
        const formatted = await api.formatXml(content);
        set({ content: formatted, isDirty: true });
      } else if (syntaxType === "json") {
        const formatted = await api.formatJson(content);
        set({ content: formatted, isDirty: true });
      }
    } catch (e: any) {
      set({ validationResult: { valid: false, error: e.toString() } });
    }
  },

  validateContent: async () => {
    const { content, syntaxType } = get();
    try {
      if (syntaxType === "xml") {
        const [valid, error] = await api.validateXml(content);
        set({ validationResult: { valid, error } });
      } else if (syntaxType === "json") {
        const [valid, error] = await api.validateJson(content);
        set({ validationResult: { valid, error } });
      }
    } catch (e: any) {
      set({ validationResult: { valid: false, error: e.toString() } });
    }
  },

  saveFile: async () => {
    const { filePath, content, isRemote } = get();
    if (!filePath || isRemote) return;
    try {
      await api.saveLocalFile(filePath, content);
      set({ isDirty: false });
    } catch (e: any) {
      alert(`Save failed: ${e.toString()}`);
    }
  },

  searchInFile: async (query) => {
    const { filePath, caseSensitive, isRegex, wholeWord, isRemote } = get();
    if (!filePath || !query.trim() || isRemote) {
      set({ searchQuery: query, searchMatches: [], currentMatchIndex: -1 });
      return;
    }

    try {
      set({ isSearching: true, searchQuery: query });
      const result = await api.searchFile(
        filePath,
        query,
        caseSensitive,
        isRegex,
        wholeWord,
        1000
      );
      set({
        searchMatches: result.matches,
        currentMatchIndex: result.matches.length > 0 ? 0 : -1,
        isSearching: false,
      });
    } catch (e: any) {
      set({ isSearching: false, searchMatches: [], currentMatchIndex: -1 });
    }
  },

  nextMatch: () => {
    const { searchMatches, currentMatchIndex } = get();
    if (searchMatches.length === 0) return;
    const nextIdx = (currentMatchIndex + 1) % searchMatches.length;
    set({ currentMatchIndex: nextIdx });
    const targetLine = searchMatches[nextIdx].line_number;
    get().loadPage(Math.max(1, targetLine - 5));
  },

  prevMatch: () => {
    const { searchMatches, currentMatchIndex } = get();
    if (searchMatches.length === 0) return;
    const prevIdx =
      (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
    set({ currentMatchIndex: prevIdx });
    const targetLine = searchMatches[prevIdx].line_number;
    get().loadPage(Math.max(1, targetLine - 5));
  },

  goToLine: async (line) => {
    await get().loadPage(Math.max(1, line));
  },

  setSearchOptions: (opts) => set((state) => ({ ...state, ...opts })),
}));
