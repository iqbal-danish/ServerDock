import React, { useState, useEffect } from "react";
import {
  BarChart3,
  FileCode,
  Briefcase,
  Loader2,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  MapPin,
  Building,
  DollarSign,
  Globe,
  Sparkles,
  Info,
  Tag,
  Filter,
} from "lucide-react";
import { useAnalysisStore } from "../../stores/analysisStore";
import { api } from "../../services/api";
import { XmlValueStat } from "../../types";

export const DataToolsPanel: React.FC = () => {
  const {
    filePath,
    analysisType,
    xmlResult,
    jsonResult,
    feedResult,
    isLoading,
    error,
    setFilePath,
    setAnalysisType,
    runAnalysis,
  } = useAnalysisStore();

  const [inputPath, setInputPath] = useState(filePath);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [tagValues, setTagValues] = useState<XmlValueStat[]>([]);
  const [isLoadingTagValues, setIsLoadingTagValues] = useState(false);
  const [valueSearchQuery, setValueSearchQuery] = useState("");
  const [xmlRightTab, setXmlRightTab] = useState<"values" | "attributes">("values");

  // Automatically select a sensible default tag when XML analysis finishes
  useEffect(() => {
    if (xmlResult && xmlResult.top_elements.length > 0) {
      const candidates = ["category", "state", "city", "jobtype", "company", "title", "country"];
      let bestTag: string | null = null;

      if (xmlResult.element_value_frequencies) {
        for (const c of candidates) {
          if (xmlResult.element_value_frequencies[c] && xmlResult.element_value_frequencies[c].length > 0) {
            bestTag = c;
            break;
          }
        }
        if (!bestTag) {
          const keyWithValues = Object.keys(xmlResult.element_value_frequencies).find(
            (k) => xmlResult.element_value_frequencies![k].length > 0
          );
          if (keyWithValues) bestTag = keyWithValues;
        }
      }

      if (!bestTag) {
        bestTag = xmlResult.top_elements[0].name.replace(/^[<]+|[>]+$/g, "");
      }

      setSelectedTag(bestTag);
      if (xmlResult.element_value_frequencies?.[bestTag]) {
        setTagValues(xmlResult.element_value_frequencies[bestTag]);
      } else {
        setTagValues([]);
      }

      if (xmlResult.top_attributes.length === 0) {
        setXmlRightTab("values");
      }
    }
  }, [xmlResult]);

  const handleSelectTag = async (tagName: string) => {
    const cleanTag = tagName.replace(/^[<]+|[>]+$/g, "");
    setSelectedTag(cleanTag);
    setValueSearchQuery("");

    if (xmlResult?.element_value_frequencies?.[cleanTag]) {
      setTagValues(xmlResult.element_value_frequencies[cleanTag]);
      setXmlRightTab("values");
      return;
    }

    if (inputPath.trim()) {
      setIsLoadingTagValues(true);
      try {
        const vals = await api.getXmlTagValues(inputPath.trim(), cleanTag, 50);
        setTagValues(vals);
      } catch (e) {
        console.error("Failed to load tag values:", e);
        setTagValues([]);
      } finally {
        setIsLoadingTagValues(false);
      }
    }
    setXmlRightTab("values");
  };

  useEffect(() => {
    if (filePath) {
      setInputPath(filePath);
    }
  }, [filePath]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputPath.trim()) {
      runAnalysis(inputPath.trim());
    }
  };

  const handleModeSwitch = (type: "xml" | "json" | "feed") => {
    setAnalysisType(type);
    if (inputPath.trim()) {
      runAnalysis(inputPath.trim(), type);
    }
  };

  const handleSelectSample = (samplePath: string, type: "xml" | "json" | "feed") => {
    setInputPath(samplePath);
    setFilePath(samplePath);
    runAnalysis(samplePath, type);
  };

  const sampleFiles = [
    { name: "jobs.xml", path: "sample_data/jobs.xml", type: "feed" as const, desc: "XML Job Feed with CDATA & salaries" },
    { name: "jobs.json", path: "sample_data/jobs.json", type: "json" as const, desc: "JSON structured job postings" },
    { name: "jobs-production.xml", path: "sample_data/jobs-production.xml", type: "xml" as const, desc: "Large XML feed structure" },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0d1117] text-xs">
      {/* Top Controls Bar */}
      <div className="bg-[#161b22] border-b border-[#30363d] p-3 select-none space-y-2">
        <form onSubmit={handleSubmit} className="flex items-center space-x-3">
          {/* Analysis Mode Switcher */}
          <div className="flex items-center space-x-1 bg-[#0d1117] p-0.5 rounded border border-[#30363d]">
            <button
              type="button"
              onClick={() => handleModeSwitch("feed")}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded text-[11px] transition-colors ${
                analysisType === "feed"
                  ? "bg-[#21262d] text-white font-medium shadow-xs"
                  : "text-[#8b949e] hover:text-white"
              }`}
            >
              <Briefcase className="w-3.5 h-3.5 text-purple-400" />
              <span>Job Feed Tools</span>
            </button>

            <button
              type="button"
              onClick={() => handleModeSwitch("xml")}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded text-[11px] transition-colors ${
                analysisType === "xml"
                  ? "bg-[#21262d] text-white font-medium shadow-xs"
                  : "text-[#8b949e] hover:text-white"
              }`}
            >
              <FileCode className="w-3.5 h-3.5 text-blue-400" />
              <span>XML Analyzer</span>
            </button>

            <button
              type="button"
              onClick={() => handleModeSwitch("json")}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded text-[11px] transition-colors ${
                analysisType === "json"
                  ? "bg-[#21262d] text-white font-medium shadow-xs"
                  : "text-[#8b949e] hover:text-white"
              }`}
            >
              <FileCode className="w-3.5 h-3.5 text-emerald-400" />
              <span>JSON Analyzer</span>
            </button>
          </div>

          {/* File Path Input */}
          <div className="flex-1">
            <input
              type="text"
              value={inputPath}
              onChange={(e) => setInputPath(e.target.value)}
              placeholder="Path to XML or JSON feed (e.g. sample_data/jobs.xml or C:\data\feed.xml)"
              className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2.5 py-1 text-white font-mono-code focus:outline-hidden focus:border-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !inputPath.trim()}
            className="flex items-center space-x-1.5 px-4 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-40 shadow-xs transition-colors"
          >
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <BarChart3 className="w-3.5 h-3.5" />
            )}
            <span>Analyze File</span>
          </button>
        </form>

        {/* Quick Sample Selector Bar */}
        <div className="flex items-center space-x-2 text-[11px]">
          <span className="text-[#8b949e] flex items-center space-x-1">
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>Try sample feeds:</span>
          </span>
          {sampleFiles.map((s) => (
            <button
              key={s.path}
              type="button"
              onClick={() => handleSelectSample(s.path, s.type)}
              className="px-2 py-0.5 rounded bg-[#21262d] hover:bg-[#30363d] text-blue-300 border border-[#30363d] hover:border-blue-500/50 transition-colors font-mono"
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      {/* Main Analysis Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="p-3 rounded-md bg-red-950/40 border border-red-500/40 text-rose-300 mb-4 flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block">Analysis Error:</span>
              <span className="text-[11px] font-mono-code">{error}</span>
            </div>
          </div>
        )}

        {!xmlResult && !jsonResult && !feedResult && !isLoading && (
          <div className="h-full flex flex-col items-center justify-center p-8 text-[#8b949e] select-none">
            <BarChart3 className="w-12 h-12 text-[#30363d] mb-3" />
            <span className="font-semibold text-white text-sm mb-1">
              Developer Data & Feed Analyzer
            </span>
            <span className="text-[11px] text-[#6e7681] text-center max-w-sm mb-6">
              Inspect element frequencies, attributes, JSON schemas, or compute job feed
              metrics for huge XML and JSON files.
            </span>

            {/* Quick launch sample cards */}
            <div className="grid grid-cols-3 gap-3 w-full max-w-xl">
              {sampleFiles.map((s) => (
                <div
                  key={s.path}
                  onClick={() => handleSelectSample(s.path, s.type)}
                  className="p-3 rounded-lg border border-[#30363d] bg-[#161b22] hover:border-blue-500 hover:bg-[#21262d] cursor-pointer transition-all space-y-1.5 group"
                >
                  <div className="flex items-center space-x-2">
                    <FileCode className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
                    <span className="font-semibold text-white font-mono text-xs">{s.name}</span>
                  </div>
                  <p className="text-[11px] text-[#8b949e] leading-snug">{s.desc}</p>
                  <span className="inline-block text-[10px] text-blue-400 group-hover:underline pt-1">
                    Click to analyze →
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* XML Analysis Results */}
        {analysisType === "xml" && xmlResult && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-[#161b22] border border-[#30363d] rounded-md">
                <span className="text-[#8b949e] text-[11px]">Total Elements</span>
                <div className="text-xl font-semibold text-white mt-1 font-mono-code">
                  {xmlResult.total_elements.toLocaleString()}
                </div>
              </div>

              <div className="p-3 bg-[#161b22] border border-[#30363d] rounded-md">
                <span className="text-[#8b949e] text-[11px]">
                  Unique Tag Names
                </span>
                <div className="text-xl font-semibold text-white mt-1 font-mono-code">
                  {xmlResult.unique_element_names.toLocaleString()}
                </div>
              </div>

              <div className="p-3 bg-[#161b22] border border-[#30363d] rounded-md">
                <span className="text-[#8b949e] text-[11px]">Validation</span>
                <div className="flex items-center space-x-1.5 mt-1 font-medium">
                  {xmlResult.is_valid ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-400">Valid XML</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4 text-red-400" />
                      <span className="text-red-400">Syntax Error</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Elements Table */}
              <div className="bg-[#161b22] border border-[#30363d] rounded-md p-3 flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-semibold text-white">Element Frequencies</span>
                    <span className="text-[10px] text-[#8b949e] ml-2 hidden sm:inline">
                      (Click tag to inspect values)
                    </span>
                  </div>
                  <span className="text-[10px] text-[#8b949e] font-mono bg-[#0d1117] px-2 py-0.5 rounded border border-[#30363d]/60">
                    {xmlResult.top_elements.length} tags
                  </span>
                </div>
                <div className="space-y-1 font-mono-code text-[11px] max-h-[420px] overflow-y-auto pr-1 flex-1">
                  {xmlResult.top_elements.length === 0 ? (
                    <div className="p-6 text-center text-[#8b949e] bg-[#0d1117]/60 rounded border border-[#30363d]/40">
                      No XML elements found.
                    </div>
                  ) : (
                    (() => {
                      const maxElementCount = Math.max(...xmlResult.top_elements.map((e) => e.count), 1);
                      return xmlResult.top_elements.map((el, i) => {
                        const cleanName = el.name.replace(/^[<]+|[>]+$/g, "");
                        const isSelected = selectedTag === cleanName;
                        const hasValues = !!(xmlResult.element_value_frequencies?.[cleanName]?.length);
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => handleSelectTag(cleanName)}
                            className={`w-full text-left relative overflow-hidden p-1.5 rounded border transition-all flex items-center justify-between cursor-pointer group ${
                              isSelected
                                ? "bg-blue-950/40 border-blue-500/70 shadow-xs ring-1 ring-blue-500/30"
                                : "bg-[#0d1117] border-[#21262d] hover:border-[#30363d] hover:bg-[#161b22]"
                            }`}
                          >
                            <div
                              className={`absolute left-0 top-0 bottom-0 pointer-events-none transition-colors ${
                                isSelected ? "bg-blue-500/20" : "bg-blue-500/10 group-hover:bg-blue-500/15"
                              }`}
                              style={{ width: `${(el.count / maxElementCount) * 100}%` }}
                            />
                            <div className="relative z-10 flex items-center space-x-1.5">
                              <span className={`font-medium ${isSelected ? "text-blue-300 font-bold" : "text-blue-400"}`}>
                                &lt;{cleanName}&gt;
                              </span>
                              {hasValues && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-purple-900/40 text-purple-300 border border-purple-700/40 font-sans font-normal">
                                  values
                                </span>
                              )}
                            </div>
                            <div className="relative z-10 flex items-center space-x-1.5">
                              <span className="text-[#8b949e] text-[10px] bg-[#161b22] px-1.5 py-0.2 rounded border border-[#30363d]/50 font-mono">
                                {el.count.toLocaleString()}
                              </span>
                            </div>
                          </button>
                        );
                      });
                    })()
                  )}
                </div>
              </div>

              {/* Right Panel: Value Frequencies OR Attribute Frequencies */}
              <div className="bg-[#161b22] border border-[#30363d] rounded-md p-3 flex flex-col">
                {/* Tabs switcher */}
                <div className="flex items-center justify-between mb-2 border-b border-[#30363d]/60 pb-2">
                  <div className="flex items-center space-x-1 bg-[#0d1117] p-0.5 rounded border border-[#30363d]">
                    <button
                      type="button"
                      onClick={() => setXmlRightTab("values")}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors flex items-center space-x-1.5 cursor-pointer ${
                        xmlRightTab === "values"
                          ? "bg-[#21262d] text-white shadow-xs"
                          : "text-[#8b949e] hover:text-white"
                      }`}
                    >
                      <TrendingUp className="w-3 h-3 text-purple-400" />
                      <span>Value Frequencies</span>
                      {selectedTag && (
                        <span className="text-[10px] text-blue-400 font-mono">
                          &lt;{selectedTag}&gt;
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setXmlRightTab("attributes")}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors flex items-center space-x-1.5 cursor-pointer ${
                        xmlRightTab === "attributes"
                          ? "bg-[#21262d] text-white shadow-xs"
                          : "text-[#8b949e] hover:text-white"
                      }`}
                    >
                      <FileCode className="w-3 h-3 text-emerald-400" />
                      <span>Tag Attributes</span>
                      <span className="text-[10px] px-1 rounded bg-[#161b22] text-[#8b949e] font-mono">
                        {xmlResult.top_attributes.length}
                      </span>
                    </button>
                  </div>

                  {xmlRightTab === "values" && selectedTag && tagValues.length > 0 && (
                    <div className="text-[10px] text-[#8b949e] font-mono">
                      {tagValues.length} distinct values
                    </div>
                  )}
                </div>

                {/* Tab Content: Value Distribution */}
                {xmlRightTab === "values" && (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Search inside values if multiple */}
                    {tagValues.length > 4 && (
                      <div className="mb-2">
                        <input
                          type="text"
                          value={valueSearchQuery}
                          onChange={(e) => setValueSearchQuery(e.target.value)}
                          placeholder={`Filter <${selectedTag || "tag"}> values...`}
                          className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2.5 py-1 text-white text-[11px] focus:outline-hidden focus:border-blue-500 font-mono-code"
                        />
                      </div>
                    )}

                    <div className="space-y-1.5 font-mono-code text-[11px] max-h-[380px] overflow-y-auto pr-1 flex-1">
                      {isLoadingTagValues ? (
                        <div className="h-48 flex flex-col items-center justify-center text-[#8b949e] space-y-2">
                          <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                          <span className="text-xs">Scanning values for &lt;{selectedTag}&gt;...</span>
                        </div>
                      ) : !selectedTag ? (
                        <div className="p-8 text-center text-[#8b949e] bg-[#0d1117]/60 rounded border border-[#30363d]/40">
                          Select an element on the left to inspect its values.
                        </div>
                      ) : (() => {
                        const filteredValues = tagValues.filter((v) =>
                          !valueSearchQuery.trim() || v.value.toLowerCase().includes(valueSearchQuery.toLowerCase().trim())
                        );

                        if (filteredValues.length === 0) {
                          return (
                            <div className="p-6 text-center text-[#8b949e] bg-[#0d1117]/60 rounded border border-[#30363d]/40 flex flex-col items-center justify-center space-y-2">
                              <Info className="w-5 h-5 text-blue-400" />
                              <div className="font-semibold text-white text-xs">
                                No Direct Values Found for &lt;{selectedTag}&gt;
                              </div>
                              <p className="text-[11px] text-[#8b949e] max-w-xs leading-relaxed font-sans">
                                &lt;{selectedTag}&gt; appears to be a parent wrapper element enclosing child tags. Click a child element on the left (e.g. &lt;category&gt;, &lt;city&gt;, &lt;state&gt;) to see its value frequencies.
                              </p>
                            </div>
                          );
                        }

                        const maxValueCount = Math.max(...filteredValues.map((v) => v.count), 1);

                        return filteredValues.map((v, i) => {
                          const isEmpty = v.value === "(empty)";
                          return (
                            <div
                              key={i}
                              className="relative overflow-hidden p-1.5 rounded bg-[#0d1117] border border-[#21262d] flex items-center justify-between"
                            >
                              <div
                                className="absolute left-0 top-0 bottom-0 bg-purple-500/10 pointer-events-none"
                                style={{ width: `${(v.count / maxValueCount) * 100}%` }}
                              />
                              <div className="relative z-10 flex items-center space-x-2 max-w-[70%]">
                                <span className="text-[#8b949e] text-[10px] w-5 text-right font-mono flex-shrink-0">
                                  #{i + 1}
                                </span>
                                {isEmpty ? (
                                  <span className="text-[#8b949e] italic font-sans text-[10px] bg-[#21262d] px-1.5 py-0.5 rounded">
                                    (empty / not set)
                                  </span>
                                ) : (
                                  <span className="text-white truncate font-medium" title={v.value}>
                                    {v.value}
                                  </span>
                                )}
                              </div>
                              <div className="relative z-10 flex items-center space-x-1.5">
                                <span className="text-purple-300 text-[10px] font-mono">
                                  {v.percentage}%
                                </span>
                                <span className="text-[#8b949e] text-[10px] bg-[#161b22] px-1.5 py-0.2 rounded border border-[#30363d]/50">
                                  {v.count.toLocaleString()}
                                </span>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                )}

                {/* Tab Content: Tag Attributes */}
                {xmlRightTab === "attributes" && (
                  <div className="space-y-1.5 font-mono-code text-[11px] max-h-[420px] overflow-y-auto pr-1 flex-1">
                    {xmlResult.top_attributes.length === 0 ? (
                      <div className="p-6 text-center text-[#8b949e] bg-[#0d1117]/60 rounded border border-[#30363d]/40 flex flex-col items-center justify-center space-y-2">
                        <div className="w-8 h-8 rounded-full bg-[#21262d] flex items-center justify-center text-[#8b949e]">
                          <Info className="w-4 h-4 text-blue-400" />
                        </div>
                        <div className="font-semibold text-white text-xs">No Inline Attributes in Document</div>
                        <p className="text-[11px] text-[#8b949e] max-w-xs leading-relaxed font-sans">
                          All fields in this XML file are structured as child elements (&lt;company&gt;...&lt;/company&gt;) rather than tag attributes (&lt;job id="..."&gt;).
                        </p>
                        <button
                          type="button"
                          onClick={() => setXmlRightTab("values")}
                          className="mt-2 px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-[11px] transition-colors cursor-pointer"
                        >
                          View Tag Values Distribution →
                        </button>
                      </div>
                    ) : (
                      (() => {
                        const maxAttrCount = Math.max(...xmlResult.top_attributes.map((a) => a.count), 1);
                        return xmlResult.top_attributes.map((attr, i) => (
                          <div
                            key={i}
                            className="relative overflow-hidden p-1.5 rounded bg-[#0d1117] border border-[#21262d] flex items-center justify-between"
                          >
                            <div
                              className="absolute left-0 top-0 bottom-0 bg-emerald-500/10 pointer-events-none"
                              style={{ width: `${(attr.count / maxAttrCount) * 100}%` }}
                            />
                            <span className="text-emerald-400 relative z-10 font-medium">{attr.name}=...</span>
                            <span className="text-[#8b949e] relative z-10 text-[10px] bg-[#161b22] px-1.5 py-0.2 rounded border border-[#30363d]/50">
                              {attr.count.toLocaleString()}
                            </span>
                          </div>
                        ));
                      })()
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* JSON Analysis Results */}
        {analysisType === "json" && jsonResult && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-[#161b22] border border-[#30363d] rounded-md">
                <span className="text-[#8b949e] text-[11px]">Total Keys</span>
                <div className="text-xl font-semibold text-white mt-1 font-mono-code">
                  {jsonResult.total_keys.toLocaleString()}
                </div>
              </div>

              <div className="p-3 bg-[#161b22] border border-[#30363d] rounded-md">
                <span className="text-[#8b949e] text-[11px]">Objects</span>
                <div className="text-xl font-semibold text-white mt-1 font-mono-code">
                  {jsonResult.object_count.toLocaleString()}
                </div>
              </div>

              <div className="p-3 bg-[#161b22] border border-[#30363d] rounded-md">
                <span className="text-[#8b949e] text-[11px]">Arrays</span>
                <div className="text-xl font-semibold text-white mt-1 font-mono-code">
                  {jsonResult.array_count.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Keys Table */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-md p-3">
              <span className="font-semibold text-white block mb-2">
                Schema Keys & Data Types
              </span>
              <div className="space-y-1.5 font-mono-code text-[11px] max-h-96 overflow-y-auto pr-1">
                {jsonResult.top_keys.map((k, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-1.5 rounded bg-[#0d1117] border border-[#21262d]"
                  >
                    <span className="text-emerald-400">{k.path}</span>
                    <div className="flex items-center space-x-3">
                      <span className="text-[10px] uppercase font-mono px-1 rounded bg-[#21262d] text-purple-300">
                        {k.data_type}
                      </span>
                      <span className="text-[#8b949e]">
                        {k.count.toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Job Feed Analysis Results */}
        {analysisType === "feed" && feedResult && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-3">
              <div className="p-3 bg-[#161b22] border border-[#30363d] rounded-md">
                <div className="flex items-center space-x-1.5 text-[#8b949e] text-[11px]">
                  <Briefcase className="w-3.5 h-3.5 text-blue-400" />
                  <span>Total Jobs</span>
                </div>
                <div className="text-xl font-semibold text-white mt-1 font-mono-code">
                  {feedResult.total_jobs.toLocaleString()}
                </div>
              </div>

              <div className="p-3 bg-[#161b22] border border-[#30363d] rounded-md">
                <div className="flex items-center space-x-1.5 text-[#8b949e] text-[11px]">
                  <Building className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Companies</span>
                </div>
                <div className="text-xl font-semibold text-white mt-1 font-mono-code">
                  {feedResult.unique_companies.toLocaleString()}
                </div>
              </div>

              <div className="p-3 bg-[#161b22] border border-[#30363d] rounded-md">
                <div className="flex items-center space-x-1.5 text-[#8b949e] text-[11px]">
                  <MapPin className="w-3.5 h-3.5 text-amber-400" />
                  <span>Locations</span>
                </div>
                <div className="text-xl font-semibold text-white mt-1 font-mono-code">
                  {feedResult.unique_locations.toLocaleString()}
                </div>
              </div>

              <div className="p-3 bg-[#161b22] border border-[#30363d] rounded-md">
                <div className="flex items-center space-x-1.5 text-[#8b949e] text-[11px]">
                  <DollarSign className="w-3.5 h-3.5 text-purple-400" />
                  <span>Jobs with Salary</span>
                </div>
                <div className="text-xl font-semibold text-white mt-1 font-mono-code">
                  {feedResult.jobs_with_salary.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Additional Badges */}
            <div className="flex items-center space-x-3">
              <span className="px-2.5 py-1 rounded bg-[#161b22] border border-[#30363d] text-[11px] text-[#e6edf3]">
                🌐 Remote Jobs:{" "}
                <span className="font-semibold text-blue-400">
                  {feedResult.remote_jobs.toLocaleString()}
                </span>
              </span>
              <span className="px-2.5 py-1 rounded bg-[#161b22] border border-[#30363d] text-[11px] text-[#e6edf3]">
                ⚠️ Duplicate Titles:{" "}
                <span className="font-semibold text-amber-400">
                  {feedResult.duplicate_titles.toLocaleString()}
                </span>
              </span>
            </div>

            {/* Top Companies and Locations */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#161b22] border border-[#30363d] rounded-md p-3">
                <span className="font-semibold text-white block mb-2">
                  Top Hiring Companies
                </span>
                <div className="space-y-1 font-mono-code text-[11px]">
                  {feedResult.top_companies.map(([company, count], i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-1 bg-[#0d1117] rounded border border-[#21262d]"
                    >
                      <span className="text-[#e6edf3] truncate">{company}</span>
                      <span className="text-[#8b949e] font-semibold">
                        {count.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-[#161b22] border border-[#30363d] rounded-md p-3">
                <span className="font-semibold text-white block mb-2">
                  Top Job Locations
                </span>
                <div className="space-y-1 font-mono-code text-[11px]">
                  {feedResult.top_locations.map(([location, count], i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-1 bg-[#0d1117] rounded border border-[#21262d]"
                    >
                      <span className="text-[#e6edf3] truncate">{location}</span>
                      <span className="text-[#8b949e] font-semibold">
                        {count.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
