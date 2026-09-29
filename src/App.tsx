import React, { useState, useEffect } from "react";
import { Header } from "./components/Header";
import { ConnectionSidebar } from "./components/Sidebar/ConnectionSidebar";
import { FileBrowser } from "./components/FileBrowser/FileBrowser";
import { LargeFileEditor } from "./components/Editor/LargeFileEditor";
import { FileDiffViewer } from "./components/Diff/FileDiffViewer";
import { TransferQueuePanel } from "./components/TransferQueue/TransferQueuePanel";
import { AddConnectionModal } from "./components/ConnectionDialog/AddConnectionModal";
import { SettingsModal } from "./components/Settings/SettingsModal";
import { ActiveTab, ConnectionProfile } from "./types";
import { useConnectionStore } from "./stores/connectionStore";
import { useFileStore } from "./stores/fileStore";
import { useTransferStore } from "./stores/transferStore";
import { api } from "./services/api";

export function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("files");
  const [isAddConnectionOpen, setIsAddConnectionOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ConnectionProfile | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const { loadProfiles, refreshStatus } = useConnectionStore();
  const { initLocalDirectory } = useFileStore();
  const { loadTransfers, updateTransferItem } = useTransferStore();

  useEffect(() => {
    // 1. Load profiles and local directory
    loadProfiles();
    initLocalDirectory();
    loadTransfers();
    refreshStatus();

    // 2. Subscribe to real-time Rust transfer progress events
    let unlisten: (() => void) | undefined;
    api
      .onTransferUpdate((item) => {
        updateTransferItem(item);
      })
      .then((fn) => {
        unlisten = fn;
      })
      .catch((err) => {
        console.error("Failed to register transfer listener:", err);
      });

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0d1117] text-[#e6edf3]">
      {/* Top Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        openSettings={() => setIsSettingsOpen(true)}
      />

      {/* Main Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Persistent Connection Sidebar */}
        <ConnectionSidebar
          onOpenAddModal={() => {
            setEditingProfile(null);
            setIsAddConnectionOpen(true);
          }}
          onEditProfile={(profile) => {
            setEditingProfile(profile);
            setIsAddConnectionOpen(true);
          }}
        />

        {/* Central Workspace */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {activeTab === "files" && (
            <FileBrowser
              onSwitchTab={(tab) => {
                setActiveTab(tab);
              }}
            />
          )}

          {activeTab === "editor" && <LargeFileEditor />}

          {activeTab === "diff" && <FileDiffViewer />}
        </main>
      </div>

      {/* Bottom Transfer Queue Drawer */}
      <TransferQueuePanel />

      {/* Add / Edit Connection Modal */}
      <AddConnectionModal
        isOpen={isAddConnectionOpen}
        onClose={() => {
          setIsAddConnectionOpen(false);
          setEditingProfile(null);
        }}
        initialProfile={editingProfile}
      />

      {/* Settings & Diagnostics Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}

export default App;
