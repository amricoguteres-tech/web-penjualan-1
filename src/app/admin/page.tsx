import CommandCenter from "@/components/command-center";
import { requirePageAdmin } from "@/lib/auth-guards";

export const metadata = {
  title: "Admin workspace status",
};

export default async function AdminPage() {
  await requirePageAdmin();
  return <CommandCenter mode="admin" />;
}
