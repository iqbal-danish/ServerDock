import { create } from "zustand";
import { ConnectionProfile, ConnectionStatus, ConnectionTestResult } from "../types";
import { api } from "../services/api";

interface ConnectionState {
  profiles: ConnectionProfile[];
  status: ConnectionStatus;
  isLoading: boolean;
  isConnecting: boolean;
  isTesting: boolean;
  testResult: ConnectionTestResult | null;
  selectedProfileId: string | null;
  error: string | null;

  loadProfiles: () => Promise<void>;
  saveProfile: (profile: ConnectionProfile, secret?: string) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  deleteSavedPassword: (id: string) => Promise<void>;
  clearAllSavedPasswords: () => Promise<void>;
  testConnection: (
    host: string,
    port: number,
    username: string,
    authType: string,
    password?: string,
    keyPath?: string
  ) => Promise<ConnectionTestResult>;
  clearTestResult: () => void;
  connect: (profile: ConnectionProfile, password?: string) => Promise<boolean>;
  disconnect: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  setSelectedProfileId: (id: string | null) => void;
  clearError: () => void;
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  profiles: [],
  status: {
    connected: false,
    current_remote_dir: ".",
  },
  isLoading: false,
  isConnecting: false,
  isTesting: false,
  testResult: null,
  selectedProfileId: null,
  error: null,

  loadProfiles: async () => {
    try {
      set({ isLoading: true, error: null });
      const profiles = await api.listProfiles();
      set({ profiles, isLoading: false });
    } catch (e: any) {
      set({ error: e.toString(), isLoading: false });
    }
  },

  saveProfile: async (profile, secret) => {
    try {
      await api.saveProfile(profile, secret);
      await get().loadProfiles();
    } catch (e: any) {
      set({ error: e.toString() });
      throw e;
    }
  },

  deleteProfile: async (id) => {
    try {
      await api.deleteProfile(id);
      if (get().selectedProfileId === id) {
        set({ selectedProfileId: null });
      }
      await get().loadProfiles();
    } catch (e: any) {
      set({ error: e.toString() });
    }
  },

  deleteSavedPassword: async (id) => {
    try {
      await api.deleteSavedPassword(id);
      await get().loadProfiles();
    } catch (e: any) {
      set({ error: e.toString() });
    }
  },

  clearAllSavedPasswords: async () => {
    try {
      await api.clearAllSavedPasswords();
      await get().loadProfiles();
    } catch (e: any) {
      set({ error: e.toString() });
    }
  },

  testConnection: async (host, port, username, authType, password, keyPath) => {
    try {
      set({ isTesting: true, testResult: null });
      const result = await api.testSftpConnection(
        host,
        port,
        username,
        authType,
        password,
        keyPath
      );
      set({ testResult: result, isTesting: false });
      return result;
    } catch (e: any) {
      const failRes: ConnectionTestResult = {
        success: false,
        steps: [
          {
            title: "Connection attempt",
            status: "failed",
            message: e.toString(),
          },
        ],
        error_details: e.toString(),
      };
      set({ testResult: failRes, isTesting: false });
      return failRes;
    }
  },

  clearTestResult: () => set({ testResult: null }),

  connect: async (profile, password) => {
    try {
      set({ isConnecting: true, error: null });
      const startDir = await api.connectSftp(
        profile.id,
        profile.host,
        profile.port,
        profile.username,
        profile.auth_type,
        password,
        profile.key_path,
        profile.remote_dir
      );

      set({
        status: {
          connected: true,
          profile_id: profile.id,
          host: profile.host,
          username: profile.username,
          current_remote_dir: startDir || ".",
        },
        selectedProfileId: profile.id,
        isConnecting: false,
      });
      await get().loadProfiles();
      return true;
    } catch (e: any) {
      set({
        error: e.toString(),
        isConnecting: false,
        status: {
          connected: false,
          current_remote_dir: ".",
          error: e.toString(),
        },
      });
      return false;
    }
  },

  disconnect: async () => {
    try {
      await api.disconnectSftp();
      set({
        status: {
          connected: false,
          current_remote_dir: ".",
        },
      });
    } catch (e: any) {
      set({ error: e.toString() });
    }
  },

  refreshStatus: async () => {
    try {
      const status = await api.getConnectionStatus();
      set({ status });
    } catch (e) {
      // ignore
    }
  },

  setSelectedProfileId: (id) => set({ selectedProfileId: id }),
  clearError: () => set({ error: null }),
}));
