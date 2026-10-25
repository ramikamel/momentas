import Link from "next/link";
import { PerspectiveInvitation } from "@/components/perspective-invitation";
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
        <Link className="conn-library-link" href="/library">
          Saved pictures
        </Link>
      </header>
      <PerspectiveInvitation token={token} />
    </>
  );
}
