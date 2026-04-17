'use client';

import { useState } from 'react';
import { createClientAndOwner } from '../actions';
import { slugify } from '@/lib/workspace/generateUniqueSlug';

/**
 * NewClientForm — form for creating a new client workspace.
 * Accessible only from /admin/clients/new (admin only route).
 */
export default function NewClientForm() {
  const [form, setForm] = useState({
    name:        '',
    slug:        '',
    plan:        'collaboration',
    brand_color: '',
    ownerEmail:  '',
    ownerName:   '',
  });
  const [slugManual, setSlugManual] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  function set(key, value) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function handleNameChange(val) {
    set('name', val);
    if (!slugManual) set('slug', slugify(val));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await createClientAndOwner(
        {
          name:        form.name,
          slug:        form.slug,
          type:        'client',
          plan:        form.plan,
          brand_color: form.brand_color || null,
        },
        form.ownerEmail,
        form.ownerName,
      );
      // createClientAndOwner redirects on success
    } catch (err) {
      setError(err.message || 'Error al crear el cliente. Inténtalo de nuevo.');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Workspace info */}
      <div className="border border-zinc-800 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
          Datos del workspace
        </h2>

        <div>
          <label className="block text-sm text-zinc-400 mb-1.5">Nombre de la empresa</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Ej: Verant Agency"
            required
            className="w-full px-3 py-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-zinc-500"
          />
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-1.5">URL del workspace</label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-600 whitespace-nowrap">/w/</span>
            <input
              type="text"
              value={form.slug}
              onChange={(e) => { set('slug', e.target.value); setSlugManual(true); }}
              pattern="^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$"
              title="Solo minúsculas, números y guiones. Mínimo 3 caracteres."
              required
              className="flex-1 px-3 py-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-zinc-500"
            />
          </div>
          <p className="text-xs text-zinc-600 mt-1">Se genera automáticamente desde el nombre.</p>
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-1.5">Color de marca</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={form.brand_color || '#d9ff00'}
              onChange={(e) => set('brand_color', e.target.value)}
              className="w-10 h-10 rounded cursor-pointer border border-zinc-700 bg-zinc-900 p-0.5"
            />
            <input
              type="text"
              value={form.brand_color}
              onChange={(e) => set('brand_color', e.target.value)}
              placeholder="#000000 (opcional)"
              className="w-36 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-zinc-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-1.5">Plan</label>
          <select
            value={form.plan}
            onChange={(e) => set('plan', e.target.value)}
            className="w-full px-3 py-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-zinc-500"
          >
            <option value="collaboration">Collaboration — solo workspace y archivos</option>
            <option value="generative">Generative — workspace + Studios con su API</option>
          </select>
        </div>
      </div>

      {/* Owner info */}
      <div className="border border-zinc-800 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
          Contacto principal (owner)
        </h2>
        <p className="text-xs text-zinc-600">
          Si el email ya tiene cuenta en DreamWare, se le agrega directamente y recibe
          un email de bienvenida. Si no, se crea una invitación y se envía por email
          automáticamente.
        </p>

        <div>
          <label className="block text-sm text-zinc-400 mb-1.5">Email</label>
          <input
            type="email"
            value={form.ownerEmail}
            onChange={(e) => set('ownerEmail', e.target.value)}
            placeholder="contacto@empresa.com"
            required
            className="w-full px-3 py-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-zinc-500"
          />
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-1.5">Nombre completo</label>
          <input
            type="text"
            value={form.ownerName}
            onChange={(e) => set('ownerName', e.target.value)}
            placeholder="Nombre Apellido"
            required
            className="w-full px-3 py-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-zinc-500"
          />
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <a
          href="/admin/clients"
          className="flex-1 text-center py-3 bg-zinc-900 hover:bg-zinc-800 rounded-lg text-sm text-zinc-300 transition-colors"
        >
          Cancelar
        </a>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 py-3 bg-[#d9ff00] text-black font-semibold text-sm rounded-lg hover:bg-yellow-300 transition-colors disabled:opacity-50"
        >
          {loading ? 'Creando...' : 'Crear cliente'}
        </button>
      </div>
    </form>
  );
}
