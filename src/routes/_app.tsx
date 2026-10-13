import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { CommandMenu } from "@/components/layout/CommandMenu";
import { TopBar } from "@/components/layout/TopBar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ApiError, setToken } from "@/lib/api";
import { isAuthenticated } from "@/lib/auth";
import { meQuery } from "@/lib/queries";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context, location }) => {
    if (!isAuthenticated()) throw redirect({ to: "/login", search: { redirect: location.href } });
    try {
      await context.queryClient.ensureQueryData(meQuery);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setToken(null);
        throw redirect({ to: "/login", search: { redirect: location.href } });
      }
      throw err;
    }
  },
  pendingComponent: () => (
    <div className="flex h-dvh items-center justify-center">
      <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  ),
  component: AppLayout,
});

function AppLayout() {
  const [searchOpen, setSearchOpen] = useState(false);
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <TopBar onSearch={() => setSearchOpen(true)} />
        <div className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1400px]">
            <Outlet />
          </div>
        </div>
      </SidebarInset>
      <CommandMenu open={searchOpen} onOpenChange={setSearchOpen} />
    </SidebarProvider>
  );
}
