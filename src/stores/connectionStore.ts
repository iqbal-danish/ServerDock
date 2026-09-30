import { create } from "zustand";
import { ConnectionProfile, ConnectionStatus, ConnectionTestResult, ActiveSessionInfo } from "../types";
import { api } from "../services/api";

interface ConnectionState {
  profiles: ConnectionProfile[];
  connectedProfiles: ConnectionProfile[];
  activeProfileId: string | null;
  activeSessions: ActiveSessionInfo[];
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
  switchActiveSession: (profileId: string) => Promise<string | null>;
  disconnect: (profileId?: string) => Promise<void>;
  refreshStatus: () => Promise<void>;
  setSelectedProfileId: (id: string | null) => void;
  clearError: () => void;
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  profiles: [],
  connectedProfiles: [],
  activeProfileId: null,
  activeSessions: [],
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

      const existing = get().connectedProfiles;
      const alreadyInList = existing.some((p) => p.id === profile.id);
      const updatedConnected = alreadyInList ? existing : [...existing, profile];

      set({
        connectedProfiles: updatedConnected,
        activeProfileId: profile.id,
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
      await get().refreshStatus();
      return true;
    } catch (e: any) {
      set({
        error: e.toString(),
        isConnecting: false,
      });
      return false;
    }
  },

  switchActiveSession: async (profileId) => {
    try {
      const path = await api.switchSftpSession(profileId);
      const profile =
        get().connectedProfiles.find((p) => p.id === profileId) ||
        get().profiles.find((p) => p.id === profileId);

      set({
        activeProfileId: profileId,
        selectedProfileId: profileId,
        status: {
          connected: true,
          profile_id: profileId,
          host: profile?.host,
          username: profile?.username,
          current_remote_dir: path || ".",
        },
      });

      await get().refreshStatus();
      return path;
    } catch (e: any) {
      set({ error: e.toString() });
      return null;
    }
  },

  disconnect: async (profileId) => {
    try {
      const targetId = profileId || get().activeProfileId;
      if (!targetId) {
        await api.disconnectSftp();
        set({
          connectedProfiles: [],
          activeProfileId: null,
          status: {
            connected: false,
            current_remote_dir: ".",
          },
        });
        return;
      }

      await api.disconnectSftp(targetId);
      const remaining = get().connectedProfiles.filter((p) => p.id !== targetId);

      if (remaining.length > 0) {
        const nextProfile = remaining[remaining.length - 1];
        const nextPath = await api.switchSftpSession(nextProfile.id).catch(() => ".");
        set({
          connectedProfiles: remaining,
          activeProfileId: nextProfile.id,
          selectedProfileId: nextProfile.id,
          status: {
            connected: true,
            profile_id: nextProfile.id,
            host: nextProfile.host,
            username: nextProfile.username,
            current_remote_dir: nextPath || ".",
          },
        });
      } else {
        set({
          connectedProfiles: [],
          activeProfileId: null,
          status: {
            connected: false,
            current_remote_dir: ".",
          },
        });
      }
      await get().refreshStatus();
    } catch (e: any) {
      set({ error: e.toString() });
    }
  },

  refreshStatus: async () => {
    try {
      const status = await api.getConnectionStatus();
      const activeSessions = await api.getActiveSessions().catch(() => []);
      set({ status, activeSessions });
    } catch (e) {
      // ignore
    }
  },

  setSelectedProfileId: (id) => set({ selectedProfileId: id }),
  clearError: () => set({ error: null }),
}));
