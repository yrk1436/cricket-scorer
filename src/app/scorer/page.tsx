import CreateMatchForm from "@/components/CreateMatchForm";
import { getRequestOrigin } from "@/lib/site-origin";

export const metadata = {
  title: "New match | Sparta Cricket Club",
};

export default async function ScorerPage() {
  const origin = await getRequestOrigin();
  return (
    <main className="bg-[var(--background)]">
      <CreateMatchForm origin={origin} />
    </main>
  );
}
