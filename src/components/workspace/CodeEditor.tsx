"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { Spinner } from "@/components/ui/Spinner";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-[12.5px] text-muted">
      <Spinner /> Memuat editor...
    </div>
  ),
});

// Colours come from CSS variables, so the editor flips with the theme instead of
// shipping a dark palette that becomes unreadable on the light canvas.
const aomiTheme = EditorView.theme(
  {
    "&": { backgroundColor: "var(--bg)", color: "var(--ink)", height: "100%" },
    ".cm-content": { caretColor: "var(--accent)", fontFamily: "var(--font-mono)" },
    ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.6" },
    "&.cm-focused": { outline: "none" },
    ".cm-gutters": { backgroundColor: "var(--panel)", color: "var(--faint)", border: "none", borderRight: "1px solid var(--line)" },
    ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--ink) 4%, transparent)" },
    ".cm-activeLineGutter": { backgroundColor: "color-mix(in srgb, var(--ink) 6%, transparent)", color: "var(--ink-dim)" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, & ::selection": {
      backgroundColor: "color-mix(in srgb, var(--accent) 22%, transparent)",
    },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)" },
    ".cm-foldPlaceholder": { backgroundColor: "var(--surface)", border: "1px solid var(--line)", color: "var(--muted)" },
  },
  { dark: false },
);

const aomiHighlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.modifier, tags.operatorKeyword, tags.tagName, tags.angleBracket], color: "var(--syntax-keyword)" },
  { tag: [tags.string, tags.special(tags.string), tags.attributeValue], color: "var(--syntax-string)" },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: "var(--syntax-comment)", fontStyle: "italic" },
  { tag: [tags.number, tags.bool, tags.null], color: "var(--syntax-number)" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.definition(tags.variableName)], color: "var(--syntax-title)" },
  { tag: [tags.attributeName, tags.typeName, tags.className, tags.propertyName], color: "var(--syntax-title)" },
  { tag: [tags.variableName, tags.punctuation, tags.bracket], color: "var(--syntax-var)" },
]);

export function CodeEditor({
  value,
  language,
  onChange,
  readOnly,
}: {
  value: string;
  language: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
}) {
  const extensions = useMemo<Extension[]>(() => [aomiTheme, syntaxHighlighting(aomiHighlight)], []);

  return (
    <CodeMirror
      value={value}
      height="100%"
      extensions={extensions}
      editable={!readOnly}
      onChange={onChange}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: true,
        autocompletion: false,
        bracketMatching: true,
      }}
      className="h-full text-[12.5px]"
    />
  );
}
