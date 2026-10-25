import { Workspace } from "@/components/memory-app";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    image?: string | string[];
    step?: string | string[];
  }>;
}) {
  const { id } = await params;
  const { image, step } = await searchParams;
  return (
    <Workspace
      id={id}
      initialVersionId={typeof image === "string" ? image : undefined}
      initialStage={
        typeof step === "string" && /^[0-3]$/.test(step)
          ? Number(step)
          : undefined
      }
    />
  );
}
