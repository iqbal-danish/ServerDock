import React, { useState } from "react";
import { X, ShieldCheck, Terminal, HardDrive, Sliders, PowerOff, KeyRound, Trash2 } from "lucide-react";
import { useTransferStore } from "../../stores/transferStore";
import { useLogStore } from "../../stores/logStore";
import { useConnectionStore } from "../../stores/connectionStore";
import { api } from "../../services/api";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { concurrencyLimit, setConcurrencyLimit } = useTransferStore();
  const { logs, clearLogs } = useLogStore();
  const { profiles, deleteSavedPassword, clearAllSavedPasswords, deleteProfile } = useConnectionStore();
  const [activeTab, setActiveTab] = useState<"general" | "security" | "logs">("general");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 select-none">
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg shadow-2xl w-full max-w-lg text-xs overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#30363d] flex items-center justify-between">
          <span className="font-semibold text-white text-sm">
            ByteFlow Preferences & Diagnostics
          </span>
          <button
            onClick={onClose}
            className="text-[#8b949e] hover:text-white p-1 rounded hover:bg-[#21262d]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center px-4 pt-2 border-b border-[#30363d] space-x-4 bg-[#0d1117]/50">
          <button
            onClick={() => setActiveTab("general")}
            className={`pb-2 font-medium border-b-2 transition-colors ${
              activeTab === "general"
                ? "border-blue-500 text-white"
                : "border-transparent text-[#8b949e] hover:text-white"
            }`}
          >
            Transfer & Storage
          </button>

          <button
            onClick={() => setActiveTab("security")}
            className={`pb-2 font-medium border-b-2 transition-colors ${
              activeTab === "security"
                ? "border-blue-500 text-white"
                : "border-transparent text-[#8b949e] hover:text-white"
            }`}
          >
            Security & Credentials
          </button>

          <button
            onClick={() => setActiveTab("logs")}
            className={`pb-2 font-medium border-b-2 transition-colors ${
              activeTab === "logs"
                ? "border-blue-500 text-white"
                : "border-transparent text-[#8b949e] hover:text-white"
            }`}
          >
            Diagnostics & Logs
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1 text-[#e6edf3]">
          {activeTab === "general" && (
            <div className="space-y-4">
              <div>
                <label className="block text-white font-medium mb-1">
                  Concurrent File Transfers
                </label>
                <p className="text-[11px] text-[#8b949e] mb-2">
                  Maximum number of simultaneous upload/download connections.
                </p>
                <select
                  value={concurrencyLimit}
                  onChange={(e) => setConcurrencyLimit(Number(e.target.value))}
                  className="bg-[#0d1117] border border-[#30363d] rounded px-3 py-1.5 text-white font-mono-code focus:outline-hidden focus:border-blue-500"
                >
                  <option value={1}>1 (Conservative)</option>
                  <option value={2}>2</option>
                  <option value={3}>3 (Recommended)</option>
                  <option value={5}>5 (High Speed)</option>
                  <option value={8}>8 (Gigabit Networks)</option>
                </select>
              </div>

              <div className="pt-3 border-t border-[#30363d]/50">
                <span className="font-medium text-white block mb-1">
                  Local SQLite Persistence
                </span>
                <p className="text-[11px] text-[#8b949e]">
                  Transfer history, preferences, and connection profiles are stored
                  in an embedded SQLite database in your user application data directory.
                </p>
              </div>
            </div>
          )}

          {activeTab === "security" && (
            <div className="space-y-4">
              <div className="flex items-start space-x-3 p-3 bg-[#0d1117] border border-[#30363d] rounded-md">
                <ShieldCheck className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-white block">
                    Windows Credential Manager Integration
                  </span>
                  <p className="text-[11px] text-[#8b949e] mt-0.5">
                    ByteFlow stores passwords in the secure Windows Credential Manager (CredWrite API).
                    Credentials are encrypted by Windows using your user account's master key and are never stored in plaintext SQLite.
                  </p>
                </div>
              </div>

              {/* Saved Passwords Management */}
              <div className="bg-[#0d1117] border border-[#30363d] rounded-md p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <KeyRound className="w-4 h-4 text-amber-400" />
                    <span className="font-semibold text-white">
                      Saved Passwords ({profiles.filter((p) => p.has_saved_password).length})
                    </span>
                  </div>
                  {profiles.some((p) => p.has_saved_password) && (
                    <button
                      onClick={() => {
                        if (confirm("Clear ALL saved passwords from Windows Credential Manager?\nYou will need to re-enter passwords when connecting.")) {
                          clearAllSavedPasswords();
                        }
                      }}
                      className="px-2 py-0.5 rounded text-[10px] bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    >
                      Clear All Saved Passwords
                    </button>
                  )}
                </div>

                <div className="space-y-1.5">
                  {profiles.length === 0 ? (
                    <div className="text-[11px] text-[#6e7681] py-1">No connection profiles configured.</div>
                  ) : profiles.filter((p) => p.has_saved_password).length === 0 ? (
                    <div className="text-[11px] text-[#6e7681] py-1">
                      No saved passwords currently stored in Windows Credential Manager. You will be prompted whenever you connect.
                    </div>
                  ) : (
                    profiles
                      .filter((p) => p.has_saved_password)
                      .map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between p-2 rounded bg-[#161b22] border border-[#30363d]/60 text-xs"
                        >
                          <div>
                            <span className="font-medium text-white">{p.name}</span>
                            <span className="text-[11px] text-[#8b949e] font-mono-code ml-2">
                              {p.username}@{p.host}:{p.port}
                            </span>
                          </div>
                          <button
                            onClick={() => {
                              if (confirm(`Forget saved password for "${p.name}"?`)) {
                                deleteSavedPassword(p.id);
                              }
                            }}
                            className="px-2 py-0.5 rounded text-[11px] bg-[#21262d] hover:bg-amber-500/20 text-[#8b949e] hover:text-amber-300 border border-[#30363d] transition-colors"
                          >
                            Forget Password
                          </button>
                        </div>
                      ))
                  )}
                </div>
              </div>

              {/* Saved Connection Profiles Management */}
              <div className="bg-[#0d1117] border border-[#30363d] rounded-md p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">
                    Saved Connections ({profiles.length})
                  </span>
                </div>

                <div className="space-y-1.5">
                  {profiles.length === 0 ? (
                    <div className="text-[11px] text-[#6e7681] py-1">No connections created yet.</div>
                  ) : (
                    profiles.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between p-2 rounded bg-[#161b22] border border-[#30363d]/60 text-xs"
                      >
                        <div>
                          <span className="font-medium text-white">{p.name}</span>
                          <span className="text-[11px] text-[#8b949e] font-mono-code ml-2">
                            {p.username ? `${p.username}@` : ""}{p.host}:{p.port}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            if (confirm(`Delete connection "${p.name}"?\nThis removes the profile and any saved credentials.`)) {
                              deleteProfile(p.id);
                            }
                          }}
                          className="p-1 rounded text-[#8b949e] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Delete Connection"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="p-3 bg-[#0d1117] border border-[#30363d] rounded-md">
                <span className="font-semibold text-white block mb-1">
                  Strict Path Validation
                </span>
                <p className="text-[11px] text-[#8b949e]">
                  All local and remote file paths are validated against directory
                  traversal patterns (<code className="text-purple-300">..</code>) to
                  prevent unauthorized filesystem access.
                </p>
              </div>
            </div>
          )}

          {activeTab === "logs" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[#8b949e]">
                  Live System & Connection Logs ({logs.length} entries):
                </span>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      const text = logs
                        .map(
                          (l) =>
                            `[${l.timestamp}] [${l.level}] [${l.category}] ${l.message}`
                        )
                        .join("\n");
                      navigator.clipboard.writeText(text);
                    }}
                    className="px-2 py-0.5 rounded text-[10px] bg-[#21262d] hover:bg-[#30363d] text-[#8b949e] hover:text-white border border-[#30363d]"
                  >
                    Copy All
                  </button>
                  <button
                    onClick={() => clearLogs()}
                    className="px-2 py-0.5 rounded text-[10px] bg-[#21262d] hover:bg-red-500/20 text-[#8b949e] hover:text-red-400 border border-[#30363d]"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="bg-[#0d1117] border border-[#30363d] rounded p-2.5 font-mono text-[11px] text-[#c9d1d9] h-52 overflow-y-auto space-y-1 select-text">
                {logs.length === 0 ? (
                  <div className="text-[#6e7681] text-center pt-8 text-xs font-sans">
                    No logs recorded yet.
                  </div>
                ) : (
                  logs.map((log) => (
                    <div
                      key={log.id}
                      className={`flex items-start space-x-1.5 leading-tight ${
                        log.level === "ERROR"
                          ? "text-rose-300"
                          : log.level === "WARN"
                          ? "text-amber-300"
                          : log.level === "SUCCESS"
                          ? "text-emerald-300"
                          : "text-[#8b949e]"
                      }`}
                    >
                      <span className="text-[#6e7681] text-[10px]">{log.timestamp}</span>
                      <span className="font-bold text-[10px]">[{log.level}]</span>
                      <span className="text-[10px]">[{log.category}]</span>
                      <span className="text-white flex-1 break-all">{log.message}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-[#0d1117] border-t border-[#30363d] flex items-center justify-between">
          <button
            onClick={() => {
              if (confirm("Quit ByteFlow? All active connections, transfers, and open ports will be closed immediately.")) {
                api.exitApp();
              }
            }}
            className="px-3 py-1.5 rounded bg-red-600/10 hover:bg-red-600/20 text-red-400 hover:text-red-300 font-medium border border-red-500/20 transition-colors flex items-center space-x-1.5"
          >
            <PowerOff className="w-3.5 h-3.5" />
            <span>Quit ByteFlow</span>
          </button>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-[#21262d] hover:bg-[#30363d] text-white font-medium border border-[#30363d]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
