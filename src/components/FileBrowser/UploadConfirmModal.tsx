import React, { useState, useEffect } from "react";
import {
  Upload,
  Folder,
  FileCode,
  FileText,
  AlertTriangle,
  CheckCircle2,
  X,
  Edit2,
  Copy,
} from "lucide-react";
import { FileItem } from "../../types";

interface UploadConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: FileItem[];
  defaultRemoteFolder: string;
  existingRemoteFiles: FileItem[];
  onConfirm: (
    uploads: Array<{
      localFile: FileItem;
      targetFolder: string;
      targetFileName: string;
    }>
  ) => void;
}

export const UploadConfirmModal: React.FC<UploadConfirmModalProps> = ({
  isOpen,
  onClose,
  items,
  defaultRemoteFolder,
  existingRemoteFiles,
  onConfirm,
}) => {
  const [targetFolder, setTargetFolder] = useState(defaultRemoteFolder);
  const [fileRenames, setFileRenames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      setTargetFolder(defaultRemoteFolder.replace(/\\/g, "/"));
      const initial: Record<string, string> = {};
      items.forEach((item) => {
        initial[item.path] = item.name;
      });
      setFileRenames(initial);
    }
  }, [isOpen, defaultRemoteFolder, items]);

  if (!isOpen || items.length === 0) return null;

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const cleanTargetFolder = targetFolder.trim().replace(/\\/g, "/").replace(/\/+$/, "") || "/";

  // Check if any target file name already exists on the remote directory
  const conflicts: Array<{ item: FileItem; targetName: string; existing: FileItem }> = [];
  items.forEach((item) => {
    const targetName = fileRenames[item.path] || item.name;
    const existing = existingRemoteFiles.find(
      (rf) => rf.name.toLowerCase() === targetName.toLowerCase()
    );
    if (existing) {
      conflicts.push({ item, targetName, existing });
    }
  });

  const hasConflicts = conflicts.length > 0;

  const handleRenameChange = (itemPath: string, newName: string) => {
    setFileRenames((prev) => ({
      ...prev,
      [itemPath]: newName,
    }));
  };

  const handleAutoRename = (itemPath: string) => {
    const currentName = fileRenames[itemPath] || items.find((i) => i.path === itemPath)?.name || "";
    const lastDot = currentName.lastIndexOf(".");
    let newName = "";
    if (lastDot > 0) {
      const base = currentName.substring(0, lastDot);
      const ext = currentName.substring(lastDot);
      newName = `${base}_copy${ext}`;
    } else {
      newName = `${currentName}_copy`;
    }
    handleRenameChange(itemPath, newName);
  };

  const handleSubmit = (overwrite = false) => {
    const uploads = items.map((localFile) => {
      const targetFileName = (fileRenames[localFile.path] || localFile.name).trim();
      return {
        localFile,
        targetFolder: cleanTargetFolder,
        targetFileName,
      };
    });
    onConfirm(uploads);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs select-none p-4">
      <div className="w-full max-w-lg bg-[#161b22] border border-[#30363d] rounded-lg shadow-2xl overflow-hidden flex flex-col text-xs">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#30363d] flex items-center justify-between bg-[#0d1117]">
          <div className="flex items-center space-x-2">
            <Upload className="w-4 h-4 text-blue-400" />
            <span className="font-semibold text-white text-sm">
              Upload to Remote Server
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-[#8b949e] hover:text-white p-1 rounded hover:bg-[#21262d] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Remote Target Folder */}
          <div className="space-y-1.5">
            <label className="text-white font-medium flex items-center space-x-1.5">
              <Folder className="w-3.5 h-3.5 text-amber-400" />
              <span>Destination Folder on Remote Server:</span>
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={targetFolder}
                onChange={(e) => setTargetFolder(e.target.value)}
                placeholder="/home/user/feeds or /doc/DocDat/Ses"
                className="flex-1 bg-[#0d1117] border border-[#30363d] rounded px-3 py-1.5 text-white font-mono-code focus:outline-hidden focus:border-blue-500"
              />
            </div>
            <span className="text-[10px] text-[#8b949e]">
              Enter the exact folder path on the connected SFTP server where files will be uploaded.
            </span>
          </div>

          {/* Files List & Rename Fields */}
          <div className="space-y-2">
            <label className="text-white font-medium flex items-center justify-between">
              <span>File(s) to Upload & Rename Option:</span>
              <span className="text-[10px] text-[#8b949e] font-mono">
                {items.length} file{items.length > 1 ? "s" : ""}
              </span>
            </label>

            <div className="space-y-2">
              {items.map((item) => {
                const currentTargetName = fileRenames[item.path] || item.name;
                const conflict = conflicts.find((c) => c.item.path === item.path);

                return (
                  <div
                    key={item.path}
                    className={`p-2.5 rounded border bg-[#0d1117] space-y-2 ${
                      conflict
                        ? "border-amber-500/50 bg-amber-950/10"
                        : "border-[#30363d]"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[#8b949e]">
                      <div className="flex items-center space-x-2 truncate">
                        <FileCode className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                        <span className="text-white font-medium truncate font-mono">
                          {item.name}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono ml-2 flex-shrink-0">
                        {formatSize(item.size)}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-[11px] text-[#8b949e] flex-shrink-0">
                          Target Name:
                        </span>
                        <input
                          type="text"
                          value={currentTargetName}
                          onChange={(e) => handleRenameChange(item.path, e.target.value)}
                          className="flex-1 bg-[#161b22] border border-[#30363d] rounded px-2 py-1 text-white font-mono text-[11px] focus:outline-hidden focus:border-blue-500"
                        />
                        <button
                          type="button"
                          onClick={() => handleAutoRename(item.path)}
                          title="Append _copy to filename"
                          className="px-2 py-1 bg-[#21262d] hover:bg-[#30363d] text-[#8b949e] hover:text-white rounded border border-[#30363d] flex items-center space-x-1 flex-shrink-0 text-[10px]"
                        >
                          <Copy className="w-3 h-3 text-purple-400" />
                          <span>+ _copy</span>
                        </button>
                      </div>
                    </div>

                    {/* Conflict Notice for this item */}
                    {conflict && (
                      <div className="p-2 rounded bg-amber-950/40 border border-amber-500/30 text-amber-200 text-[11px] flex items-start space-x-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold block">
                            File already exists on remote server!
                          </span>
                          <span className="text-[10px] text-amber-300/80 font-mono block">
                            Existing: {conflict.targetName} ({formatSize(conflict.existing.size)})
                          </span>
                          <span className="text-[10px] text-amber-400/90 block mt-0.5">
                            You can rename it above or click "Overwrite Existing File" below.
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-4 py-3 border-t border-[#30363d] flex items-center justify-between bg-[#0d1117]">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded bg-[#21262d] hover:bg-[#30363d] text-white transition-colors"
          >
            Cancel
          </button>

          <div className="flex items-center space-x-2">
            {hasConflicts ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    conflicts.forEach((c) => handleAutoRename(c.item.path));
                  }}
                  className="px-3 py-1.5 rounded bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/40 transition-colors font-medium flex items-center space-x-1"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Rename to Avoid Overwrite</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSubmit(true)}
                  className="px-4 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white font-medium shadow-xs transition-colors flex items-center space-x-1.5"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Overwrite & Upload</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => handleSubmit(false)}
                className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-xs transition-colors flex items-center space-x-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Upload to Remote</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
