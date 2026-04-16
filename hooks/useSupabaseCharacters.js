'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Hook that syncs the character library with Supabase `characters` table.
 * Returns { characters, saveCharacter, deleteCharacter, loading }.
 */
export function useSupabaseCharacters() {
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    const supabase = createClient();

    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);

      const { data, error } = await supabase
        .from('characters')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setCharacters(data.map(normalizeRow));
      }
      setLoading(false);
    };

    load();
  }, []);

  const saveCharacter = useCallback(async (character) => {
    if (!userId) return;
    const supabase = createClient();

    const row = {
      id: character.id,
      user_id: userId,
      name: character.name,
      description: character.description || '',
      trigger_prompt: character.triggerPrompt || '',
      reference_images: character.referenceImages || [],
      thumbnail: character.thumbnail || null,
    };

    const { data, error } = await supabase
      .from('characters')
      .upsert(row, { onConflict: 'id' })
      .select()
      .single();

    if (!error && data) {
      const normalized = normalizeRow(data);
      setCharacters(prev => {
        const exists = prev.find(c => c.id === normalized.id);
        if (exists) return prev.map(c => c.id === normalized.id ? normalized : c);
        return [normalized, ...prev];
      });
    }
  }, [userId]);

  const deleteCharacter = useCallback(async (id) => {
    if (!userId) return;
    const supabase = createClient();
    await supabase.from('characters').delete().eq('id', id).eq('user_id', userId);
    setCharacters(prev => prev.filter(c => c.id !== id));
  }, [userId]);

  return { characters, saveCharacter, deleteCharacter, loading };
}

function normalizeRow(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    triggerPrompt: row.trigger_prompt,
    referenceImages: row.reference_images || [],
    thumbnail: row.thumbnail,
  };
}
