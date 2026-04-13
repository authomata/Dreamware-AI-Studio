"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { uploadFile } from "../muapi.js";

const STORAGE_KEY = "dw_characters";

function loadCharacters() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCharacters(characters) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(characters));
  } catch {}
}

// ─── Upload Zone ──────────────────────────────────────────────────────────────

function ImageUploadZone({ apiKey, images, onAdd, onRemove }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({});
  const [error, setError] = useState(null);

  const handleFiles = useCallback(
    async (files) => {
      const remaining = 5 - images.length;
      const toUpload = Array.from(files).slice(0, remaining);
      if (!toUpload.length) return;

      setUploading(true);
      setError(null);

      for (const file of toUpload) {
        const id = Math.random().toString(36).slice(2);
        try {
          setProgress((p) => ({ ...p, [id]: 0 }));
          const url = await uploadFile(apiKey, file, (pct) =>
            setProgress((p) => ({ ...p, [id]: pct }))
          );
          onAdd(url);
        } catch (e) {
          setError("Upload failed: " + e.message.slice(0, 60));
        } finally {
          setProgress((p) => {
            const next = { ...p };
            delete next[id];
            return next;
          });
        }
      }

      setUploading(false);
    },
    [apiKey, images.length, onAdd]
  );

  const handleDrop = (e) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Drop zone */}
      {images.length < 5 && (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-white/10 hover:border-primary/40 rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors bg-white/[0.02] hover:bg-white/[0.04]"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/30">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <p className="text-xs text-white/40 text-center">
            {uploading ? "Uploading..." : `Drop images or click to upload (${images.length}/5)`}
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      )}

      {/* Upload progress bars */}
      {Object.entries(progress).map(([id, pct]) => (
        <div key={id} className="w-full bg-white/10 rounded-full h-1">
          <div
            className="bg-primary h-1 rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      ))}

      {/* Error */}
      {error && (
        <p className="text-red-400 text-xs">{error}</p>
      )}

      {/* Thumbnails */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((url, i) => (
            <div key={i} className="relative group w-16 h-16">
              <img
                src={url}
                alt=""
                className="w-full h-full object-cover rounded-lg border border-white/10"
              />
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Character Card ───────────────────────────────────────────────────────────

function CharacterCard({ character, onDelete }) {
  return (
    <div className="relative group rounded-2xl overflow-hidden border border-white/10 bg-[#0a0a0a] shadow-xl hover:border-primary/40 transition-all duration-300 flex flex-col">
      {/* Thumbnail */}
      <div className="aspect-square bg-black/40 overflow-hidden">
        {character.thumbnail ? (
          <img
            src={character.thumbnail}
            alt={character.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/20">
              <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
          </div>
        )}
      </div>

      {/* Delete button */}
      <button
        type="button"
        onClick={() => onDelete(character.id)}
        title="Delete"
        className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-full text-white hover:bg-red-500 transition-colors opacity-0 group-hover:opacity-100"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
        </svg>
      </button>

      {/* Info */}
      <div className="p-3 flex flex-col gap-1 flex-1">
        <p className="text-white text-sm font-semibold truncate">{character.name}</p>
        {character.description && (
          <p className="text-white/40 text-xs line-clamp-2">{character.description}</p>
        )}
        {character.triggerPrompt && (
          <p className="text-primary/60 text-[10px] line-clamp-2 mt-1 font-mono">
            {character.triggerPrompt}
          </p>
        )}
        <p className="text-white/20 text-[10px] mt-auto pt-1">
          {character.referenceImages?.length || 0} ref image{character.referenceImages?.length !== 1 ? "s" : ""}
        </p>
      </div>
    </div>
  );
}

// ─── New Character Form ───────────────────────────────────────────────────────

function NewCharacterForm({ apiKey, onSave, onCancel }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerPrompt, setTriggerPrompt] = useState("");
  const [referenceImages, setReferenceImages] = useState([]);
  const [saving, setSaving] = useState(false);

  const handleAddImage = useCallback((url) => {
    setReferenceImages((prev) => [...prev, url]);
  }, []);

  const handleRemoveImage = useCallback((idx) => {
    setReferenceImages((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleSave = async () => {
    if (!name.trim()) {
      alert("Character name is required.");
      return;
    }
    setSaving(true);
    try {
      const character = {
        id: crypto.randomUUID(),
        name: name.trim(),
        description: description.trim(),
        triggerPrompt: triggerPrompt.trim(),
        referenceImages,
        thumbnail: referenceImages[0] || null,
        createdAt: new Date().toISOString(),
      };
      onSave(character);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>
        <h2 className="text-white font-bold text-lg">New Character</h2>
      </div>

      {/* Name */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-white/40 uppercase tracking-widest">Name *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Sarah, Marcus, Agent X"
          className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-primary/40 transition-colors"
        />
      </div>

      {/* Trigger Prompt */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-white/40 uppercase tracking-widest">Visual Description / Trigger Prompt</label>
        <p className="text-[11px] text-white/30">This will be prepended to your prompts when using this character in Image Studio.</p>
        <textarea
          value={triggerPrompt}
          onChange={(e) => setTriggerPrompt(e.target.value)}
          placeholder='e.g. "a 35-year-old woman with curly red hair, green eyes, freckles, wearing a blue blazer"'
          rows={3}
          className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-primary/40 transition-colors resize-none leading-relaxed"
        />
      </div>

      {/* Description */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-white/40 uppercase tracking-widest">Notes (optional)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Any notes about this character..."
          rows={2}
          className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-primary/40 transition-colors resize-none"
        />
      </div>

      {/* Reference Images */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-white/40 uppercase tracking-widest">Reference Images (up to 5)</label>
        <p className="text-[11px] text-white/30">Upload reference photos. These will be loaded as reference images in Image Studio when you use this character.</p>
        <ImageUploadZone
          apiKey={apiKey}
          images={referenceImages}
          onAdd={handleAddImage}
          onRemove={handleRemoveImage}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-sm font-semibold transition-all border border-white/5"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="flex-1 py-3 rounded-xl bg-primary text-black text-sm font-bold hover:bg-primary/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : "Save Character"}
        </button>
      </div>
    </div>
  );
}

// ─── Gallery View ─────────────────────────────────────────────────────────────

function GalleryView({ characters, onNew, onDelete }) {
  return (
    <div className="w-full h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
        <div>
          <h1 className="text-white font-bold text-xl">Characters</h1>
          <p className="text-white/30 text-xs mt-0.5">Reusable character references for consistent generation</p>
        </div>
        <button
          type="button"
          onClick={onNew}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-black text-xs font-bold rounded-xl hover:bg-primary/90 transition-all"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Character
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        {characters.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 animate-fade-in-up">
            <div className="w-20 h-20 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/20">
                <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-white/40 text-sm font-medium">No characters yet</p>
              <p className="text-white/20 text-xs mt-1">Create your first character to use it in Image Studio</p>
            </div>
            <button
              type="button"
              onClick={onNew}
              className="px-5 py-2.5 bg-primary text-black text-sm font-bold rounded-xl hover:bg-primary/90 transition-all"
            >
              Create Character
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 animate-fade-in-up">
            {characters.map((char) => (
              <CharacterCard
                key={char.id}
                character={char}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CharacterStudio({ apiKey }) {
  const [view, setView] = useState("gallery"); // 'gallery' | 'new'
  const [characters, setCharacters] = useState([]);

  // Load from localStorage on mount
  useEffect(() => {
    setCharacters(loadCharacters());
  }, []);

  // Save to localStorage whenever characters change
  useEffect(() => {
    saveCharacters(characters);
  }, [characters]);

  const handleSave = useCallback((character) => {
    setCharacters((prev) => [character, ...prev]);
    setView("gallery");
  }, []);

  const handleDelete = useCallback((id) => {
    setCharacters((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return (
    <div className="w-full h-full flex flex-col items-center bg-app-bg overflow-hidden">
      {view === "gallery" ? (
        <div className="w-full h-full">
          <GalleryView
            characters={characters}
            onNew={() => setView("new")}
            onDelete={handleDelete}
          />
        </div>
      ) : (
        <div className="w-full h-full overflow-y-auto custom-scrollbar">
          <NewCharacterForm
            apiKey={apiKey}
            onSave={handleSave}
            onCancel={() => setView("gallery")}
          />
        </div>
      )}
    </div>
  );
}
