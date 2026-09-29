import { create } from "zustand";
import { TransferItem } from "../types";
import { api } from "../services/api";

interface TransferState {
  transfers: TransferItem[];
  history: TransferItem[];
  concurrencyLimit: number;
  isOpen: boolean;
  filter: "all" | "active" | "completed" | "failed";

  loadTransfers: () => Promise<void>;
  loadHistory: () => Promise<void>;
  queueUpload: (
    fileName: string,
    sourcePath: string,
    destPath: string,
    totalBytes: number
  ) => Promise<string>;
  queueDownload: (
    fileName: string,
    sourcePath: string,
    destPath: string,
    totalBytes: number
  ) => Promise<string>;
  pauseTransfer: (id: string) => Promise<void>;
  resumeTransfer: (id: string) => Promise<void>;
  cancelTransfer: (id: string) => Promise<void>;
  retryTransfer: (id: string) => Promise<void>;
  clearCompleted: () => Promise<void>;
  setConcurrencyLimit: (limit: number) => Promise<void>;
  setIsOpen: (open: boolean) => void;
  setFilter: (filter: "all" | "active" | "completed" | "failed") => void;
  updateTransferItem: (item: TransferItem) => void;
}

export const useTransferStore = create<TransferState>((set, get) => ({
  transfers: [],
  history: [],
  concurrencyLimit: 3,
  isOpen: true,
  filter: "all",

  loadTransfers: async () => {
    try {
      const transfers = await api.getTransfers();
      set({ transfers });
    } catch (e) {
      console.error("Failed to load transfers:", e);
    }
  },

  loadHistory: async () => {
    try {
      const history = await api.getTransferHistory(100);
      set({ history });
    } catch (e) {
      console.error("Failed to load history:", e);
    }
  },

  queueUpload: async (fileName, sourcePath, destPath, totalBytes) => {
    const id = await api.queueTransfer(
      fileName,
      "Upload",
      sourcePath,
      destPath,
      totalBytes
    );
    await get().loadTransfers();
    return id;
  },

  queueDownload: async (fileName, sourcePath, destPath, totalBytes) => {
    const id = await api.queueTransfer(
      fileName,
      "Download",
      sourcePath,
      destPath,
      totalBytes
    );
    await get().loadTransfers();
    return id;
  },

  pauseTransfer: async (id) => {
    await api.pauseTransfer(id);
    await get().loadTransfers();
  },

  resumeTransfer: async (id) => {
    await api.resumeTransfer(id);
    await get().loadTransfers();
  },

  cancelTransfer: async (id) => {
    await api.cancelTransfer(id);
    await get().loadTransfers();
  },

  retryTransfer: async (id) => {
    await api.retryTransfer(id);
    await get().loadTransfers();
  },

  clearCompleted: async () => {
    await api.clearCompletedTransfers();
    await get().loadTransfers();
  },

  setConcurrencyLimit: async (limit) => {
    await api.setTransferConcurrency(limit);
    set({ concurrencyLimit: limit });
  },

  setIsOpen: (isOpen) => set({ isOpen }),
  setFilter: (filter) => set({ filter }),

  updateTransferItem: (item) => {
    set((state) => {
      const existing = state.transfers.findIndex((t) => t.id === item.id);
      if (existing !== -1) {
        const copy = [...state.transfers];
        copy[existing] = item;
        return { transfers: copy };
      } else {
        return { transfers: [item, ...state.transfers] };
      }
    });
  },
}));
