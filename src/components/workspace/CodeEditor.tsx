"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { Extension } from "@codemirror/state";
import { Spinner } from "@/components/ui/Spinner";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-[12.5px] text-muted">
      <Spinner /> Memuat editor...
    </div>
  ),
});

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
  const extensions = useMemo<Extension[]>(() => [], []);

  return (
    <CodeMirror
      value={value}
      height="100%"
      theme="dark"
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
      className="h-full text-[12.5px] [&_.cm-editor]:h-full [&_.cm-scroller]:font-mono [&_.cm-gutters]:border-r [&_.cm-gutters]:border-line [&_.cm-gutters]:bg-panel"
    />
  );
}
