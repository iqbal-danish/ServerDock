import React, { useState } from "react";
import { KeyRound, Eye, EyeOff, Loader2, X, Shield } from "lucide-react";
import { ConnectionProfile } from "../../types";

interface PasswordPromptModalProps {
  isOpen: boolean;
  profile: ConnectionProfile | null;
  errorMessage?: string | null;
  onClose: () => void;
  onSubmit: (password: string, saveToKeyring: boolean) => Promise<void>;
}

export const PasswordPromptModal: React.FC<PasswordPromptModalProps> = ({
  isOpen,
  profile,
  errorMessage,
  onClose,
  onSubmit,
}) => {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saveToKeyring, setSaveToKeyring] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !profile) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    try {
      setIsSubmitting(true);
      await onSubmit(password, saveToKeyring);
      setIsSubmitting(false);
      setPassword("");
      onClose();
    } catch (_) {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 select-none">
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg shadow-2xl w-full max-w-md text-xs overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#30363d] flex items-center justify-between bg-[#1f242c]">
          <div className="flex items-center space-x-2">
            <KeyRound className="w-4 h-4 text-amber-400" />
            <span className="font-semibold text-white text-sm">
              Authentication Required
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-[#8b949e] hover:text-white p-1 rounded hover:bg-[#30363d]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="p-2.5 rounded bg-[#0d1117] border border-[#30363d] space-y-1">
            <div className="font-medium text-white">{profile.name}</div>
            <div className="text-[11px] text-[#8b949e] font-mono-code">
              {profile.username ? `${profile.username}@` : ""}
              {profile.host}:{profile.port}
            </div>
          </div>

          {errorMessage && (
            <div className="p-2.5 rounded bg-red-950/40 border border-red-800/40 text-rose-300 text-[11px] space-y-0.5">
              <span className="font-semibold block">Connection rejected:</span>
              <span>{errorMessage}</span>
            </div>
          )}

          <div>
            <label className="block text-[#c9d1d9] mb-1 font-medium">
              Enter Password for user <span className="text-white font-mono">{profile.username}</span>:
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                autoFocus
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password..."
                className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 pr-9 text-white font-mono focus:outline-hidden focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-2.5 text-[#8b949e] hover:text-white"
              >
                {showPassword ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          <label className="flex items-center space-x-2 text-[#8b949e] hover:text-white cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={saveToKeyring}
              onChange={(e) => setSaveToKeyring(e.target.checked)}
              className="rounded bg-[#0d1117] border-[#30363d] text-blue-500 focus:ring-0"
            />
            <div className="flex items-center space-x-1.5">
              <Shield className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-[11px]">Save password securely in Windows Credential Manager</span>
            </div>
          </label>

          {/* Actions */}
          <div className="pt-3 border-t border-[#30363d] flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded text-white bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !password}
              className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium flex items-center space-x-1.5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Connecting...</span>
                </>
              ) : (
                <span>Connect</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
