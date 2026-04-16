"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { generateImage, generateI2I, generateStoryPlan } from "../muapi.js";

// ─── constants ────────────────────────────────────────────────────────────────

const PERSIST_KEY = "dw_story_studio";

const STYLES = [
  { id: "cinematic", label: "Cinematic", prompt: "cinematic photography, dramatic lighting, film grain, 35mm" },
  { id: "anime",     label: "Anime",     prompt: "anime illustration, detailed, vibrant colors, studio quality" },
  { id: "noir",      label: "Noir",      prompt: "film noir, high contrast, deep shadows, monochromatic, moody" },
  { id: "scifi",     label: "Sci-Fi",    prompt: "science fiction, futuristic, neon lighting, cyberpunk aesthetic" },
  { id: "fantasy",   label: "Fantasy",   prompt: "epic fantasy art, magical atmosphere, painterly, ethereal" },
  { id: "horror",    label: "Horror",    prompt: "atmospheric horror, dark and foreboding, unsettling, desaturated" },
];

const SCENE_COUNTS = [3, 4, 5, 6, 8, 10, 12];

const ASPECT_RATIOS = ["16:9", "21:9", "4:3", "1:1"];

// ─── helpers ──────────────────────────────────────────────────────────────────

async function downloadImage(url, filename) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob),
      download: filename,
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch {
    window.open(url, "_blank");
  }
}

function createManualFallback(count, storyPrompt) {
  return Array.from({ length: count }, (_, i) => ({
    scene_number: i + 1,
    description: `Scene ${i + 1} — describe what happens in this part of the story.`,
    shot_type: "Wide Shot",
    mood: "dramatic",
    camera_motion: "static",
    image_prompt: `Scene ${i + 1}: ${storyPrompt.slice(0, 60)}, cinematic`,
  }));
}

// ─── sub-components ───────────────────────────────────────────────────────────

function SprocketRow() {
  return (
    <div className="flex justify-between px-1.5 mb-1">
      {[...Array(7)].map((_, i) => (
        <div key={i} className="w-2.5 h-1.5 bg-white/[0.12] rounded-[2px]" />
      ))}
    </div>
  );
}

