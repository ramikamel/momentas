"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AuthorMemoryView, ImageVersionView } from "@/lib/memory/types";
import type { PinDraft } from "@/lib/memory/connections";
import type { DetectedObject, ObjectMap } from "@/lib/memory/personalization";
import type {
  PhotoContextDraft,
  PhotoQuestions,
} from "@/lib/memory/photo-context";
import { MemoryComposer } from "./memory-composer";
import { ReferencePhotos } from "./reference-photos";
import "./photo-memory.css";
const fresh = (key: string): PhotoContextDraft => ({
  key,
  revision: 0,
  text: "",
  questionIndex: 0,
  appliedNarrations: [],
});
async function request<T>(
  url: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const r = await fetch(
    url,
    body === undefined
      ? undefined
      : {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await r.json();
  if (!r.ok)
    throw Error(
      data.error || "Could not save. Your words are still here; retry saving.",
    );
  return data;
}
export function PhotoMemoryWorkspace({
  memory,
  version,
  onShare,
  outsideFrame,
}: {
  memory: AuthorMemoryView;
  version: ImageVersionView;
  onShare: (story: string, pins: PinDraft[]) => void;
  outsideFrame?: ReactNode;
}) {
  const base = `/api/memories/${memory.id}`,
    vbase = `${base}/versions/${version.id}`;
  const [drafts, rawSetDrafts] = useState<Record<string, PhotoContextDraft>>({
      story: { ...fresh("story"), text: memory.story },
    }),
    [active, setActive] = useState("story"),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [saving, setSaving] = useState(false),
    [notice, setNotice] = useState(""),
    [objects, setObjects] = useState<DetectedObject[]>([]),
    [preparing, setPreparing] = useState(true),
    [manual, setManual] = useState(false),
    [retarget, setRetarget] = useState(false),
    [concept, setConcept] = useState(""),
    [finding, setFinding] = useState(false),
    [questions, setQuestions] = useState<PhotoQuestions | null>(null),
    [pins, setPins] = useState<PinDraft[]>(
      memory.pinsByVersion?.[version.id] || [],
    );
  const latest = useRef(drafts);
  const activeRef = useRef(active);
  const saveLock = useRef(false);
  function setDrafts(
    update: (
      current: Record<string, PhotoContextDraft>,
    ) => Record<string, PhotoContextDraft>,
  ) {
    const next = update(latest.current);
    latest.current = next;
    rawSetDrafts(next);
  }
  useEffect(() => {
    activeRef.current = active;
  }, [active]);
  useEffect(() => {
    let alive = true;
    void request<PhotoContextDraft[]>(
      `${base}/source/context?versionId=${version.id}`,
    )
      .then((items) => {
        if (alive) {
          setDrafts((current) => ({
            ...current,
            ...Object.fromEntries(items.map((d) => [d.key, d])),
          }));
          setLoaded(true);
        }
      })
      .catch((e) => setNotice(e.message));
    void request<PhotoQuestions | null>(
      `${base}/source/questions?versionId=${version.id}`,
    )
      .then((q) => {
        if (alive) setQuestions(q);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [base, version.id]);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function load(prepare = false) {
      try {
        const data = await request<{
          map: ObjectMap | null;
        }>(`${vbase}/objects`, prepare ? {} : undefined);
        if (!alive) return;
        if (!data.map && !prepare) {
          void load(true);
          return;
        }
        setObjects(data.map?.objects || []);
        setPreparing(data.map?.status === "pending");
        if (data.map?.status === "pending")
          timer = setTimeout(() => void load(), 2000);
      } catch {
        if (alive) {
          setPreparing(false);
          setNotice("You can still choose a spot and tell its story.");
        }
      }
    }
    void load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [vbase]);
  const draft = drafts[active] || fresh(active);
  const notes = Object.values(drafts).filter((d) => d.key.startsWith("note:"));
  async function save(
    key = activeRef.current,
    narrationId?: string,
    recordingId?: string,
  ) {
    const captured = latest.current[key];
    if (!captured || !loaded || saveLock.current) return null;
    saveLock.current = true;
    setSaving(true);
    setNotice("");
    try {
      const saved = await request<PhotoContextDraft>(
        `${base}/source/context`,
        {
          versionId: version.id,
          draft: {
            key: captured.key,
            revision: captured.revision,
            text: captured.text,
            questionIndex: captured.questionIndex,
            region: captured.region,
            ...(narrationId ? { narrationId } : {}),
            ...(recordingId ? { recordingId } : {}),
          },
        },
        "PUT",
      );
      setDrafts((current) => {
        const now = current[key];
        return {
          ...current,
          [key]: {
            ...saved,
            text:
              now.text === captured.text
                ? saved.text
                : narrationId &&
                    !captured.appliedNarrations.includes(narrationId)
                  ? [
                      now.text.trimEnd(),
                      saved.text.slice(captured.text.trimEnd().length).trim(),
                    ]
                      .filter(Boolean)
                      .join("\n\n")
                  : now.text,
          },
        };
      });
      setNotice("Words saved privately.");
      return latest.current[key];
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : "Could not save your words. Retry saving.",
      );
      return null;
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }
  async function switchTo(key: string, region?: PhotoContextDraft["region"]) {
    if (busy || saving || saveLock.current || !loaded) return;
    if (!(await save())) return;
    setDrafts((current) => ({
      ...current,
      [key]: current[key] || { ...fresh(key), region },
    }));
    activeRef.current = key;
    setActive(key);
    setManual(false);
  }
  async function choose(object: DetectedObject) {
    if (busy || saving) return;
    const region = { x: object.x, y: object.y, outline: object.outline };
    if (retarget && active !== "story") {
      setDrafts((c) => ({ ...c, [active]: { ...c[active], region } }));
      setRetarget(false);
      return;
    }
    const existing = notes.find(
      (n) => n.region?.outline?.path === object.outline.path,
    );
    if (!existing && notes.length >= 5) {
      setNotice("Your photograph has room for five detail stories.");
      return;
    }
    await switchTo(existing?.key || `note:${crypto.randomUUID()}`, region);
  }
  async function commit() {
    const key = activeRef.current;
    const current = await save(key);
    if (!current) return;
    if (key === "story") return;
    if (!current.text.trim() || !current.region) return;
    const pin: PinDraft = {
      id: key.slice(5),
      ...current.region,
      detailPath: "note",
      label: current.text,
      sourceQuote: current.text,
      origin: "author",
    };
    saveLock.current = true;
    setSaving(true);
    try {
      const next = await request<PinDraft[]>(
        `${vbase}/pins`,
        { pins: [...pins.filter((p) => p.id !== pin.id), pin] },
        "PUT",
      );
      setPins(next);
      setNotice("Detail saved. Ready whenever you choose to share.");
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }
  async function find() {
    if (busy || saving || finding || !loaded) return;
    setFinding(true);
    try {
      const data = await request<{
        objects: DetectedObject[];
      }>(`${vbase}/objects`, { concept });
      setObjects((c) => [
        ...c.filter((o) => !data.objects.some((n) => n.id === o.id)),
        ...data.objects,
      ]);
      if (data.objects[0]) await choose(data.objects[0]);
      else setNotice("Try another name, or choose a spot yourself.");
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setFinding(false);
    }
  }
  async function refreshRevisions() {
    try {
      const remote = await request<PhotoContextDraft[]>(
        `${base}/source/context?versionId=${version.id}`,
      );
      setDrafts((current) => {
        const next = { ...current };
        for (const item of remote)
          next[item.key] = {
            ...item,
            text: current[item.key]?.text ?? item.text,
            region: current[item.key]?.region ?? item.region,
          };
        return next;
      });
      setLoaded(true);
      setNotice(
        "Latest save loaded. Your typed words are preserved; save again when ready.",
      );
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  const question = questions?.questions[drafts.story?.questionIndex || 0];
  return (
    <main className="photo-workspace">
      <header className="photo-heading">
        <a href="/library">← Your memory book</a>
        <span className="eyebrow">THE STORIES INSIDE A PHOTOGRAPH</span>
        <h1>{memory.title || "A moment, remembered."}</h1>
        <p>Look closer. What comes back to you?</p>
      </header>
      <div className="photo-layout">
        <section className="photo-stage" aria-label="Explore your photograph">
          <div
            className={`photo-canvas ${manual ? "is-placing" : ""}`}
            onClick={(e) => {
              if (!manual || busy) return;
              const rect = e.currentTarget.getBoundingClientRect();
              void switchTo(`note:${crypto.randomUUID()}`, {
                x: (e.clientX - rect.left) / rect.width,
                y: (e.clientY - rect.top) / rect.height,
              });
            }}
          >
            <img src={version.imageUrl} alt="Your original photograph" />
            <svg
              viewBox="0 0 1000 1000"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {[...objects]
                .sort((a, b) => b.area - a.area)
                .map((o) => (
                  <path
                    key={o.id}
                    d={o.outline.path}
                    className={
                      draft.region?.outline?.path === o.outline.path
                        ? "selected"
                        : ""
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      void choose(o);
                    }}
                  />
                ))}
            </svg>
            {notes.map(
              (n) =>
                n.region && (
                  <button
                    key={n.key}
                    className={`photo-dot ${active === n.key ? "selected" : ""}`}
                    style={{
                      left: `${n.region.x * 100}%`,
                      top: `${n.region.y * 100}%`,
                    }}
                    aria-label={`Open detail ${n.text.slice(0, 35) || "story"}`}
                    disabled={busy || saving}
                    onClick={(e) => {
                      e.stopPropagation();
                      void switchTo(n.key);
                    }}
                  >
                    +
                  </button>
                ),
            )}
          </div>
          <p className="photo-caption">
            Your original photograph ·{" "}
            {preparing
              ? "Finding little details…"
              : "Tap a detail to give it a story."}
          </p>
          <div className="photo-objects">
            {objects.map((o) => (
              <button
                disabled={busy || saving || !loaded}
                key={o.id}
                onClick={() => void choose(o)}
              >
                {o.label}
              </button>
            ))}
            <button
              disabled={busy || saving || notes.length >= 5 || !loaded}
              onClick={() => setManual(!manual)}
            >
              Choose a spot yourself
            </button>
          </div>
          {manual && (
            <button
              className="button subtle"
              disabled={busy}
              onClick={() =>
                void switchTo(`note:${crypto.randomUUID()}`, { x: 0.5, y: 0.5 })
              }
            >
              Place at the center
            </button>
          )}
          <form
            className="photo-find"
            onSubmit={(e) => {
              e.preventDefault();
              void find();
            }}
          >
            <input
              aria-label="Find another detail"
              placeholder="Looking for something? Try ‘helmet’"
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
            />
            <button
              disabled={busy || saving || finding || !loaded || !concept.trim()}
            >
              Find detail
            </button>
          </form>
        </section>
        <aside className="photo-story">
          <nav aria-label="Story context">
            <button
              disabled={busy || saving || !loaded}
              aria-pressed={active === "story"}
              onClick={() => void switchTo("story")}
            >
              The whole story
            </button>
            {notes.map((n, i) => (
              <button
                key={n.key}
                disabled={busy || saving}
                aria-pressed={active === n.key}
                onClick={() => void switchTo(n.key)}
              >
                Detail {i + 1}
              </button>
            ))}
          </nav>
          <span className="eyebrow">
            {active === "story"
              ? "BEYOND THE EDGES"
              : "A LITTLE DETAIL, A WHOLE STORY"}
          </span>
          <h2>
            {active === "story"
              ? "What the photograph can’t tell us."
              : "What do you remember about this?"}
          </h2>
          {active !== "story" && (
            <button
              disabled={busy || saving}
              onClick={() => setRetarget(!retarget)}
            >
              {retarget
                ? "Choose the new object in your photo"
                : "Change this detail’s target"}
            </button>
          )}
          <MemoryComposer
            key={active}
            memoryId={memory.id}
            resumeNarrationId={draft.pendingNarrationId}
            onUploaded={async ({ narrationId }) => {
              if (!(await save(active, undefined, narrationId)))
                throw Error(
                  "Your recording is saved. Retry to attach it to this story.",
                );
            }}
            label={
              active === "story"
                ? "The story behind this photograph"
                : "What do you remember about this?"
            }
            text={draft.text}
            onText={(text) =>
              setDrafts((c) => ({ ...c, [active]: { ...c[active], text } }))
            }
            onSave={() => void commit()}
            busy={busy || !loaded}
            saving={saving}
            recordingDisabled={!loaded || saving}
            maxLength={active === "story" ? 6000 : 500}
            onBusy={setBusy}
            onVoice={async ({ narrationId }) => {
              if (!(await save(active, narrationId)))
                throw Error(
                  "Your recording is saved. Retry to add it to these words.",
                );
            }}
          />
          {notice && (
            <div>
              <p role="status">{notice}</p>
              {!notice.includes("saved") && (
                <button
                  disabled={busy || saving}
                  onClick={() => void refreshRevisions()}
                >
                  Reload latest save, keep my words
                </button>
              )}
            </div>
          )}
          <details className="photo-prompts">
            <summary>A little help remembering</summary>
            {question ? (
              <>
                <p>{question.text}</p>
                <button
                  disabled={busy || saving}
                  onClick={() => {
                    const object = objects.find(
                      (o) => o.id === question.regionId,
                    );
                    if (object) void choose(object);
                    else void switchTo("story");
                  }}
                >
                  Answer this
                </button>
                <button
                  disabled={busy || saving}
                  onClick={() => {
                    setDrafts((c) => ({
                      ...c,
                      story: {
                        ...c.story,
                        questionIndex: Math.min(3, c.story.questionIndex + 1),
                      },
                    }));
                    void save("story");
                  }}
                >
                  Skip
                </button>
                <button
                  disabled={busy || saving}
                  onClick={() => {
                    setDrafts((c) => ({
                      ...c,
                      story: { ...c.story, questionIndex: 3 },
                    }));
                    void save("story");
                  }}
                >
                  Done
                </button>
              </>
            ) : (
              <>
                <p>
                  What happened just before this photograph? What would you like
                  someone to know?
                </p>
                <button
                  disabled={busy || saving}
                  onClick={() =>
                    void request<PhotoQuestions>(`${base}/source/questions`, {
                      versionId: version.id,
                    })
                      .then(setQuestions)
                      .catch(() =>
                        setNotice("You can tell your story in your own way."),
                      )
                  }
                >
                  Suggest a question
                </button>
              </>
            )}
          </details>
          <button
            className="button primary photo-share"
            disabled={busy || saving || !loaded}
            onClick={async () => {
              const key = activeRef.current;
              const text = latest.current[key].text;
              if (await save()) {
                if (latest.current[key].text !== text) {
                  setNotice(
                    "Your newest words are still here. Choose Ready to share again to save them first.",
                  );
                  return;
                }
                onShare(latest.current.story.text, pins);
              }
            }}
          >
            Ready to share
          </button>
        </aside>
      </div>
      <details className="photo-reference">
        <summary>
          Other photographs that might help <span>Optional</span>
        </summary>
        <ReferencePhotos memoryId={memory.id} />
      </details>
      {outsideFrame}
    </main>
  );
}
