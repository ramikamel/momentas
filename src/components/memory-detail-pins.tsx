"use client";
import { useState } from "react";
import type { PublicPin } from "@/lib/memory/connections";
import "./connections.css";
import { DetailOutline } from "./detail-outline";
export { DetailPinEditor } from "./detail-pin-editor";

export function MemoryDetailPins({
  imageUrl,
  alt,
  pins,
  onAsk,
}: {
  imageUrl: string;
  alt: string;
  pins: PublicPin[];
  onAsk?: (pin: PublicPin) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="conn-pins">
      <div className="conn-image">
        <img src={imageUrl} alt={alt} />
        <DetailOutline outline={pins.find((p) => p.id === selected)?.outline} />
        <svg
          className="conn-exploration-overlay"
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
        >
          {[...pins]
            .reverse()
            .map(
              (pin) =>
                pin.outline && (
                  <path
                    key={pin.id}
                    d={pin.outline.path}
                    onClick={() => setSelected(pin.id)}
                    style={{
                      pointerEvents: "all",
                      cursor: "pointer",
                      fill: selected === pin.id ? "#f8d68830" : "transparent",
                      stroke: selected === pin.id ? "#fff3cf" : "#fff3cf70",
                      strokeWidth: 2,
                    }}
                  />
                ),
            )}
        </svg>
        {pins.map((pin, i) => (
          <button
            key={pin.id}
            type="button"
            className="conn-pin"
            style={{
              left: `${pin.x * 100}%`,
              top: `${pin.y * 100}%`,
              zIndex: 3,
            }}
            aria-label={`Explore detail ${i + 1}: ${pin.label}`}
            aria-pressed={selected === pin.id}
            onClick={() => setSelected(pin.id)}
          >
            {i + 1}
          </button>
        ))}
      </div>
      {pins.length > 0 && (
        <ol className="conn-detail-list">
          {pins.map((pin, i) => (
            <li key={pin.id}>
              <button
                type="button"
                className="conn-detail-toggle"
                aria-expanded={selected === pin.id}
                onClick={() => setSelected(selected === pin.id ? null : pin.id)}
              >
                {i + 1}. {pin.label}
              </button>
              {selected === pin.id && (
                <div className="conn-quote">
                  <p className="conn-small">
                    {pin.origin === "author"
                      ? "A note from the storyteller"
                      : "From their original account"}
                  </p>
                  <blockquote>{pin.sourceQuote}</blockquote>
                  {onAsk && (
                    <button
                      type="button"
                      className="conn-link"
                      onClick={() => onAsk(pin)}
                    >
                      Ask about this detail →
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
