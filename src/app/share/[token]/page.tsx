import { SharedMemory } from "@/components/memory-app";
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <SharedMemory token={token} />;
}
