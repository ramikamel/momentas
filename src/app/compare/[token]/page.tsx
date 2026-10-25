import { Header } from "@/components/site-header";
import { PerspectiveComparison } from "@/components/perspective-comparison";
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <>
      <Header />
      <PerspectiveComparison token={token} />
    </>
  );
}
