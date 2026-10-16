import React, { useState, useEffect } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  RefreshCw,
  FolderPlus,
  Search,
  Upload,
  Download,
} from "lucide-react";

interface PaneHeaderProps {
  title: string;
  isRemote: boolean;
  currentPath: string;
  onNavigate: (path: string) => void;
  onBack: () => void;
  onForward: () => void;
  onUp: () => void;
  onRefresh: () => void;
  loading?: boolean;
  onCreateFolder: (name: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onActionClick: () => void;
  actionDisabled?: boolean;
}

export const PaneHeader: React.FC<PaneHeaderProps> = ({
  title,
  isRemote,
  currentPath,
  onNavigate,
  onBack,
  onForward,
  onUp,
  onRefresh,
  loading = false,
  onCreateFolder,
  searchQuery,
  onSearchChange,
  onActionClick,
  actionDisabled,
}) => {
  const [editingPath, setEditingPath] = useState(currentPath);
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    setEditingPath(currentPath);
  }, [currentPath]);

  const handlePathSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingPath.trim()) {
      onNavigate(editingPath.trim());
    }
  };

  const handleCreateFolder = () => {
    const name = prompt("Enter new folder name:");
    if (name && name.trim()) {
      onCreateFolder(name.trim());
    }
  };

  return (
    <div className="bg-[#161b22] border-b border-[#30363d] p-2 space-y-2 select-none">
      {/* Top Bar: Title & Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#e6edf3]">
            {title}
          </span>
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#21262d] text-[#8b949e] border border-[#30363d]">
            {isRemote ? "SFTP" : "Local Disk"}
          </span>
        </div>

        {/* Quick Action Button (Upload / Download) */}
        <button
          disabled={actionDisabled}
          onClick={onActionClick}
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors shadow-xs ${
            isRemote
              ? "bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40"
              : "bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40"
          }`}
        >
          {isRemote ? (
            <>
              <Download className="w-3.5 h-3.5" />
              <span>Download</span>
            </>
          ) : (
            <>
              <Upload className="w-3.5 h-3.5" />
              <span>Upload</span>
            </>
          )}
        </button>
      </div>

      {/* Navigation Buttons & Path Bar */}
      <div className="flex items-center space-x-1">
        <button
          onClick={onBack}
          title="Back (Alt+Left)"
          className="p-1 rounded text-[#8b949e] hover:text-white hover:bg-[#21262d] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onForward}
          title="Forward (Alt+Right)"
          className="p-1 rounded text-[#8b949e] hover:text-white hover:bg-[#21262d] transition-colors"
        >
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onUp}
          title="Parent Directory (Backspace)"
          className="p-1 rounded text-[#8b949e] hover:text-white hover:bg-[#21262d] transition-colors"
        >
          <ArrowUp className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onRefresh}
          title="Refresh (Ctrl+R)"
          disabled={loading}
          className="p-1 rounded text-[#8b949e] hover:text-white hover:bg-[#21262d] transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
        </button>
        <button
          onClick={handleCreateFolder}
          title="New Folder"
          className="p-1 rounded text-[#8b949e] hover:text-white hover:bg-[#21262d] transition-colors"
        >
          <FolderPlus className="w-3.5 h-3.5" />
        </button>

        {/* Path Form Input */}
        <form onSubmit={handlePathSubmit} className="flex-1 flex items-center ml-1">
          <input
            type="text"
            value={editingPath}
            onChange={(e) => setEditingPath(e.target.value)}
            className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-xs text-white font-mono-code focus:outline-hidden focus:border-blue-500"
            placeholder={isRemote ? "/path/to/remote" : "C:\\path\\to\\local"}
          />
        </form>

        {/* Filter Toggle */}
        <button
          onClick={() => setShowSearch(!showSearch)}
          title="Filter files in directory"
          className={`p-1 rounded transition-colors ${
            showSearch || searchQuery
              ? "bg-blue-600/20 text-blue-400 border border-blue-500/40"
              : "text-[#8b949e] hover:text-white hover:bg-[#21262d]"
          }`}
        >
          <Search className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Filter / Search Bar */}
      {(showSearch || searchQuery) && (
        <div className="pt-1">
          <div className="relative">
            <Search className="w-3 h-3 text-[#6e7681] absolute left-2 top-2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Filter by name..."
              className="w-full bg-[#0d1117] border border-[#30363d] rounded pl-7 pr-2 py-1 text-xs text-white focus:outline-hidden focus:border-blue-500 font-mono-code"
            />
          </div>
        </div>
      )}
    </div>
  );
};
