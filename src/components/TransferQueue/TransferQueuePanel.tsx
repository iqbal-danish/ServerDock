import React, { useState } from "react";
import {
  ArrowUp,
  ArrowDown,
  Pause,
  Play,
  X,
  RotateCcw,
  Trash2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Clock,
  Gauge,
} from "lucide-react";
import { TransferItem } from "../../types";
import { useTransferStore } from "../../stores/transferStore";

export const TransferQueuePanel: React.FC = () => {
  const {
    transfers,
    isOpen,
    setIsOpen,
    filter,
    setFilter,
    pauseTransfer,
    resumeTransfer,
    cancelTransfer,
    retryTransfer,
    clearCompleted,
    concurrencyLimit,
    setConcurrencyLimit,
  } = useTransferStore();

  const [height, setHeight] = useState(200);

  const activeCount = transfers.filter(
    (t) => t.status === "Running" || t.status === "Queued"
  ).length;
  const completedCount = transfers.filter((t) => t.status === "Completed").length;
  const failedCount = transfers.filter(
    (t) => t.status === "Failed" || t.status === "Cancelled"
  ).length;

  const filteredTransfers = transfers.filter((t) => {
    if (filter === "active") return t.status === "Running" || t.status === "Queued";
    if (filter === "completed") return t.status === "Completed";
    if (filter === "failed") return t.status === "Failed" || t.status === "Cancelled";
    return true;
  });

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const formatSpeed = (bytesPerSec: number) => {
    if (bytesPerSec === 0) return "0 B/s";
    return `${formatSize(bytesPerSec)}/s`;
  };

  const formatEta = (seconds?: number) => {
    if (seconds === undefined || seconds === null) return "—";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")} remaining`;
  };

  if (!isOpen) {
    return (
      <div
        onClick={() => setIsOpen(true)}
        className="h-7 bg-[#161b22] border-t border-[#30363d] px-3 flex items-center justify-between text-xs text-[#8b949e] cursor-pointer hover:bg-[#21262d] select-none"
      >
        <div className="flex items-center space-x-3">
          <span className="font-medium text-white">Transfer Queue</span>
          <span>
            {activeCount > 0
              ? `${activeCount} active transfer${activeCount === 1 ? "" : "s"}`
              : "No active transfers"}
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <ChevronUp className="w-4 h-4" />
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ height: `${height}px` }}
      className="bg-[#161b22] border-t border-[#30363d] flex flex-col select-none text-xs"
    >
      {/* Panel Header & Controls */}
      <div className="h-8 bg-[#161b22] border-b border-[#30363d] px-3 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1.5 font-semibold text-white">
            <span>Transfers</span>
            {activeCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-blue-500 text-white text-[10px]">
                {activeCount}
              </span>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex items-center space-x-1 bg-[#0d1117] p-0.5 rounded border border-[#30363d]">
            <button
              onClick={() => setFilter("all")}
              className={`px-2 py-0.5 rounded text-[11px] ${
                filter === "all" ? "bg-[#21262d] text-white font-medium" : "text-[#8b949e] hover:text-white"
              }`}
            >
              All ({transfers.length})
            </button>
            <button
              onClick={() => setFilter("active")}
              className={`px-2 py-0.5 rounded text-[11px] ${
                filter === "active" ? "bg-[#21262d] text-white font-medium" : "text-[#8b949e] hover:text-white"
              }`}
            >
              Active ({activeCount})
            </button>
            <button
              onClick={() => setFilter("completed")}
              className={`px-2 py-0.5 rounded text-[11px] ${
                filter === "completed" ? "bg-[#21262d] text-white font-medium" : "text-[#8b949e] hover:text-white"
              }`}
            >
              Completed ({completedCount})
            </button>
            <button
              onClick={() => setFilter("failed")}
              className={`px-2 py-0.5 rounded text-[11px] ${
                filter === "failed" ? "bg-[#21262d] text-white font-medium" : "text-[#8b949e] hover:text-white"
              }`}
            >
              Failed ({failedCount})
            </button>
          </div>
        </div>

        {/* Right Concurrency Control & Actions */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 text-[11px] text-[#8b949e]">
            <Gauge className="w-3.5 h-3.5" />
            <span>Concurrent:</span>
            <select
              value={concurrencyLimit}
              onChange={(e) => setConcurrencyLimit(Number(e.target.value))}
              className="bg-[#0d1117] border border-[#30363d] rounded px-1.5 py-0.5 text-white"
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3 (Default)</option>
              <option value={5}>5</option>
              <option value={8}>8</option>
            </select>
          </div>

          <button
            onClick={() => clearCompleted()}
            title="Clear completed transfers"
            className="flex items-center space-x-1 text-[#8b949e] hover:text-white px-2 py-0.5 rounded hover:bg-[#21262d]"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Completed</span>
          </button>

          <button
            onClick={() => setIsOpen(false)}
            title="Collapse Transfer Panel"
            className="text-[#8b949e] hover:text-white p-1 rounded hover:bg-[#21262d]"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Transfer List Table */}
      <div className="flex-1 overflow-y-auto bg-[#0d1117]">
        {filteredTransfers.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[#6e7681]">
            <span>No transfers in this view.</span>
          </div>
        ) : (
          <div className="divide-y divide-[#21262d]/50">
            {filteredTransfers.map((item) => {
              const isUpload = item.direction === "Upload";
              const percent =
                item.total_bytes > 0
                  ? Math.min(
                      100,
                      Math.round(
                        (item.transferred_bytes / item.total_bytes) * 100
                      )
                    )
                  : 0;

              return (
                <div
                  key={item.id}
                  className="p-2.5 hover:bg-[#161b22]/50 flex items-center space-x-3 transition-colors"
                >
                  {/* Direction Icon */}
                  <div
                    className={`w-6 h-6 rounded flex items-center justify-center flex-shrink-0 ${
                      isUpload
                        ? "bg-blue-600/20 text-blue-400"
                        : "bg-emerald-600/20 text-emerald-400"
                    }`}
                  >
                    {isUpload ? (
                      <ArrowUp className="w-3.5 h-3.5" />
                    ) : (
                      <ArrowDown className="w-3.5 h-3.5" />
                    )}
                  </div>

                  {/* File Info & Paths */}
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-white truncate">
                        {item.file_name}
                      </span>
                      <span
                        className={`text-[10px] font-mono px-1.5 rounded ${
                          item.status === "Running"
                            ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                            : item.status === "Completed"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : item.status === "Failed"
                            ? "bg-red-500/20 text-red-400"
                            : item.status === "Paused"
                            ? "bg-amber-500/20 text-amber-400"
                            : "bg-[#21262d] text-[#8b949e]"
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>

                    <div className="text-[11px] text-[#6e7681] truncate font-mono-code mt-0.5">
                      {item.source_path} → {item.dest_path}
                    </div>

                    {/* Progress Bar */}
                    {item.status !== "Completed" && (
                      <div className="mt-1.5 h-1.5 bg-[#21262d] rounded-full overflow-hidden w-full max-w-xl">
                        <div
                          style={{ width: `${percent}%` }}
                          className={`h-full transition-all duration-300 rounded-full ${
                            item.status === "Failed"
                              ? "bg-red-500"
                              : item.status === "Paused"
                              ? "bg-amber-500"
                              : isUpload
                              ? "bg-blue-500"
                              : "bg-emerald-500"
                          }`}
                        />
                      </div>
                    )}

                    {item.error && (
                      <div className="text-[11px] text-red-400 mt-1">
                        Reason: {item.error}
                      </div>
                    )}
                  </div>

                  {/* Size & Metrics */}
                  <div className="w-48 text-right font-mono-code text-[11px] text-[#8b949e] flex-shrink-0">
                    <div className="text-white font-medium">
                      {formatSize(item.transferred_bytes)} / {formatSize(item.total_bytes)} ({percent}%)
                    </div>
                    {item.status === "Running" && (
                      <div className="text-blue-400 text-[10px] mt-0.5">
                        {formatSpeed(item.speed_bytes_per_sec)} • {formatEta(item.eta_seconds)}
                      </div>
                    )}
                  </div>

                  {/* Control Buttons */}
                  <div className="flex items-center space-x-1 flex-shrink-0">
                    {item.status === "Running" && (
                      <button
                        onClick={() => pauseTransfer(item.id)}
                        title="Pause"
                        className="p-1 rounded text-[#8b949e] hover:text-white hover:bg-[#21262d]"
                      >
                        <Pause className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {item.status === "Paused" && (
                      <button
                        onClick={() => resumeTransfer(item.id)}
                        title="Resume"
                        className="p-1 rounded text-emerald-400 hover:text-emerald-300 hover:bg-[#21262d]"
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {(item.status === "Failed" || item.status === "Cancelled") && (
                      <button
                        onClick={() => retryTransfer(item.id)}
                        title="Retry"
                        className="p-1 rounded text-blue-400 hover:text-blue-300 hover:bg-[#21262d]"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {(item.status === "Running" ||
                      item.status === "Queued" ||
                      item.status === "Paused") && (
                      <button
                        onClick={() => cancelTransfer(item.id)}
                        title="Cancel"
                        className="p-1 rounded text-red-400 hover:text-red-300 hover:bg-[#21262d]"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
