"use client";
import { useState } from "react";
import Link from "next/link";
import type { AuthorMemoryView, ImageVersionView } from "@/lib/memory/types";
import { OutsideFrameReveal } from "./outside-frame-reveal";
import { PhotoMemoryWorkspace } from "./photo-memory-workspace";
import "./outside-frame.css";
export function PhotoFrameWorkspace({
  memory,
  source,
  initialVersionId,
  onGenerated,
  onShare,
}: {
  memory: AuthorMemoryView;
  source: ImageVersionView;
  initialVersionId?: string;
  onGenerated: (v: ImageVersionView) => void;
  onShare: (v: ImageVersionView) => void;
}) {
  const [details, setDetails] = useState(false);
  return (
    <main className="frame-page">
      <Link href="/library" className="frame-back">
        ← Your saved pictures
      </Link>
      <header className="frame-intro">
        <span className="eyebrow">A photograph is only the beginning</span>
        <h1>
          See outside the <em>frame.</em>
        </h1>
        <p>The camera caught a moment. You remember the rest.</p>
      </header>
      <OutsideFrameReveal
        memoryId={memory.id}
        source={source}
        versions={memory.versions}
        initialVersionId={initialVersionId}
        onGenerated={onGenerated}
        onShareWider={onShare}
      />
      <section className="frame-extras" aria-label="Optional photo stories">
        <div>
          <h2>More stories in this photograph?</h2>
          <p>You can also add personal notes to the little details.</p>
        </div>
        {!details && (
          <button className="button subtle" onClick={() => setDetails(true)}>
            Add stories to details
          </button>
        )}
        {details && (
          <PhotoMemoryWorkspace
            embedded
            memory={memory}
            version={source}
            onShare={() => onShare(source)}
          />
        )}
      </section>
    </main>
  );
}
