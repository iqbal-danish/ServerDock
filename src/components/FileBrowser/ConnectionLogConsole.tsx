import React, { useEffect, useRef, useState } from "react";
import {
  Terminal,
  Trash2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  ArrowDownToLine,
  Filter,
  AlertCircle,
} from "lucide-react";
import { useLogStore } from "../../stores/logStore";

export const ConnectionLogConsole: React.FC = () => {
  const {
    logs,
    isOpen,
    filter,
    autoScroll,
    toggleOpen,
    setIsOpen,
    setFilter,
    setAutoScroll,
    clearLogs,
    initListener,
  } = useLogStore();

  const [copied, setCopied] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initListener();
  }, [initListener]);

  useEffect(() => {
    if (autoScroll && isOpen && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll, isOpen]);

  const handleCopyLogs = () => {
    const text = logs
      .map(
        (l) =>
          `[${l.timestamp}] [${l.level}] [${l.category}] ${l.message}`
      )
      .join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredLogs = logs.filter((log) => {
    if (filter === "ERRORS") return log.level === "ERROR" || log.level === "WARN";
    if (filter === "SFTP") return log.category === "SFTP";
    if (filter === "AUTH") return log.category === "AUTH";
    return true;
  });

  const errorCount = logs.filter((l) => l.level === "ERROR").length;
  const warnCount = logs.filter((l) => l.level === "WARN").length;

  return (
    <div className="border-b border-[#30363d] bg-[#0d1117] transition-all duration-200 select-none">
      {/* Console Header Bar */}
      <div className="h-8 px-3 flex items-center justify-between bg-[#161b22] border-b border-[#30363d]/60 text-xs">
        <div className="flex items-center space-x-3">
          <button
            onClick={toggleOpen}
            className="flex items-center space-x-1.5 font-medium text-white hover:text-blue-400 transition-colors"
          >
            <Terminal className="w-3.5 h-3.5 text-blue-400" />
            <span className="font-semibold text-[11px] tracking-wide uppercase text-[#c9d1d9]">
              Connection Logs
            </span>
            {isOpen ? (
              <ChevronUp className="w-3.5 h-3.5 text-[#8b949e]" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-[#8b949e]" />
            )}
          </button>

          <div className="flex items-center space-x-1.5 text-[10px] font-mono-code">
            <span className="px-1.5 py-0.5 rounded bg-[#21262d] text-[#8b949e] border border-[#30363d]">
              {logs.length} entries
            </span>
            {errorCount > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-red-950/60 text-red-400 border border-red-800/40 font-semibold flex items-center space-x-1">
                <AlertCircle className="w-3 h-3 inline" />
                <span>{errorCount} errors</span>
              </span>
            )}
            {warnCount > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-400 border border-amber-800/40">
                {warnCount} warnings
              </span>
            )}
          </div>
        </div>

        {/* Filter & Actions */}
        <div className="flex items-center space-x-2">
          {isOpen && (
            <>
              {/* Filter Tabs */}
              <div className="flex items-center bg-[#0d1117] border border-[#30363d] rounded p-0.5 text-[10px]">
                <button
                  onClick={() => setFilter("ALL")}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    filter === "ALL"
                      ? "bg-[#21262d] text-white font-medium shadow-xs"
                      : "text-[#8b949e] hover:text-white"
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setFilter("ERRORS")}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    filter === "ERRORS"
                      ? "bg-red-900/40 text-red-300 font-medium"
                      : "text-[#8b949e] hover:text-white"
                  }`}
                >
                  Errors
                </button>
                <button
                  onClick={() => setFilter("SFTP")}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    filter === "SFTP"
                      ? "bg-blue-900/40 text-blue-300 font-medium"
                      : "text-[#8b949e] hover:text-white"
                  }`}
                >
                  SFTP
                </button>
                <button
                  onClick={() => setFilter("AUTH")}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    filter === "AUTH"
                      ? "bg-purple-900/40 text-purple-300 font-medium"
                      : "text-[#8b949e] hover:text-white"
                  }`}
                >
                  Auth
                </button>
              </div>

              {/* Auto Scroll Toggle */}
              <button
                onClick={() => setAutoScroll(!autoScroll)}
                title={autoScroll ? "Auto-scroll enabled" : "Auto-scroll paused"}
                className={`p-1 rounded border transition-colors ${
                  autoScroll
                    ? "bg-blue-600/20 border-blue-500/40 text-blue-400"
                    : "bg-[#21262d] border-[#30363d] text-[#8b949e] hover:text-white"
                }`}
              >
                <ArrowDownToLine className="w-3.5 h-3.5" />
              </button>

              {/* Copy Button */}
              <button
                onClick={handleCopyLogs}
                title="Copy all logs to clipboard"
                className="p-1 rounded bg-[#21262d] hover:bg-[#30363d] text-[#8b949e] hover:text-white border border-[#30363d] transition-colors"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>

              {/* Clear Button */}
              <button
                onClick={() => clearLogs()}
                title="Clear logs"
                className="p-1 rounded bg-[#21262d] hover:bg-red-500/20 text-[#8b949e] hover:text-red-400 border border-[#30363d] transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          {!isOpen && (
            <button
              onClick={() => setIsOpen(true)}
              className="text-[11px] text-blue-400 hover:text-blue-300 hover:underline"
            >
              Show details
            </button>
          )}
        </div>
      </div>

      {/* Expandable Log Output Panel */}
      {isOpen && (
        <div
          ref={logContainerRef}
          className="h-40 overflow-y-auto p-2.5 font-mono text-[11px] leading-relaxed space-y-1 select-text bg-[#0d1117]/95"
        >
          {filteredLogs.length === 0 ? (
            <div className="h-full flex items-center justify-center text-[#6e7681] text-xs font-sans">
              No logs recorded for filter "{filter}". Actions will appear here in real-time.
            </div>
          ) : (
            filteredLogs.map((log) => {
              let levelBadge = (
                <span className="px-1 py-0.2 rounded text-[10px] uppercase font-bold bg-blue-900/30 text-blue-400 border border-blue-500/20">
                  INFO
                </span>
              );

              if (log.level === "SUCCESS") {
                levelBadge = (
                  <span className="px-1 py-0.2 rounded text-[10px] uppercase font-bold bg-emerald-900/30 text-emerald-400 border border-emerald-500/20">
                    SUCCESS
                  </span>
                );
              } else if (log.level === "WARN") {
                levelBadge = (
                  <span className="px-1 py-0.2 rounded text-[10px] uppercase font-bold bg-amber-900/30 text-amber-400 border border-amber-500/20">
                    WARN
                  </span>
                );
              } else if (log.level === "ERROR") {
                levelBadge = (
                  <span className="px-1 py-0.2 rounded text-[10px] uppercase font-bold bg-rose-900/40 text-rose-400 border border-rose-500/30">
                    ERROR
                  </span>
                );
              }

              return (
                <div
                  key={log.id}
                  className={`flex items-start space-x-2 py-0.5 px-1.5 rounded transition-colors ${
                    log.level === "ERROR"
                      ? "bg-red-950/20 text-rose-200"
                      : log.level === "WARN"
                      ? "bg-amber-950/15 text-amber-200"
                      : "hover:bg-[#161b22] text-[#c9d1d9]"
                  }`}
                >
                  <span className="text-[#8b949e] font-mono-code text-[10px] flex-shrink-0 pt-0.5">
                    {log.timestamp}
                  </span>
                  <div className="flex-shrink-0">{levelBadge}</div>
                  <span className="text-[10px] text-[#8b949e] px-1 py-0.2 rounded bg-[#161b22] border border-[#30363d]/50 flex-shrink-0">
                    {log.category}
                  </span>
                  <span className="break-all font-mono-code flex-1">{log.message}</span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
