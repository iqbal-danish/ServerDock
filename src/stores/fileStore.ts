import { create } from "zustand";
import { FileItem } from "../types";
import { api } from "../services/api";
import { useConnectionStore } from "./connectionStore";

export interface ServerPaneState {
  remotePath: string;
  remoteFiles: FileItem[];
  remoteHistory: string[];
  remoteHistoryIndex: number;
  remoteLoading: boolean;
  remoteError: string | null;
  remoteSelected: string[];
  remoteSearchQuery: string;
}

interface FileState {
  // Local Pane
  localPath: string;
  localFiles: FileItem[];
  localHistory: string[];
  localHistoryIndex: number;
  localLoading: boolean;
  localError: string | null;
  localSelected: string[];
  localSearchQuery: string;

  // Remote Pane
  remotePath: string;
  remoteFiles: FileItem[];
  remoteHistory: string[];
  remoteHistoryIndex: number;
  remoteLoading: boolean;
  remoteError: string | null;
  remoteSelected: string[];
  remoteSearchQuery: string;

  // Multi-server pane storage
  serverPanes: Record<string, ServerPaneState>;
  activeServerId: string | null;

  // Active Pane
  activePane: "local" | "remote";
  setActivePane: (pane: "local" | "remote") => void;

  // Local Actions
  initLocalDirectory: () => Promise<void>;
  loadLocalDirectory: (path: string, pushHistory?: boolean) => Promise<void>;
  navigateLocalBack: () => void;
  navigateLocalForward: () => void;
  navigateLocalUp: () => void;
  refreshLocal: () => Promise<void>;
  setLocalSelected: (paths: string[]) => void;
  toggleLocalSelected: (path: string, multi: boolean, range?: boolean) => void;
  setLocalSearchQuery: (query: string) => void;

  // Remote Actions
  loadRemoteDirectory: (
    path: string,
    pushHistory?: boolean,
    forceRefresh?: boolean,
    targetProfileId?: string
  ) => Promise<void>;
  navigateRemoteBack: () => void;
  navigateRemoteForward: () => void;
  navigateRemoteUp: () => void;
  refreshRemote: () => Promise<void>;
  setRemoteSelected: (paths: string[]) => void;
  toggleRemoteSelected: (path: string, multi: boolean, range?: boolean) => void;
  setRemoteSearchQuery: (query: string) => void;
  switchRemoteServer: (profileId: string, initialPath?: string) => Promise<void>;
  closeRemoteServer: (profileId: string) => void;
}

