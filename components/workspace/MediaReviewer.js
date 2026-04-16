'use client';

import dynamic from 'next/dynamic';
import FilePreview from '@/components/workspace/FilePreview';

// Dynamically import heavy player components to avoid SSR issues
const VideoReviewer = dynamic(() => import('@/components/workspace/VideoReviewer'), { ssr: false });
const ImageReviewer = dynamic(() => import('@/components/workspace/ImageReviewer'), { ssr: false });

/**
 * MediaReviewer — decides which interactive reviewer to render based on MIME type.
 *
 * For files marked as review assets:
 *   - video/* → VideoReviewer with comment pin timeline
 *   - image/* → ImageReviewer with coordinate pins
 *   - other   → FilePreview (no interactive mode)
 *
 * For non-review-asset files, always renders FilePreview.
 *
 * Props: all of VideoReviewer + ImageReviewer props forwarded appropriately.
 *
 * @param {{
 *   file: object,
 *   signedUrl: string,
 *   comments: Array,
 *   focusedCommentId: string|null,
 *   onTimestampChange: (ms: number) => void,
 *   onCoordSelect: (coord: {x_percent: number, y_percent: number}) => void,
 *   onCoordClear: () => void,
 *   onFocusComment: (id: string) => void,
 *   onMountSeekFn: (fn: (ms: number) => void) => void,
 * }} props
 */
export default function MediaReviewer({
  file,
  signedUrl,
  comments = [],
  focusedCommentId,
  onTimestampChange,
  onCoordSelect,
  onFocusComment,
  onMountSeekFn,
}) {
  const { mime_type, is_review_asset } = file;
  const isVideo = mime_type?.startsWith('video/');
  const isImage = mime_type?.startsWith('image/');

  if (is_review_asset && isVideo) {
    return (
      <VideoReviewer
        signedUrl={signedUrl}
        comments={comments}
        focusedCommentId={focusedCommentId}
        onTimestampChange={onTimestampChange}
        onFocusComment={onFocusComment}
        onMountSeekFn={onMountSeekFn}
      />
    );
  }

  if (is_review_asset && isImage) {
    return (
      <div className="flex justify-center">
        <ImageReviewer
          signedUrl={signedUrl}
          comments={comments}
          focusedCommentId={focusedCommentId}
          onCoordSelect={onCoordSelect}
          onFocusComment={onFocusComment}
        />
      </div>
    );
  }

  // Fallback: standard preview (audio, PDF, etc.)
  return <FilePreview file={file} signedUrl={signedUrl} />;
}
