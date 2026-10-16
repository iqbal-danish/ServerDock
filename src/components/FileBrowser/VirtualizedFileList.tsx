import React, { useRef, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Folder,
  FileText,
  FileCode,
  FileSpreadsheet,
  FileArchive,
  Image,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { FileItem } from "../../types";

interface VirtualizedFileListProps {
  files: FileItem[];
  selectedPaths: string[];
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  isRemote: boolean;
  onSelect: (path: string, multi: boolean, range?: boolean) => void;
  onOpen: (item: FileItem) => void;
  onContextMenu: (e: React.MouseEvent, item: FileItem) => void;
  onDropFiles?: (sourcePaths: string[], isSourceRemote: boolean) => void;
  onRetry?: () => void;
}

export const VirtualizedFileList: React.FC<VirtualizedFileListProps> = ({
  files,
  selectedPaths,
  isLoading,
  error,
  searchQuery,
  isRemote,
  onSelect,
  onOpen,
  onContextMenu,
  onDropFiles,
  onRetry,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);

  // Filter files by search query
  const filteredFiles = searchQuery
    ? files.filter((f) =>
        f.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : files;

  const rowVirtualizer = useVirtualizer({
    count: filteredFiles.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 25,
  });

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "—";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const getFileIcon = (item: FileItem) => {
    if (item.is_dir) {
      return <Folder className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />;
    }
    const ext = item.extension?.toLowerCase();
    if (ext === "xml" || ext === "json" || ext === "yaml" || ext === "yml") {
      return <FileCode className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />;
    }
    if (ext === "csv" || ext === "tsv" || ext === "xlsx") {
      return <FileSpreadsheet className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />;
    }
    if (ext === "zip" || ext === "tar" || ext === "gz" || ext === "7z") {
      return <FileArchive className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />;
    }
    if (ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "svg") {
      return <Image className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />;
    }
    return <FileText className="w-3.5 h-3.5 text-[#8b949e] flex-shrink-0" />;
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (filteredFiles.length === 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const currentIdx = filteredFiles.findIndex((f) =>
        selectedPaths.includes(f.path)
      );
      let nextIdx = 0;
      if (currentIdx !== -1) {
        nextIdx =
          e.key === "ArrowDown"
            ? Math.min(filteredFiles.length - 1, currentIdx + 1)
            : Math.max(0, currentIdx - 1);
      }
      onSelect(filteredFiles[nextIdx].path, e.ctrlKey || e.metaKey, e.shiftKey);
      rowVirtualizer.scrollToIndex(nextIdx, { align: "auto" });
    } else if (e.key === "Enter" && selectedPaths.length === 1) {
      e.preventDefault();
      const item = filteredFiles.find((f) => f.path === selectedPaths[0]);
      if (item) onOpen(item);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-xs text-[#8b949e]">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500 mb-2" />
        <span>Loading directory contents...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-xs text-red-400">
        <AlertTriangle className="w-6 h-6 text-red-500 mb-2" />
        <span className="font-semibold mb-1">Unable to load directory</span>
        <span className="text-[11px] text-[#8b949e] max-w-sm text-center">
          {error}
        </span>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-3 px-3 py-1.5 rounded bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reconnect & Retry</span>
          </button>
        )}
      </div>
    );
  }

  if (filteredFiles.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-xs text-[#8b949e]">
        <span>
          {searchQuery ? "No matching files found." : "This folder is empty."}
        </span>
      </div>
    );
  }

  return (
    <div
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="flex-1 flex flex-col overflow-hidden outline-hidden select-none bg-[#0d1117]"
    >
      {/* Table Header Columns */}
      <div className="h-7 bg-[#161b22] border-b border-[#30363d] text-[11px] font-semibold text-[#8b949e] flex items-center px-3 select-none">
        <div className="flex-1 truncate">Name</div>
        <div className="w-24 text-right pr-4">Size</div>
        <div className="w-20 text-left">Type</div>
        <div className="w-36 text-right">Modified</div>
      </div>

      {/* Virtualized Rows List */}
      <div ref={parentRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const item = filteredFiles[virtualRow.index];
            const isSelected = selectedPaths.includes(item.path);

            return (
              <div
                key={item.path}
                draggable
                onDragStart={(e) => {
                  const pathsToDrag = isSelected
                    ? selectedPaths
                    : [item.path];
                  e.dataTransfer.setData(
                    "application/json",
                    JSON.stringify({ paths: pathsToDrag, isRemote })
                  );
                }}
                onDragOver={(e) => {
                  if (item.is_dir) {
                    e.preventDefault();
                    e.currentTarget.classList.add("bg-blue-600/30");
                  }
                }}
                onDragLeave={(e) => {
                  if (item.is_dir) {
                    e.currentTarget.classList.remove("bg-blue-600/30");
                  }
                }}
                onDrop={(e) => {
                  if (item.is_dir) {
                    e.preventDefault();
                    e.currentTarget.classList.remove("bg-blue-600/30");
                    const raw = e.dataTransfer.getData("application/json");
                    if (raw) {
                      try {
                        const parsed = JSON.parse(raw);
                        onDropFiles?.(parsed.paths, parsed.isRemote);
                      } catch (_) {}
                    }
                  }
                }}
                onClick={(e) => {
                  onSelect(item.path, e.ctrlKey || e.metaKey, e.shiftKey);
                }}
                onDoubleClick={() => onOpen(item)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (!isSelected) {
                    onSelect(item.path, false);
                  }
                  onContextMenu(e, item);
                }}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className={`flex items-center px-3 text-xs border-b border-[#21262d]/40 cursor-default transition-colors ${
                  isSelected
                    ? "bg-blue-600/25 text-white font-medium"
                    : "text-[#e6edf3] hover:bg-[#161b22]/80"
                }`}
              >
                {/* File Icon & Name */}
                <div className="flex-1 flex items-center space-x-2 truncate pr-2">
                  {getFileIcon(item)}
                  <span className="truncate">{item.name}</span>
                </div>

                {/* File Size */}
                <div className="w-24 text-right pr-4 font-mono-code text-[11px] text-[#8b949e]">
                  {formatSize(item.size)}
                </div>

                {/* File Type */}
                <div className="w-20 text-left text-[11px] text-[#8b949e] truncate">
                  {item.is_dir ? "Folder" : item.extension || "File"}
                </div>

                {/* Modified Date */}
                <div className="w-36 text-right font-mono-code text-[10px] text-[#8b949e] truncate">
                  {item.modified
                    ? new Date(item.modified * 1000).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pane Footer Status (item count and total size) */}
      <div className="h-6 bg-[#161b22] border-t border-[#30363d] px-3 flex items-center justify-between text-[10px] text-[#8b949e]">
        <span>
          {filteredFiles.length} item{filteredFiles.length === 1 ? "" : "s"}
          {searchQuery && ` (filtered from ${files.length})`}
        </span>
        {selectedPaths.length > 0 && (
          <span className="text-blue-400 font-medium">
            {selectedPaths.length} selected
          </span>
        )}
      </div>
    </div>
  );
};
