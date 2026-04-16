'use client';

import { useState, useRef } from 'react';

/**
 * ImageReviewer — displays an image with absolute-positioned comment pins.
 * Clicking anywhere on the image captures the (x_percent, y_percent) coordinate
 * and fires onCoordSelect so the CommentComposer can use it.
 *
 * Props:
 *  signedUrl        {string}     Signed URL for the image.
 *  comments         {Array}      All top-level comments that have x_percent/y_percent.
 *  focusedCommentId {string|null}
 *  onCoordSelect({ x_percent, y_percent })  Called when user clicks the image.
 *  onFocusComment(id)                       Called when user clicks an existing pin.
 *
 * @param {object} props
 */
export default function ImageReviewer({
  signedUrl,
  comments = [],
  focusedCommentId,
  onCoordSelect,
  onFocusComment,
}) {
  const containerRef = useRef(null);
  const [pendingCoord, setPendingCoord] = useState(null); // { x, y } in percent

  // Filter comments that have image coordinates (top-level only)
  const pinnedComments = comments.filter(
    (c) => c.x_percent != null && c.y_percent != null && c.parent_id == null,
  );

  const handleImageClick = (e) => {
    // Ignore clicks on existing pins (they call onFocusComment instead)
    if (e.target.closest('[data-pin]')) return;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x_percent = ((e.clientX - rect.left) / rect.width)  * 100;
    const y_percent = ((e.clientY - rect.top)  / rect.height) * 100;

    // Clamp to 0–100
    const clamped = {
      x_percent: Math.min(Math.max(x_percent, 0), 100),
      y_percent: Math.min(Math.max(y_percent, 0), 100),
    };

    setPendingCoord(clamped);
    onCoordSelect?.(clamped);
  };

  // When a new comment is successfully submitted, clear the pending pin.
  // Parent (FileDetailClient) calls this via onCoordClear if needed.

  return (
    <div
      ref={containerRef}
      className="relative inline-block cursor-crosshair select-none rounded-xl overflow-hidden border border-zinc-800"
      onClick={handleImageClick}
    >
      {/* The image */}
      <img
        src={signedUrl}
        alt=""
        className="max-w-full max-h-[70vh] object-contain bg-zinc-950 block"
        draggable={false}
      />

      {/* Existing comment pins */}
      {pinnedComments.map((c) => {
        const isFocused = c.id === focusedCommentId;
        return (
          <button
            key={c.id}
            data-pin="true"
            onClick={(e) => { e.stopPropagation(); onFocusComment?.(c.id); }}
            title={c.body.slice(0, 80)}
            className={`
              absolute w-6 h-6 rounded-full flex items-center justify-center
              text-[10px] font-bold border-2 -translate-x-1/2 -translate-y-1/2
              transition-transform hover:scale-125 z-10
              ${isFocused
                ? 'bg-[#d9ff00] border-white text-black scale-125'
                : c.resolved_at
                  ? 'bg-zinc-700 border-zinc-500 text-zinc-400'
                  : 'bg-white border-zinc-300 text-black'
              }
            `}
            style={{
              left:  `${c.x_percent}%`,
              top:   `${c.y_percent}%`,
            }}
          >
            {pinnedComments.indexOf(c) + 1}
          </button>
        );
      })}

      {/* Pending (unsubmitted) pin */}
      {pendingCoord && (
        <div
          className="absolute w-5 h-5 rounded-full bg-[#d9ff00] border-2 border-white -translate-x-1/2 -translate-y-1/2 z-20 animate-pulse pointer-events-none"
          style={{
            left: `${pendingCoord.x_percent}%`,
            top:  `${pendingCoord.y_percent}%`,
          }}
        />
      )}

      {/* Hint overlay on first hover */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/70 text-zinc-400 text-xs px-2 py-1 rounded opacity-0 hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
        Haz clic en la imagen para agregar un comentario con coordenada
      </div>
    </div>
  );
}
