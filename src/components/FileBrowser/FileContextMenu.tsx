import React, { useEffect, useRef } from "react";
import {
  FileText,
  Eye,
  Edit3,
  Download,
  Upload,
  Copy,
  Trash2,
  Info,
  GitCompare,
  Terminal,
} from "lucide-react";
import { FileItem } from "../../types";

interface FileContextMenuProps {
  x: number;
  y: number;
  item: FileItem;
  isRemote: boolean;
  onClose: () => void;
  onOpen: () => void;
  onPreview: () => void;
  onOpenEditor: () => void;
  onTransfer: () => void;
  onRename: () => void;
  onDelete: () => void;
  onCopyPath: () => void;
  onProperties: () => void;
  onCompare: () => void;
}

export const FileContextMenu: React.FC<FileContextMenuProps> = ({
  x,
  y,
  item,
  isRemote,
  onClose,
  onOpen,
  onPreview,
  onOpenEditor,
  onTransfer,
  onRename,
  onDelete,
  onCopyPath,
  onProperties,
  onCompare,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Adjust positioning to stay within viewport
  const adjustedX = Math.min(x, window.innerWidth - 220);
  const adjustedY = Math.min(y, window.innerHeight - 340);

  const isTextFile =
    !item.is_dir &&
    (item.extension === "xml" ||
      item.extension === "json" ||
      item.extension === "txt" ||
      item.extension === "log" ||
      item.extension === "csv" ||
      item.extension === "tsv" ||
      item.extension === "yml" ||
      item.extension === "yaml" ||
      item.extension === "md" ||
      item.extension === "sql");

  return (
    <div
      ref={menuRef}
      style={{ left: adjustedX, top: adjustedY }}
      className="fixed z-50 w-52 bg-[#161b22] border border-[#30363d] rounded-md shadow-2xl py-1 text-xs select-none"
    >
      <button
        onClick={() => {
          onOpen();
          onClose();
        }}
        className="w-full px-3 py-1.5 text-left text-white hover:bg-blue-600 flex items-center space-x-2"
      >
        <FileText className="w-3.5 h-3.5 text-[#8b949e]" />
        <span>Open</span>
      </button>

      {isTextFile && (
        <>
          <button
            onClick={() => {
              onPreview();
              onClose();
            }}
            className="w-full px-3 py-1.5 text-left text-white hover:bg-blue-600 flex items-center space-x-2"
          >
            <Eye className="w-3.5 h-3.5 text-[#8b949e]" />
            <span>Preview File</span>
          </button>

          <button
            onClick={() => {
              onOpenEditor();
              onClose();
            }}
            className="w-full px-3 py-1.5 text-left text-white hover:bg-blue-600 flex items-center space-x-2 font-medium"
          >
            <Edit3 className="w-3.5 h-3.5 text-blue-400" />
            <span>Open in Large-File Editor</span>
          </button>
        </>
      )}

      <div className="h-px bg-[#30363d] my-1" />

      {/* Transfer Action */}
      <button
        onClick={() => {
          onTransfer();
          onClose();
        }}
        className="w-full px-3 py-1.5 text-left text-white hover:bg-blue-600 flex items-center space-x-2"
      >
        {isRemote ? (
          <>
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Download to Local</span>
          </>
        ) : (
          <>
            <Upload className="w-3.5 h-3.5 text-blue-400" />
            <span>Upload to Remote</span>
          </>
        )}
      </button>

      {!item.is_dir && (
        <button
          onClick={() => {
            onCompare();
            onClose();
          }}
          className="w-full px-3 py-1.5 text-left text-white hover:bg-blue-600 flex items-center space-x-2"
        >
          <GitCompare className="w-3.5 h-3.5 text-[#8b949e]" />
          <span>Compare With...</span>
        </button>
      )}

      <div className="h-px bg-[#30363d] my-1" />

      <button
        onClick={() => {
          onCopyPath();
          onClose();
        }}
        className="w-full px-3 py-1.5 text-left text-white hover:bg-blue-600 flex items-center space-x-2"
      >
        <Copy className="w-3.5 h-3.5 text-[#8b949e]" />
        <span>Copy Path</span>
      </button>

      <button
        onClick={() => {
          onRename();
          onClose();
        }}
        className="w-full px-3 py-1.5 text-left text-white hover:bg-blue-600 flex items-center space-x-2"
      >
        <Edit3 className="w-3.5 h-3.5 text-[#8b949e]" />
        <span>Rename</span>
      </button>

      <button
        onClick={() => {
          onDelete();
          onClose();
        }}
        className="w-full px-3 py-1.5 text-left text-red-400 hover:bg-red-600 hover:text-white flex items-center space-x-2"
      >
        <Trash2 className="w-3.5 h-3.5" />
        <span>Delete</span>
      </button>

      <div className="h-px bg-[#30363d] my-1" />

      <button
        onClick={() => {
          onProperties();
          onClose();
        }}
        className="w-full px-3 py-1.5 text-left text-white hover:bg-blue-600 flex items-center space-x-2"
      >
        <Info className="w-3.5 h-3.5 text-[#8b949e]" />
        <span>Properties</span>
      </button>
    </div>
  );
};
