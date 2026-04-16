'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize } from 'lucide-react';

/**
 * Formats milliseconds into a M:SS string.
 * @param {number} ms
 * @returns {string}
 */
function msToTimecode(ms) {
  if (ms == null || ms < 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const min  = Math.floor(totalSec / 60);
  const sec  = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

/**
 * VideoReviewer — native HTML5 video player with a comment-pin timeline.
 *
 * Props:
 *  signedUrl        {string}    Signed URL for the video source.
 *  comments         {Array}     All comments for this file (top-level + replies).
 *                               Only those with timestamp_ms are shown as pins.
 *  focusedCommentId {string|null}
 *  onTimestampChange(ms: number)  Called on every timeupdate; gives current ms.
 *  onFocusComment(id: string)     Called when user clicks a timeline pin.
 *  onMountSeekFn(fn)              Receives an imperative seekTo(ms) function
 *                                 so parent can control the player.
 *
 * @param {object} props
 */
export default function VideoReviewer({
  signedUrl,
  comments = [],
  focusedCommentId,
  onTimestampChange,
  onFocusComment,
  onMountSeekFn,
}) {
  const videoRef   = useRef(null);
  const [playing,  setPlaying]  = useState(false);
  const [muted,    setMuted]    = useState(false);
  const [duration, setDuration] = useState(0);   // seconds
  const [current,  setCurrent]  = useState(0);   // seconds
  const [progress, setProgress] = useState(0);   // 0–100

  // Expose seekTo so parent (FileDetailClient) can jump to a timestamp
  useEffect(() => {
    if (onMountSeekFn) {
      onMountSeekFn((ms) => {
        if (videoRef.current) {
          videoRef.current.currentTime = ms / 1000;
          videoRef.current.play().catch(() => {});
          setPlaying(true);
        }
      });
    }
    // Cleanup: pass a no-op so stale refs don't fire
    return () => { onMountSeekFn?.(() => {}); };
  }, [onMountSeekFn]);

  const handleLoadedMetadata = useCallback(() => {
    setDuration(videoRef.current?.duration || 0);
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const currentSec = vid.currentTime;
    const dur        = vid.duration || 1;
    setCurrent(currentSec);
    setProgress((currentSec / dur) * 100);
    onTimestampChange?.(Math.floor(currentSec * 1000));
  }, [onTimestampChange]);

  const togglePlay = () => {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) { vid.play(); setPlaying(true); }
    else            { vid.pause(); setPlaying(false); }
  };

  const toggleMute = () => {
    if (videoRef.current) videoRef.current.muted = !muted;
    setMuted((m) => !m);
  };

  const handleProgressClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct  = (e.clientX - rect.left) / rect.width;
    if (videoRef.current) {
      videoRef.current.currentTime = pct * (videoRef.current.duration || 0);
    }
  };

  const handleFullscreen = () => {
    videoRef.current?.requestFullscreen?.();
  };

  // Filter comments that have a timestamp pin
  const pinnedComments = comments.filter(
    (c) => c.timestamp_ms != null && c.parent_id == null, // top-level only
  );

  return (
    <div className="w-full rounded-xl overflow-hidden bg-black border border-zinc-800 flex flex-col">
      {/* Video element */}
      <div
        className="relative cursor-pointer"
        onClick={togglePlay}
      >
        <video
          ref={videoRef}
          src={signedUrl}
          className="w-full max-h-[56vh] object-contain bg-black"
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          playsInline
        />

        {/* Play overlay when paused */}
        {!playing && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-14 h-14 rounded-full bg-black/60 flex items-center justify-center">
              <Play className="w-6 h-6 text-white ml-1" />
            </div>
          </div>
        )}
      </div>

      {/* Controls + timeline */}
      <div className="px-3 py-2 bg-zinc-950 space-y-1.5">
        {/* Pin timeline — shows comment pins as dots above the progress bar */}
        <div
          className="relative h-5 cursor-pointer group"
          onClick={handleProgressClick}
          title="Click para saltar a ese momento"
        >
          {/* Track */}
          <div className="absolute inset-y-[9px] inset-x-0 h-0.5 bg-zinc-800 rounded-full" />
          {/* Played */}
          <div
            className="absolute inset-y-[9px] left-0 h-0.5 bg-[#d9ff00] rounded-full transition-none"
            style={{ width: `${progress}%` }}
          />
          {/* Playhead */}
          <div
            className="absolute top-[5px] w-2.5 h-2.5 rounded-full bg-[#d9ff00] -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: `${progress}%` }}
          />

          {/* Comment pins */}
          {duration > 0 && pinnedComments.map((c) => {
            const pct      = ((c.timestamp_ms / 1000) / duration) * 100;
            const isFocused = c.id === focusedCommentId;
            return (
              <button
                key={c.id}
                title={`${msToTimecode(c.timestamp_ms)} — ${c.body.slice(0, 60)}`}
                onClick={(e) => { e.stopPropagation(); onFocusComment?.(c.id); }}
                className={`
                  absolute top-[3px] w-3.5 h-3.5 rounded-full -translate-x-1/2
                  border-2 transition-transform hover:scale-125
                  ${isFocused
                    ? 'bg-[#d9ff00] border-white scale-125 z-10'
                    : c.resolved_at
                      ? 'bg-zinc-600 border-zinc-500'
                      : 'bg-white border-zinc-400'
                  }
                `}
                style={{ left: `${Math.min(Math.max(pct, 0), 100)}%` }}
              />
            );
          })}
        </div>

        {/* Button row */}
        <div className="flex items-center gap-3">
          <button
            onClick={togglePlay}
            className="text-zinc-400 hover:text-white transition-colors"
            title={playing ? 'Pausar' : 'Reproducir'}
          >
            {playing
              ? <Pause className="w-4 h-4" />
              : <Play  className="w-4 h-4" />
            }
          </button>

          <button
            onClick={toggleMute}
            className="text-zinc-400 hover:text-white transition-colors"
            title={muted ? 'Activar audio' : 'Silenciar'}
          >
            {muted
              ? <VolumeX  className="w-4 h-4" />
              : <Volume2  className="w-4 h-4" />
            }
          </button>

          <span className="text-xs text-zinc-500 tabular-nums flex-1">
            {msToTimecode(current * 1000)}
            {duration > 0 && ` / ${msToTimecode(duration * 1000)}`}
          </span>

          <button
            onClick={handleFullscreen}
            className="text-zinc-400 hover:text-white transition-colors"
            title="Pantalla completa"
          >
            <Maximize className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Converts milliseconds to a human-readable timecode string.
 * Exported so CommentComposer can display the active timestamp.
 *
 * @param {number|null} ms
 * @returns {string}
 */
export { msToTimecode };
