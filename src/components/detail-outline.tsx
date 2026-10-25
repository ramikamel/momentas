import type { PublicPin } from "@/lib/memory/connections";
export function DetailOutline({
  outline,
}: {
  outline?: PublicPin["outline"] | null;
}) {
  if (!outline) return null;
  return (
    <svg
      className="conn-object-outline"
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={outline.path} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
