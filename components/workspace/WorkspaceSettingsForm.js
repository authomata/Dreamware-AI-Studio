'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateWorkspace, archiveWorkspace } from '@/app/w/[slug]/actions';
import { slugify } from '@/lib/workspace/generateUniqueSlug';

const PLAN_OPTIONS = [
  { value: 'collaboration', label: 'Collaboration', description: 'Solo workspace y archivos.' },
  { value: 'generative',    label: 'Generative',    description: 'Workspace + acceso a Studios con su API.' },
];

/**
 * WorkspaceSettingsForm — form for editing workspace metadata.
 * Only accessible to admins/owners.
 */
export default function WorkspaceSettingsForm({ workspace }) {
  const router  = useRouter();
  const [name,   setName]   = useState(workspace.name);
  const [slug,   setSlug]   = useState(workspace.slug);
  const [color,  setColor]  = useState(workspace.brand_color || '');
  const [plan,   setPlan]   = useState(workspace.plan);
  const [loading, setLoading] = useState(false);
  const [error,  setError]  = useState(null);
  const [saved,  setSaved]  = useState(false);

  // Auto-generate slug from name (only if slug hasn't been manually edited)
  const [slugManual, setSlugManual] = useState(false);

  function handleNameChange(val) {
    setName(val);
    if (!slugManual) setSlug(slugify(val));
  }

  async function handleSave(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSaved(false);

    try {
      const result = await updateWorkspace(workspace.id, {
        name,
        slug,
        brand_color: color || null,
        plan,
      });

      setSaved(true);

      // If slug changed, navigate to new URL
      if (result?.slug && result.slug !== workspace.slug) {
        router.push(`/w/${result.slug}/settings`);
      }
    } catch (err) {
      setError(err.message || 'Error al guardar. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  async function handleArchive() {
    if (!confirm(
      `¿Estás seguro de que quieres archivar "${workspace.name}"? `
      + 'El workspace quedará oculto pero los datos se conservan.'
    )) return;

    try {
      await archiveWorkspace(workspace.id);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-8">
      <form onSubmit={handleSave} className="space-y-5">
        {/* Name */}
        <div>
          <label className="block text-sm text-zinc-400 mb-1.5">Nombre</label>
          <input
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            required
            className="w-full px-3 py-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-zinc-500"
          />
        </div>

        {/* Slug */}
        <div>
          <label className="block text-sm text-zinc-400 mb-1.5">
            URL del workspace
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-600 whitespace-nowrap">lab.dreamware.studio/w/</span>
            <input
              type="text"
              value={slug}
              onChange={(e) => { setSlug(e.target.value); setSlugManual(true); }}
              pattern="^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$"
              title="Solo minúsculas, números y guiones. Entre 3 y 50 caracteres."
              required
              className="flex-1 px-3 py-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-zinc-500"
            />
          </div>
          <p className="text-xs text-zinc-600 mt-1">Solo minúsculas, números y guiones. Mínimo 3 caracteres.</p>
        </div>

        {/* Brand color */}
        <div>
          <label className="block text-sm text-zinc-400 mb-1.5">Color de marca</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={color || '#d9ff00'}
              onChange={(e) => setColor(e.target.value)}
              className="w-10 h-10 rounded cursor-pointer border border-zinc-700 bg-zinc-900 p-0.5"
            />
            <input
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="#d9ff00"
              className="w-28 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-zinc-500"
            />
            {color && (
              <button
                type="button"
                onClick={() => setColor('')}
                className="text-xs text-zinc-600 hover:text-zinc-400"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>

        {/* Plan */}
        <div>
          <label className="block text-sm text-zinc-400 mb-2">Plan</label>
          <div className="space-y-2">
            {PLAN_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`
                  flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                  ${plan === opt.value
                    ? 'border-[#d9ff00]/50 bg-[#d9ff00]/5'
                    : 'border-zinc-800 hover:border-zinc-700'}
                `}
              >
                <input
                  type="radio"
                  name="plan"
                  value={opt.value}
                  checked={plan === opt.value}
                  onChange={() => setPlan(opt.value)}
                  className="mt-0.5 accent-[#d9ff00]"
                />
                <div>
                  <p className="text-sm font-medium text-white">{opt.label}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{opt.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-sm text-red-300">
            {error}
          </div>
        )}

        {saved && (
          <div className="p-3 bg-green-900/20 border border-green-700 rounded-lg text-sm text-green-400">
            ¡Cambios guardados!
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2.5 bg-[#d9ff00] text-black font-semibold text-sm rounded-lg hover:bg-yellow-300 transition-colors disabled:opacity-50"
        >
          {loading ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </form>

      {/* Danger zone — owner only */}
      {workspace.member_role === 'owner' && (
        <div className="border border-red-900/50 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-red-400 mb-1">Zona de peligro</h3>
          <p className="text-xs text-zinc-500 mb-4">
            Archivar el workspace lo oculta sin borrar los datos.
            Puedes restaurarlo desde el panel de administración.
          </p>
          <button
            onClick={handleArchive}
            className="px-4 py-2 text-sm text-red-400 border border-red-800 rounded-lg hover:bg-red-900/20 transition-colors"
          >
            Archivar workspace
          </button>
        </div>
      )}
    </div>
  );
}
