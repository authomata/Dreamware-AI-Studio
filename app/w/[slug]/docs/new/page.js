import { redirect } from 'next/navigation';
import { getWorkspaceBySlug } from '@/lib/workspace/getWorkspaceBySlug';
import { createDocument } from '@/app/w/[slug]/docs/actions';

export const dynamic = 'force-dynamic';

/**
 * /w/[slug]/docs/new — server-side redirect page.
 * Creates a blank document and immediately redirects to the editor.
 * Accepts optional ?folder=<folderId> query param.
 */
export default async function NewDocPage({ params, searchParams }) {
  const { slug }     = await params;
  const { folder }   = (await searchParams) || {};

  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) redirect('/');

  // Create the blank document and redirect to the editor
  try {
    const { docId } = await createDocument(workspace.id, folder || null, 'Sin título');
    redirect(`/w/${slug}/docs/${docId}`);
  } catch (err) {
    // If unauthorized or error, go back to docs list
    redirect(`/w/${slug}/docs`);
  }
}
