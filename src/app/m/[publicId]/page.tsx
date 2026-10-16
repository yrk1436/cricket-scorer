import PublicMatchView from "@/components/PublicMatchView";
import {
  fetchBundle,
  getMatchByPublicId,
  toPublicBundle,
} from "@/lib/match-service";
import { notFound } from "next/navigation";

export default async function PublicMatchPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  const m = await getMatchByPublicId(publicId);
  if (!m) notFound();

  const bundle = toPublicBundle(await fetchBundle(m));

  return (
    <main>
      <PublicMatchView bundle={bundle} />
    </main>
  );
}
