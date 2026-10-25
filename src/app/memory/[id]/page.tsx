import { Workspace } from "@/components/memory-app";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ image?: string | string[] }>;
}) {
  const { id } = await params;
  const { image } = await searchParams;
  return (
    <Workspace
      id={id}
      initialVersionId={typeof image === "string" ? image : undefined}
    />
  );
}
