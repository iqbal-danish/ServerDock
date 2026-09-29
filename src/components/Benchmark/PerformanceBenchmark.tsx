import React, { useState } from "react";
import { Gauge, Play, Loader2, CheckCircle2, Zap, HardDrive, Search } from "lucide-react";
import { BenchmarkResult } from "../../types";
import { api } from "../../services/api";

export const PerformanceBenchmark: React.FC = () => {
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [targetFile, setTargetFile] = useState("");

  const handleRunBenchmarks = async () => {
    try {
      setIsRunning(true);
      const res = await api.runPerformanceBenchmark(targetFile.trim() || undefined);
      setResults(res);
      setIsRunning(false);
    } catch (e: any) {
      setIsRunning(false);
      alert(`Benchmark error: ${e.toString()}`);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-[#0d1117] p-6 text-xs text-[#e6edf3]">
      {/* Header Banner */}
      <div className="flex items-center justify-between pb-4 border-b border-[#30363d] mb-6 select-none">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center space-x-2">
            <Gauge className="w-5 h-5 text-blue-400" />
            <span>High-Performance Engine Diagnostics & Benchmarks</span>
          </h2>
          <p className="text-[11px] text-[#8b949e] mt-1">
            Measure actual zero-copy memory mapped read throughput, regex scan speeds,
            and line indexing on this system.
          </p>
        </div>

        <button
          disabled={isRunning}
          onClick={handleRunBenchmarks}
          className="flex items-center space-x-2 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-sm disabled:opacity-50 transition-colors"
        >
          {isRunning ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4 fill-white" />
          )}
          <span>{isRunning ? "Running Benchmarks..." : "Run Engine Benchmarks"}</span>
        </button>
      </div>

      {/* Target File Option */}
      <div className="p-4 bg-[#161b22] border border-[#30363d] rounded-md mb-6">
        <label className="block text-[11px] font-medium text-[#8b949e] mb-1.5">
          Benchmark Specific File (Optional)
        </label>
        <div className="flex items-center space-x-3">
          <input
            type="text"
            value={targetFile}
            onChange={(e) => setTargetFile(e.target.value)}
            placeholder="Enter path to any 1GB - 10GB file to test line-seek speed..."
            className="flex-1 bg-[#0d1117] border border-[#30363d] rounded px-3 py-1.5 font-mono-code text-xs text-white focus:outline-hidden focus:border-blue-500"
          />
        </div>
      </div>

      {/* Results Grid */}
      {results.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-white uppercase tracking-wider text-[11px] text-[#8b949e]">
            Live Benchmark Results
          </h3>

          <div className="grid grid-cols-3 gap-4">
            {results.map((res, idx) => (
              <div
                key={idx}
                className="p-4 bg-[#161b22] border border-[#30363d] rounded-md flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-white text-xs truncate">
                      {res.task_name}
                    </span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  </div>

                  <div className="text-2xl font-bold font-mono-code text-white">
                    {res.duration_ms} <span className="text-xs font-normal text-[#8b949e]">ms</span>
                  </div>

                  {res.throughput_mb_s && (
                    <div className="mt-2 inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-blue-600/10 border border-blue-500/30 text-blue-400 font-mono-code font-semibold text-[11px]">
                      <Zap className="w-3 h-3" />
                      <span>{res.throughput_mb_s.toFixed(1)} MB/s throughput</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-[#30363d]/50 font-mono-code text-[11px] text-[#8b949e]">
                  {res.details}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Architectural Guarantee Cards */}
      <div className="mt-8 pt-6 border-t border-[#30363d]">
        <h3 className="font-semibold text-white uppercase tracking-wider text-[11px] text-[#8b949e] mb-3">
          Architecture Guarantees
        </h3>

        <div className="grid grid-cols-3 gap-4">
          <div className="p-3 bg-[#161b22]/50 border border-[#30363d] rounded-md">
            <span className="font-semibold text-white block mb-1">
              Zero-Copy File Streaming
            </span>
            <p className="text-[11px] text-[#8b949e]">
              10GB+ files are mapped using OS virtual memory pages (<code className="text-purple-300">memmap2</code>).
              React never buffers multi-gigabyte data into browser memory.
            </p>
          </div>

          <div className="p-3 bg-[#161b22]/50 border border-[#30363d] rounded-md">
            <span className="font-semibold text-white block mb-1">
              Virtualized File System Lists
            </span>
            <p className="text-[11px] text-[#8b949e]">
              Directories with 250,000+ files render with constant 60 FPS scrolling
              using DOM row virtualization.
            </p>
          </div>

          <div className="p-3 bg-[#161b22]/50 border border-[#30363d] rounded-md">
            <span className="font-semibold text-white block mb-1">
              OS Credential Security
            </span>
            <p className="text-[11px] text-[#8b949e]">
              Credentials and private key passphrases are stored in the operating system's
              secure credential store, never in plaintext.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
