import SocialPage from "@/components/SocialPage";
export default async function Profile({
  searchParams,
}: {
  searchParams: Promise<{ artist?: string }>;
}) {
  const query = await searchParams;
  return <SocialPage mode="profile" artistId={query.artist} />;
}
