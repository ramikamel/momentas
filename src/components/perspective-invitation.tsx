"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import "./connections.css";
export function PerspectiveInvitation({ token }: { token: string }) {
  const router = useRouter();
  const [invitation, setInvitation] = useState<{
    eventLabel: string;
    inviterName: string;
    contributionExists: boolean;
  } | null>(null);
  const [name, setName] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    fetch(`/api/perspectives/${encodeURIComponent(token)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "This invitation is unavailable.");
        if (active) setInvitation(data);
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [token]);
  async function claim(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/perspectives/${encodeURIComponent(token)}/claim`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ authorName: name.trim() }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not open your perspective.");
      router.push(`/memory/${data.memoryId}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Please try again.");
      setBusy(false);
    }
  }
  return (
    <main className="conn-shell conn-invite">
      <span className="conn-eyebrow">Another way to remember</span>
      <h1>
        One moment.
        <br />
        <em>Your perspective.</em>
      </h1>
      {invitation ? (
        <>
          <p>
            {invitation.inviterName} invited you to remember{" "}
            <strong>{invitation.eventLabel}</strong>.
          </p>
          <p className="conn-muted">
            Start with your own words or a recording. After you review and share
            your account, you can reveal the two perspectives together.
          </p>
          <form onSubmit={claim}>
            <label className="conn-field">
              Your name
              <input
                required
                maxLength={80}
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <button className="conn-button" disabled={busy || !name.trim()}>
              {busy
                ? "Opening…"
                : invitation.contributionExists
                  ? "Continue my perspective →"
                  : "Begin my perspective →"}
            </button>
          </form>
          <p className="conn-small">
            Anyone with this invitation can create or resume this contribution.
            Keep the link with the person you invited.
          </p>
        </>
      ) : (
        !error && <p role="status">Opening your invitation…</p>
      )}
      {error && (
        <p role="alert" className="conn-error">
          {error}
        </p>
      )}
    </main>
  );
}
