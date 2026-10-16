import React, { useState, useRef, useEffect } from "react";
import { X, Server } from "lucide-react";
import { PaneHeader } from "./PaneHeader";
import { VirtualizedFileList } from "./VirtualizedFileList";
import { FileContextMenu } from "./FileContextMenu";
import { FilePropertiesModal } from "./FilePropertiesModal";
import { UploadConfirmModal } from "./UploadConfirmModal";
import { ConnectionLogConsole } from "./ConnectionLogConsole";
import { FileItem } from "../../types";
import { useFileStore } from "../../stores/fileStore";
import { useConnectionStore } from "../../stores/connectionStore";
import { useTransferStore } from "../../stores/transferStore";
import { useEditorStore } from "../../stores/editorStore";
import { useDiffStore } from "../../stores/diffStore";
import { api } from "../../services/api";

interface FileBrowserProps {
  onSwitchTab: (tab: "editor" | "diff") => void;
}

export const FileBrowser: React.FC<FileBrowserProps> = ({ onSwitchTab }) => {
  const {
    localPath,
    localFiles,
    localLoading,
    localError,
    localSelected,
    localSearchQuery,
    loadLocalDirectory,
    navigateLocalBack,
    navigateLocalForward,
    navigateLocalUp,
    refreshLocal,
    toggleLocalSelected,
    setLocalSearchQuery,

    remotePath,
    remoteFiles,
    remoteLoading,
    remoteError,
    remoteSelected,
    remoteSearchQuery,
    loadRemoteDirectory,
    navigateRemoteBack,
    navigateRemoteForward,
    navigateRemoteUp,
    refreshRemote,
    toggleRemoteSelected,
    setRemoteSearchQuery,
    switchRemoteServer,
    closeRemoteServer,
  } = useFileStore();

  const {
    status,
    connectedProfiles,
    activeProfileId,
    switchActiveSession,
    disconnect,
  } = useConnectionStore();
  const { queueUpload, queueDownload } = useTransferStore();
  const { openFile } = useEditorStore();
  const { setFileA } = useDiffStore();
  const [uploadModalItems, setUploadModalItems] = useState<FileItem[]>([]);

  const activeProfile = connectedProfiles.find((p) => p.id === activeProfileId);

  const handleSwitchServer = async (profileId: string) => {
    const newPath = await switchActiveSession(profileId);
    await switchRemoteServer(profileId, newPath || undefined);
  };

  const handleDisconnectServer = async (profileId: string) => {
    closeRemoteServer(profileId);
    await disconnect(profileId);
    const nextActiveId = useConnectionStore.getState().activeProfileId;
    if (nextActiveId) {
      await switchRemoteServer(nextActiveId);
    }
  };

  const containerRef = useRef<HTMLDivElement>(null);
  const [splitPercent, setSplitPercent] = useState<number>(50);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: FileItem;
    isRemote: boolean;
  } | null>(null);

  // Properties Modal State
  const [propertiesItem, setPropertiesItem] = useState<{
    item: FileItem;
    isRemote: boolean;
  } | null>(null);

  // Drag over states
  const [isLocalDragOver, setIsLocalDragOver] = useState(false);
  const [isRemoteDragOver, setIsRemoteDragOver] = useState(false);

  // Resizer mouse event handlers
  const handleMouseDownSplitter = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const offset = e.clientX - rect.left;
      const percent = (offset / rect.width) * 100;
      // Clamp between 20% and 80% so both panes remain accessible
      setSplitPercent(Math.min(80, Math.max(20, percent)));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  // Handle double click on item
  const handleItemOpen = (item: FileItem, isRemote: boolean) => {
    if (item.is_dir) {
      if (isRemote) {
        loadRemoteDirectory(item.path, true);
      } else {
        loadLocalDirectory(item.path, true);
      }
    } else {
      openFile(item.path, item.name, isRemote);
      onSwitchTab("editor");
    }
  };

  // Handle Upload
  const handleUploadSelected = () => {
    if (!status.connected) {
      alert("Please connect to a server before uploading.");
      return;
    }
    const itemsToUpload = localFiles.filter(
      (f) => localSelected.includes(f.path) && !f.is_dir
    );
    if (itemsToUpload.length === 0) {
      alert("Please select one or more files to upload.");
      return;
    }
    setUploadModalItems(itemsToUpload);
  };

  const handleConfirmUpload = async (
    uploads: Array<{ localFile: FileItem; targetFolder: string; targetFileName: string }>
  ) => {
    for (const u of uploads) {
      const cleanFolder = u.targetFolder.replace(/\\/g, "/").replace(/\/+$/, "") || "/";
      const dest =
        cleanFolder === "/"
          ? `/${u.targetFileName}`
          : `${cleanFolder}/${u.targetFileName}`;
      await queueUpload(u.targetFileName, u.localFile.path, dest, u.localFile.size);
    }
  };

  // Handle Download
  const handleDownloadSelected = async () => {
    const itemsToDownload = remoteFiles.filter((f) =>
      remoteSelected.includes(f.path)
    );
    for (const item of itemsToDownload) {
      if (!item.is_dir) {
        const sep = localPath.includes("/") ? "/" : "\\";
        const dest = `${localPath}${sep}${item.name}`;
        await queueDownload(item.name, item.path, dest, item.size);
      }
    }
  };

  // Handle Drop between panes
  const handleDropToRemote = (sourcePaths: string[], isSourceRemote: boolean) => {
    setIsRemoteDragOver(false);
    if (isSourceRemote || !status.connected) return;
    const itemsToUpload = localFiles.filter(
      (f) => sourcePaths.includes(f.path) && !f.is_dir
    );
    if (itemsToUpload.length > 0) {
      setUploadModalItems(itemsToUpload);
    }
  };

  const handleDropToLocal = async (sourcePaths: string[], isSourceRemote: boolean) => {
    setIsLocalDragOver(false);
    if (!isSourceRemote) return;
    for (const path of sourcePaths) {
      const file = remoteFiles.find((f) => f.path === path);
      if (file && !file.is_dir) {
        const sep = localPath.includes("/") ? "/" : "\\";
        const dest = `${localPath}${sep}${file.name}`;
        await queueDownload(file.name, file.path, dest, file.size);
      }
    }
  };

  // Context Menu Actions
  const handleContextMenuAction = (action: string) => {
    if (!contextMenu) return;
    const { item, isRemote } = contextMenu;

    switch (action) {
      case "open":
      case "preview":
      case "editor":
        handleItemOpen(item, isRemote);
        break;
      case "transfer":
        if (isRemote) {
          const sep = localPath.includes("/") ? "/" : "\\";
          queueDownload(item.name, item.path, `${localPath}${sep}${item.name}`, item.size);
        } else if (status.connected) {
          setUploadModalItems([item]);
        } else {
          alert("Connect to a server to upload.");
        }
        break;
      case "copyPath":
        navigator.clipboard.writeText(item.path);
        break;
      case "rename": {
        const newName = prompt("Rename to:", item.name);
        if (newName && newName.trim() && newName !== item.name) {
          const sep = item.path.includes("/") ? "/" : "\\";
          const parent = item.path.substring(0, item.path.lastIndexOf(sep));
          const newPath = `${parent}${sep}${newName.trim()}`;
          if (isRemote) {
            api.renameRemoteFile(item.path, newPath).then(() => refreshRemote());
          } else {
            api.renameLocalFile(item.path, newPath).then(() => refreshLocal());
          }
        }
        break;
      }
      case "delete": {
        if (confirm(`Permanently delete "${item.name}"? This cannot be undone.`)) {
          if (isRemote) {
            api.deleteRemoteFile(item.path, item.is_dir).then(() => refreshRemote());
          } else {
            api.deleteLocalFile(item.path).then(() => refreshLocal());
          }
        }
        break;
      }
      case "properties":
        setPropertiesItem({ item, isRemote });
        break;
      case "compare":
        setFileA(item.path);
        onSwitchTab("diff");
        break;
    }
    setContextMenu(null);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0d1117]">
      {/* Real-time Connection Log Console */}
      <ConnectionLogConsole />

      {/* Dual Pane Workspace */}
      <div
        ref={containerRef}
        className={`flex-1 flex overflow-hidden bg-[#0d1117] ${
          isDragging ? "cursor-col-resize select-none" : ""
        }`}
      >
        {/* LOCAL FILES PANE (Dynamic Width) */}
      <div
        style={{ width: `${splitPercent}%` }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsLocalDragOver(true);
        }}
        onDragLeave={() => setIsLocalDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsLocalDragOver(false);
          const raw = e.dataTransfer.getData("application/json");
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              handleDropToLocal(parsed.paths, parsed.isRemote);
            } catch (_) {}
          }
        }}
        className="flex flex-col overflow-hidden relative min-w-[200px]"
      >
        <PaneHeader
          title="Local Files"
          isRemote={false}
          currentPath={localPath}
          onNavigate={(p) => loadLocalDirectory(p, true)}
          onBack={navigateLocalBack}
          onForward={navigateLocalForward}
          onUp={navigateLocalUp}
          onRefresh={refreshLocal}
          loading={localLoading}
          onCreateFolder={(name) => {
            const sep = localPath.includes("/") ? "/" : "\\";
            api.createLocalDirectory(`${localPath}${sep}${name}`).then(() => refreshLocal());
          }}
          searchQuery={localSearchQuery}
          onSearchChange={setLocalSearchQuery}
          onActionClick={handleUploadSelected}
          actionDisabled={!status.connected || localSelected.length === 0}
        />

        <VirtualizedFileList
          files={localFiles}
          selectedPaths={localSelected}
          isLoading={localLoading}
          error={localError}
          searchQuery={localSearchQuery}
          isRemote={false}
          onSelect={toggleLocalSelected}
          onOpen={(item) => handleItemOpen(item, false)}
          onContextMenu={(e, item) => {
            setContextMenu({ x: e.clientX, y: e.clientY, item, isRemote: false });
          }}
          onDropFiles={handleDropToLocal}
        />

        {isLocalDragOver && (
          <div className="absolute inset-0 bg-blue-600/20 border-2 border-dashed border-blue-500 flex items-center justify-center pointer-events-none z-30 backdrop-blur-2xs">
            <span className="bg-[#161b22] px-4 py-2 rounded-md shadow-lg text-white font-medium text-xs border border-[#30363d]">
              Drop files to download to this folder
            </span>
          </div>
        )}
      </div>

      {/* RESIZABLE DIVIDER SPLITTER */}
      <div
        onMouseDown={handleMouseDownSplitter}
        onDoubleClick={() => setSplitPercent(50)}
        title="Drag to resize panes (Double-click to reset 50/50)"
        className={`w-1.5 hover:w-2 bg-[#30363d] hover:bg-blue-500 cursor-col-resize select-none z-20 flex items-center justify-center transition-colors ${
          isDragging ? "bg-blue-500 w-2" : ""
        }`}
      >
        <div className="h-8 w-0.5 bg-gray-500/60 rounded-full" />
      </div>

      {/* REMOTE FILES PANE (Dynamic Width) */}
      <div
        style={{ width: `${100 - splitPercent}%` }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsRemoteDragOver(true);
        }}
        onDragLeave={() => setIsRemoteDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsRemoteDragOver(false);
          const raw = e.dataTransfer.getData("application/json");
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              handleDropToRemote(parsed.paths, parsed.isRemote);
            } catch (_) {}
          }
        }}
        className="flex flex-col overflow-hidden relative min-w-[200px]"
      >
        {/* MULTI-SERVER TABS BAR */}
        {connectedProfiles.length > 0 && (
          <div className="h-8 bg-[#161b22] border-b border-[#30363d] flex items-center px-1 overflow-x-auto scrollbar-none select-none">
            {connectedProfiles.map((p) => {
              const isActive = activeProfileId === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => handleSwitchServer(p.id)}
                  className={`group h-7 px-2.5 mx-0.5 rounded-t flex items-center space-x-1.5 text-xs cursor-pointer border-t-2 transition-all ${
                    isActive
                      ? "bg-[#0d1117] text-white border-blue-500 font-medium shadow-sm"
                      : "bg-[#21262d]/40 text-[#8b949e] border-transparent hover:text-white hover:bg-[#21262d]"
                  }`}
                  title={`${p.name} (${p.host}:${p.port})`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  <span className="max-w-[120px] truncate text-[11px]">{p.name || p.host}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDisconnectServer(p.id);
                    }}
                    title={`Disconnect ${p.name || p.host}`}
                    className="p-0.5 rounded hover:bg-[#30363d] text-[#6e7681] hover:text-red-400 transition-colors ml-1"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <PaneHeader
          title={activeProfile ? `${activeProfile.name}` : "Remote Files"}
          isRemote={true}
          currentPath={remotePath}
          onNavigate={(p) => loadRemoteDirectory(p, true)}
          onBack={navigateRemoteBack}
          onForward={navigateRemoteForward}
          onUp={navigateRemoteUp}
          onRefresh={refreshRemote}
          loading={remoteLoading}
          onCreateFolder={(name) => {
            const dest = remotePath.endsWith("/") ? `${remotePath}${name}` : `${remotePath}/${name}`;
            api.createRemoteDirectory(dest, activeProfileId || undefined).then(() => refreshRemote());
          }}
          searchQuery={remoteSearchQuery}
          onSearchChange={setRemoteSearchQuery}
          onActionClick={handleDownloadSelected}
          actionDisabled={remoteSelected.length === 0}
        />

        {!status.connected ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-xs text-[#8b949e]">
            <div className="w-12 h-12 rounded-full bg-[#161b22] border border-[#30363d] flex items-center justify-center mb-3">
              <span className="w-3 h-3 rounded-full bg-gray-500" />
            </div>
            <span className="font-medium text-white mb-1">Not Connected to SFTP Server</span>
            <span className="text-[11px] text-[#6e7681] text-center max-w-xs">
              Select or add a connection profile on the left sidebar to browse remote files and transfer data.
            </span>
          </div>
        ) : (
          <VirtualizedFileList
            files={remoteFiles}
            selectedPaths={remoteSelected}
            isLoading={remoteLoading}
            error={remoteError}
            searchQuery={remoteSearchQuery}
            isRemote={true}
            onSelect={toggleRemoteSelected}
            onOpen={(item) => handleItemOpen(item, true)}
            onContextMenu={(e, item) => {
              setContextMenu({ x: e.clientX, y: e.clientY, item, isRemote: true });
            }}
            onDropFiles={handleDropToRemote}
            onRetry={refreshRemote}
          />
        )}

        {isRemoteDragOver && (
          <div className="absolute inset-0 bg-emerald-600/20 border-2 border-dashed border-emerald-500 flex items-center justify-center pointer-events-none z-30 backdrop-blur-2xs">
            <span className="bg-[#161b22] px-4 py-2 rounded-md shadow-lg text-white font-medium text-xs border border-[#30363d]">
              Drop files to upload to remote server
            </span>
          </div>
        )}
      </div>
      </div>

      {/* Right Click Context Menu */}
      {contextMenu && (
        <FileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          item={contextMenu.item}
          isRemote={contextMenu.isRemote}
          onClose={() => setContextMenu(null)}
          onOpen={() => handleContextMenuAction("open")}
          onPreview={() => handleContextMenuAction("preview")}
          onOpenEditor={() => handleContextMenuAction("editor")}
          onTransfer={() => handleContextMenuAction("transfer")}
          onRename={() => handleContextMenuAction("rename")}
          onDelete={() => handleContextMenuAction("delete")}
          onCopyPath={() => handleContextMenuAction("copyPath")}
          onProperties={() => handleContextMenuAction("properties")}
          onCompare={() => handleContextMenuAction("compare")}
        />
      )}

      {/* Properties Modal */}
      {propertiesItem && (
        <FilePropertiesModal
          item={propertiesItem.item}
          isRemote={propertiesItem.isRemote}
          onClose={() => setPropertiesItem(null)}
        />
      )}

      {/* Upload Confirmation & Overwrite/Rename Modal */}
      <UploadConfirmModal
        isOpen={uploadModalItems.length > 0}
        onClose={() => setUploadModalItems([])}
        items={uploadModalItems}
        defaultRemoteFolder={remotePath}
        existingRemoteFiles={remoteFiles}
        onConfirm={handleConfirmUpload}
      />
    </div>
  );
};
