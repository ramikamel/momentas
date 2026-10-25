import type { PhotoContextStore } from "../memory/photo-context";
export function createPhotoContextSupabaseStore(
  url: string,
  key: string,
): PhotoContextStore {
  const base = url.replace(/\/$/, "").replace(/\/rest\/v1$/, "");
  async function rpc(action: string, data: object) {
    const response = await fetch(base + "/rest/v1/rpc/photo_context_action", {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_action: action, p_data: data }),
      cache: "no-store",
    });
    if (!response.ok)
      throw Object.assign(
        new Error("Could not save this story. Reload before retrying."),
        { status: response.status === 400 ? 409 : response.status },
      );
    return response.json();
  }
  return {
    photoContexts: (memoryId, versionId) =>
      rpc("list", { memoryId, versionId }),
    savePhotoContext: (memoryId, versionId, input) =>
      rpc("save", { memoryId, versionId, input }),
    getPhotoQuestions: (memoryId, versionId) =>
      rpc("questions", { memoryId, versionId }),
    claimPhotoQuestions: (memoryId, versionId, requestId, retry) =>
      rpc("claim", { memoryId, versionId, requestId, retry }),
    finishPhotoQuestions: async (
      memoryId,
      versionId,
      requestId,
      questions,
      failed,
    ) => {
      await rpc("finish", {
        memoryId,
        versionId,
        requestId,
        questions,
        failed,
      });
    },
  };
}
