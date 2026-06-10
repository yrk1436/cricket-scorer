import AdminScorecards from "@/components/AdminScorecards";
import { ADMIN_COOKIE_NAME, parseAdminSession } from "@/lib/admin-auth";
import { getRequestOrigin } from "@/lib/site-origin";
import { cookies } from "next/headers";

export const metadata = {
  title: "Admin scorecards",
  robots: { index: false, follow: false },
};

export default async function AdminScorecardsPage() {
  const cookie = (await cookies()).get(ADMIN_COOKIE_NAME)?.value;
  const initiallyAuthed = parseAdminSession(cookie);
  const origin = await getRequestOrigin();

  return (
    <main>
      <AdminScorecards initiallyAuthed={initiallyAuthed} siteOrigin={origin} />
    </main>
  );
}
