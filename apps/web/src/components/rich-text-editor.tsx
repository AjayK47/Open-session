import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import { Bold, Italic, Underline as UnderlineIcon, Link as LinkIcon, List, ListOrdered } from "lucide-react";
import { cn } from "@opensession/ui";
import { useEffect } from "react";

/**
 * Shared rich-text field (welcome messages, descriptions, email bodies) — the
 * toolbar mirrors what's actually used across the product (B/I/U/link/lists/align),
 * matching the Sessionboard screenshots' editor without the alignment/superscript
 * options nobody uses.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder = "Enter text here...",
  className,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none min-h-[120px] px-3 py-2 focus:outline-none dark:prose-invert",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML() && document.activeElement?.closest(".ProseMirror") === null) {
      editor.commands.setContent(value || "", false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  if (!editor) return null;

  const buttons: { icon: typeof Bold; label: string; active: boolean; onClick: () => void }[] = [
    { icon: Bold, label: "Bold", active: editor.isActive("bold"), onClick: () => editor.chain().focus().toggleBold().run() },
    { icon: Italic, label: "Italic", active: editor.isActive("italic"), onClick: () => editor.chain().focus().toggleItalic().run() },
    { icon: UnderlineIcon, label: "Underline", active: editor.isActive("underline"), onClick: () => editor.chain().focus().toggleUnderline().run() },
    {
      icon: LinkIcon,
      label: "Link",
      active: editor.isActive("link"),
      onClick: () => {
        const url = window.prompt("URL");
        if (url) editor.chain().focus().setLink({ href: url }).run();
      },
    },
    { icon: List, label: "Bullet list", active: editor.isActive("bulletList"), onClick: () => editor.chain().focus().toggleBulletList().run() },
    { icon: ListOrdered, label: "Numbered list", active: editor.isActive("orderedList"), onClick: () => editor.chain().focus().toggleOrderedList().run() },
  ];

  return (
    <div className={cn("overflow-hidden rounded-md border border-input", className)}>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/40 px-2 py-1.5">
        {buttons.map(({ icon: Icon, label, active, onClick }) => (
          <button
            key={label}
            type="button"
            title={label}
            onClick={onClick}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-secondary",
              active && "bg-secondary text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
