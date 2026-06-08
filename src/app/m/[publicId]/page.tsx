import Scorecard from "@/components/Scorecard";
import { fetchBundle, getMatchByPublicId } from "@/lib/match-service";
import { notFound } from "next/navigation";

export default async function PublicMatchPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  const m = await getMatchByPublicId(publicId);
  if (!m) notFound();

  const bundle = await fetchBundle(m);

  return (
    <main>
      <Scorecard
        bundle={bundle}
        variant="public"
        readOnlyBanner="Anyone with this link can view only."
      />
    </main>
  );
}
