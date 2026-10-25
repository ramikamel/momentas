"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronLeft,
  Copy,
  Feather,
  Heart,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import type {
  AuthorMemoryView,
  DraftInput,
  ImageVersionView,
  MemoryMessage,
  PublishedMemoryView,
  ScenePlan,
  SourcedDetail,
} from "@/lib/memory/types";
import { VoiceRecorder } from "./voice-recorder";
import {
  ReferencePhotos,
  uploadPendingReferences,
  type PendingReference,
} from "./reference-photos";
import { MemoryVoicePlayer } from "./memory-voice-player";
import { DetailPinEditor, MemoryDetailPins } from "./memory-detail-pins";
import { PerspectiveControls } from "./perspective-controls";
import type { PublicPin } from "@/lib/memory/connections";
const empty: DraftInput = {
  title: "",
  authorName: "",
  recipientName: "",
  story: "",
  scenePlan: null,
};
async function api<T>(
  path: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const r = await fetch(path, {
    method: body === undefined ? "GET" : method,
    cache: "no-store",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok)
    throw Object.assign(
      new Error(data.error || "Something went wrong. Please try again."),
      { status: r.status, code: data.code },
    );
  return data;
}
function Brand() {
  return (
    <Link className="brand" href="/">
      <span className="brand-mark">
        <BookOpen size={22} />
      </span>{" "}
      momentas<span className="brand-period">.</span>
    </Link>
  );
}
export function Header() {
  return (
    <header className="header">
      <Brand />
      <span className="header-note">
        A little closer to the way you remember.
      </span>
      <Link className="quiet-link saved-link" href="/library">
        Saved pictures
      </Link>
      <Link className="quiet-link create-link" href="/#begin">
        Create a memory <ArrowUpRight size={15} />
      </Link>
    </header>
  );
}
function Busy({ label }: { label: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="busy" role="status">
      <LoaderCircle className="spin" size={17} />
      {label}
      <span>{seconds}s elapsed</span>
    </div>
  );
}
function ErrorNotice({ error }: { error: string }) {
  return error ? (
    <div className="error" role="alert">
      {error}
    </div>
  ) : null;
}
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function StoryFields({
  draft,
  setDraft,
}: {
  draft: DraftInput;
  setDraft: (d: DraftInput) => void;
}) {
  return (
    <>
      <Field label="Give this memory a title">
        <input
          maxLength={120}
          placeholder="The day you let go"
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
      </Field>
      <div className="field-grid">
        <Field label="Your name">
          <input
            maxLength={80}
            placeholder="Alex"
            value={draft.authorName}
            onChange={(e) => setDraft({ ...draft, authorName: e.target.value })}
          />
        </Field>
        <Field label="Who is it for?">
          <input
            maxLength={80}
            placeholder="Dad"
            value={draft.recipientName}
            onChange={(e) =>
              setDraft({ ...draft, recipientName: e.target.value })
            }
          />
        </Field>
      </div>
      <Field
        label="Tell it as you remember it"
        hint="Where were you? What stayed with you? Include only the feelings and details you want to share."
      >
        <textarea
          required
          maxLength={6000}
          rows={7}
          placeholder="I remember the parking lot feeling impossibly big…"
          value={draft.story}
          onChange={(e) =>
            setDraft({ ...draft, story: e.target.value, scenePlan: null })
          }
        />
      </Field>
    </>
  );
}
function SampleArt() {
  return (
    <div className="sample-art sample-art-output">
      <img
        src="/sample-memory.webp"
        alt="Fictional AI memory reconstruction: a red bicycle in the foreground and a father cheering across an enormous parking lot, seen from the rider’s viewpoint."
      />
      <span className="sample-label">Fictional sample · Muse Image</span>
    </div>
  );
}
export function Landing() {
  const router = useRouter();
  const [draft, setDraft] = useState<DraftInput>(empty),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [createdId, setCreatedId] = useState(""),
    [busyMessage, setBusyMessage] = useState(""),
    [references, setReferences] = useState<PendingReference[]>([]);
  const generationAttempt = useRef<{ signature: string; id: string } | null>(
      null,
    ),
    draftRef = useRef(draft),
    idRef = useRef("");
  draftRef.current = draft;
  function sample() {
    setDraft({
      title: "The day you let go",
      authorName: "Alex",
      recipientName: "Dad",
      story:
        "This is a fictional sample memory. I was seven, learning to ride my red bicycle in an empty parking lot on a warm afternoon. Dad held the back of the seat. The parking lot felt enormous to me. When I looked back, he was standing far behind me, smiling with his hands in the air. I felt scared for a moment, then proud when I realized I was riding by myself.",
      scenePlan: null,
    });
    document.getElementById("begin")?.scrollIntoView({ behavior: "smooth" });
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    await createMode("generate");
  }
  async function createMode(mode: "generate" | "details") {
    setBusy(true);
    setError("");
    setBusyMessage("Saving your memory");
    try {
      let id = idRef.current || createdId;
      if (!id) {
        const r = await api<{ id: string }>("/api/memories", draft);
        id = r.id;
        idRef.current = id;
        setCreatedId(id);
      } else if (generationAttempt.current?.signature !== JSON.stringify(draft))
        await api(`/api/memories/${id}`, draft, "PATCH");
      const savedReferences = await uploadPendingReferences(id, references);
      setReferences(savedReferences);
      if (mode === "details") {
        setBusyMessage("Finding the details in your memory");
        await api(`/api/memories/${id}/scene`, { story: draft.story });
      } else {
        setBusyMessage(
          "Reconstructing your memory — this can take a few minutes",
        );
        const signature = JSON.stringify(draft);
        if (generationAttempt.current?.signature !== signature)
          generationAttempt.current = { signature, id: crypto.randomUUID() };
        await api(`/api/memories/${id}/generate`, {
          requestId: generationAttempt.current.id,
        });
      }
      router.push(`/memory/${id}`);
    } catch (e) {
      if ((e as { code?: string }).code === "GENERATION_FAILED")
        generationAttempt.current = null;
      setError((e as Error).message);
      setBusy(false);
    }
  }
  async function ensureMemory() {
    if (idRef.current) return idRef.current;
    const r = await api<{ id: string }>("/api/memories", {
      ...draftRef.current,
      scenePlan: null,
    });
    idRef.current = r.id;
    setCreatedId(r.id);
    return r.id;
  }
  return (
    <>
      <Header />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span /> FOR THE MOMENTS THAT STAY
            </div>
            <h1>
              Some memories
              <br />
              deserve to be <em>seen.</em>
            </h1>
            <p>
              You remember more than what happened.
              <br className="desktop-break" /> You remember how it felt. Turn
              your memory into a lifelike scene, then share it with someone who
              matters.
            </p>
            <Link className="button primary" href="#begin">
              Start a memory <ArrowRight size={18} />
            </Link>
            <button className="sample-button" onClick={sample}>
              Try a sample memory <ArrowUpRight size={15} />
            </button>
            <div className="hero-footnote">
              <Heart size={14} /> Your perspective. Your words. A new
              conversation.
            </div>
          </div>
          <div className="hero-art">
            <SampleArt />
            <div className="art-caption">
              <span>
                “I didn’t know you’d let go.
                <br />I only knew I was flying.”
              </span>
              <span>01 / A MEMORY OF LEARNING</span>
            </div>
          </div>
        </section>
        <section className="how">
          <div>
            <span className="section-number">01</span>
            <h3>Remember it.</h3>
            <p>Write it down, or tell it in your own voice.</p>
          </div>
          <div>
            <span className="section-number">02</span>
            <h3>Make it yours.</h3>
            <p>Recreate the moment. Leave details someone can discover.</p>
          </div>
          <div>
            <span className="section-number">03</span>
            <h3>Let them in.</h3>
            <p>
              Invite their side of the story. Find what you remember together.
            </p>
          </div>
        </section>
        <section className="begin-section" id="begin">
          <div className="begin-intro">
            <div className="eyebrow">A PLACE TO BEGIN</div>
            <h2>
              What takes you
              <br /> <em>back?</em>
            </h2>
            <p>
              It doesn’t have to be a big moment.
              <br />
              Sometimes the small ones hold everything.
            </p>
            <span className="hand-note">
              Let me show you
              <br />
              how I remember it.
            </span>
          </div>
          <form className="paper form-card" onSubmit={create}>
            <VoiceRecorder
              memoryId={createdId}
              ensureMemory={ensureMemory}
              onUse={(value) =>
                setDraft({
                  ...draftRef.current,
                  story: value.story,
                  narrationId: value.narrationId,
                  scenePlan: null,
                })
              }
            />
            <StoryFields draft={draft} setDraft={setDraft} />
            <ReferencePhotos
              memoryId={createdId || null}
              references={references}
              onChange={setReferences}
              disabled={busy}
            />
            <ErrorNotice error={error} />
            <button
              disabled={busy}
              className="button primary wide"
              type="submit"
            >
              {busy ? "Working on your memory…" : "Submit & generate image"}
              <ArrowRight size={18} />
            </button>
            <button
              type="button"
              className="button subtle wide"
              disabled={busy}
              onClick={(e) => {
                if (e.currentTarget.form?.reportValidity())
                  void createMode("details");
              }}
            >
              Add details
            </button>
            {busy && <Busy label={busyMessage || "Saving your memory"} />}
            {createdId && !busy && (
              <Link className="quiet-link" href={`/memory/${createdId}`}>
                Open saved draft →
              </Link>
            )}
            <p className="form-note">
              Your draft stays private. You decide when to share.
              <br />
              Editing is available in this browser.
            </p>
          </form>
        </section>
      </main>
      <footer>
        <Brand />
        <span>Made for the things we carry with us.</span>
      </footer>
    </>
  );
}
function SceneEditor({
  plan,
  onChange,
}: {
  plan: ScenePlan;
  onChange: (p: ScenePlan) => void;
}) {
  const groups: {
    key: "setting" | "people" | "details" | "perspective" | "feelings";
    label: string;
    single: boolean;
  }[] = [
    { key: "setting", label: "The setting", single: true },
    { key: "people", label: "The people", single: false },
    { key: "details", label: "The details that matter", single: false },
    { key: "perspective", label: "Your perspective", single: true },
    { key: "feelings", label: "How you felt", single: false },
  ];
  return (
    <div className="scene-fields">
      {groups.map((g) => {
        const value = plan[g.key];
        const items = (
          g.single ? (value ? [value] : []) : value
        ) as SourcedDetail[];
        return (
          <div className="scene-group" key={g.key}>
            <h4>{g.label}</h4>
            {items.length === 0 && (
              <p className="muted small">
                Not specified in your memory. Add new details below if you wish.
              </p>
            )}
            {items.map((d, i) => (
              <div className="sourced-detail" key={i}>
                <textarea
                  aria-label={`${g.label} ${i + 1}`}
                  rows={2}
                  value={d.text}
                  onChange={(e) => {
                    const n = { ...d, text: e.target.value };
                    onChange({
                      ...plan,
                      [g.key]: g.single
                        ? n
                        : items.map((v, j) => (j === i ? n : v)),
                    });
                  }}
                />
                <blockquote>From your words: “{d.sourceQuote}”</blockquote>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
function MessageList({
  messages,
  versions,
  currentVersionId,
  reply,
  onReply,
}: {
  messages: MemoryMessage[];
  versions?: ImageVersionView[];
  currentVersionId?: string;
  reply?: Record<string, string>;
  onReply?: (id: string, text?: string) => void;
}) {
  return (
    <div className="message-list">
      {messages
        .filter((m) => !m.parentId)
        .map((m) => (
          <article className="message" key={m.id}>
            <div className="message-meta">
              <span className="avatar">{m.displayName.slice(0, 1)}</span>
              <strong>{m.displayName}</strong>
              <span>
                {m.role === "storyteller" ? "Storyteller" : "Recipient"}
                {versions
                  ? ` · image ${versions.findIndex((v) => v.id === m.versionId) + 1}`
                  : currentVersionId && m.versionId !== currentVersionId
                    ? " · Earlier image"
                    : ""}
              </span>
            </div>
            {m.pinContext && (
              <blockquote className="conn-evidence">
                About {m.pinContext.label}: “{m.pinContext.sourceQuote}”
              </blockquote>
            )}
            <p>{m.text}</p>
            {messages
              .filter((r) => r.parentId === m.id)
              .map((r) => (
                <div className="reply" key={r.id}>
                  <strong>
                    {r.displayName} <span>· Storyteller</span>
                  </strong>
                  <p>{r.text}</p>
                </div>
              ))}
            {onReply && m.role === "recipient" && (
              <div className="reply-form">
                <textarea
                  rows={2}
                  aria-label={`Reply to ${m.displayName}`}
                  placeholder="Write a personal reply…"
                  value={reply?.[m.id] || ""}
                  onChange={(e) => onReply(m.id, e.target.value)}
                />
                <button
                  className="button subtle"
                  disabled={!reply?.[m.id]?.trim()}
                  onClick={() => onReply(m.id)}
                >
                  Send reply <ArrowUpRight size={15} />
                </button>
              </div>
            )}
          </article>
        ))}
    </div>
  );
}
export function Workspace({
  id,
  initialVersionId,
}: {
  id: string;
  initialVersionId?: string;
}) {
  const [memory, setMemory] = useState<AuthorMemoryView | null>(null),
    [draft, setDraft] = useState<DraftInput>(empty),
    [stage, setStage] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [approved, setApproved] = useState(false),
    [additions, setAdditions] = useState(""),
    [selected, setSelected] = useState(""),
    [instruction, setInstruction] = useState(""),
    [caption, setCaption] = useState(""),
    [includeNarration, setIncludeNarration] = useState(false),
    [shareUrl, setShareUrl] = useState(""),
    [copied, setCopied] = useState(false),
    [reply, setReply] = useState<Record<string, string>>({}),
    [references, setReferences] = useState<PendingReference[]>([]);
  const generationAttempt = useRef<{ signature: string; id: string } | null>(
    null,
  );
  const base = `/api/memories/${id}`;
  const load = useCallback(
    async (initial = false) => {
      try {
        const m = await api<AuthorMemoryView>(base);
        setMemory(m);
        if (initial) {
          setDraft({
            title: m.title,
            authorName: m.authorName,
            recipientName: m.recipientName,
            story: m.story,
            narrationId: m.narrationId ?? null,
            scenePlan: m.scenePlan,
          });
          const chosen =
            m.versions.find((v) => v.id === initialVersionId) ||
            m.versions.at(-1);
          setSelected(chosen?.id || "");
          setApproved(
            !!m.scenePlan &&
              JSON.stringify(m.scenePlan) ===
                JSON.stringify(chosen?.scene.plan),
          );
          setStage(m.versions.length ? 2 : m.scenePlan ? 1 : 0);
          setCaption(m.publishedCaption || "");
          setShareUrl(m.shareUrl || "");
          setAdditions(chosen?.scene.authorAdditions || "");
          setReferences(m.visualReferences ?? []);
          if (initialVersionId && chosen) {
            setDraft((d) => ({ ...d, scenePlan: chosen.scene.plan }));
            setApproved(true);
          }
        }
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [base, initialVersionId],
  );
  useEffect(() => {
    void load(true);
  }, [load]);
  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function save() {
    await api(base, draft, "PATCH");
  }
  async function extract() {
    await run("Reading your memory", async () => {
      await save();
      const plan = await api<ScenePlan>(`${base}/scene`, {
        story: draft.story,
      });
      const next = { ...draft, scenePlan: plan };
      await api(base, next, "PATCH");
      setDraft(next);
      setApproved(false);
      setStage(1);
    });
  }
  async function render() {
    if (!draft.scenePlan) return;
    await run("Reconstructing your memory", async () => {
      await save();
      const v = await api<ImageVersionView>(`${base}/versions`, {
        requestId: crypto.randomUUID(),
        scene: {
          plan: draft.scenePlan,
          authorAdditions: additions,
          confirmed: true,
        },
        baseVersionId: memory?.versions.length ? selected : null,
        instruction: memory?.versions.length
          ? instruction.trim() ||
            "Apply my current scene details and additions."
          : null,
      });
      setSelected(v.id);
      setApproved(true);
      setInstruction("");
      await load();
      setStage(2);
    });
  }
  async function generateDirectly() {
    await run(
      "Reconstructing your memory — this can take a few minutes",
      async () => {
        const signature = JSON.stringify(draft);
        if (generationAttempt.current?.signature !== signature) await save();
        if (generationAttempt.current?.signature !== signature)
          generationAttempt.current = { signature, id: crypto.randomUUID() };
        let v: ImageVersionView;
        try {
          v = await api<ImageVersionView>(`${base}/generate`, {
            requestId: generationAttempt.current.id,
          });
        } catch (e) {
          if ((e as { code?: string }).code === "GENERATION_FAILED")
            generationAttempt.current = null;
          throw e;
        }
        setSelected(v.id);
        setDraft((d) => ({ ...d, scenePlan: v.scene.plan }));
        setAdditions("");
        setApproved(true);
        setInstruction("");
        await load();
        setStage(2);
      },
    );
  }
  const version = memory?.versions.find((v) => v.id === selected);
  return (
    <>
      <Header />
      <div className="workspace">
        <aside className="sidebar">
          <Link className="back-link" href="/library">
            <ChevronLeft size={15} /> Saved pictures
          </Link>
          <div className="eyebrow">YOUR MEMORY BOOK</div>
          <h2>{draft.title || "A memory, unfolding."}</h2>
          <p className="muted">
            {draft.authorName
              ? `From ${draft.authorName}${draft.recipientName ? ` to ${draft.recipientName}` : ""}`
              : "A story only you can tell."}
          </p>
          <nav className="steps" aria-label="Memory stages">
            {[
              "Tell the memory",
              "Review the scene",
              "Shape the image",
              "Share & connect",
            ].map((s, i) => (
              <button
                className={stage === i ? "active" : ""}
                disabled={
                  !!busy ||
                  !memory ||
                  (i === 1 && !draft.scenePlan) ||
                  (i > 1 && !memory?.versions.length)
                }
                onClick={() => setStage(i)}
                key={s}
              >
                <span>
                  {stage > i ? (
                    <Check size={14} />
                  ) : (
                    String(i + 1).padStart(2, "0")
                  )}
                </span>
                {s}
              </button>
            ))}
          </nav>
          <div className="sidebar-note">
            <Feather size={22} />
            <p>
              This is your perspective.
              <br />
              There is no perfect way
              <br />
              to remember.
            </p>
          </div>
          <small className="browser-note">
            Your editing access is saved in this browser. Shared links only show
            what you publish.
          </small>
        </aside>
        <main className="workspace-main">
          <div className="workspace-top">
            <span className="eyebrow">
              CHAPTER {String(stage + 1).padStart(2, "0")}
            </span>
            <span className="private-badge">
              {shareUrl
                ? "A version has been shared"
                : "Private until you share"}
            </span>
          </div>
          <ErrorNotice error={error} />
          {busy && <Busy label={busy} />}
          <fieldset disabled={!!busy} className="workspace-fieldset">
            {!memory ? (
              <div className="empty-state">
                <BookOpen size={34} />
                <h2>
                  {error
                    ? "This memory isn’t available here."
                    : "Opening your memory…"}
                </h2>
                <p>
                  {error
                    ? "Open it in the browser where it was created, or use the shared link to view the published memory."
                    : "Finding your saved words and images."}
                </p>
              </div>
            ) : stage === 0 ? (
              <>
                <div className="page-heading">
                  <h1>Start with what stayed.</h1>
                  <p>A few honest words are all a memory needs.</p>
                </div>
                <form
                  className="paper editor-card"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void generateDirectly();
                  }}
                >
                  <VoiceRecorder
                    memoryId={id}
                    onUse={(value) => {
                      setDraft((current) => ({
                        ...current,
                        story: value.story,
                        narrationId: value.narrationId,
                        scenePlan: null,
                      }));
                      setApproved(false);
                    }}
                  />
                  <StoryFields draft={draft} setDraft={setDraft} />
                  <ReferencePhotos
                    memoryId={id}
                    references={references}
                    onChange={setReferences}
                    disabled={!!busy}
                  />
                  <div className="action-row">
                    <button
                      type="button"
                      className="button subtle"
                      onClick={() => run("Saving your words", save)}
                    >
                      Save draft
                    </button>
                    <button
                      type="button"
                      className="button subtle"
                      disabled={!draft.story.trim()}
                      onClick={() => void extract()}
                    >
                      Add details
                    </button>
                    <button
                      className="button primary"
                      type="submit"
                      disabled={!draft.story.trim()}
                    >
                      Submit & generate image <ArrowRight size={17} />
                    </button>
                  </div>
                </form>
              </>
            ) : stage === 1 && draft.scenePlan ? (
              <>
                <div className="page-heading">
                  <h1>Does this feel like your memory?</h1>
                  <p>
                    These details come from your words. Change anything that
                    doesn’t feel right.
                  </p>
                </div>
                <div className="paper editor-card">
                  <div className="card-overline">
                    <Sparkles size={16} /> YOUR SCENE, IN WORDS
                  </div>
                  <SceneEditor
                    plan={draft.scenePlan}
                    onChange={(plan) => {
                      setDraft({ ...draft, scenePlan: plan });
                      setApproved(false);
                    }}
                  />
                  {draft.scenePlan.followUpQuestions.length > 0 && (
                    <div className="question-prompts">
                      <h4>
                        A little more to remember? <span>Optional</span>
                      </h4>
                      {draft.scenePlan.followUpQuestions.map((q) => (
                        <p key={q}>{q}</p>
                      ))}
                    </div>
                  )}
                  <Field
                    label="Anything you’d like to add?"
                    hint="These are your additions, kept separate from details extracted from the original story."
                  >
                    <textarea
                      rows={3}
                      value={additions}
                      onChange={(e) => {
                        setAdditions(e.target.value);
                        setApproved(false);
                      }}
                      placeholder="The afternoon light was golden. My bike had a little bell…"
                    />
                  </Field>
                  <button className="button primary wide" onClick={render}>
                    Visualize this memory <Sparkles size={17} />
                  </button>
                  <p className="form-note">
                    A realistic AI reconstruction of your perspective, not an
                    original photograph.
                    <br />
                    Image creation may take a few minutes.
                  </p>
                </div>
              </>
            ) : stage === 2 ? (
              <>
                <div className="page-heading">
                  <h1>A little closer to how it felt.</h1>
                  <p>Keep what feels true. Change what doesn’t.</p>
                </div>
                {version && (
                  <DetailPinEditor
                    key={version.id}
                    memoryId={id}
                    version={version}
                    initialPins={memory.pinsByVersion?.[version.id] ?? []}
                    onSaved={() => {
                      void load();
                    }}
                  />
                )}
                <div className="version-bar">
                  <span>
                    {memory.versions.length} saved{" "}
                    {memory.versions.length === 1 ? "image" : "images"}
                  </span>
                  <div>
                    {memory.versions.map((v, i) => (
                      <button
                        className={
                          selected === v.id ? "version active" : "version"
                        }
                        onClick={() => {
                          setSelected(v.id);
                          setAdditions(v.scene.authorAdditions);
                          setDraft({ ...draft, scenePlan: v.scene.plan });
                          setApproved(true);
                        }}
                        key={v.id}
                        aria-label={`View saved image ${i + 1}`}
                      >
                        <img src={v.imageUrl} alt="" />
                        <span>{i + 1}</span>
                        {selected === v.id && <Check size={12} />}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="paper correction-card">
                  {(!draft.scenePlan || !approved) && (
                    <p className="link-notice">
                      Your scene has changed since this picture. Open scene
                      details to use those changes, or select a saved image to
                      keep refining it.
                    </p>
                  )}
                  <Field
                    label="What would bring it closer?"
                    hint="Your current image is always saved. Each successful correction becomes a new version."
                  >
                    <textarea
                      rows={3}
                      maxLength={1000}
                      value={instruction}
                      onChange={(e) => setInstruction(e.target.value)}
                      placeholder="Make the parking lot feel enormous, and put Dad farther behind me…"
                    />
                  </Field>
                  <div className="action-row">
                    <button
                      className="button subtle"
                      onClick={() => {
                        setApproved(false);
                        setStage(1);
                      }}
                    >
                      Review scene details
                    </button>
                    <button
                      className="button secondary"
                      disabled={
                        !instruction.trim() || !draft.scenePlan || !approved
                      }
                      onClick={() => {
                        void run("Refining your image", async () => {
                          await save();
                          const v = await api<ImageVersionView>(
                            `${base}/versions`,
                            {
                              requestId: crypto.randomUUID(),
                              scene: {
                                plan: draft.scenePlan,
                                authorAdditions: additions,
                                confirmed: true,
                              },
                              baseVersionId: selected,
                              instruction,
                            },
                          );
                          setSelected(v.id);
                          setInstruction("");
                          await load();
                        });
                      }}
                    >
                      Make this change <Sparkles size={16} />
                    </button>
                  </div>
                </div>
                <div className="next-step">
                  <p>Ready to let someone see it?</p>
                  <button
                    className="button primary"
                    onClick={() => setStage(3)}
                  >
                    Share this image <ArrowRight size={17} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="page-heading">
                  <h1>A memory is a way in.</h1>
                  <p>
                    Let {draft.recipientName || "someone"} see it through your
                    eyes.
                  </p>
                </div>
                <div className="publish-layout">
                  {version && (
                    <div className="publish-preview">
                      <img src={version.imageUrl} alt={draft.title} />
                      <div>
                        <span className="eyebrow">
                          FOR {draft.recipientName.toUpperCase()}
                        </span>
                        <h2>{draft.title}</h2>
                        <p>
                          An AI memory reconstruction, shaped by{" "}
                          {draft.authorName}.
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="paper editor-card">
                    <Field label="A few words to go with it">
                      <textarea
                        rows={5}
                        maxLength={2000}
                        value={caption}
                        onChange={(e) => setCaption(e.target.value)}
                        placeholder="This is how I remember that afternoon. What do you remember?"
                      />
                    </Field>
                    {draft.narrationId && (
                      <>
                        <label className="approval">
                          <input
                            type="checkbox"
                            checked={includeNarration}
                            onChange={(e) =>
                              setIncludeNarration(e.target.checked)
                            }
                          />
                          <span>
                            Include my recorded voice and its original
                            transcript
                          </span>
                        </label>
                        {memory.narrations?.find(
                          (n) => n.id === draft.narrationId,
                        ) && (
                          <MemoryVoicePlayer
                            narration={
                              memory.narrations.find(
                                (n) => n.id === draft.narrationId,
                              )!
                            }
                          />
                        )}
                      </>
                    )}
                    <p className="link-notice">
                      Anyone with this link can view this memory and leave a
                      question. Your draft and other images stay private.
                    </p>
                    <button
                      className="button primary wide"
                      disabled={!selected || !caption.trim()}
                      onClick={() =>
                        run("Publishing your memory", async () => {
                          await save();
                          const r = await api<{ shareUrl: string }>(
                            `${base}/publish`,
                            { versionId: selected, caption, includeNarration },
                          );
                          setShareUrl(r.shareUrl);
                          await load();
                        })
                      }
                    >
                      {shareUrl
                        ? "Update shared memory"
                        : "Publish this memory"}
                      <ArrowUpRight size={17} />
                    </button>
                    {shareUrl && (
                      <div className="share-result">
                        <span className="success">
                          <CheckCheck size={16} /> Your memory is ready to share
                        </span>
                        <div className="copy-row">
                          <input
                            readOnly
                            aria-label="Share link"
                            value={shareUrl}
                          />
                          <button
                            aria-label="Copy share link"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(
                                  new URL(shareUrl, window.location.origin)
                                    .href,
                                );
                                setCopied(true);
                              } catch {
                                setError(
                                  "Copy the link from the field to share it.",
                                );
                              }
                            }}
                          >
                            {copied ? <Check size={18} /> : <Copy size={18} />}
                          </button>
                        </div>
                        <Link
                          className="quiet-link"
                          href={shareUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open the recipient view <ArrowUpRight size={15} />
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
                <PerspectiveControls memory={memory} onRefresh={() => load()} />
                <section className="conversation">
                  <div className="conversation-heading">
                    <div>
                      <div className="eyebrow">THE CONVERSATION CONTINUES</div>
                      <h2>What this brings back.</h2>
                    </div>
                    <button
                      className="button subtle"
                      onClick={() =>
                        run("Refreshing the conversation", () => load())
                      }
                    >
                      <RefreshCw size={15} /> Refresh
                    </button>
                  </div>
                  <p className="muted small">
                    Questions and replies come from real people. Refresh to see
                    new messages.
                  </p>
                  {memory.messages.length ? (
                    <MessageList
                      messages={memory.messages}
                      versions={memory.versions}
                      reply={reply}
                      onReply={(parentId, text) => {
                        if (text !== undefined) {
                          setReply({ ...reply, [parentId]: text });
                          return;
                        }
                        void run("Sending your reply", async () => {
                          await api(`${base}/reply`, {
                            parentId,
                            text: reply[parentId],
                          });
                          setReply({ ...reply, [parentId]: "" });
                          await load();
                        });
                      }}
                    />
                  ) : (
                    <div className="conversation-empty">
                      <MessageCircle size={25} />
                      <p>Every memory can begin a conversation.</p>
                      <span>Share your link and invite a question.</span>
                    </div>
                  )}
                </section>
              </>
            )}
          </fieldset>
        </main>
      </div>
    </>
  );
}
export function SharedMemory({ token }: { token: string }) {
  const [memory, setMemory] = useState<PublishedMemoryView | null>(null),
    [error, setError] = useState(""),
    [name, setName] = useState(""),
    [selectedPin, setSelectedPin] = useState<PublicPin | null>(null),
    [text, setText] = useState(""),
    [busy, setBusy] = useState("");
  const base = `/api/share/${token}`;
  const load = useCallback(async () => {
    const m = await api<PublishedMemoryView>(base);
    setMemory(m);
  }, [base]);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);
  async function refresh() {
    setBusy("Refreshing the conversation");
    setError("");
    try {
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <Header />
      <main className="shared-page">
        <ErrorNotice error={error} />
        {!memory ? (
          <div className="empty-state">
            <BookOpen size={35} />
            <h1>
              {error ? "This memory isn’t available." : "Opening a memory…"}
            </h1>
            <p>
              {error
                ? "Check your link with the person who shared it."
                : "A story, seen through someone else’s eyes."}
            </p>
          </div>
        ) : (
          <>
            <div className="shared-heading">
              <div className="eyebrow">
                A MEMORY FOR {memory.recipientName.toUpperCase()}
              </div>
              <h1>{memory.title}</h1>
              <p>
                AI reconstruction · Shaped by {memory.authorName}, not an
                original photograph.
              </p>
            </div>
            <div className="shared-image">
              <MemoryDetailPins
                imageUrl={memory.imageUrl}
                alt={memory.imageDescription || memory.title}
                pins={memory.pins ?? []}
                onAsk={(pin) => {
                  setSelectedPin(pin);
                  document
                    .getElementById("shared-question")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
              />
            </div>
            {memory.narration && (
              <MemoryVoicePlayer narration={memory.narration} />
            )}
            <div className="shared-caption">
              <span className="quote-mark">“</span>
              <p>{memory.caption}</p>
              <span>— {memory.authorName}</span>
            </div>
            <div className="shared-divider">
              <Heart size={17} />
            </div>
            <section className="shared-conversation">
              <div className="conversation-heading">
                <div>
                  <div className="eyebrow">THERE’S MORE TO EVERY MEMORY</div>
                  <h2>What does this bring back?</h2>
                </div>
                <button
                  className="icon-button"
                  aria-label="Refresh conversation"
                  onClick={refresh}
                  disabled={!!busy}
                >
                  <RefreshCw size={18} />
                </button>
              </div>
              <p className="muted">
                Ask {memory.authorName} a question, or leave a little of your
                own perspective. They’ll answer in their own words.
              </p>
              {busy && <Busy label={busy} />}
              <MessageList
                messages={memory.messages}
                currentVersionId={memory.versionId}
              />
              <form
                className="paper editor-card"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy("Leaving your message");
                  setError("");
                  try {
                    await api(`${base}/messages`, {
                      versionId: memory.versionId,
                      publicationId: memory.publicationId,
                      pinId: selectedPin?.id ?? null,
                      displayName: name,
                      text,
                    });
                    setText("");
                    await load();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy("");
                  }
                }}
              >
                <div id="shared-question" />
                {selectedPin && (
                  <div className="conn-quote">
                    <blockquote>{selectedPin.sourceQuote}</blockquote>
                    <button
                      type="button"
                      className="conn-link"
                      onClick={() => setSelectedPin(null)}
                    >
                      Ask without this detail
                    </button>
                  </div>
                )}
                <Field label="Your name">
                  <input
                    required
                    maxLength={80}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="How they know you"
                  />
                </Field>
                <Field label="Your question or reflection">
                  <textarea
                    rows={4}
                    required
                    maxLength={2000}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="I never knew you remembered it that way…"
                  />
                </Field>
                <div className="question-starters">
                  {[
                    "What happened next?",
                    "What detail matters most to you?",
                  ].map((q) => (
                    <button type="button" onClick={() => setText(q)} key={q}>
                      {q}
                    </button>
                  ))}
                </div>
                <button
                  disabled={!!busy}
                  className="button primary"
                  type="submit"
                >
                  Leave your message <ArrowUpRight size={16} />
                </button>
                <p className="form-note">
                  A real conversation with {memory.authorName}. Refresh to see
                  their reply.
                </p>
              </form>
            </section>
          </>
        )}
        <div className="shared-end">
          <Feather size={24} />
          <p>
            Every memory looks a little different
            <br />
            through someone else’s eyes.
          </p>
          <Link href="/" className="quiet-link">
            Tell a memory of your own <ArrowRight size={15} />
          </Link>
        </div>
      </main>
      <footer>
        <Brand />
        <span>Made for the things we carry with us.</span>
      </footer>
    </>
  );
}
