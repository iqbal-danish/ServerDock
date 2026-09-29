import React, { useState } from "react";
import { X, CheckCircle2, XCircle, Loader2, Shield, KeyRound, Server, ShieldCheck } from "lucide-react";
import { ConnectionProfile, ConnectionTestResult } from "../../types";
import { useConnectionStore } from "../../stores/connectionStore";
import { useFileStore } from "../../stores/fileStore";

interface AddConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialProfile?: ConnectionProfile | null;
}

export const AddConnectionModal: React.FC<AddConnectionModalProps> = ({
  isOpen,
  onClose,
  initialProfile,
}) => {
  const {
    saveProfile,
    deleteSavedPassword,
    testConnection,
    connect,
    isTesting,
    testResult,
    clearTestResult,
  } = useConnectionStore();

  const { loadRemoteDirectory } = useFileStore();

  const [name, setName] = useState(initialProfile?.name || "Production Server");
  const [protocol, setProtocol] = useState(initialProfile?.protocol || "sftp");
  const [host, setHost] = useState(initialProfile?.host || "");
  const [port, setPort] = useState(initialProfile?.port || 22);
  const [username, setUsername] = useState(initialProfile?.username || "");
  const [authType, setAuthType] = useState<"password" | "key">(
    (initialProfile?.auth_type as "password" | "key") || "password"
  );
  const [password, setPassword] = useState("");
  const [keyPath, setKeyPath] = useState(initialProfile?.key_path || "");
  const [remoteDir, setRemoteDir] = useState(initialProfile?.remote_dir || "/");
  const [localDir, setLocalDir] = useState(initialProfile?.local_dir || "");
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleTest = async () => {
    setShowErrorDetails(false);
    await testConnection(
      host,
      Number(port),
      username,
      authType,
      password || undefined,
      keyPath || undefined
    );
  };

  const handleSaveAndConnect = async () => {
    try {
      setIsSaving(true);
      const profile: ConnectionProfile = {
        id: initialProfile?.id || crypto.randomUUID(),
        name: name.trim() || host,
        protocol,
        host: host.trim(),
        port: Number(port),
        username: username.trim(),
        auth_type: authType,
        key_path: keyPath.trim() || undefined,
        remote_dir: remoteDir.trim() || undefined,
        local_dir: localDir.trim() || undefined,
      };

      await saveProfile(profile, password || undefined);
      const connected = await connect(profile, password || undefined);
      if (connected) {
        loadRemoteDirectory(profile.remote_dir || ".");
      }
      setIsSaving(false);
      onClose();
    } catch (e: any) {
      setIsSaving(false);
      alert(`Save failed: ${e.toString()}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg shadow-2xl w-full max-w-lg text-xs overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-4 py-3 border-b border-[#30363d] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Server className="w-4 h-4 text-blue-400" />
            <span className="font-semibold text-white text-sm">
              {initialProfile ? "Edit Connection" : "Add Connection Profile"}
            </span>
          </div>
          <button
            onClick={() => {
              clearTestResult();
              onClose();
            }}
            className="text-[#8b949e] hover:text-white p-1 rounded hover:bg-[#21262d]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          {/* Connection Name */}
          <div>
            <label className="block text-[#8b949e] mb-1 font-medium">
              Connection Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Production Cluster, Dev SFTP"
              className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2.5 py-1.5 text-white focus:outline-hidden focus:border-blue-500 font-mono-code"
            />
          </div>

          {/* Protocol & Host & Port */}
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-3">
              <label className="block text-[#8b949e] mb-1 font-medium">
                Protocol
              </label>
              <select
                value={protocol}
                onChange={(e) => setProtocol(e.target.value)}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-white focus:outline-hidden focus:border-blue-500"
              >
                <option value="sftp">SFTP (SSH)</option>
                <option value="ftp" disabled>
                  FTP (Future)
                </option>
                <option value="ftps" disabled>
                  FTPS (Future)
                </option>
              </select>
            </div>

            <div className="col-span-6">
              <label className="block text-[#8b949e] mb-1 font-medium">
                Host / IP
              </label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="sftp.company.com"
                className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2.5 py-1.5 text-white focus:outline-hidden focus:border-blue-500 font-mono-code"
              />
            </div>

            <div className="col-span-3">
              <label className="block text-[#8b949e] mb-1 font-medium">Port</label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2.5 py-1.5 text-white focus:outline-hidden focus:border-blue-500 font-mono-code"
              />
            </div>
          </div>

          {/* Username */}
          <div>
            <label className="block text-[#8b949e] mb-1 font-medium">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="deploy, root, user"
              className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2.5 py-1.5 text-white focus:outline-hidden focus:border-blue-500 font-mono-code"
            />
          </div>

          {/* Authentication Type Radio */}
          <div>
            <label className="block text-[#8b949e] mb-1.5 font-medium">
              Authentication Method
            </label>
            <div className="flex items-center space-x-4">
              <label className="flex items-center space-x-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="authType"
                  value="password"
                  checked={authType === "password"}
                  onChange={() => setAuthType("password")}
                  className="accent-blue-500"
                />
                <span className="text-white">Password</span>
              </label>
              <label className="flex items-center space-x-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="authType"
                  value="key"
                  checked={authType === "key"}
                  onChange={() => setAuthType("key")}
                  className="accent-blue-500"
                />
                <span className="text-white">SSH Private Key</span>
              </label>
            </div>
          </div>

          {/* Secret / Key Input */}
          {authType === "password" ? (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[#8b949e] font-medium">
                  Password
                </label>
                {initialProfile?.has_saved_password && (
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] text-emerald-400 flex items-center space-x-1">
                      <ShieldCheck className="w-3 h-3" />
                      <span>Password saved in OS</span>
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        if (confirm(`Remove saved password for "${initialProfile.name}" from Windows Credential Manager?`)) {
                          await deleteSavedPassword(initialProfile.id);
                        }
                      }}
                      className="text-[10px] text-amber-400 hover:text-amber-300 underline font-medium"
                    >
                      Forget Password
                    </button>
                  </div>
                )}
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  initialProfile?.has_saved_password
                    ? "(Password saved - leave blank to keep, or enter new password)"
                    : initialProfile
                    ? "(No password saved - enter to save)"
                    : "Enter password"
                }
                className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2.5 py-1.5 text-white focus:outline-hidden focus:border-blue-500 font-mono-code"
              />
              <span className="text-[10px] text-[#6e7681] mt-1 block">
                Saved securely in Windows Credential Manager using OS encryption.
              </span>
            </div>
          ) : (
            <div>
              <label className="block text-[#8b949e] mb-1 font-medium">
                Private Key File Path
              </label>
              <input
                type="text"
                value={keyPath}
                onChange={(e) => setKeyPath(e.target.value)}
                placeholder="C:\Users\username\.ssh\id_ed25519"
                className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2.5 py-1.5 text-white focus:outline-hidden focus:border-blue-500 font-mono-code"
              />
            </div>
          )}

          {/* Remote Starting Directory */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[#8b949e] mb-1 font-medium">
                Remote Directory (optional)
              </label>
              <input
                type="text"
                value={remoteDir}
                onChange={(e) => setRemoteDir(e.target.value)}
                placeholder="/home/user/feeds"
                className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2.5 py-1.5 text-white focus:outline-hidden focus:border-blue-500 font-mono-code"
              />
            </div>
            <div>
              <label className="block text-[#8b949e] mb-1 font-medium">
                Local Directory (optional)
              </label>
              <input
                type="text"
                value={localDir}
                onChange={(e) => setLocalDir(e.target.value)}
                placeholder="Default local folder"
                className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2.5 py-1.5 text-white focus:outline-hidden focus:border-blue-500 font-mono-code"
              />
            </div>
          </div>

          {/* Test Connection Results Card */}
          {testResult && (
            <div
              className={`p-3 rounded-md border text-xs ${
                testResult.success
                  ? "bg-emerald-950/20 border-emerald-500/40"
                  : "bg-red-950/20 border-red-500/40"
              }`}
            >
              <div className="font-semibold text-white mb-2 flex items-center justify-between">
                <span>
                  {testResult.success
                    ? "Connection Successful"
                    : "Connection Failed"}
                </span>
                {testResult.error_details && (
                  <button
                    onClick={() => setShowErrorDetails(!showErrorDetails)}
                    className="text-blue-400 hover:underline text-[11px]"
                  >
                    {showErrorDetails ? "Hide Details" : "Show Details"}
                  </button>
                )}
              </div>

              <div className="space-y-1.5">
                {testResult.steps.map((step, idx) => (
                  <div key={idx} className="flex items-center space-x-2">
                    {step.status === "success" ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    ) : step.status === "failed" ? (
                      <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                    ) : (
                      <span className="w-3.5 h-3.5 rounded-full border border-gray-500 flex-shrink-0" />
                    )}
                    <span className="text-[#e6edf3] font-medium">{step.title}</span>
                    {step.message && (
                      <span className="text-[#8b949e] text-[11px] truncate">
                        - {step.message}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {showErrorDetails && testResult.error_details && (
                <div className="mt-2.5 p-2 bg-[#0d1117] rounded border border-[#30363d] font-mono-code text-[11px] text-red-300 break-all select-text">
                  {testResult.error_details}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-4 py-3 bg-[#0d1117] border-t border-[#30363d] flex items-center justify-between">
          <button
            type="button"
            disabled={isTesting || !host || !username}
            onClick={handleTest}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-[#21262d] hover:bg-[#30363d] text-white font-medium border border-[#30363d] disabled:opacity-50 transition-colors"
          >
            {isTesting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{isTesting ? "Testing..." : "Test Connection"}</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => {
                clearTestResult();
                onClose();
              }}
              className="px-3 py-1.5 rounded text-[#8b949e] hover:text-white hover:bg-[#21262d] transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSaving || !host || !username}
              onClick={handleSaveAndConnect}
              className="flex items-center space-x-1.5 px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-sm disabled:opacity-50 transition-colors"
            >
              {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Save & Connect</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
