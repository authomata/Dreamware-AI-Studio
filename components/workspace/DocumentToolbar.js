'use client';

import {
  Bold, Italic, Strikethrough,
  Heading1, Heading2, Heading3,
  List, ListOrdered, CheckSquare,
  Link2, Code, FileCode, Quote,
  Minus, MessageSquarePlus,
} from 'lucide-react';

/**
 * DocumentToolbar — formatting controls for the Tiptap editor.
 *
 * Props:
 *  editor              {object}       Tiptap editor instance
 *  hasSelection        {boolean}      true when editor has non-empty selection
 *  onCommentRequest    {() => void}   called when user wants to comment selection
 *  canComment          {boolean}      false for viewers (hide comment button)
 */
export default function DocumentToolbar({
  editor,
  hasSelection = false,
  onCommentRequest,
  canComment = true,
}) {
  if (!editor) return null;

  const setLink = () => {
    const previous = editor.getAttributes('link').href;
    const url      = window.prompt('URL del enlace:', previous || 'https://');
    if (url === null) return; // cancelled
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
  };

  const tools = [
    {
      icon: <Bold className="w-4 h-4" />,
      title: 'Negrita (⌘B)',
      active: () => editor.isActive('bold'),
      action: () => editor.chain().focus().toggleBold().run(),
    },
    {
      icon: <Italic className="w-4 h-4" />,
      title: 'Itálica (⌘I)',
      active: () => editor.isActive('italic'),
      action: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      icon: <Strikethrough className="w-4 h-4" />,
      title: 'Tachado',
      active: () => editor.isActive('strike'),
      action: () => editor.chain().focus().toggleStrike().run(),
    },
    { type: 'separator' },
    {
      icon: <Heading1 className="w-4 h-4" />,
      title: 'Encabezado 1',
      active: () => editor.isActive('heading', { level: 1 }),
      action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      icon: <Heading2 className="w-4 h-4" />,
      title: 'Encabezado 2',
      active: () => editor.isActive('heading', { level: 2 }),
      action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      icon: <Heading3 className="w-4 h-4" />,
      title: 'Encabezado 3',
      active: () => editor.isActive('heading', { level: 3 }),
      action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    { type: 'separator' },
    {
      icon: <List className="w-4 h-4" />,
      title: 'Lista con viñetas',
      active: () => editor.isActive('bulletList'),
      action: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      icon: <ListOrdered className="w-4 h-4" />,
      title: 'Lista numerada',
      active: () => editor.isActive('orderedList'),
      action: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      icon: <CheckSquare className="w-4 h-4" />,
      title: 'Lista de tareas',
      active: () => editor.isActive('taskList'),
      action: () => editor.chain().focus().toggleTaskList().run(),
    },
    { type: 'separator' },
    {
      icon: <Link2 className="w-4 h-4" />,
      title: 'Enlace (⌘K)',
      active: () => editor.isActive('link'),
      action: setLink,
    },
    {
      icon: <Code className="w-4 h-4" />,
      title: 'Código inline',
      active: () => editor.isActive('code'),
      action: () => editor.chain().focus().toggleCode().run(),
    },
    {
      icon: <FileCode className="w-4 h-4" />,
      title: 'Bloque de código',
      active: () => editor.isActive('codeBlock'),
      action: () => editor.chain().focus().toggleCodeBlock().run(),
    },
    {
      icon: <Quote className="w-4 h-4" />,
      title: 'Cita',
      active: () => editor.isActive('blockquote'),
      action: () => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      icon: <Minus className="w-4 h-4" />,
      title: 'Separador horizontal',
      active: () => false,
      action: () => editor.chain().focus().setHorizontalRule().run(),
    },
  ];

  return (
    <div className="flex items-center gap-0.5 px-3 py-2 border-b border-zinc-800 flex-wrap">
      {tools.map((tool, i) => {
        if (tool.type === 'separator') {
          return <div key={`sep-${i}`} className="w-px h-5 bg-zinc-700 mx-1 shrink-0" />;
        }
        const isActive = tool.active();
        return (
          <button
            key={i}
            onClick={tool.action}
            title={tool.title}
            className={`
              p-1.5 rounded-lg transition-colors shrink-0
              ${isActive
                ? 'bg-[#d9ff00]/10 text-[#d9ff00]'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }
            `}
          >
            {tool.icon}
          </button>
        );
      })}

      {/* Comment button — only visible when text is selected */}
      {canComment && (
        <>
          <div className="w-px h-5 bg-zinc-700 mx-1 shrink-0" />
          <button
            onClick={onCommentRequest}
            disabled={!hasSelection}
            title={hasSelection ? 'Comentar selección' : 'Selecciona texto para comentar'}
            className={`
              flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium
              transition-all shrink-0
              ${hasSelection
                ? 'bg-[#d9ff00]/10 text-[#d9ff00] hover:bg-[#d9ff00]/20 cursor-pointer'
                : 'text-zinc-700 cursor-not-allowed opacity-40'
              }
            `}
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            Comentar
          </button>
        </>
      )}
    </div>
  );
}
