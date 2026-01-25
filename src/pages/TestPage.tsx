import { useState } from "react";
import { CaretDown, CaretRight } from "@phosphor-icons/react";
import { TranscriptionTest } from "../components/test/TranscriptionTest";
import { ClaudeTest } from "../components/test/ClaudeTest";
import { GeminiTest } from "../components/test/GeminiTest";
import { DebugEditPanel } from "../components/edit/DebugEditPanel";

interface SectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function Section({ title, children, defaultOpen = false }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg border border-neutral-800 bg-[#111]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-white hover:bg-neutral-800/50"
      >
        {open ? <CaretDown size={14} /> : <CaretRight size={14} />}
        {title}
      </button>
      {open && <div className="border-t border-neutral-800 px-4 py-4">{children}</div>}
    </div>
  );
}

export function TestPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-3 p-4">
      <h1 className="mb-4 text-lg font-medium text-white">API Test Harness</h1>

      <Section title="Transcription (ElevenLabs Scribe v2)" defaultOpen>
        <TranscriptionTest />
      </Section>

      <Section title="Claude (Anthropic Messages API)">
        <ClaudeTest />
      </Section>

      <Section title="Gemini (Video Understanding)">
        <GeminiTest />
      </Section>

      <Section title="Agent Edit Functions (Word/Sentence Operations)" defaultOpen>
        <DebugEditPanel />
      </Section>
    </div>
  );
}
