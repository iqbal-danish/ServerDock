import { create } from "zustand";
import { LogEntry } from "../types";
import { api } from "../services/api";

type LogFilter = "ALL" | "ERRORS" | "SFTP" | "AUTH";

interface LogState {
  logs: LogEntry[];
  isOpen: boolean;
  filter: LogFilter;
  autoScroll: boolean;
  isInitialized: boolean;

  addLog: (entry: LogEntry) => void;
  loadLogs: () => Promise<void>;
  clearLogs: () => Promise<void>;
  setIsOpen: (open: boolean) => void;
  toggleOpen: () => void;
  setFilter: (filter: LogFilter) => void;
  setAutoScroll: (autoScroll: boolean) => void;
  initListener: () => Promise<void>;
}

export const useLogStore = create<LogState>((set, get) => ({
  logs: [],
  isOpen: false,
  filter: "ALL",
  autoScroll: true,
  isInitialized: false,

  addLog: (entry) => {
    set((state) => {
      // Auto-open log console if an ERROR or WARN is encountered so the user sees it immediately
      const shouldAutoOpen = entry.level === "ERROR" || entry.level === "WARN";
      return {
        logs: [...state.logs.slice(-999), entry],
        isOpen: shouldAutoOpen ? true : state.isOpen,
      };
    });
  },

  loadLogs: async () => {
    try {
      const logs = await api.getConnectionLogs();
      set({ logs });
    } catch (_) {
      // Ignore initial log load errors
    }
  },

  clearLogs: async () => {
    try {
      await api.clearConnectionLogs();
      set({ logs: [] });
    } catch (_) {
      set({ logs: [] });
    }
  },

  setIsOpen: (isOpen) => set({ isOpen }),
  toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),
  setFilter: (filter) => set({ filter }),
  setAutoScroll: (autoScroll) => set({ autoScroll }),

  initListener: async () => {
    if (get().isInitialized) return;
    set({ isInitialized: true });
    await get().loadLogs();
    try {
      await api.onConnectionLog((entry) => {
        get().addLog(entry);
      });
    } catch (_) {
      // Listener setup failed or running in non-tauri dev environment
    }
  },
}));
