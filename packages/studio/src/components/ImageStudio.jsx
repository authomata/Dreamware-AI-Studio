"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { generateImage, generateI2I, uploadFile } from "../muapi.js";
import {
  t2iModels,
  i2iModels,
  getAspectRatiosForModel,
  getResolutionsForModel,
  getQualityFieldForModel,
  getAspectRatiosForI2IModel,
  getResolutionsForI2IModel,
  getQualityFieldForI2IModel,
  getMaxImagesForI2IModel,
} from "../models.js";

// ─── helpers ────────────────────────────────────────────────────────────────

async function downloadImage(url, filename) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch {
    window.open(url, "_blank");
  }
}

// ─── UploadButton (inline picker) ───────────────────────────────────────────

function UploadButton({ apiKey, maxImages, onSelect, onClear, initialUrls = [] }) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedEntries, setSelectedEntries] = useState([]); // [{url, thumbnail}]
  const [uploadHistory, setUploadHistory] = useState([]); // [{id, name, url, thumbnail}]
  const [lastUploadProgress, setLastUploadProgress] = useState(0);
  const fileInputRef = useRef(null);
  const panelRef = useRef(null);
  const triggerRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!panelOpen) return;
    const handler = (e) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target)
      ) {
        setPanelOpen(false);
      }
    };
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [panelOpen]);

  // Sync initialUrls from parent (e.g. restored from localStorage)
  useEffect(() => {
    if (initialUrls && initialUrls.length > 0) {
      // Avoid infinite loops by only updating if URLs actually changed
      const currentUrls = selectedEntries.map(e => e.url);
      const isSame = initialUrls.length === currentUrls.length && initialUrls.every(u => currentUrls.includes(u));
      if (isSame) return;

      const newEntries = initialUrls.map(url => ({ url }));
      setSelectedEntries(newEntries);
      
      // Also ensure they are in the history panel
      setUploadHistory(prev => {
        const existingUrls = prev.map(h => h.url);
        const missing = initialUrls
          .filter(u => !existingUrls.includes(u))
          .map(u => ({ id: `restored-${u}`, name: "Restored Image", url: u, progress: 100 }));
        return [...missing, ...prev];
      });
    }
  }, [initialUrls]); // eslint-disable-line react-hooks/exhaustive-deps

  // When maxImages changes, trim excess selections
  useEffect(() => {
    if (selectedEntries.length > maxImages) {
      const trimmed = selectedEntries.slice(0, maxImages);
      setSelectedEntries(trimmed);
      if (trimmed.length === 0) onClear?.();
    }
    if (fileInputRef.current) {
      fileInputRef.current.multiple = maxImages > 1;
    }
  }, [maxImages]); // eslint-disable-line react-hooks/exhaustive-deps

  const fireOnSelect = useCallback(
    (entries) => {
      if (!entries.length) return;
      const urls = entries.map((e) => e.url);
      onSelect({ url: urls[0], urls, thumbnail: entries[0].url });
    },
    [onSelect],
  );

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    e.target.value = "";

    const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
    const tooLarge = files.filter((f) => f.size > MAX_IMAGE_SIZE);
    if (tooLarge.length > 0) {
      alert(
        `The following images are too large (max 10MB): ${tooLarge.map((f) => f.name).join(", ")}`,
      );
      return;
    }

    setUploading(true);
    try {
      const toUpload =
        maxImages === 1
          ? files.slice(0, 1)
          : files.slice(0, maxImages - selectedEntries.length || 1);

      await Promise.all(
        toUpload.map(async (file) => {
          const id = Date.now().toString() + Math.random();

          // Add a placeholder to history immediately without local preview
          const placeholder = { id, name: file.name, url: null, progress: 0 };
          setUploadHistory((prev) => [placeholder, ...prev]);

          try {
            const uploadedUrl = await uploadFile(apiKey, file, (pct) => {
              setLastUploadProgress(pct);
              setUploadHistory((prev) =>
                prev.map((h) => (h.id === id ? { ...h, progress: pct } : h)),
              );
            });

            // Update history with real URL and Mark as 100%
            setUploadHistory((prev) =>
              prev.map((h) => {
                if (h.id === id) {
                  return { ...h, url: uploadedUrl, progress: 100 };
                }
                return h;
              }),
            );

            // Auto-select if there's room
            if (selectedEntries.length < maxImages) {
              const newEntry = { url: uploadedUrl };
              setSelectedEntries((prev) => [...prev, newEntry]);

              if (maxImages === 1) {
                fireOnSelect([newEntry]);
                setPanelOpen(false);
              }
            }
          } catch (err) {
            console.error("[UploadButton] Upload failed for", file.name, err);
            setUploadHistory((prev) => prev.filter((h) => h.id !== id));
            throw err;
          }
        }),
      );
    } catch (err) {
      alert(`Image upload failed: ${err.message}`);
    } finally {
      setUploading(false);
      setLastUploadProgress(0);
    }
  };

  const handleCellClick = (entry) => {
    const selIdx = selectedEntries.findIndex((e) => e.url === entry.url);
    const isSelected = selIdx !== -1;
    const atMax =
      maxImages > 1 && !isSelected && selectedEntries.length >= maxImages;
    if (atMax) return;

    if (maxImages === 1) {
      const newSelected = [{ url: entry.url, localUrl: entry.localUrl }];
      setSelectedEntries(newSelected);
      fireOnSelect(newSelected);
      setPanelOpen(false);
    } else {
      let next;
      if (isSelected) {
        next = selectedEntries.filter((_, i) => i !== selIdx);
        if (next.length === 0) onClear?.();
      } else {
        next = [
          ...selectedEntries,
          { url: entry.url, localUrl: entry.localUrl },
        ];
      }
      setSelectedEntries(next);
    }
  };

  const handleRemoveFromHistory = (e, entry) => {
    e.stopPropagation();
    if (entry.localUrl) URL.revokeObjectURL(entry.localUrl);
    setUploadHistory((prev) => prev.filter((h) => h.id !== entry.id));

    const next = selectedEntries.filter((s) => s.url !== entry.url);
    if (next.length !== selectedEntries.length) {
      setSelectedEntries(next);
      if (next.length === 0) onClear?.();
    }
  };

  const handleDone = (e) => {
    e.stopPropagation();
    fireOnSelect(selectedEntries);
    setPanelOpen(false);
  };

  const reset = () => {
    setSelectedEntries([]);
    setPanelOpen(false);
  };

  // expose reset via ref pattern — parent calls reset() directly
  // (handled by parent through uploadedImageUrls state reset)

  const isMulti = maxImages > 1;
  const count = selectedEntries.length;
  const hasSelection = count > 0;

  // Trigger icon content
  let triggerContent;
  if (hasSelection || uploading) {
    const mainEntry = selectedEntries[0] || uploadHistory[0];
    const canAddMore = isMulti && count < maxImages;
    let badge;
    if (uploading && !hasSelection) {
      badge = (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-10">
          <div className="w-4 h-4 rounded-full border border-primary/30 border-t-primary animate-spin mb-0.5" />
          <span className="text-[8px] font-black text-primary">
            {lastUploadProgress}%
          </span>
        </div>
      );
    } else if (count > 1) {
      badge = (
        <div className="absolute bottom-0.5 right-0.5 min-w-[16px] h-4 bg-primary rounded-full flex items-center justify-center px-0.5">
          <span className="text-[9px] font-black text-black leading-none">
            {count}
          </span>
        </div>
      );
    } else if (canAddMore) {
      badge = (
        <div className="absolute bottom-0.5 right-0.5 min-w-[16px] h-4 bg-white/80 rounded-full flex items-center justify-center px-0.5 border border-primary/60">
          <span className="text-[9px] font-black text-black leading-none">
            +
          </span>
        </div>
      );
    } else {
      badge = (
        <div className="absolute bottom-0.5 right-0.5 min-w-[16px] h-4 bg-primary rounded-full flex items-center justify-center px-0.5">
          <svg
            width="8"
            height="8"
            viewBox="0 0 24 24"
            fill="none"
            stroke="black"
            strokeWidth="4"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      );
    }
    triggerContent = (
      <>
        {uploading && hasSelection && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-30">
            <div className="w-4 h-4 rounded-full border border-primary/30 border-t-primary animate-spin mb-0.5" />
            <span className="text-[8px] font-black text-primary">
              {lastUploadProgress}%
            </span>
          </div>
        )}
        {count > 1 ? (
          <div className="relative w-full h-full p-1.5 flex items-center justify-center">
            {/* Bottom Image */}
            {selectedEntries[1]?.url && (
              <div className="absolute top-1 left-1 w-6 h-6 rounded-md border border-black/40 overflow-hidden shadow-lg rotate-[-8deg] translate-x-[-1px] translate-y-[-1px]">
                <img
                  src={selectedEntries[1].url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            {/* Top Image */}
            {selectedEntries[0]?.url && (
              <div className="absolute bottom-1 right-1 w-7 h-7 rounded-sm border-[1.5px] border-black/60 overflow-hidden shadow-2xl z-10 rotate-[4deg] translate-x-[1px] translate-y-[1px]">
                <img
                  src={selectedEntries[0].url}
                  alt=""
                  className={`w-full h-full object-cover transition-all duration-300 ${
                    uploading && hasSelection ? "blur-[2px] opacity-60" : "opacity-100"
                  }`}
                />
              </div>
            )}
          </div>
        ) : mainEntry?.url ? (
          <img
            src={mainEntry.url}
            alt=""
            className={`w-full h-full object-cover transition-all duration-300 ${
              uploading && hasSelection ? "blur-[2px] scale-110 opacity-60" : "blur-0 scale-100 opacity-100"
            }`}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-white/5 animate-pulse">
            <div className="w-4 h-4 rounded-full border border-primary/20 border-t-primary animate-spin mb-0.5" />
            <span className="text-[8px] font-black text-primary">
              {lastUploadProgress}%
            </span>
          </div>
        )}
        {!uploading && badge}
      </>
    );
  } else {
    triggerContent = (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-white/40 group-hover:text-primary transition-colors"
      >
        <rect
          x="3"
          y="3"
          width="18"
          height="18"
          rx="2"
          ry="2"
        />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    );
  }

  const triggerTitle = hasSelection
    ? count > 1
      ? `${count} of ${maxImages} images selected — click to manage`
      : isMulti
        ? `1 image selected — click to add more (up to ${maxImages})`
        : "Reference image"
    : isMulti
      ? `Add up to ${maxImages} images`
      : "Reference image";

  return (
    <div className="relative">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple={isMulti}
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        title={triggerTitle}
        onClick={(e) => {
          e.stopPropagation();
          setPanelOpen((o) => !o);
        }}
        className={`w-10 h-10 shrink-0 rounded-full border transition-all flex items-center justify-center relative overflow-hidden mt-1.5 bg-white/5 hover:bg-white/10 group ${
          hasSelection
            ? "border-primary/60 hover:border-primary/40"
            : "border-white/10 hover:border-primary/40"
        }`}
      >
        {triggerContent}
      </button>

      {/* Panel */}
      {panelOpen && (
        <div
          ref={panelRef}
          onClick={(e) => e.stopPropagation()}
          className="absolute z-50 bottom-[calc(100%+8px)] left-0 bg-[#111] rounded-xl p-3 shadow-4xl border border-white/10 w-96"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-1 pb-3 mb-2 border-b border-white/5">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-bold text-secondary">
                Reference Images
              </span>
              {isMulti && (
                <span className="text-[9px] text-muted">
                  Select up to {maxImages} images
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isMulti && hasSelection && (
                <button
                  type="button"
                  onClick={handleDone}
                  className="flex items-center gap-1 px-3 py-1.5 bg-primary text-black rounded-xl text-xs font-black transition-all hover:scale-105"
                >
                  ✓ Done ({count})
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPanelOpen(false);
                  fileInputRef.current?.click();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-full text-xs font-bold transition-all border border-primary/20"
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                >
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                {isMulti ? "Upload files" : "Upload new"}
              </button>
            </div>
          </div>

          {/* Grid or empty state */}
          {uploadHistory.length === 0 ? (
            <div className="py-6 flex flex-col items-center gap-2 opacity-40">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-secondary"
              >
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span className="text-xs text-secondary">No uploads yet</span>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 max-h-56 overflow-y-auto custom-scrollbar pr-0.5">
              {uploadHistory.map((entry) => {
                const selIdx = selectedEntries.findIndex(
                  (e) => e.url === entry.url,
                );
                const isSelected = selIdx !== -1;
                const atMax =
                  isMulti && !isSelected && selectedEntries.length >= maxImages;

                return (
                  <div
                    key={entry.id}
                    title={entry.name}
                    onClick={() => entry.url && handleCellClick(entry)}
                    className={`relative rounded-xl overflow-hidden border-2 cursor-pointer group/cell aspect-square transition-all ${
                      isSelected
                        ? "border-primary shadow-glow"
                        : "border-white/10 hover:border-white/30"
                    } ${atMax ? "opacity-40 cursor-not-allowed" : ""} ${!entry.url ? "cursor-wait" : ""}`}
                  >
                    {entry.url ? (
                      <img
                        src={entry.url}
                        alt={entry.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-white/5 flex flex-col items-center justify-center">
                        <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin mb-1" />
                        <span className="text-[10px] font-black text-primary">
                          {entry.progress}%
                        </span>
                      </div>
                    )}

                    {/* Hover overlay with delete */}
                    {entry.url && (
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/cell:opacity-100 transition-opacity flex items-end justify-end p-1">
                        <button
                          type="button"
                          title="Remove from history"
                          onClick={(e) => handleRemoveFromHistory(e, entry)}
                          className="w-5 h-5 bg-red-500/80 hover:bg-red-500 rounded-md flex items-center justify-center transition-colors"
                        >
                          <svg
                            width="8"
                            height="8"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="white"
                            strokeWidth="3"
                          >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    )}

                    {/* Selection badge */}
                    {isSelected && (
                      <div className="absolute top-1 left-1 min-w-[20px] h-5 bg-primary rounded-full flex items-center justify-center px-1">
                        {isMulti ? (
                          <span className="text-[10px] font-black text-black">
                            {selIdx + 1}
                          </span>
                        ) : (
                          <svg
                            width="9"
                            height="9"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="black"
                            strokeWidth="4"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Bottom bar for multi-select */}
          {isMulti && hasSelection && (
            <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
              <span className="text-xs text-secondary">
                {count} of {maxImages} selected
              </span>
              <button
                type="button"
                onClick={handleDone}
                className="px-4 py-1.5 bg-primary text-black rounded-xl text-xs font-black transition-all hover:scale-105"
              >
                Use Selected
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ModelDropdown ────────────────────────────────────────────────────────────

function ModelDropdown({ models, selectedModel, onSelect, onClose }) {
  const [search, setSearch] = useState("");

  const filtered = models.filter(
    (m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.id.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-2 h-full max-h-[60vh]">
      <div className="border-b border-white/5 shrink-0">
        <div className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-2.5 border border-white/5 focus-within:border-primary/50 transition-colors">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="text-muted"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search models..."
            value={search}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent border-none text-xs text-white focus:ring-0 w-full p-0 focus:outline-none"
          />
        </div>
      </div>
      <div className="text-xs font-medium text-secondary py-2 shrink-0">
        Available models
      </div>
      <div className="flex flex-col gap-1.5 overflow-y-auto custom-scrollbar pr-1 pb-2">
        {filtered.map((m) => (
          <div
            key={m.id}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(m);
              onClose();
            }}
            className={`flex items-center justify-between p-3.5 hover:bg-white/5 rounded-lg cursor-pointer transition-all border border-transparent hover:border-white/5 ${
              selectedModel === m.id ? "bg-white/5 border-white/5" : ""
            }`}
          >
            <div className="flex items-center gap-3.5">
              <div
                className={`w-10 h-10 ${
                  m.family === "kontext"
                    ? "bg-blue-500/10 text-blue-400"
                    : m.family === "effects"
                      ? "bg-purple-500/10 text-purple-400"
                      : "bg-primary/10 text-primary"
                } border border-white/5 rounded-full flex items-center justify-center font-bold text-xs shadow-inner uppercase`}
              >
                {m.name.charAt(0)}
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-bold text-white tracking-tight">
                  {m.name}
                </span>
              </div>
            </div>
            {selectedModel === m.id && (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#d9ff00"
                strokeWidth="4"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SimpleDropdown ───────────────────────────────────────────────────────────

function SimpleDropdown({ title, options, selected, onSelect, onClose }) {
  return (
    <>
      <div className="text-xs font-medium text-muted pb-2 border-b border-white/5 mb-2">
        {title}
      </div>
      <div className="flex flex-col gap-1">
        {options.map((opt) => (
          <div
            key={opt}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(opt);
              onClose();
            }}
            className="flex items-center justify-between p-2 hover:bg-white/5 rounded-md cursor-pointer transition-all group"
          >
            <span className="text-xs font-bold text-white opacity-80 group-hover:opacity-100">
              {opt}
            </span>
            {selected === opt && (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#d9ff00"
                strokeWidth="4"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ImageStudio({
  apiKey,
  onGenerationComplete,
  historyItems,
  onAnimate,
}) {
  const PERSIST_KEY = "hg_image_studio_persistent";

  // ── Model / mode state ──────────────────────────────────────────────────
  const [imageMode, setImageMode] = useState(false); // false=t2i, true=i2i
  const [selectedModelId, setSelectedModelId] = useState(t2iModels[0].id);
  const [selectedModelName, setSelectedModelName] = useState(t2iModels[0].name);
  const [selectedAr, setSelectedAr] = useState(
    t2iModels[0].inputs?.aspect_ratio?.default || "1:1",
  );
  const [selectedQuality, setSelectedQuality] = useState(() => {
    const resolutions = getResolutionsForModel(t2iModels[0].id);
    return resolutions[0] || null;
  });
  const [maxImages, setMaxImages] = useState(1);

  // ── Prompt / upload state ───────────────────────────────────────────────
  const [prompt, setPrompt] = useState("");
  const [uploadedImageUrls, setUploadedImageUrls] = useState([]);

  // ── Character state ─────────────────────────────────────────────────────
  const [activeCharacter, setActiveCharacter] = useState(null); // { id, name, triggerPrompt, referenceImages, ... }
  const [savedCharacters, setSavedCharacters] = useState([]);
  const [charPickerOpen, setCharPickerOpen] = useState(false);
  const charPickerRef = useRef(null);

  // ── @mention state ──────────────────────────────────────────────────────
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionAnchor, setMentionAnchor] = useState(null); // { start, end }

  // ── UI state ────────────────────────────────────────────────────────────
  const [dropdownOpen, setDropdownOpen] = useState(null); // 'model' | 'ar' | 'quality' | null
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const [fullscreenUrl, setFullscreenUrl] = useState(null);

  // ── Canvas / history state ──────────────────────────────────────────────
  const [currentImageUrl, setCurrentImageUrl] = useState(null);
  const [activeHistoryIdx, setActiveHistoryIdx] = useState(0);
  const [localHistory, setLocalHistory] = useState([]); // [{id,url,prompt,model,aspect_ratio,timestamp}]

  // Use prop history if provided, otherwise local
  const history = historyItems ?? localHistory;

  // ── Refs ────────────────────────────────────────────────────────────────
  const textareaRef = useRef(null);
  const dropdownRef = useRef(null);
  const uploadPickerResetRef = useRef(null); // not used directly — managed via key

  // ── Load saved characters from localStorage ─────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem("dw_characters");
      if (raw) setSavedCharacters(JSON.parse(raw));
    } catch {}
    // Listen for storage changes (e.g. user creates a character in another tab)
    const handler = (e) => {
      if (e.key === "dw_characters") {
        try { setSavedCharacters(JSON.parse(e.newValue || "[]")); } catch {}
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  // ── Character select / deselect ─────────────────────────────────────────
  const handleCharacterSelect = useCallback(
    (character) => {
      setActiveCharacter(character);
      setCharPickerOpen(false);

      // Load reference images and switch to i2i mode
      if (character.referenceImages?.length > 0) {
        const urls = character.referenceImages;
        setUploadedImageUrls(urls);
        if (!imageMode) {
          const firstI2I = i2iModels[0];
          const ars = getAspectRatiosForI2IModel(firstI2I.id);
          const resolutions = getResolutionsForI2IModel(firstI2I.id);
          setImageMode(true);
          setSelectedModelId(firstI2I.id);
          setSelectedModelName(firstI2I.name);
          setSelectedAr(ars[0] || "1:1");
          setSelectedQuality(resolutions[0] || null);
          setMaxImages(getMaxImagesForI2IModel(firstI2I.id));
        }
      }
    },
    [imageMode]
  );

  const handleCharacterDeselect = useCallback(() => {
    setActiveCharacter(null);
    setUploadedImageUrls([]);
    setImageMode(false);
    const firstT2I = t2iModels[0];
    const ars = getAspectRatiosForModel(firstT2I.id);
    const resolutions = getResolutionsForModel(firstT2I.id);
    setSelectedModelId(firstT2I.id);
    setSelectedModelName(firstT2I.name);
    setSelectedAr(ars[0] || "1:1");
    setSelectedQuality(resolutions[0] || null);
    setMaxImages(1);
  }, []);

  // ── Close character picker on outside click ─────────────────────────────
  useEffect(() => {
    if (!charPickerOpen) return;
    const handler = (e) => {
      if (charPickerRef.current && !charPickerRef.current.contains(e.target)) {
        setCharPickerOpen(false);
      }
    };
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [charPickerOpen]);

  // ── Close dropdown on outside click ─────────────────────────────────────
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(null);
      }
    };
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [dropdownOpen]);

  // ── Persistence: Load ────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem(PERSIST_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        if (data.imageMode !== undefined) setImageMode(data.imageMode);
        if (data.selectedModelId) setSelectedModelId(data.selectedModelId);
        if (data.selectedModelName) setSelectedModelName(data.selectedModelName);
        if (data.selectedAr) setSelectedAr(data.selectedAr);
        if (data.selectedQuality) setSelectedQuality(data.selectedQuality);
        if (data.maxImages) setMaxImages(data.maxImages);
        if (data.prompt) setPrompt(data.prompt);
        if (data.uploadedImageUrls) setUploadedImageUrls(data.uploadedImageUrls);
        if (data.localHistory) setLocalHistory(data.localHistory);
      }
    } catch (err) {
      console.warn("Failed to load ImageStudio persistence:", err);
    }
  }, []);

  // ── Persistence: Save ────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const state = {
          imageMode,
          selectedModelId,
          selectedModelName,
          selectedAr,
          selectedQuality,
          maxImages,
          prompt,
          uploadedImageUrls,
          localHistory,
        };
        localStorage.setItem(PERSIST_KEY, JSON.stringify(state));
      } catch (err) {
        console.warn("Failed to save ImageStudio persistence:", err);
      }
    }, 500); // 500ms debounce
    return () => clearTimeout(timer);
  }, [
    imageMode,
    selectedModelId,
    selectedModelName,
    selectedAr,
    selectedQuality,
    maxImages,
    prompt,
    uploadedImageUrls,
    localHistory,
  ]);

  // ── Derived: current model lists & helpers ───────────────────────────────
  const currentModels = imageMode ? i2iModels : t2iModels;
  const currentAspectRatios = imageMode
    ? getAspectRatiosForI2IModel(selectedModelId)
    : getAspectRatiosForModel(selectedModelId);
  const currentResolutions = imageMode
    ? getResolutionsForI2IModel(selectedModelId)
    : getResolutionsForModel(selectedModelId);
  const currentQualityField = imageMode
    ? getQualityFieldForI2IModel(selectedModelId)
    : getQualityFieldForModel(selectedModelId);
  const showQualityBtn = currentResolutions.length > 0;

  // ── Textarea auto-resize ─────────────────────────────────────────────────
  const handleTextareaInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxHeight = window.innerWidth < 768 ? 150 : 250;
    el.style.height = Math.min(el.scrollHeight, maxHeight) + "px";
  };

  // ── @mention handlers ────────────────────────────────────────────────────
  const handlePromptChange = (e) => {
    const val = e.target.value;
    setPrompt(val);
    const cursor = e.target.selectionStart;
    const textBefore = val.slice(0, cursor);
    const match = textBefore.match(/@(\w*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionAnchor({ start: cursor - match[0].length, end: cursor });
      setMentionOpen(true);
    } else {
      setMentionOpen(false);
    }
  };

  const handleMentionSelect = (character) => {
    // 1. Insert text tag at cursor position
    const tag = `@${character.name.replace(/\s+/g, '_')}`;
    const anchor = mentionAnchor || { start: 0, end: 0 };
    const newPrompt = prompt.slice(0, anchor.start) + tag + ' ' + prompt.slice(anchor.end);
    setPrompt(newPrompt);
    setMentionOpen(false);

    // 2. Load reference images additively (deduplicated)
    if (character.referenceImages?.length > 0) {
      setUploadedImageUrls((prev) => [...new Set([...prev, ...character.referenceImages])]);

      // 3. Switch to i2i mode if not already
      if (!imageMode) {
        const firstI2I = i2iModels[0];
        setImageMode(true);
        setSelectedModelId(firstI2I.id);
        setSelectedModelName(firstI2I.name);
        setSelectedAr(getAspectRatiosForI2IModel(firstI2I.id)[0] || '1:1');
        setSelectedQuality(getResolutionsForI2IModel(firstI2I.id)[0] || null);
        setMaxImages(getMaxImagesForI2IModel(firstI2I.id));
      }
    }

    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const expandMentions = (text) => {
    return text.replace(/@(\w+)/g, (match, tag) => {
      const normalized = tag.replace(/_/g, ' ').toLowerCase();
      const char = savedCharacters.find(
        (c) =>
          c.name.toLowerCase() === normalized ||
          c.name.toLowerCase().replace(/\s+/g, '_') === tag.toLowerCase()
      );
      return char?.triggerPrompt ? char.triggerPrompt : match;
    });
  };

  // ── Upload picker callbacks ──────────────────────────────────────────────
  const handleUploadSelect = useCallback(
    ({ url, urls }) => {
      const newUrls = urls || [url];
      setUploadedImageUrls(newUrls);

      if (!imageMode) {
        const firstI2I = i2iModels[0];
        const ars = getAspectRatiosForI2IModel(firstI2I.id);
        const resolutions = getResolutionsForI2IModel(firstI2I.id);
        setImageMode(true);
        setSelectedModelId(firstI2I.id);
        setSelectedModelName(firstI2I.name);
        setSelectedAr(ars[0] || "1:1");
        setSelectedQuality(resolutions[0] || null);
        setMaxImages(getMaxImagesForI2IModel(firstI2I.id));
      }
    },
    [imageMode],
  );

  const handleUploadClear = useCallback(() => {
    setUploadedImageUrls([]);
    setImageMode(false);
    const firstT2I = t2iModels[0];
    const ars = getAspectRatiosForModel(firstT2I.id);
    const resolutions = getResolutionsForModel(firstT2I.id);
    setSelectedModelId(firstT2I.id);
    setSelectedModelName(firstT2I.name);
    setSelectedAr(ars[0] || "1:1");
    setSelectedQuality(resolutions[0] || null);
    setMaxImages(1);
  }, []);

  // ── Model selection ──────────────────────────────────────────────────────
  const handleModelSelect = (m) => {
    const ars = imageMode
      ? getAspectRatiosForI2IModel(m.id)
      : getAspectRatiosForModel(m.id);
    const resolutions = imageMode
      ? getResolutionsForI2IModel(m.id)
      : getResolutionsForModel(m.id);
    setSelectedModelId(m.id);
    setSelectedModelName(m.name);
    setSelectedAr(ars[0] || "1:1");
    setSelectedQuality(resolutions[0] || null);
    if (imageMode) setMaxImages(getMaxImagesForI2IModel(m.id));
  };

  // ── History helpers ──────────────────────────────────────────────────────
  const addToHistory = useCallback(
    (entry) => {
      if (!historyItems) {
        setLocalHistory((prev) => [entry, ...prev.slice(0, 49)]);
      }
      setActiveHistoryIdx(0);
      setCurrentImageUrl(entry.url);
    },
    [historyItems],
  );

  // ── View state ─────────────────────────────────────

  const resetToPrompt = () => {
    setCurrentImageUrl(null);
    setPrompt("");
    setUploadedImageUrls([]);
    setImageMode(false);
    const firstT2I = t2iModels[0];
    const ars = getAspectRatiosForModel(firstT2I.id);
    const resolutions = getResolutionsForModel(firstT2I.id);
    setSelectedModelId(firstT2I.id);
    setSelectedModelName(firstT2I.name);
    setSelectedAr(ars[0] || "1:1");
    setSelectedQuality(resolutions[0] || null);
    setMaxImages(1);
  };

  // ── Generation ───────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (generating) return;

    if (imageMode) {
      if (uploadedImageUrls.length === 0) {
        alert("Please upload a reference image first.");
        return;
      }
    } else {
      if (!prompt.trim()) {
        alert("Please enter a prompt to generate an image.");
        return;
      }
    }

    setGenerating(true);
    setGenerateError(null);

    // Build final prompt: expand @mentions, then prepend character trigger if active
    const characterPrefix = activeCharacter?.triggerPrompt?.trim();
    const expandedUserPrompt = expandMentions(prompt.trim());
    const fullPrompt = characterPrefix && expandedUserPrompt
      ? `${characterPrefix}, ${expandedUserPrompt}`
      : characterPrefix || expandedUserPrompt;

    try {
      let res;
      if (imageMode) {
        const genParams = {
          model: selectedModelId,
          images_list: uploadedImageUrls,
          image_url: uploadedImageUrls[0],
          aspect_ratio: selectedAr,
        };
        if (fullPrompt) genParams.prompt = fullPrompt;
        if (currentQualityField && selectedQuality) {
          genParams[currentQualityField] = selectedQuality;
        }
        res = await generateI2I(apiKey, genParams);
      } else {
        const genParams = {
          model: selectedModelId,
          prompt: fullPrompt,
          aspect_ratio: selectedAr,
        };
        if (currentQualityField && selectedQuality) {
          genParams[currentQualityField] = selectedQuality;
        }
        res = await generateImage(apiKey, genParams);
      }

      const outputUrls = res?.allOutputs?.length > 0 ? res.allOutputs : (res?.url ? [res.url] : []);
      if (outputUrls.length === 0) {
        console.error("[ImageStudio] Full API response:", res);
        throw new Error("No image URL returned by API");
      }
      // Add each output image to history (multi-image models return several)
      outputUrls.forEach((url, i) => {
        const entry = {
          id: (res.id || res.request_id || Date.now().toString()) + (i > 0 ? `-${i}` : ''),
          url,
          prompt: fullPrompt,
          model: selectedModelId,
          aspect_ratio: selectedAr,
          timestamp: new Date().toISOString(),
        };
        addToHistory(entry);
      });
      onGenerationComplete?.({
        url: outputUrls[0],
        model: selectedModelId,
        prompt: fullPrompt,
        type: "image",
      });
    } catch (e) {
      console.error("[ImageStudio] Generation failed:", e);
      setGenerateError(e.message.slice(0, 80));
      setTimeout(() => setGenerateError(null), 4000);
    } finally {
      setGenerating(false);
    }
  };

  const placeholderText =
    uploadedImageUrls.length > 1
      ? `${uploadedImageUrls.length} images selected — describe the transformation (optional)`
      : imageMode
        ? "Describe how to transform this image (optional)"
        : "Describe the image you want to create";

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-app-bg relative p-4 md:p-6 overflow-hidden">
      
      {/* ── CENTRAL GALLERY AREA ── */}
      <div className="flex-1 w-full max-w-7xl mx-auto overflow-y-auto custom-scrollbar pb-40 lg:pb-32 px-2">
        {history.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 w-full pt-4 animate-fade-in-up">
            {history.map((entry, idx) => (
              <div
                key={entry.id || idx}
                className="relative group rounded-xl overflow-hidden border border-white/[0.08] bg-[#111111] shadow-xl hover:border-primary/40 hover:shadow-glow-soft transition-all duration-300 flex flex-col"
              >
                <img
                  src={entry.url}
                  alt={entry.prompt?.substring(0, 30) || "Generated image"}
                  className="w-full aspect-square object-cover bg-black/40 cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => setFullscreenUrl(entry.url)}
                />
                
                {/* Overlay actions */}
                <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    title="Fullscreen"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFullscreenUrl(entry.url);
                    }}
                    className="p-2 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-primary hover:text-black transition-all border border-white/10"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="15 3 21 3 21 9" />
                      <polyline points="9 21 3 21 3 15" />
                      <line x1="21" y1="3" x2="14" y2="10" />
                      <line x1="3" y1="21" x2="10" y2="14" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    title="Download"
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadImage(entry.url, `muapi-${entry.id || idx}.jpg`);
                    }}
                    className="p-2 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-primary hover:text-black transition-all border border-white/10"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                    </svg>
                  </button>
                  {onAnimate && (
                    <button
                      type="button"
                      title="Animate in Video Studio"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAnimate(entry.url);
                      }}
                      className="p-2 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-primary hover:text-black transition-all border border-white/10"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                    </button>
                  )}
                  <button
                    type="button"
                    title="Delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!historyItems) setLocalHistory((prev) => prev.filter((_, i) => i !== idx));
                    }}
                    className="p-2 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-red-500 transition-all border border-white/10"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" />
                    </svg>
                  </button>
                </div>

                {/* Prompt & Details */}
                <div className="p-3 bg-black/80 backdrop-blur-sm border-t border-white/5 flex-1 flex flex-col justify-between gap-2">
                  <p className="text-white/70 text-xs line-clamp-3 leading-relaxed" title={entry.prompt}>
                    {entry.prompt || "No prompt provided"}
                  </p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] font-bold text-primary px-2 py-0.5 bg-primary/10 rounded border border-primary/20">
                      {entry.model?.replace("-", " ")}
                    </span>
                    <span className="text-[10px] text-white/40">{entry.aspect_ratio}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full animate-fade-in-up transition-all duration-700 min-h-[50vh]">
            <div className="mb-12 relative group">
              <div className="absolute inset-0 bg-primary/10 blur-[120px] rounded-full opacity-30 group-hover:opacity-60 transition-opacity duration-1000" />
              <div className="relative w-24 h-24 md:w-32 md:h-32 bg-white/[0.02] rounded-2xl flex items-center justify-center border border-white/[0.05] overflow-hidden backdrop-blur-sm">
                <div className="w-16 h-16 bg-primary/5 rounded-2xl flex items-center justify-center border border-primary/10 relative z-10 transition-transform duration-500 group-hover:scale-110">
                  <svg
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="text-primary opacity-80"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                </div>
                <div className="absolute top-4 right-4 text-[10px] text-primary/40 animate-pulse">
                  ✨
                </div>
              </div>
            </div>
            <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold text-white tracking-tight mb-4 text-center px-4">
              <span className="text-white/40 font-medium">START CREATING WITH</span>
              <br />
              <span className="text-white">IMAGE STUDIO</span>
            </h1>
            <p className="text-white/40 text-sm md:text-base font-medium tracking-wide text-center max-w-lg leading-relaxed">
              Describe a scene, character, mood, or style — and watch it come to life
            </p>
          </div>
        )}
      </div>

      {/* ── BOTTOM PROMPT BAR ── */}
      <div 
        className="absolute bottom-4 w-full max-w-[95%] lg:max-w-4xl z-40 animate-fade-in-up" 
        style={{ animationDelay: "0.2s" }}
      >
        <div className="w-full bg-[#111111]/90 backdrop-blur-3xl rounded-xl border border-white/[0.08] p-4 flex flex-col gap-2 shadow-2xl">
          {/* Character badge (shown when a character is active) */}
          {activeCharacter && (
            <div className="flex items-center gap-2 px-1">
              <div className="flex items-center gap-2 px-2.5 py-1 bg-primary/10 border border-primary/20 rounded-lg">
                {activeCharacter.thumbnail && (
                  <img src={activeCharacter.thumbnail} alt="" className="w-4 h-4 rounded-full object-cover" />
                )}
                <span className="text-[11px] font-semibold text-primary">{activeCharacter.name}</span>
                {activeCharacter.triggerPrompt && (
                  <span className="text-[10px] text-primary/50 max-w-[180px] truncate hidden sm:block">
                    — {activeCharacter.triggerPrompt}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleCharacterDeselect}
                  className="ml-1 text-primary/60 hover:text-primary transition-colors"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Top row: upload picker + textarea */}
          <div className="flex items-center gap-2">
            <UploadButton
              apiKey={apiKey}
              maxImages={maxImages}
              onSelect={handleUploadSelect}
              onClear={handleUploadClear}
              initialUrls={uploadedImageUrls}
            />
            <div className="relative flex-1 flex flex-col gap-2">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={handlePromptChange}
                onInput={handleTextareaInput}
                onBlur={() => setTimeout(() => setMentionOpen(false), 150)}
                placeholder={placeholderText}
                rows={1}
                className="w-full bg-transparent border-none text-white text-sm placeholder:text-white/20 focus:outline-none resize-none pt-1 leading-relaxed min-h-[40px] max-h-[150px] md:max-h-[250px] overflow-y-auto custom-scrollbar"
              />

              {/* @mention dropdown */}
              {mentionOpen && savedCharacters.length > 0 && (
                <div className="absolute bottom-[calc(100%+4px)] left-0 right-0 z-50 bg-[#111111] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden max-h-52 overflow-y-auto custom-scrollbar">
                  {savedCharacters
                    .filter((c) => c.name.toLowerCase().includes(mentionQuery.toLowerCase()))
                    .map((char) => (
                      <button
                        key={char.id}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); handleMentionSelect(char); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/5 text-left transition-colors"
                      >
                        {char.thumbnail ? (
                          <img src={char.thumbnail} alt="" className="w-7 h-7 rounded-lg object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/30">
                              <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                            </svg>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <span className="text-white text-xs font-semibold block truncate">{char.name}</span>
                          {char.triggerPrompt && (
                            <p className="text-white/30 text-[10px] truncate">{char.triggerPrompt}</p>
                          )}
                        </div>
                      </button>
                    ))}
                  {savedCharacters.filter((c) => c.name.toLowerCase().includes(mentionQuery.toLowerCase())).length === 0 && (
                    <p className="text-white/30 text-xs px-3 py-3 text-center">No characters match &ldquo;{mentionQuery}&rdquo;</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Bottom row: controls + generate */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-2 border-t border-white/[0.03] relative">
            {/* Left controls */}
            <div className="flex items-center gap-2 relative flex-wrap pb-1 md:pb-0">
              {/* Character picker button */}
              <div className="relative" ref={charPickerRef}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCharPickerOpen((o) => !o);
                    setDropdownOpen(null);
                  }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 border whitespace-nowrap active:scale-95 ${
                    activeCharacter
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : "bg-white/[0.03] hover:bg-white/[0.06] border-white/[0.04] text-white/70 hover:text-primary"
                  } group`}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                  </svg>
                  <span className="text-xs font-semibold">
                    {activeCharacter ? activeCharacter.name : "Character"}
                  </span>
                </button>

                {charPickerOpen && (
                  <div className="absolute bottom-[calc(100%+12px)] left-0 z-50 bg-[#111111] rounded-xl p-3 shadow-2xl border border-white/[0.08] w-64">
                    <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2">Your Characters</p>
                    {savedCharacters.length === 0 ? (
                      <p className="text-xs text-white/30 py-2 text-center">No characters yet — create one in the Characters tab</p>
                    ) : (
                      <div className="flex flex-col gap-1 max-h-52 overflow-y-auto custom-scrollbar">
                        {savedCharacters.map((char) => (
                          <button
                            key={char.id}
                            type="button"
                            onClick={() => handleCharacterSelect(char)}
                            className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all hover:bg-white/5 ${
                              activeCharacter?.id === char.id ? "bg-primary/10 border border-primary/20" : ""
                            }`}
                          >
                            {char.thumbnail ? (
                              <img src={char.thumbnail} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0 border border-white/10" />
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 border border-white/5">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/30">
                                  <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                                </svg>
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-white truncate">{char.name}</p>
                              {char.triggerPrompt && (
                                <p className="text-[10px] text-white/30 truncate">{char.triggerPrompt}</p>
                              )}
                            </div>
                            {activeCharacter?.id === char.id && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#d9ff00" strokeWidth="3" className="flex-shrink-0">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    {activeCharacter && (
                      <button
                        type="button"
                        onClick={handleCharacterDeselect}
                        className="w-full mt-2 py-1.5 text-[11px] text-white/40 hover:text-white/70 transition-colors text-center border-t border-white/5 pt-2"
                      >
                        Clear character
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Model button */}
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDropdownOpen((o) => (o === "model" ? null : "model"));
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-white/[0.03] hover:bg-white/[0.06] rounded-lg transition-all duration-200 border border-white/[0.04] group whitespace-nowrap active:scale-95"
                >
                  <div className="w-4 h-4 bg-[#d9ff00] rounded flex items-center justify-center">
                    <span className="text-[9px] font-bold text-black uppercase">G</span>
                  </div>
                  <span className="text-xs font-semibold text-white/70 group-hover:text-[#d9ff00] transition-colors">
                    {selectedModelName}
                  </span>
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="4"
                    className="opacity-50 group-hover:opacity-100 transition-opacity flex-shrink-0"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>

                {dropdownOpen === "model" && (
                  <div
                    ref={dropdownRef}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute bottom-[calc(100%+12px)] left-0 z-50 bg-[#111111] rounded-lg p-3 shadow-2xl border border-white/[0.07] w-[calc(100vw-3rem)] max-w-xs"
                  >
                    <ModelDropdown
                      models={currentModels}
                      selectedModel={selectedModelId}
                      onSelect={handleModelSelect}
                      onClose={() => setDropdownOpen(null)}
                    />
                  </div>
                )}
              </div>

              {/* Aspect ratio button */}
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDropdownOpen((o) => (o === "ar" ? null : "ar"));
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-white/[0.03] hover:bg-white/[0.06] rounded-lg transition-all duration-200 border border-white/[0.04] group whitespace-nowrap active:scale-95"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-40 text-white">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  </svg>
                  <span className="text-[11px] font-semibold text-white/70 group-hover:text-[#d9ff00] transition-colors">
                    {selectedAr}
                  </span>
                </button>

                {dropdownOpen === "ar" && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute bottom-[calc(100%+12px)] left-0 z-50 bg-[#0a0a0a] rounded-md p-3 shadow-2xl border border-white/10 min-w-[160px]"
                  >
                    <SimpleDropdown
                      title="Aspect Ratio"
                      options={currentAspectRatios}
                      selected={selectedAr}
                      onSelect={(val) => setSelectedAr(val)}
                      onClose={() => setDropdownOpen(null)}
                    />
                  </div>
                )}
              </div>

              {/* Quality/resolution button */}
              {showQualityBtn && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDropdownOpen((o) => (o === "quality" ? null : "quality"));
                    }}
                    className="flex items-center gap-2 px-3 py-2 bg-white/[0.03] hover:bg-white/[0.06] rounded-xl transition-all border border-white/[0.03] group whitespace-nowrap"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-40 text-white">
                      <path d="M6 2L3 6v15a2 2 0 002 2h14a2 2 0 002-2V6l-3-4H6z" />
                    </svg>
                    <span className="text-[11px] font-semibold text-white/70 group-hover:text-[#d9ff00] transition-colors">
                      {selectedQuality || currentResolutions[0]}
                    </span>
                  </button>

                  {dropdownOpen === "quality" && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute bottom-[calc(100%+12px)] left-0 z-50 bg-[#0a0a0a] rounded-[1.5rem] p-3 shadow-2xl border border-white/[0.05] min-w-[160px]"
                    >
                      <SimpleDropdown
                        title="Resolution"
                        options={currentResolutions}
                        selected={selectedQuality}
                        onSelect={(val) => setSelectedQuality(val)}
                        onClose={() => setDropdownOpen(null)}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Generate button */}
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="bg-[#d9ff00] text-black px-5 py-2 rounded-lg font-semibold text-sm hover:bg-[#e5ff33] hover:scale-[1.02] active:scale-[0.97] transition-all duration-200 flex items-center justify-center gap-2 w-full sm:w-auto shadow-lg shadow-[#d9ff00]/15 disabled:opacity-50 disabled:cursor-not-allowed z-10"
            >
              {generating ? (
                <>
                  <span className="animate-spin inline-block text-black">◌</span>
                  Generating...
                </>
              ) : generateError ? (
                `Error: ${generateError}`
              ) : (
                <>
                  <span>Generate</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── FULLSCREEN IMAGE MODAL ── */}
      {fullscreenUrl && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-sm animate-fade-in"
          onClick={() => setFullscreenUrl(null)}
        >
          <button
            type="button"
            className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors border border-white/10"
            onClick={(e) => {
              e.stopPropagation();
              setFullscreenUrl(null);
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <img 
            src={fullscreenUrl} 
            alt="Fullscreen Preview" 
            className="max-w-[95vw] max-h-[95vh] rounded-2xl shadow-2xl object-contain animate-scale-up" 
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
