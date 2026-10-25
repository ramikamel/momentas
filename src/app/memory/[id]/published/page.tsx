import { Workspace } from "@/components/memory-app";
export default async function PublishedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Workspace id={id} publishedView />;
}
