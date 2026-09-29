import React, { useState } from "react";
import {
  Plus,
  Server,
  Trash2,
  PowerOff,
  Shield,
  RefreshCw,
  Edit3,
  AlertTriangle,
  Terminal,
  KeyRound,
  ShieldCheck,
} from "lucide-react";
import { ConnectionProfile } from "../../types";
import { useConnectionStore } from "../../stores/connectionStore";
import { useFileStore } from "../../stores/fileStore";
import { useLogStore } from "../../stores/logStore";
import { PasswordPromptModal } from "../ConnectionDialog/PasswordPromptModal";

interface ConnectionSidebarProps {
  onOpenAddModal: () => void;
  onEditProfile: (profile: ConnectionProfile) => void;
}

export const ConnectionSidebar: React.FC<ConnectionSidebarProps> = ({
  onOpenAddModal,
  onEditProfile,
}) => {
  const {
    profiles,
    status,
    isConnecting,
    selectedProfileId,
    connect,
    disconnect,
    deleteProfile,
    deleteSavedPassword,
    loadProfiles,
    saveProfile,
    setSelectedProfileId,
  } = useConnectionStore();

  const { loadRemoteDirectory } = useFileStore();
  const { setIsOpen: setLogConsoleOpen } = useLogStore();

  const [passwordModalProfile, setPasswordModalProfile] = useState<ConnectionProfile | null>(null);
  const [connectError, setConnectError] = useState<{ profileId: string; message: string } | null>(null);

  const handleConnect = async (profile: ConnectionProfile) => {
    setSelectedProfileId(profile.id);
    setConnectError(null);

    const success = await connect(profile);
    if (success) {
      loadRemoteDirectory(profile.remote_dir || ".");
    } else {
      const err = useConnectionStore.getState().error || "Failed to establish SFTP connection.";
      setLogConsoleOpen(true);

      const isAuthIssue =
        profile.auth_type === "password" &&
        (err.toLowerCase().includes("rejected") ||
          err.toLowerCase().includes("auth") ||
          err.toLowerCase().includes("credential") ||
          err.toLowerCase().includes("password"));

      if (isAuthIssue) {
        setPasswordModalProfile(profile);
      } else {
        setConnectError({
          profileId: profile.id,
          message: err,
        });
      }
    }
  };

  const handlePasswordSubmit = async (password: string, saveToKeyring: boolean) => {
    if (!passwordModalProfile) return;
    const profile = passwordModalProfile;

    if (saveToKeyring) {
      await saveProfile(profile, password);
    }

    const success = await connect(profile, password);
    if (success) {
      loadRemoteDirectory(profile.remote_dir || ".");
    } else {
      const err = useConnectionStore.getState().error || "Password was not accepted by server.";
      setConnectError({
        profileId: profile.id,
        message: err,
      });
      setLogConsoleOpen(true);
    }
  };

  return (
    <aside className="w-64 bg-[#161b22] border-r border-[#30363d] flex flex-col h-full select-none">
      {/* Sidebar Header */}
      <div className="p-3 border-b border-[#30363d] flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wider text-[#8b949e] uppercase">
          Connections
        </span>
        <button
          onClick={() => loadProfiles()}
          title="Refresh connection profiles"
          className="text-[#8b949e] hover:text-white p-1 rounded hover:bg-[#21262d] transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Profile List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {profiles.length === 0 ? (
          <div className="p-4 text-center text-xs text-[#8b949e]">
            No connections configured.
            <div className="mt-2 text-[11px] text-[#6e7681]">
              Add a server below to start transferring files.
            </div>
          </div>
        ) : (
          profiles.map((profile) => {
            const isConnected =
              status.connected && status.profile_id === profile.id;
            const isThisConnecting =
              isConnecting && selectedProfileId === profile.id;

            return (
              <div
                key={profile.id}
                onClick={() => setSelectedProfileId(profile.id)}
                className={`group p-2.5 rounded-md border text-xs cursor-pointer transition-all ${
                  selectedProfileId === profile.id
                    ? "bg-[#21262d] border-blue-500/50 shadow-sm"
                    : "bg-[#0d1117]/50 border-transparent hover:border-[#30363d] hover:bg-[#21262d]/50"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center space-x-2 truncate">
                    {/* Status Dot */}
                    {isConnected ? (
                      <span
                        className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm flex-shrink-0"
                        title="Connected"
                      />
                    ) : isThisConnecting ? (
                      <span
                        className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping flex-shrink-0"
                        title="Connecting..."
                      />
                    ) : (
                      <span
                        className="w-2.5 h-2.5 rounded-full bg-gray-600 flex-shrink-0"
                        title="Disconnected"
                      />
                    )}
                    <span className="font-medium text-white truncate">
                      {profile.name}
                    </span>
                  </div>

                  <span className="text-[10px] uppercase font-mono px-1 rounded bg-[#21262d] text-[#8b949e] border border-[#30363d]/60">
                    {profile.protocol}
                  </span>
                </div>

                <div className="text-[11px] text-[#8b949e] truncate font-mono-code">
                  {profile.username ? `${profile.username}@` : ""}
                  {profile.host}:{profile.port}
                </div>

                {/* Quick actions on hover */}
                <div className="mt-2 pt-2 border-t border-[#30363d]/40 flex items-center justify-between">
                  <div className="flex items-center space-x-1 text-[10px]">
                    {profile.auth_type === "key" ? (
                      <>
                        <Shield className="w-3 h-3 text-blue-400" />
                        <span className="text-[#8b949e]">SSH Key</span>
                      </>
                    ) : profile.has_saved_password ? (
                      <span className="flex items-center space-x-1 text-emerald-400" title="Password saved in Windows Credential Manager">
                        <ShieldCheck className="w-3 h-3 text-emerald-400" />
                        <span>Password Saved</span>
                      </span>
                    ) : (
                      <span className="flex items-center space-x-1 text-[#8b949e]" title="Password not saved (will prompt upon connect)">
                        <Shield className="w-3 h-3 text-[#6e7681]" />
                        <span>Prompt Password</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-1 opacity-80 group-hover:opacity-100">
                    {isConnected ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          disconnect();
                        }}
                        className="p-1 rounded text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        title="Disconnect"
                      >
                        <PowerOff className="w-3 h-3" />
                      </button>
                    ) : (
                      <button
                        disabled={isConnecting}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleConnect(profile);
                        }}
                        className="px-2 py-0.5 rounded text-[11px] font-medium bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
                        title="Connect"
                      >
                        {isThisConnecting ? "..." : "Connect"}
                      </button>
                    )}

                    {profile.auth_type === "password" && profile.has_saved_password && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Forget saved password for "${profile.name}"?\nYou will be prompted to enter your password next time you connect.`)) {
                            deleteSavedPassword(profile.id);
                          }
                        }}
                        className="p-1 rounded text-[#8b949e] hover:text-amber-400 hover:bg-amber-500/10"
                        title="Forget saved password (removes from Windows Credential Manager)"
                      >
                        <KeyRound className="w-3 h-3 text-amber-400/80 hover:text-amber-400" />
                      </button>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditProfile(profile);
                      }}
                      className="p-1 rounded text-[#8b949e] hover:text-blue-400 hover:bg-blue-500/10"
                      title="Edit connection profile"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete connection "${profile.name}"?\nThis deletes the profile and any saved credentials.`)) {
                          deleteProfile(profile.id);
                        }
                      }}
                      className="p-1 rounded text-[#8b949e] hover:text-red-400 hover:bg-red-500/10"
                      title="Delete connection profile"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Inline Error Banner if connection failed for this profile */}
                {connectError && connectError.profileId === profile.id && (
                  <div className="mt-2 p-2 rounded bg-red-950/40 border border-red-800/40 text-rose-300 text-[11px] space-y-1">
                    <div className="flex items-start space-x-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0 mt-0.5" />
                      <span className="font-semibold text-rose-200 break-words flex-1">
                        Connection Failed
                      </span>
                    </div>
                    <div className="text-[10px] text-rose-300/90 break-words font-mono-code leading-tight">
                      {connectError.message}
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setLogConsoleOpen(true);
                        }}
                        className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center space-x-1 underline"
                      >
                        <Terminal className="w-3 h-3" />
                        <span>View Connection Logs</span>
                      </button>
                      {profile.auth_type === "password" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPasswordModalProfile(profile);
                          }}
                          className="text-[10px] text-amber-400 hover:text-amber-300 font-medium underline"
                        >
                          Enter Password
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Add Connection Button */}
      <div className="p-3 border-t border-[#30363d]">
        <button
          onClick={onOpenAddModal}
          className="w-full flex items-center justify-center space-x-2 py-2 px-3 rounded-md bg-[#21262d] hover:bg-[#30363d] text-white text-xs font-medium border border-[#30363d] transition-colors"
        >
          <Plus className="w-4 h-4 text-blue-400" />
          <span>Add Connection</span>
        </button>
      </div>

      {/* Password Prompt Modal */}
      {passwordModalProfile && (
        <PasswordPromptModal
          isOpen={true}
          profile={passwordModalProfile}
          errorMessage={connectError?.profileId === passwordModalProfile.id ? connectError.message : null}
          onClose={() => setPasswordModalProfile(null)}
          onSubmit={handlePasswordSubmit}
        />
      )}
    </aside>
  );
};
