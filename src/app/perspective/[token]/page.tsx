import { Header } from "@/components/site-header";
import { PerspectiveInvitation } from "@/components/perspective-invitation";
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <>
      <Header />
      <PerspectiveInvitation token={token} />
    </>
  );
}
