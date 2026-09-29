import React, { useState, useEffect, useRef } from "react";
import {
  Save,
  CheckCircle,
  AlertCircle,
  FileCode,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Sparkles,
  Check,
  X,
  Code,
  FileText,
} from "lucide-react";
import { useEditorStore } from "../../stores/editorStore";

export const LargeFileEditor: React.FC = () => {
  const {
    filePath,
    fileName,
    isRemote,
    content,
    startLine,
    lineCount,
    totalLines,
    totalSize,
    isLoading,
    isDirty,
    syntaxType,
    validationResult,
    searchQuery,
    isRegex,
    caseSensitive,
    wholeWord,
    searchMatches,
    currentMatchIndex,
    isSearching,
    loadPage,
    setContent,
    formatContent,
    validateContent,
    saveFile,
    searchInFile,
    nextMatch,
    prevMatch,
    goToLine,
    setSearchOptions,
  } = useEditorStore();

  const [goToInput, setGoToInput] = useState("");
  const [showGoToModal, setShowGoToModal] = useState(false);
  const [showSearchBox, setShowSearchBox] = useState(false);
  const [localSearchInput, setLocalSearchInput] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const handleTextareaScroll = () => {
    if (textareaRef.current && gutterRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleGutterWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (textareaRef.current) {
      textareaRef.current.scrollTop += e.deltaY;
    }
  };

  useEffect(() => {
    if (textareaRef.current && gutterRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, [content, startLine]);

  const lines = content.split("\n");

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Keyboard shortcuts (Ctrl+F, Ctrl+G, Ctrl+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setShowSearchBox(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key === "g") {
        e.preventDefault();
        setShowGoToModal(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (!isRemote && isDirty) {
          saveFile();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isRemote, isDirty, saveFile]);

  if (!filePath) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-xs text-[#8b949e] bg-[#0d1117] select-none">
        <FileCode className="w-10 h-10 text-[#30363d] mb-3" />
        <span className="font-semibold text-white mb-1">
          No File Open in Editor
        </span>
        <span className="text-[11px] text-[#6e7681] text-center max-w-sm">
          Double-click any text, XML, JSON, or CSV file in the File Transfer tab,
          or right-click and select "Open in Large-File Editor".
        </span>
      </div>
    );
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    searchInFile(localSearchInput);
  };

  const handleGoToSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const target = parseInt(goToInput, 10);
    if (!isNaN(target) && target > 0) {
      goToLine(target);
      setShowGoToModal(false);
      setGoToInput("");
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0d1117] text-xs">
      {/* Editor Top Toolbar */}
      <div className="h-9 bg-[#161b22] border-b border-[#30363d] px-3 flex items-center justify-between select-none">
        {/* File Name & Path Info */}
        <div className="flex items-center space-x-2 truncate pr-2">
          <span className="font-semibold text-white truncate max-w-xs">
            {fileName}
          </span>
          {isDirty && (
            <span className="w-2 h-2 rounded-full bg-blue-500" title="Modified" />
          )}
          <span className="text-[10px] uppercase font-mono px-1 rounded bg-[#21262d] text-[#8b949e] border border-[#30363d]">
            {syntaxType}
          </span>
          <span className="text-[11px] text-[#8b949e] font-mono-code">
            {formatSize(totalSize)}
            {totalLines ? ` • ${totalLines.toLocaleString()} lines` : ""}
          </span>
          {isRemote && (
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
              Remote Preview (Read-Only)
            </span>
          )}
        </div>

        {/* Developer Action Buttons */}
        <div className="flex items-center space-x-2 flex-shrink-0">
          {/* Format Button (for XML / JSON) */}
          {(syntaxType === "xml" || syntaxType === "json") && (
            <button
              onClick={() => formatContent()}
              title={`Format ${syntaxType.toUpperCase()} (Indents syntax)`}
              className="flex items-center space-x-1 px-2 py-1 rounded bg-[#21262d] hover:bg-[#30363d] text-white text-[11px] border border-[#30363d]"
            >
              <Sparkles className="w-3 h-3 text-blue-400" />
              <span>Format</span>
            </button>
          )}

          {/* Validate Button */}
          {(syntaxType === "xml" || syntaxType === "json") && (
            <button
              onClick={() => validateContent()}
              title={`Validate ${syntaxType.toUpperCase()} Syntax`}
              className="flex items-center space-x-1 px-2 py-1 rounded bg-[#21262d] hover:bg-[#30363d] text-white text-[11px] border border-[#30363d]"
            >
              <CheckCircle className="w-3 h-3 text-emerald-400" />
              <span>Validate</span>
            </button>
          )}

          {/* Search Toggle */}
          <button
            onClick={() => setShowSearchBox(!showSearchBox)}
            title="Search in File (Ctrl+F)"
            className={`flex items-center space-x-1 px-2 py-1 rounded text-[11px] border transition-colors ${
              showSearchBox
                ? "bg-blue-600 text-white border-blue-500"
                : "bg-[#21262d] hover:bg-[#30363d] text-[#8b949e] hover:text-white border-[#30363d]"
            }`}
          >
            <Search className="w-3 h-3" />
            <span>Find</span>
          </button>

          {/* Go to line */}
          <button
            onClick={() => setShowGoToModal(true)}
            title="Go to line (Ctrl+G)"
            className="flex items-center space-x-1 px-2 py-1 rounded bg-[#21262d] hover:bg-[#30363d] text-[#8b949e] hover:text-white text-[11px] border border-[#30363d]"
          >
            <span>Line {startLine}</span>
          </button>

          {/* Save Local File */}
          {!isRemote && (
            <button
              disabled={!isDirty}
              onClick={() => saveFile()}
              title="Save Local Changes (Ctrl+S)"
              className="flex items-center space-x-1 px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium text-[11px] disabled:opacity-40 transition-colors shadow-xs"
            >
              <Save className="w-3 h-3" />
              <span>Save</span>
            </button>
          )}
        </div>
      </div>

      {/* Search Bar Drawer (Ctrl+F) */}
      {showSearchBox && (
        <div className="bg-[#161b22] border-b border-[#30363d] px-3 py-1.5 flex items-center justify-between select-none">
          <form onSubmit={handleSearchSubmit} className="flex items-center space-x-2 flex-1 max-w-xl">
            <div className="relative flex-1">
              <input
                type="text"
                value={localSearchInput}
                onChange={(e) => setLocalSearchInput(e.target.value)}
                placeholder="Search inside large file..."
                className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-xs text-white font-mono-code focus:outline-hidden focus:border-blue-500"
              />
            </div>

            <button
              type="submit"
              className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-medium"
            >
              Search
            </button>

            {/* Options */}
            <label className="flex items-center space-x-1 text-[11px] text-[#8b949e] cursor-pointer">
              <input
                type="checkbox"
                checked={caseSensitive}
                onChange={(e) =>
                  setSearchOptions({ caseSensitive: e.target.checked })
                }
                className="accent-blue-500"
              />
              <span>Match Case</span>
            </label>

            <label className="flex items-center space-x-1 text-[11px] text-[#8b949e] cursor-pointer">
              <input
                type="checkbox"
                checked={isRegex}
                onChange={(e) => setSearchOptions({ isRegex: e.target.checked })}
                className="accent-blue-500"
              />
              <span>Regex</span>
            </label>

            <label className="flex items-center space-x-1 text-[11px] text-[#8b949e] cursor-pointer">
              <input
                type="checkbox"
                checked={wholeWord}
                onChange={(e) => setSearchOptions({ wholeWord: e.target.checked })}
                className="accent-blue-500"
              />
              <span>Whole Word</span>
            </label>
          </form>

          {/* Search Result Counter & Nav */}
          <div className="flex items-center space-x-2">
            {searchMatches.length > 0 && (
              <span className="text-[11px] font-mono-code text-[#8b949e]">
                {currentMatchIndex + 1} / {searchMatches.length.toLocaleString()} matches
              </span>
            )}
            {searchMatches.length > 0 && (
              <div className="flex items-center space-x-1">
                <button
                  onClick={prevMatch}
                  title="Previous match (Shift+F3)"
                  className="p-1 rounded text-[#8b949e] hover:text-white hover:bg-[#21262d]"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={nextMatch}
                  title="Next match (F3)"
                  className="p-1 rounded text-[#8b949e] hover:text-white hover:bg-[#21262d]"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <button
              onClick={() => setShowSearchBox(false)}
              className="p-1 rounded text-[#8b949e] hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Validation Message Banner */}
      {validationResult && (
        <div
          className={`px-3 py-1.5 flex items-center justify-between text-xs ${
            validationResult.valid
              ? "bg-emerald-950/30 text-emerald-300 border-b border-emerald-500/40"
              : "bg-red-950/30 text-red-300 border-b border-red-500/40"
          }`}
        >
          <div className="flex items-center space-x-2">
            {validationResult.valid ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 text-red-400" />
            )}
            <span>
              {validationResult.valid
                ? `Valid ${syntaxType.toUpperCase()} Syntax`
                : validationResult.error}
            </span>
          </div>
          <button
            onClick={() => useEditorStore.setState({ validationResult: null })}
            className="text-gray-400 hover:text-white p-0.5"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Editor Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Line Numbers Gutter */}
        <div
          ref={gutterRef}
          onWheel={handleGutterWheel}
          className="w-16 bg-[#161b22] border-r border-[#30363d] py-2 font-mono-code text-[11px] text-[#6e7681] text-right pr-2 select-none overflow-hidden"
        >
          {lines.map((_, idx) => (
            <div key={idx} className="h-5 leading-5">
              {startLine + idx}
            </div>
          ))}
        </div>

        {/* Text Area / Editor Buffer */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          <textarea
            ref={textareaRef}
            onScroll={handleTextareaScroll}
            value={content}
            readOnly={isRemote}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
            className="flex-1 w-full bg-[#0d1117] text-[#e6edf3] p-2 font-mono-code text-[11px] leading-5 resize-none focus:outline-hidden border-none overflow-auto whitespace-pre tab-4"
          />
        </div>
      </div>

      {/* Editor Status Bar & Pagination */}
      <div className="h-6 bg-[#161b22] border-t border-[#30363d] px-3 flex items-center justify-between text-[11px] text-[#8b949e] select-none font-mono-code">
        <div className="flex items-center space-x-4">
          <span>
            Lines {startLine} - {startLine + lineCount - 1}
          </span>
          <span>{lines.length} lines visible in viewport</span>
        </div>

        {/* Streaming Pagination Controls */}
        <div className="flex items-center space-x-2">
          <button
            disabled={startLine <= 1 || isLoading}
            onClick={() => loadPage(Math.max(1, startLine - 500))}
            className="flex items-center space-x-1 px-1.5 py-0.5 rounded hover:bg-[#21262d] text-[#8b949e] hover:text-white disabled:opacity-40"
          >
            <ChevronLeft className="w-3 h-3" />
            <span>Prev 500 Lines</span>
          </button>

          <button
            disabled={isLoading}
            onClick={() => loadPage(startLine + 500)}
            className="flex items-center space-x-1 px-1.5 py-0.5 rounded hover:bg-[#21262d] text-[#8b949e] hover:text-white disabled:opacity-40"
          >
            <span>Next 500 Lines</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Go To Line Modal (Ctrl+G) */}
      {showGoToModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg shadow-2xl p-4 w-72 text-xs">
            <span className="font-semibold text-white block mb-2">
              Go to Line
            </span>
            <form onSubmit={handleGoToSubmit}>
              <input
                autoFocus
                type="number"
                min={1}
                value={goToInput}
                onChange={(e) => setGoToInput(e.target.value)}
                placeholder="Line number..."
                className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2.5 py-1.5 text-white font-mono-code mb-3 focus:outline-hidden focus:border-blue-500"
              />
              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowGoToModal(false)}
                  className="px-3 py-1 rounded text-[#8b949e] hover:text-white hover:bg-[#21262d]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium"
                >
                  Go
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
