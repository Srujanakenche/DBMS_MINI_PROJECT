import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import AdminWorkspace from "@/components/admin-workspace";
import Workspace from "@/components/workspace";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user.role === "ADMIN" ? <AdminWorkspace /> : <Workspace />;
}
