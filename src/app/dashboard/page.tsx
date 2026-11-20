import CommandCenter from "@/components/command-center";
import { requirePageUser } from "@/lib/auth-guards";

export const metadata = {
  title: "Command center",
};

export default async function DashboardPage() {
  await requirePageUser();
  return <CommandCenter mode="customer" />;
}
