import Studio from "@/components/Studio";
export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{
    project?: string;
    source?: string;
    open?: string;
    account?: string;
    beat?: string;
    preset?: string;
  }>;
}) {
  const q = await searchParams;
  return (
    <Studio
      initialPreset={!q.project && !q.beat ? q.preset : undefined}
      initialSession={
        q.beat
          ? { id: q.beat, source: "beat" }
          : q.project
            ? { id: q.project, source: q.source ?? "local" }
            : undefined
      }
      initialDialog={
        q.account === "1"
          ? "auth"
          : q.open === "projects"
            ? "projects"
            : undefined
      }
    />
  );
}
