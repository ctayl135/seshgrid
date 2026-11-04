import CommunityPage from "@/components/CommunityPage";
export default async function Messages({
  searchParams,
}: {
  searchParams: Promise<{ artist?: string }>;
}) {
  const q = await searchParams;
  return <CommunityPage mode="messages" artist={q.artist} />;
}
