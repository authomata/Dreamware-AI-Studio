'use client';

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';

/**
 * MentionList — autocomplete popup for @ mentions in DocumentEditor.
 *
 * Used by @tiptap/extension-mention's suggestion.render().
 * Receives items (workspace members) and a command() to insert the mention.
 * Supports keyboard navigation (ArrowUp / ArrowDown / Enter).
 *
 * Each item shape: { id: string, label: string }
 * where label = full_name || email || 'Usuario'.
 */
const MentionList = forwardRef(function MentionList({ items, command }, ref) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Reset selection when the list changes (e.g. filtered results)
  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  const selectItem = (index) => {
    const item = items[index];
    if (item) command({ id: item.id, label: item.label });
  };

  useImperativeHandle(ref, () => ({
    onKeyDown({ event }) {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((s) => (s + items.length - 1) % items.length);
        return true;
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex((s) => (s + 1) % items.length);
        return true;
      }
      if (event.key === 'Enter') {
        selectItem(selectedIndex);
        return true;
      }
      return false;
    },
  }));

  if (!items.length) {
    return (
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl p-3 text-xs text-zinc-500">
        Sin resultados
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl overflow-hidden p-1 min-w-[200px] max-w-[280px]">
      {items.map((item, index) => (
        <button
          key={item.id}
          onClick={() => selectItem(index)}
          className={`
            w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors
            ${index === selectedIndex
              ? 'bg-zinc-800 text-white'
              : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
            }
          `}
        >
          <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-semibold text-zinc-100 flex-shrink-0">
            {item.label.charAt(0).toUpperCase()}
          </div>
          <span className="truncate">{item.label}</span>
        </button>
      ))}
    </div>
  );
});

export default MentionList;
