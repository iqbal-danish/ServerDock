import React, { useState } from "react";
import { GitCompare, Loader2, ArrowLeftRight, Check, Plus, Minus } from "lucide-react";
import { useDiffStore } from "../../stores/diffStore";

export const FileDiffViewer: React.FC = () => {
  const {
    fileA,
    fileB,
    diffResult,
    isLoading,
    error,
    viewMode,
    setFileA,
    setFileB,
    setViewMode,
    compare,
  } = useDiffStore();

  const [inputA, setInputA] = useState(fileA);
  const [inputB, setInputB] = useState(fileB);

  const handleRunDiff = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputA && inputB) {
      compare(inputA, inputB);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0d1117] text-xs">
      {/* Top Diff Path Bar */}
      <div className="bg-[#161b22] border-b border-[#30363d] p-3 select-none">
        <form onSubmit={handleRunDiff} className="flex items-center space-x-3">
          <div className="flex-1 flex items-center space-x-2">
            <span className="text-[#8b949e] font-semibold text-[11px] w-12">
              File A:
            </span>
            <input
              type="text"
              value={inputA}
              onChange={(e) => setInputA(e.target.value)}
              placeholder="Path to original file (e.g. C:\feeds\jobs.xml)"
              className="flex-1 bg-[#0d1117] border border-[#30363d] rounded px-2.5 py-1 text-white font-mono-code focus:outline-hidden focus:border-blue-500"
            />
          </div>

          <div className="flex items-center text-[#8b949e]">
            <ArrowLeftRight className="w-4 h-4" />
          </div>

          <div className="flex-1 flex items-center space-x-2">
            <span className="text-[#8b949e] font-semibold text-[11px] w-12">
              File B:
            </span>
            <input
              type="text"
              value={inputB}
              onChange={(e) => setInputB(e.target.value)}
              placeholder="Path to comparison file (e.g. C:\feeds\jobs-production.xml)"
              className="flex-1 bg-[#0d1117] border border-[#30363d] rounded px-2.5 py-1 text-white font-mono-code focus:outline-hidden focus:border-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !inputA || !inputB}
            className="flex items-center space-x-1.5 px-4 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-40 shadow-xs"
          >
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <GitCompare className="w-3.5 h-3.5" />
            )}
            <span>Compare</span>
          </button>
        </form>

        {/* Diff Metrics & View Mode Toggle */}
        {diffResult && (
          <div className="mt-2.5 pt-2 border-t border-[#30363d]/50 flex items-center justify-between text-[11px]">
            <div className="flex items-center space-x-4">
              <span className="flex items-center space-x-1 text-emerald-400 font-mono-code font-semibold">
                <Plus className="w-3.5 h-3.5" />
                <span>{diffResult.additions.toLocaleString()} Added</span>
              </span>
              <span className="flex items-center space-x-1 text-red-400 font-mono-code font-semibold">
                <Minus className="w-3.5 h-3.5" />
                <span>{diffResult.deletions.toLocaleString()} Removed</span>
              </span>
              <span className="text-[#8b949e] font-mono-code">
                {diffResult.unchanged.toLocaleString()} Unchanged
              </span>
            </div>

            <div className="flex items-center space-x-1 bg-[#0d1117] p-0.5 rounded border border-[#30363d]">
              <button
                type="button"
                onClick={() => setViewMode("unified")}
                className={`px-2 py-0.5 rounded text-[11px] ${
                  viewMode === "unified"
                    ? "bg-[#21262d] text-white font-medium"
                    : "text-[#8b949e] hover:text-white"
                }`}
              >
                Unified View
              </button>
              <button
                type="button"
                onClick={() => setViewMode("split")}
                className={`px-2 py-0.5 rounded text-[11px] ${
                  viewMode === "split"
                    ? "bg-[#21262d] text-white font-medium"
                    : "text-[#8b949e] hover:text-white"
                }`}
              >
                Split View
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Diff Content */}
      <div className="flex-1 overflow-auto bg-[#0d1117] font-mono-code text-[11px] leading-5">
        {error && (
          <div className="p-8 text-center text-red-400">
            <span>Diff error: {error}</span>
          </div>
        )}

        {!diffResult && !error && !isLoading && (
          <div className="h-full flex flex-col items-center justify-center p-8 text-[#8b949e] select-none">
            <GitCompare className="w-10 h-10 text-[#30363d] mb-3" />
            <span className="font-semibold text-white mb-1">
              File Comparison & Diff
            </span>
            <span className="text-[11px] text-[#6e7681] text-center max-w-sm">
              Enter two file paths above or right-click any file in the file browser and click "Compare With...".
            </span>
          </div>
        )}

        {diffResult && (
          <div className="min-w-full">
            {diffResult.lines.map((line, idx) => {
              const isInsert = line.tag === "insert";
              const isDelete = line.tag === "delete";

              return (
                <div
                  key={idx}
                  className={`flex items-center px-2 hover:opacity-90 ${
                    isInsert
                      ? "bg-emerald-950/40 text-emerald-300 border-l-2 border-emerald-500"
                      : isDelete
                      ? "bg-red-950/40 text-red-300 border-l-2 border-red-500"
                      : "text-[#e6edf3]"
                  }`}
                >
                  {/* Old line num */}
                  <span className="w-12 text-right pr-2 text-[#6e7681] select-none">
                    {line.old_line_num ?? ""}
                  </span>
                  {/* New line num */}
                  <span className="w-12 text-right pr-3 text-[#6e7681] select-none">
                    {line.new_line_num ?? ""}
                  </span>
                  {/* Change tag indicator */}
                  <span className="w-4 text-center select-none font-bold">
                    {isInsert ? "+" : isDelete ? "-" : " "}
                  </span>
                  {/* Line Content */}
                  <span className="whitespace-pre flex-1 pl-1">
                    {line.content}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
