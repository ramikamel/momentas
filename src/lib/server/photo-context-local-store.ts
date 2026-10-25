import type {
  PhotoContextDraft,
  PhotoContextStore,
  PhotoQuestions,
} from "../memory/photo-context";
import type { MemoryRecord } from "../memory/types";
type State = {
  memories: MemoryRecord[];
  photoContexts?: Record<string, PhotoContextDraft[]>;
  photoQuestions?: Record<string, PhotoQuestions>;
};
export function createPhotoContextLocalStore(
  transaction: <T>(
    fn: (s: State) => T | Promise<T>,
    save?: boolean,
  ) => Promise<T>,
): PhotoContextStore {
  const id = (mid: string, vid: string) => mid + ":" + vid;
  const conflict = () => {
    throw Object.assign(
      new Error("This story changed. Reload it before saving again."),
      { status: 409 },
    );
  };
  return {
    photoContexts: (m, v) =>
      transaction(
        (s) => structuredClone(s.photoContexts?.[id(m, v)] ?? []),
        false,
      ),
    savePhotoContext: (m, v, input) =>
      transaction((s) => {
        const drafts = ((s.photoContexts ??= {})[id(m, v)] ??= []);
        const prior = drafts.find((d) => d.key === input.key);
        if (
          input.narrationId &&
          prior?.appliedNarrations.includes(input.narrationId)
        )
          return structuredClone(prior);
        if ((prior?.revision ?? 0) !== input.revision) conflict();
        if (!prior && drafts.length >= 16) conflict();
        const text = [input.text.trimEnd(), input.transcript?.trim()]
          .filter(Boolean)
          .join("\n\n");
        if (text.length > (input.key === "story" ? 6000 : 500))
          throw Object.assign(
            new Error("Shorten the text before adding these recorded words."),
            { status: 400 },
          );
        const next: PhotoContextDraft = {
          key: input.key,
          revision: input.revision + 1,
          text,
          questionIndex: input.questionIndex,
          region: input.region,
          narrationId: input.narrationId ?? prior?.narrationId,
          ...(input.narrationId
            ? {}
            : (input.recordingId ?? prior?.pendingNarrationId)
              ? {
                  pendingNarrationId:
                    input.recordingId ?? prior?.pendingNarrationId,
                }
              : {}),
          appliedNarrations: [
            ...(prior?.appliedNarrations ?? []),
            ...(input.narrationId ? [input.narrationId] : []),
          ],
        };
        if (prior) drafts.splice(drafts.indexOf(prior), 1, next);
        else drafts.push(next);
        if (input.key === "story") {
          const memory = s.memories.find((x) => x.id === m);
          if (!memory) conflict();
          memory!.story = text;
          if (next.narrationId) memory!.narrationId = next.narrationId;
        }
        return structuredClone(next);
      }),
    getPhotoQuestions: (m, v) =>
      transaction((s) => {
        const q = s.photoQuestions?.[id(m, v)];
        return q
          ? structuredClone(
              q.status === "pending" && q.expiresAt <= Date.now()
                ? { ...q, status: "failed" as const }
                : q,
            )
          : null;
      }, false),
    claimPhotoQuestions: (m, v, r, retry) =>
      transaction((s) => {
        const all = (s.photoQuestions ??= {}),
          q = all[id(m, v)];
        if (
          q &&
          !(
            retry &&
            (q.status === "failed" ||
              (q.status === "pending" && q.expiresAt <= Date.now()))
          )
        )
          return false;
        all[id(m, v)] = {
          status: "pending",
          questions: [],
          requestId: r,
          expiresAt: Date.now() + 90000,
        };
        return true;
      }),
    finishPhotoQuestions: (m, v, r, questions, failed) =>
      transaction((s) => {
        const q = s.photoQuestions?.[id(m, v)];
        if (!q || q.requestId !== r || q.status !== "pending") conflict();
        q!.questions = questions;
        q!.status = failed ? "failed" : "complete";
      }),
  };
}