function FrameSkeleton({ status, sceneNumber }) {
  return (
    <div className={`w-full aspect-video rounded-xl border flex items-center justify-center transition-all duration-500 ${
      status === "generating"
        ? "border-primary/40 bg-primary/5 animate-pulse"
        : "border-white/[0.05] bg-white/[0.02]"
    }`}>
      {status === "generating" ? (
        <div className="flex flex-col items-center gap-2">
          <span className="animate-spin text-primary text-2xl leading-none">◌</span>
          <span className="text-[10px] text-primary/60 font-bold">Scene {sceneNumber}</span>
        </div>
      ) : (
        <span className="text-white/10 text-xs font-bold">S{sceneNumber}</span>
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function StoryStudio({ apiKey, onAnimate, characters: charactersProp }) {
  // ── setup state ─────────────────────────────────────────────────────────────
  const [storyPrompt, setStoryPrompt] = useState("");
  const [sceneCount, setSceneCount] = useState(5);
  const [style, setStyle] = useState("cinematic");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [selectedCharacters, setSelectedCharacters] = useState([]);
  const [savedCharacters, setSavedCharacters] = useState([]);
  const [charPickerOpen, setCharPickerOpen] = useState(false);

  // ── phase state ──────────────────────────────────────────────────────────────
  // 'setup' | 'planning' | 'plan_review' | 'generating' | 'filmstrip'
  const [phase, setPhase] = useState("setup");
  const [planError, setPlanError] = useState(null);

  // ── scene / frame state ──────────────────────────────────────────────────────
  const [scenes, setScenes] = useState([]); // [{scene_number, description, shot_type, mood, camera_motion, image_prompt}]
  const [frames, setFrames] = useState([]); // [{status: 'pending'|'generating'|'done'|'error', url, error}]

  // ── ui state ─────────────────────────────────────────────────────────────────
  const [fullscreenUrl, setFullscreenUrl] = useState(null);
  const [generatingProgress, setGeneratingProgress] = useState(0); // 0-N

  const charPickerRef = useRef(null);
  const filmstripRef = useRef(null);
  const abortRef = useRef(false); // set to true when user cancels generation

  // ── load characters (from prop or localStorage fallback) ────────────────────
  useEffect(() => {
    if (charactersProp != null) {
      setSavedCharacters(charactersProp);
      return;
    }
    try {
      const raw = localStorage.getItem("dw_characters");
      if (raw) setSavedCharacters(JSON.parse(raw));
    } catch {}
    const handler = (e) => {
      if (e.key === "dw_characters") {
        try { setSavedCharacters(JSON.parse(e.newValue || "[]")); } catch {}
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [charactersProp]);

  // ── close char picker on outside click ──────────────────────────────────────
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

  // ── persistence: load ────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PERSIST_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.storyPrompt) setStoryPrompt(data.storyPrompt);
      if (data.sceneCount) setSceneCount(data.sceneCount);
      if (data.style) setStyle(data.style);
      if (data.aspectRatio) setAspectRatio(data.aspectRatio);
      if (data.scenes?.length > 0) setScenes(data.scenes);
      if (data.frames?.length > 0) {
        const restored = data.frames.map((f) => ({ ...f, status: f.status === "done" ? "done" : "pending" }));
        setFrames(restored);
        // Restore phase
        if (restored.every((f) => f.status === "done")) setPhase("filmstrip");
        else if (data.scenes?.length > 0) setPhase("plan_review");
      } else if (data.scenes?.length > 0) {
        setPhase("plan_review");
      }
      if (data.selectedCharacterIds?.length > 0) {
        // Re-hydrate from prop (Supabase) or localStorage fallback
        try {
          const chars = charactersProp ?? JSON.parse(localStorage.getItem("dw_characters") || "[]");
          setSelectedCharacters(chars.filter((c) => data.selectedCharacterIds.includes(c.id)));
        } catch {}
      }
    } catch {}
  }, []);

  // ── persistence: save ────────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(PERSIST_KEY, JSON.stringify({
          storyPrompt, sceneCount, style, aspectRatio,
          scenes,
          frames: frames.map((f) => ({ status: f.status, url: f.url || null })),
          selectedCharacterIds: selectedCharacters.map((c) => c.id),
        }));
      } catch {}
    }, 500);
    return () => clearTimeout(timer);
  }, [storyPrompt, sceneCount, style, aspectRatio, scenes, frames, selectedCharacters]);

  // ── helpers ──────────────────────────────────────────────────────────────────

  const updateScene = useCallback((idx, field, value) => {
    setScenes((prev) => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  }, []);

  const toggleCharacter = useCallback((char) => {
    setSelectedCharacters((prev) => {
      const exists = prev.find((c) => c.id === char.id);
      return exists ? prev.filter((c) => c.id !== char.id) : [...prev, char];
    });
  }, []);

  const resetToSetup = useCallback(() => {
    abortRef.current = true;
    setPhase("setup");
    setScenes([]);
    setFrames([]);
    setPlanError(null);
    setGeneratingProgress(0);
    setTimeout(() => { abortRef.current = false; }, 100);
  }, []);

  // ── generate story plan ──────────────────────────────────────────────────────

  const handleGeneratePlan = async () => {
    if (!storyPrompt.trim()) return;
    setPlanError(null);
    setPhase("planning");
    try {
      const styleObj = STYLES.find((s) => s.id === style);
      const result = await generateStoryPlan(apiKey, {
        storyPrompt: storyPrompt.trim(),
        sceneCount,
        style: styleObj?.label || style,
      });
      // Pad or trim to requested count
      let finalScenes = result.slice(0, sceneCount);
      while (finalScenes.length < sceneCount) {
        const i = finalScenes.length;
        finalScenes.push(createManualFallback(1, storyPrompt.trim())[0]);
        finalScenes[i].scene_number = i + 1;
      }
      setScenes(finalScenes);
      setPhase("plan_review");
    } catch (err) {
      console.warn("[StoryStudio] LLM plan failed, using manual fallback:", err);
      setPlanError(`Couldn't auto-plan (${err.message.slice(0, 80)}). Edit the scenes below manually.`);
      setScenes(createManualFallback(sceneCount, storyPrompt.trim()));
      setPhase("plan_review");
    }
  };

  // ── generate all frames sequentially ────────────────────────────────────────

  const handleGenerateFrames = async () => {
    abortRef.current = false;
    const initialFrames = scenes.map(() => ({ status: "pending", url: null, error: null }));
    setFrames(initialFrames);
    setPhase("generating");
    setGeneratingProgress(0);

    const styleObj = STYLES.find((s) => s.id === style);
    const stylePrompt = styleObj?.prompt || "";
    const charTriggers = selectedCharacters.map((c) => c.triggerPrompt).filter(Boolean).join(", ");
    const charRefs = selectedCharacters.flatMap((c) => c.referenceImages || []).slice(0, 8);

    const completedUrls = []; // track urls as they complete

    for (let i = 0; i < scenes.length; i++) {
      if (abortRef.current) break;

      const scene = scenes[i];
      setFrames((prev) => prev.map((f, idx) => idx === i ? { ...f, status: "generating" } : f));

      try {
        const priorFrameRef = completedUrls.length > 0 ? [completedUrls[completedUrls.length - 1]] : [];
        const imagesList = [...charRefs, ...priorFrameRef];

        const fullPrompt = [charTriggers, scene.image_prompt, stylePrompt].filter(Boolean).join(", ");

        let res;
        if (imagesList.length > 0) {
          res = await generateI2I(apiKey, {
            model: "nano-banana-edit",
            prompt: fullPrompt,
            images_list: imagesList,
            image_url: imagesList[0],
            aspect_ratio: aspectRatio,
          });
        } else {
          res = await generateImage(apiKey, {
            model: "nano-banana",
            prompt: fullPrompt,
            aspect_ratio: aspectRatio,
          });
        }

        const url = res?.allOutputs?.[0] || res?.url || null;
        if (!url) throw new Error("No image URL returned");

        completedUrls.push(url);
        setFrames((prev) => prev.map((f, idx) => idx === i ? { status: "done", url, error: null } : f));
      } catch (err) {
        console.error(`[StoryStudio] Frame ${i + 1} failed:`, err);
        completedUrls.push(null); // keep index alignment
        setFrames((prev) => prev.map((f, idx) => idx === i ? { status: "error", url: null, error: err.message?.slice(0, 80) } : f));
      }

      setGeneratingProgress(i + 1);
    }

    if (!abortRef.current) setPhase("filmstrip");
  };

  // ── retry single frame ───────────────────────────────────────────────────────

  const handleRetryFrame = async (idx) => {
    const scene = scenes[idx];
    setFrames((prev) => prev.map((f, i) => i === idx ? { ...f, status: "generating", error: null } : f));

    const styleObj = STYLES.find((s) => s.id === style);
    const charTriggers = selectedCharacters.map((c) => c.triggerPrompt).filter(Boolean).join(", ");
    const charRefs = selectedCharacters.flatMap((c) => c.referenceImages || []).slice(0, 8);
    const priorUrl = frames.slice(0, idx).reverse().find((f) => f.status === "done")?.url;
    const imagesList = [...charRefs, ...(priorUrl ? [priorUrl] : [])];
    const fullPrompt = [charTriggers, scene.image_prompt, styleObj?.prompt].filter(Boolean).join(", ");

    try {
      let res;
      if (imagesList.length > 0) {
        res = await generateI2I(apiKey, { model: "nano-banana-edit", prompt: fullPrompt, images_list: imagesList, image_url: imagesList[0], aspect_ratio: aspectRatio });
      } else {
        res = await generateImage(apiKey, { model: "nano-banana", prompt: fullPrompt, aspect_ratio: aspectRatio });
      }
      const url = res?.allOutputs?.[0] || res?.url || null;
      if (!url) throw new Error("No image URL returned");
      setFrames((prev) => prev.map((f, i) => i === idx ? { status: "done", url, error: null } : f));
    } catch (err) {
      setFrames((prev) => prev.map((f, i) => i === idx ? { status: "error", url: null, error: err.message?.slice(0, 80) } : f));
    }
  };

  // ── render: SETUP ────────────────────────────────────────────────────────────

  if (phase === "setup") {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-app-bg p-6 overflow-y-auto custom-scrollbar">
        <div className="w-full max-w-2xl flex flex-col gap-6 animate-fade-in-up">

          {/* Header */}
          <div className="text-center mb-2">
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-2">STORY STUDIO</h1>
            <p className="text-white/30 text-sm font-medium">Write a story. Get a cinematic storyboard.</p>
          </div>

          {/* Story prompt */}
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-bold text-white/30 uppercase tracking-widest">Your Story</label>
            <textarea
              value={storyPrompt}
              onChange={(e) => setStoryPrompt(e.target.value)}
              placeholder={'e.g. "A rogue detective follows a ghost signal into an abandoned space station where she discovers the last surviving A.I. from a forgotten war."'}
              rows={4}
              className="w-full bg-[#111111] border border-white/[0.08] rounded-xl p-4 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-primary/40 resize-none leading-relaxed custom-scrollbar transition-colors"
            />
          </div>

          {/* Scene count + aspect ratio */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-bold text-white/30 uppercase tracking-widest">Scenes</label>
              <div className="flex gap-1.5 flex-wrap">
                {SCENE_COUNTS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSceneCount(n)}
                    className={`w-9 h-9 rounded-lg text-xs font-bold transition-all duration-200 active:scale-95 ${
                      sceneCount === n
                        ? "bg-primary text-black"
                        : "bg-white/[0.04] text-white/50 hover:bg-white/[0.08] hover:text-white border border-white/[0.06]"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-bold text-white/30 uppercase tracking-widest">Aspect Ratio</label>
              <div className="flex gap-1.5 flex-wrap">
                {ASPECT_RATIOS.map((ar) => (
                  <button
                    key={ar}
                    type="button"
                    onClick={() => setAspectRatio(ar)}
                    className={`px-2.5 h-9 rounded-lg text-xs font-bold transition-all duration-200 active:scale-95 ${
                      aspectRatio === ar
                        ? "bg-primary text-black"
                        : "bg-white/[0.04] text-white/50 hover:bg-white/[0.08] hover:text-white border border-white/[0.06]"
                    }`}
                  >
                    {ar}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Style picker */}
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-bold text-white/30 uppercase tracking-widest">Visual Style</label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {STYLES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStyle(s.id)}
                  className={`py-2 rounded-lg text-xs font-semibold transition-all duration-200 active:scale-95 ${
                    style === s.id
                      ? "bg-primary text-black"
                      : "bg-white/[0.04] text-white/50 hover:bg-white/[0.08] hover:text-white border border-white/[0.06]"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Character picker */}
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-bold text-white/30 uppercase tracking-widest">Characters (optional)</label>
            <div className="relative" ref={charPickerRef}>
              <button
                type="button"
                onClick={() => setCharPickerOpen((o) => !o)}
                className="flex items-center gap-2 px-3 py-2.5 bg-white/[0.04] border border-white/[0.06] rounded-lg text-sm text-white/60 hover:text-white/90 hover:bg-white/[0.07] transition-all duration-200 active:scale-95 w-full text-left"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
                  <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                </svg>
                {selectedCharacters.length === 0
                  ? "Select characters for visual consistency"
                  : `${selectedCharacters.length} character${selectedCharacters.length > 1 ? "s" : ""} selected`}
              </button>

              {charPickerOpen && (
                <div className="absolute bottom-[calc(100%+8px)] left-0 right-0 z-50 bg-[#111111] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden">
                  {savedCharacters.length === 0 ? (
                    <p className="text-white/30 text-xs px-4 py-4 text-center">No characters yet — create some in the Characters tab</p>
                  ) : (
                    <div className="max-h-56 overflow-y-auto custom-scrollbar p-2 flex flex-col gap-1">
                      {savedCharacters.map((char) => {
                        const selected = selectedCharacters.some((c) => c.id === char.id);
                        return (
                          <button
                            key={char.id}
                            type="button"
                            onClick={() => toggleCharacter(char)}
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all hover:bg-white/5 ${selected ? "bg-primary/10 border border-primary/20" : ""}`}
                          >
                            {char.thumbnail ? (
                              <img src={char.thumbnail} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0 border border-white/10" />
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
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
                            {selected && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#d9ff00" strokeWidth="3">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {selectedCharacters.length > 0 && (
              <div className="flex gap-2 flex-wrap mt-1">
                {selectedCharacters.map((c) => (
                  <div key={c.id} className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 border border-primary/20 rounded-lg">
                    {c.thumbnail && <img src={c.thumbnail} alt="" className="w-4 h-4 rounded-full object-cover" />}
                    <span className="text-[11px] font-semibold text-primary">{c.name}</span>
                    <button type="button" onClick={() => toggleCharacter(c)} className="text-primary/50 hover:text-primary transition-colors ml-0.5">
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Generate Plan button */}
          <button
            type="button"
            onClick={handleGeneratePlan}
            disabled={!storyPrompt.trim()}
            className="w-full h-12 bg-[#d9ff00] text-black rounded-xl font-black text-sm hover:bg-[#e5ff33] active:scale-[0.98] transition-all duration-200 shadow-lg shadow-[#d9ff00]/15 disabled:opacity-40 disabled:cursor-not-allowed tracking-wide"
          >
            Generate Storyboard Plan
          </button>
        </div>
      </div>
    );
  }

  // ── render: PLANNING ─────────────────────────────────────────────────────────

  if (phase === "planning") {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-app-bg gap-6 animate-fade-in-up">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 blur-[60px] rounded-full" />
          <div className="relative w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <span className="animate-spin text-primary text-4xl leading-none">◌</span>
          </div>
        </div>
        <div className="text-center">
          <p className="text-white font-bold text-base mb-1">Writing your storyboard…</p>
          <p className="text-white/30 text-sm">The director is planning {sceneCount} scenes</p>
        </div>
      </div>
    );
  }

  // ── render: PLAN REVIEW ──────────────────────────────────────────────────────

  if (phase === "plan_review") {
    return (
      <div className="w-full h-full flex flex-col bg-app-bg overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-white/[0.06] flex items-center justify-between gap-4">
          <div>
            <h2 className="text-white font-black text-base tracking-tight">Review Your Storyboard</h2>
            <p className="text-white/30 text-xs mt-0.5">Edit the image prompts if needed, then generate all frames.</p>
          </div>
          <button type="button" onClick={resetToSetup}
            className="text-white/30 hover:text-white/70 text-xs font-semibold transition-colors whitespace-nowrap active:scale-95">
            ← Back
          </button>
        </div>

        {planError && (
          <div className="flex-shrink-0 mx-6 mt-4 px-4 py-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <p className="text-yellow-400 text-xs leading-relaxed">{planError}</p>
          </div>
        )}

        {/* Scene cards */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 pb-32">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 py-5">
            {scenes.map((scene, idx) => (
              <div key={idx} className="bg-[#111111] border border-white/[0.08] rounded-xl p-4 flex flex-col gap-3 hover:border-primary/20 transition-all duration-200">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black text-primary/70 uppercase tracking-widest flex-shrink-0">
                    Scene {scene.scene_number}
                  </span>
                  <div className="flex gap-1.5 flex-wrap justify-end">
                    <span className="text-[9px] bg-white/[0.05] text-white/40 px-2 py-0.5 rounded-full whitespace-nowrap">{scene.shot_type}</span>
                    <span className="text-[9px] bg-white/[0.05] text-white/40 px-2 py-0.5 rounded-full">{scene.mood}</span>
                  </div>
                </div>
                <p className="text-white/60 text-[11px] leading-relaxed">{scene.description}</p>
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold text-white/20 uppercase tracking-widest">Image Prompt</label>
                  <textarea
                    value={scene.image_prompt}
                    onChange={(e) => updateScene(idx, "image_prompt", e.target.value)}
                    rows={2}
                    className="w-full bg-white/[0.03] border border-white/[0.05] rounded-lg p-2.5 text-white/60 text-[11px] focus:outline-none focus:border-primary/30 resize-none leading-relaxed custom-scrollbar transition-colors placeholder:text-white/15"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom action bar */}
        <div className="absolute bottom-4 left-0 right-0 flex justify-center z-40 px-6">
          <div className="w-full max-w-xl bg-[#111111]/90 backdrop-blur-3xl rounded-xl border border-white/[0.08] p-3 flex items-center gap-3 shadow-2xl">
            <div className="flex-1 text-xs text-white/40">
              <span className="font-semibold text-white/60">{scenes.length} scenes</span> · {STYLES.find(s => s.id === style)?.label} · {aspectRatio}
              {selectedCharacters.length > 0 && ` · ${selectedCharacters.length} character${selectedCharacters.length > 1 ? "s" : ""}`}
            </div>
            <button
              type="button"
              onClick={handleGenerateFrames}
              className="flex-shrink-0 px-5 py-2.5 bg-[#d9ff00] text-black rounded-lg font-black text-sm hover:bg-[#e5ff33] active:scale-[0.97] transition-all duration-200 shadow-lg shadow-[#d9ff00]/15 whitespace-nowrap"
            >
              Generate Storyboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── render: GENERATING ───────────────────────────────────────────────────────

  if (phase === "generating") {
    const doneCount = frames.filter((f) => f.status === "done").length;
    const errorCount = frames.filter((f) => f.status === "error").length;
    const progressPct = Math.round((generatingProgress / scenes.length) * 100);

    return (
      <div className="w-full h-full flex flex-col bg-app-bg overflow-hidden">
        {/* Progress header */}
        <div className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-white/[0.06]">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-white font-black text-base tracking-tight">Generating Storyboard</h2>
              <p className="text-white/30 text-xs mt-0.5">
                {doneCount} of {scenes.length} frames done{errorCount > 0 ? ` · ${errorCount} failed` : ""}
              </p>
            </div>
            <button type="button" onClick={resetToSetup}
              className="text-white/30 hover:text-red-400 text-xs font-semibold transition-colors active:scale-95">
              Cancel
            </button>
          </div>
          <div className="w-full h-1 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#d9ff00] rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Live frame preview */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar p-6 flex items-start gap-4" ref={filmstripRef}>
          {scenes.map((scene, idx) => {
            const frame = frames[idx];
            return (
              <div key={idx} className="flex-shrink-0 w-56 flex flex-col gap-2">
                <SprocketRow />
                {frame?.status === "done" && frame.url ? (
                  <img src={frame.url} alt={`Scene ${idx + 1}`} className="w-full aspect-video object-cover rounded-xl border border-primary/20" />
                ) : (
                  <FrameSkeleton status={frame?.status || "pending"} sceneNumber={idx + 1} />
                )}
                <p className="text-white/30 text-[9px] leading-tight px-0.5 line-clamp-2">{scene.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── render: FILMSTRIP ────────────────────────────────────────────────────────

  if (phase === "filmstrip") {
    const doneFrames = frames.filter((f) => f.status === "done");
    return (
      <div className="w-full h-full flex flex-col bg-app-bg overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 px-6 pt-4 pb-3 border-b border-white/[0.06] flex items-center justify-between gap-4">
          <div>
            <h2 className="text-white font-black text-base tracking-tight">Your Storyboard</h2>
            <p className="text-white/30 text-xs mt-0.5 line-clamp-1">{storyPrompt}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-[11px] font-semibold text-primary/60 bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-lg">
              {doneFrames.length}/{scenes.length} frames
            </span>
          </div>
        </div>

        {/* Filmstrip */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-6">
          <div className="flex gap-5 overflow-x-auto pb-4 custom-scrollbar" ref={filmstripRef}>
            {scenes.map((scene, idx) => {
              const frame = frames[idx];
              const isDone = frame?.status === "done";
              const isError = frame?.status === "error";

              return (
                <div key={idx} className="flex-shrink-0 w-64 flex flex-col gap-2 group">
                  <SprocketRow />

                  <div className={`relative rounded-xl overflow-hidden border transition-all duration-300 ${
                    isDone ? "border-white/[0.08] hover:border-primary/40 hover:shadow-glow-soft" : "border-white/[0.04]"
                  } bg-[#111111]`}>
                    {isDone && frame.url ? (
                      <>
                        <img
                          src={frame.url}
                          alt={`Scene ${idx + 1}`}
                          className="w-full aspect-video object-cover cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => setFullscreenUrl(frame.url)}
                        />
                        {/* Scene number badge */}
                        <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm px-2 py-0.5 rounded-md">
                          <span className="text-[10px] font-black text-primary">S{idx + 1}</span>
                        </div>
                        {/* Hover actions */}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2.5">
                          <button
                            type="button"
                            title="Fullscreen"
                            onClick={() => setFullscreenUrl(frame.url)}
                            className="p-2.5 bg-black/60 rounded-full text-white hover:bg-white/20 transition-all border border-white/10 active:scale-95"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                              <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            title="Download"
                            onClick={() => downloadImage(frame.url, `scene-${idx + 1}.jpg`)}
                            className="p-2.5 bg-black/60 rounded-full text-white hover:bg-white/20 transition-all border border-white/10 active:scale-95"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                            </svg>
                          </button>
                          {onAnimate && (
                            <button
                              type="button"
                              title="Animate in Video Studio"
                              onClick={() => onAnimate(frame.url)}
                              className="p-2.5 bg-[#d9ff00]/90 rounded-full text-black hover:bg-[#d9ff00] transition-all active:scale-95"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <polygon points="5 3 19 12 5 21 5 3" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </>
                    ) : isError ? (
                      <div className="w-full aspect-video flex flex-col items-center justify-center gap-2 bg-red-500/5">
                        <span className="text-red-400/60 text-xs text-center px-4">{frame.error || "Generation failed"}</span>
                        <button
                          type="button"
                          onClick={() => handleRetryFrame(idx)}
                          className="px-3 py-1.5 bg-white/5 text-white/60 text-[10px] font-semibold rounded-lg hover:bg-white/10 transition-all active:scale-95 border border-white/[0.06]"
                        >
                          Retry Scene {idx + 1}
                        </button>
                      </div>
                    ) : (
                      <FrameSkeleton status="pending" sceneNumber={idx + 1} />
                    )}
                  </div>

                  {/* Metadata below frame */}
                  <div className="px-0.5">
                    <p className="text-white/40 text-[10px] leading-relaxed line-clamp-2">{scene.description}</p>
                    <div className="flex gap-1.5 mt-1.5 flex-wrap">
                      <span className="text-[8px] bg-white/[0.04] text-white/25 px-1.5 py-0.5 rounded-full border border-white/[0.04]">{scene.shot_type}</span>
                      <span className="text-[8px] bg-white/[0.04] text-white/25 px-1.5 py-0.5 rounded-full border border-white/[0.04]">{scene.mood}</span>
                      <span className="text-[8px] bg-white/[0.04] text-white/25 px-1.5 py-0.5 rounded-full border border-white/[0.04]">{scene.camera_motion}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom action bar */}
        <div className="flex-shrink-0 border-t border-white/[0.06] px-6 py-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={resetToSetup}
            className="px-4 py-2 bg-white/[0.04] border border-white/[0.06] rounded-lg text-white/50 text-xs font-semibold hover:bg-white/[0.08] hover:text-white/80 transition-all duration-200 active:scale-95"
          >
            New Story
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPhase("plan_review")}
              className="px-4 py-2 bg-white/[0.04] border border-white/[0.06] rounded-lg text-white/50 text-xs font-semibold hover:bg-white/[0.08] hover:text-white/80 transition-all duration-200 active:scale-95"
            >
              Edit Scenes
            </button>
            {onAnimate && doneFrames.length > 0 && (
              <button
                type="button"
                onClick={() => onAnimate(doneFrames[0].url)}
                className="px-4 py-2 bg-[#d9ff00]/10 border border-[#d9ff00]/20 rounded-lg text-primary text-xs font-semibold hover:bg-[#d9ff00]/20 transition-all duration-200 active:scale-95"
              >
                ▶ Animate Scene 1
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
