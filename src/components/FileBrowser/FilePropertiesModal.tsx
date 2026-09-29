import React, { useState } from "react";
import { X, FileText, Folder, Copy, Check, Hash, Loader2 } from "lucide-react";
import { FileItem } from "../../types";
import { api } from "../../services/api";

interface FilePropertiesModalProps {
  item: FileItem;
  isRemote: boolean;
  onClose: () => void;
}

export const FilePropertiesModal: React.FC<FilePropertiesModalProps> = ({
  item,
  isRemote,
  onClose,
}) => {
  const [checksum, setChecksum] = useState<string | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [copied, setCopied] = useState(false);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const handleCalculateChecksum = async () => {
    if (isRemote) return;
    try {
      setIsCalculating(true);
      const hash = await api.calculateLocalChecksum(item.path);
      setChecksum(hash);
      setIsCalculating(false);
    } catch (e: any) {
      setIsCalculating(false);
      alert(`Checksum failed: ${e.toString()}`);
    }
  };

  const handleCopyChecksum = () => {
    if (checksum) {
      navigator.clipboard.writeText(checksum);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg shadow-2xl w-full max-w-md text-xs overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#30363d] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {item.is_dir ? (
              <Folder className="w-4 h-4 text-blue-400" />
            ) : (
              <FileText className="w-4 h-4 text-[#8b949e]" />
            )}
            <span className="font-semibold text-white truncate max-w-[280px]">
              {item.name}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-[#8b949e] hover:text-white p-1 rounded hover:bg-[#21262d]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3 font-mono-code text-[#e6edf3]">
          <div>
            <span className="text-[#8b949e] text-[11px] block">Location:</span>
            <span className="break-all select-all text-xs">{item.path}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#30363d]/50">
            <div>
              <span className="text-[#8b949e] text-[11px] block">Size:</span>
              <span className="text-xs">
                {item.is_dir ? "—" : `${formatSize(item.size)} (${item.size.toLocaleString()} bytes)`}
              </span>
            </div>
            <div>
              <span className="text-[#8b949e] text-[11px] block">Type:</span>
              <span className="text-xs">
                {item.is_dir
                  ? "Directory"
                  : item.extension
                  ? `${item.extension.toUpperCase()} File`
                  : "File"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#30363d]/50">
            <div>
              <span className="text-[#8b949e] text-[11px] block">Modified:</span>
              <span className="text-xs">
                {item.modified
                  ? new Date(item.modified * 1000).toLocaleString()
                  : "Unknown"}
              </span>
            </div>
            <div>
              <span className="text-[#8b949e] text-[11px] block">Permissions:</span>
              <span className="text-xs">{item.permissions || "—"}</span>
            </div>
          </div>

          {/* Checksum calculator for local files */}
          {!item.is_dir && !isRemote && (
            <div className="pt-2 border-t border-[#30363d]/50">
              <span className="text-[#8b949e] text-[11px] block mb-1">
                SHA-256 Checksum:
              </span>
              {checksum ? (
                <div className="flex items-center space-x-2 bg-[#0d1117] p-2 rounded border border-[#30363d]">
                  <span className="text-[11px] break-all select-all text-emerald-400 flex-1">
                    {checksum}
                  </span>
                  <button
                    onClick={handleCopyChecksum}
                    title="Copy Checksum"
                    className="p-1 rounded text-[#8b949e] hover:text-white hover:bg-[#21262d]"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              ) : (
                <button
                  disabled={isCalculating}
                  onClick={handleCalculateChecksum}
                  className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded bg-[#21262d] hover:bg-[#30363d] text-white text-xs border border-[#30363d]"
                >
                  {isCalculating ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Hash className="w-3.5 h-3.5 text-blue-400" />
                  )}
                  <span>{isCalculating ? "Calculating..." : "Compute SHA-256"}</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-[#0d1117] border-t border-[#30363d] flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1 rounded bg-[#21262d] hover:bg-[#30363d] text-white font-medium border border-[#30363d]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
