import { create } from "zustand";
import { JobFeedAnalysisResult, JsonAnalysisResult, XmlAnalysisResult } from "../types";
import { api } from "../services/api";

interface AnalysisState {
  filePath: string;
  analysisType: "xml" | "json" | "feed";
  xmlResult: XmlAnalysisResult | null;
  jsonResult: JsonAnalysisResult | null;
  feedResult: JobFeedAnalysisResult | null;
  isLoading: boolean;
  error: string | null;

  setFilePath: (path: string) => void;
  setAnalysisType: (type: "xml" | "json" | "feed") => void;
  runAnalysis: (path?: string, overrideType?: "xml" | "json" | "feed") => Promise<void>;
  clear: () => void;
}

export const useAnalysisStore = create<AnalysisState>((set, get) => ({
  filePath: "",
  analysisType: "feed",
  xmlResult: null,
  jsonResult: null,
  feedResult: null,
  isLoading: false,
  error: null,

  setFilePath: (filePath) => {
    const clean = filePath.trim().replace(/^["']|["']$/g, "");
    const ext = clean.split(".").pop()?.toLowerCase();
    let analysisType: "xml" | "json" | "feed" = get().analysisType;
    if (ext === "xml" || ext === "xsl" || ext === "xslt" || ext === "rss") {
      analysisType = clean.toLowerCase().includes("job") || clean.toLowerCase().includes("feed") ? "feed" : "xml";
    } else if (ext === "json") {
      analysisType = clean.toLowerCase().includes("job") || clean.toLowerCase().includes("feed") ? "feed" : "json";
    }
    set({ filePath: clean, analysisType });
  },

  setAnalysisType: (analysisType) => set({ analysisType }),

  runAnalysis: async (path, overrideType) => {
    const rawPath = path || get().filePath;
    const targetPath = rawPath.trim().replace(/^["']|["']$/g, "");
    if (!targetPath) return;

    let analysisType = overrideType || get().analysisType;
    const lower = targetPath.toLowerCase();

    // Auto-detect best tool if not explicitly specified
    if (!overrideType) {
      if (lower.includes("job") || lower.includes("feed") || lower.includes("posting")) {
        analysisType = "feed";
      } else if (lower.endsWith(".json")) {
        analysisType = "json";
      } else if (lower.endsWith(".xml") || lower.endsWith(".xsl") || lower.endsWith(".rss")) {
        analysisType = "xml";
      }
    }

    try {
      set({
        isLoading: true,
        error: null,
        filePath: targetPath,
        analysisType,
        xmlResult: null,
        jsonResult: null,
        feedResult: null,
      });

      if (analysisType === "xml") {
        const res = await api.analyzeXmlFile(targetPath);
        if (res.error) {
          set({ error: res.error, xmlResult: res, isLoading: false });
        } else {
          set({ xmlResult: res, isLoading: false });
        }
      } else if (analysisType === "json") {
        const res = await api.analyzeJsonFile(targetPath);
        if (res.error) {
          set({ error: res.error, jsonResult: res, isLoading: false });
        } else {
          set({ jsonResult: res, isLoading: false });
        }
      } else if (analysisType === "feed") {
        const res = await api.analyzeJobFeed(targetPath);
        if (res.total_jobs === 0) {
          // If 0 jobs found, also attempt general xml or json analyzer to see if it's general XML/JSON
          if (lower.endsWith(".json")) {
            const jRes = await api.analyzeJsonFile(targetPath);
            if (jRes.is_valid && jRes.total_keys > 0) {
              set({ jsonResult: jRes, analysisType: "json", isLoading: false });
              return;
            }
          } else {
            const xRes = await api.analyzeXmlFile(targetPath);
            if (xRes.is_valid && xRes.total_elements > 0) {
              set({ xmlResult: xRes, analysisType: "xml", isLoading: false });
              return;
            }
          }
        }
        set({ feedResult: res, isLoading: false });
      }
    } catch (e: any) {
      set({ error: e.toString(), isLoading: false });
    }
  },

  clear: () =>
    set({
      filePath: "",
      xmlResult: null,
      jsonResult: null,
      feedResult: null,
      error: null,
    }),
}));
