'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Hook that syncs generation history with Supabase `generations` table.
 * Returns { history, addEntry, deleteEntry, loading }.
 *
 * @param {'image'|'video'|'lipsync'|'cinema'|'story'} type
 */
export function useSupabaseHistory(type) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    const supabase = createClient();

    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);

      const { data, error } = await supabase
        .from('generations')
        .select('*')
        .eq('user_id', user.id)
        .eq('type', type)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!error && data) {
        setHistory(data.map(normalizeRow));
      }
      setLoading(false);
    };

    load();
  }, [type]);

  const addEntry = useCallback(async (entry) => {
    if (!userId) return;
    const supabase = createClient();

    const { data, error } = await supabase
      .from('generations')
      .insert({
        user_id: userId,
        type,
        url: entry.url,
        prompt: entry.prompt || '',
        model: entry.model || '',
        metadata: {
          aspect_ratio: entry.aspect_ratio,
          duration: entry.duration,
          ...entry.metadata,
        },
      })
      .select()
      .single();

    if (!error && data) {
      setHistory(prev => [normalizeRow(data), ...prev.slice(0, 49)]);
    }
  }, [userId, type]);

  const deleteEntry = useCallback(async (id) => {
    if (!userId) return;
    const supabase = createClient();
    await supabase.from('generations').delete().eq('id', id).eq('user_id', userId);
    setHistory(prev => prev.filter(item => item.id !== id));
  }, [userId]);

  return { history, addEntry, deleteEntry, loading };
}

function normalizeRow(row) {
  return {
    id: row.id,
    url: row.url,
    prompt: row.prompt,
    model: row.model,
    aspect_ratio: row.metadata?.aspect_ratio,
    duration: row.metadata?.duration,
    timestamp: row.created_at,
    metadata: row.metadata,
  };
}
