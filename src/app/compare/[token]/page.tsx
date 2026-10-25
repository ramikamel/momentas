import Link from "next/link";
import { PerspectiveComparison } from "@/components/perspective-comparison";
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <>
      <header className="conn-header">
        <Link href="/">momentas.</Link>
        <span>A little closer to the way you remember.</span>
      </header>
      <PerspectiveComparison token={token} />
    </>
  );
}
