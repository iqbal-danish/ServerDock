import { create } from "zustand";
import { DiffResult } from "../types";
import { api } from "../services/api";

interface DiffState {
  fileA: string;
  fileB: string;
  diffResult: DiffResult | null;
  isLoading: boolean;
  error: string | null;
  viewMode: "split" | "unified";

  setFileA: (path: string) => void;
  setFileB: (path: string) => void;
  setViewMode: (mode: "split" | "unified") => void;
  compare: (pathA?: string, pathB?: string) => Promise<void>;
  clear: () => void;
}

export const useDiffStore = create<DiffState>((set, get) => ({
  fileA: "",
  fileB: "",
  diffResult: null,
  isLoading: false,
  error: null,
  viewMode: "unified",

  setFileA: (path) => set({ fileA: path }),
  setFileB: (path) => set({ fileB: path }),
  setViewMode: (mode) => set({ viewMode: mode }),

  compare: async (pathA, pathB) => {
    const a = pathA || get().fileA;
    const b = pathB || get().fileB;
    if (!a || !b) return;

    try {
      set({ isLoading: true, error: null, fileA: a, fileB: b });
      const result = await api.compareFiles(a, b);
      set({ diffResult: result, isLoading: false });
    } catch (e: any) {
      set({ error: e.toString(), isLoading: false, diffResult: null });
    }
  },

  clear: () => set({ fileA: "", fileB: "", diffResult: null, error: null }),
}));