export const useFileStore = create<FileState>((set, get) => ({
  localPath: "",
  localFiles: [],
  localHistory: [],
  localHistoryIndex: -1,
  localLoading: false,
  localError: null,
  localSelected: [],
  localSearchQuery: "",

  remotePath: ".",
  remoteFiles: [],
  remoteHistory: ["."],
  remoteHistoryIndex: 0,
  remoteLoading: false,
  remoteError: null,
  remoteSelected: [],
  remoteSearchQuery: "",

  serverPanes: {},
  activeServerId: null,

  activePane: "local",
  setActivePane: (pane) => set({ activePane: pane }),

  // Local Actions
  initLocalDirectory: async () => {
    try {
      const defaultDir = await api.getDefaultLocalDirectory();
      await get().loadLocalDirectory(defaultDir, true);
    } catch (e: any) {
      set({ localError: e.toString() });
    }
  },

  loadLocalDirectory: async (path: string, pushHistory = true) => {
    try {
      set({ localLoading: true, localError: null, localSelected: [] });
      const files = await api.listLocalDirectory(path);

      let newHistory = get().localHistory;
      let newIndex = get().localHistoryIndex;

      if (pushHistory) {
        newHistory = newHistory.slice(0, newIndex + 1);
        newHistory.push(path);
        newIndex = newHistory.length - 1;
      }

      set({
        localPath: path,
        localFiles: files,
        localHistory: newHistory,
        localHistoryIndex: newIndex,
        localLoading: false,
      });
    } catch (e: any) {
      set({ localLoading: false, localError: e.toString(), localFiles: [] });
    }
  },

  navigateLocalBack: () => {
    const { localHistory, localHistoryIndex } = get();
    if (localHistoryIndex > 0) {
      const prev = localHistory[localHistoryIndex - 1];
      set({ localHistoryIndex: localHistoryIndex - 1 });
      get().loadLocalDirectory(prev, false);
    }
  },

  navigateLocalForward: () => {
    const { localHistory, localHistoryIndex } = get();
    if (localHistoryIndex < localHistory.length - 1) {
      const next = localHistory[localHistoryIndex + 1];
      set({ localHistoryIndex: localHistoryIndex + 1 });
      get().loadLocalDirectory(next, false);
    }
  },

  navigateLocalUp: () => {
    const { localPath } = get();
    if (!localPath) return;
    const normalized = localPath.replace(/\\/g, "/");
    const lastSlash = normalized.lastIndexOf("/");
    if (lastSlash > 0) {
      const parent = localPath.substring(0, lastSlash);
      get().loadLocalDirectory(parent, true);
    } else if (lastSlash === 0) {
      get().loadLocalDirectory("/", true);
    }
  },

  refreshLocal: async () => {
    const { localPath } = get();
    if (localPath) {
      await get().loadLocalDirectory(localPath, false);
    }
  },

  setLocalSelected: (paths) => set({ localSelected: paths }),

  toggleLocalSelected: (path, multi, range) => {
    const { localFiles, localSelected } = get();
    if (range && localSelected.length > 0) {
      const lastSelected = localSelected[localSelected.length - 1];
      const idxA = localFiles.findIndex((f) => f.path === lastSelected);
      const idxB = localFiles.findIndex((f) => f.path === path);
      if (idxA !== -1 && idxB !== -1) {
        const start = Math.min(idxA, idxB);
        const end = Math.max(idxA, idxB);
        const rangePaths = localFiles.slice(start, end + 1).map((f) => f.path);
        set({ localSelected: Array.from(new Set([...localSelected, ...rangePaths])) });
        return;
      }
    }

    if (multi) {
      if (localSelected.includes(path)) {
        set({ localSelected: localSelected.filter((p) => p !== path) });
      } else {
        set({ localSelected: [...localSelected, path] });
      }
    } else {
      set({ localSelected: [path] });
    }
  },

  setLocalSearchQuery: (query) => set({ localSearchQuery: query }),

  // Remote Actions
  loadRemoteDirectory: async (
    path: string,
    pushHistory = true,
    forceRefresh = false,
    targetProfileId?: string
  ) => {
    const cleanPath = path.replace(/\\/g, "/");
    const activeId = targetProfileId || get().activeServerId || useConnectionStore.getState().activeProfileId || undefined;

    try {
      set({ remoteLoading: true, remoteError: null, remoteSelected: [] });
      const files = await api.listRemoteDirectory(cleanPath, activeId, forceRefresh);

      let newHistory = get().remoteHistory;
      let newIndex = get().remoteHistoryIndex;

      if (pushHistory) {
        newHistory = newHistory.slice(0, newIndex + 1);
        newHistory.push(cleanPath);
        newIndex = newHistory.length - 1;
      }

      const updatedPane: ServerPaneState = {
        remotePath: cleanPath,
        remoteFiles: files,
        remoteHistory: newHistory,
        remoteHistoryIndex: newIndex,
        remoteLoading: false,
        remoteError: null,
        remoteSelected: [],
        remoteSearchQuery: get().remoteSearchQuery,
      };

      const updatedPanes = { ...get().serverPanes };
      if (activeId) {
        updatedPanes[activeId] = updatedPane;
      }

      set({
        remotePath: cleanPath,
        remoteFiles: files,
        remoteHistory: newHistory,
        remoteHistoryIndex: newIndex,
        remoteLoading: false,
        serverPanes: updatedPanes,
        activeServerId: activeId || null,
      });
    } catch (e: any) {
      const errStr = String(e || "");
      if (errStr.includes("session closed") || errStr.includes("No active connection") || errStr.includes("Broken pipe")) {
        const activeProfile = useConnectionStore.getState().connectedProfiles.find((p) => p.id === activeId)
          || useConnectionStore.getState().profiles.find((p) => p.id === activeId);
        if (activeProfile) {
          try {
            const reconnected = await useConnectionStore.getState().connect(activeProfile);
            if (reconnected) {
              const retryFiles = await api.listRemoteDirectory(cleanPath, activeId, true);
              set({
                remotePath: cleanPath,
                remoteFiles: retryFiles,
                remoteLoading: false,
                remoteError: null,
              });
              return;
            }
          } catch (retryErr) {
            console.error("Auto-reconnect fallback failed:", retryErr);
          }
        }
      }
      set({ remoteLoading: false, remoteError: errStr, remoteFiles: [] });
    }
  },

  navigateRemoteBack: () => {
    const { remoteHistory, remoteHistoryIndex } = get();
    if (remoteHistoryIndex > 0) {
      const prev = remoteHistory[remoteHistoryIndex - 1];
      set({ remoteHistoryIndex: remoteHistoryIndex - 1 });
      get().loadRemoteDirectory(prev, false);
    }
  },

  navigateRemoteForward: () => {
    const { remoteHistory, remoteHistoryIndex } = get();
    if (remoteHistoryIndex < remoteHistory.length - 1) {
      const next = remoteHistory[remoteHistoryIndex + 1];
      set({ remoteHistoryIndex: remoteHistoryIndex + 1 });
      get().loadRemoteDirectory(next, false);
    }
  },

  navigateRemoteUp: () => {
    const { remotePath } = get();
    if (!remotePath || remotePath === "/" || remotePath === ".") return;
    const clean = remotePath.replace(/\\/g, "/").replace(/\/+$/, "");
    const lastSlash = clean.lastIndexOf("/");
    if (lastSlash > 0) {
      get().loadRemoteDirectory(clean.substring(0, lastSlash), true);
    } else if (lastSlash === 0) {
      get().loadRemoteDirectory("/", true);
    } else {
      get().loadRemoteDirectory("..", true);
    }
  },

  refreshRemote: async () => {
    const { remotePath } = get();
    const targetPath = remotePath && remotePath.trim() ? remotePath : ".";
    await get().loadRemoteDirectory(targetPath, false, true);
  },

  setRemoteSelected: (paths) => set({ remoteSelected: paths }),

  toggleRemoteSelected: (path, multi, range) => {
    const { remoteFiles, remoteSelected } = get();
    if (range && remoteSelected.length > 0) {
      const lastSelected = remoteSelected[remoteSelected.length - 1];
      const idxA = remoteFiles.findIndex((f) => f.path === lastSelected);
      const idxB = remoteFiles.findIndex((f) => f.path === path);
      if (idxA !== -1 && idxB !== -1) {
        const start = Math.min(idxA, idxB);
        const end = Math.max(idxA, idxB);
        const rangePaths = remoteFiles.slice(start, end + 1).map((f) => f.path);
        set({ remoteSelected: Array.from(new Set([...remoteSelected, ...rangePaths])) });
        return;
      }
    }

    if (multi) {
      if (remoteSelected.includes(path)) {
        set({ remoteSelected: remoteSelected.filter((p) => p !== path) });
      } else {
        set({ remoteSelected: [...remoteSelected, path] });
      }
    } else {
      set({ remoteSelected: [path] });
    }
  },

  setRemoteSearchQuery: (query) => set({ remoteSearchQuery: query }),

  switchRemoteServer: async (profileId: string, initialPath?: string) => {
    const currentActiveId = get().activeServerId;
    const panes = { ...get().serverPanes };

    // Save current active server state if we had one
    if (currentActiveId) {
      panes[currentActiveId] = {
        remotePath: get().remotePath,
        remoteFiles: get().remoteFiles,
        remoteHistory: get().remoteHistory,
        remoteHistoryIndex: get().remoteHistoryIndex,
        remoteLoading: get().remoteLoading,
        remoteError: get().remoteError,
        remoteSelected: get().remoteSelected,
        remoteSearchQuery: get().remoteSearchQuery,
      };
    }

    // Check if target server already has cached state in memory
    const existingPane = panes[profileId];
    if (existingPane && existingPane.remoteFiles.length > 0) {
      set({
        activeServerId: profileId,
        serverPanes: panes,
        remotePath: existingPane.remotePath,
        remoteFiles: existingPane.remoteFiles,
        remoteHistory: existingPane.remoteHistory,
        remoteHistoryIndex: existingPane.remoteHistoryIndex,
        remoteLoading: false,
        remoteError: existingPane.remoteError,
        remoteSelected: [],
        remoteSearchQuery: "",
      });
    } else {
      // Initialize target server pane and fetch its directory
      const path = initialPath || ".";
      set({
        activeServerId: profileId,
        serverPanes: panes,
        remotePath: path,
        remoteFiles: [],
        remoteHistory: [path],
        remoteHistoryIndex: 0,
        remoteLoading: true,
        remoteError: null,
        remoteSelected: [],
        remoteSearchQuery: "",
      });
      await get().loadRemoteDirectory(path, false, false, profileId);
    }
  },

  closeRemoteServer: (profileId: string) => {
    const panes = { ...get().serverPanes };
    delete panes[profileId];
    set({ serverPanes: panes });
  },
}));
