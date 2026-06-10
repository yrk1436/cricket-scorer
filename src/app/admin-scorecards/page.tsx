import AdminScorecards from "@/components/AdminScorecards";
import { getRequestOrigin } from "@/lib/site-origin";

export const metadata = {
  title: "Admin scorecards",
  robots: { index: false, follow: false },
};

export default async function AdminScorecardsPage() {
  const origin = await getRequestOrigin();

  return (
    <main>
      <AdminScorecards siteOrigin={origin} />
    </main>
  );
}
