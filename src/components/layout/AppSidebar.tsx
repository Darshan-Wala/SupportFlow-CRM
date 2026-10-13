import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  AlertTriangle,
  BarChart3,
  ChevronsUpDown,
  CircleUser,
  Inbox,
  LayoutDashboard,
  LogOut,
  Moon,
  Settings,
  Sun,
  Ticket,
  UserX,
  Users,
  Zap,
} from "lucide-react";
import { UserAvatar } from "@/components/common/misc";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { logout, useMe } from "@/lib/auth";
import { dashboardQuery } from "@/lib/queries";
import { useTheme } from "@/lib/theme";
import { Logo } from "./Logo";

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.searchStr });
  const { data } = useQuery(dashboardQuery);
  const { user, workspace } = useMe();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const { setOpenMobile, state } = useSidebar();
  const c = data?.counts;

  const close = () => setOpenMobile(false);
  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  const main = [
    { title: "Dashboard", to: "/", icon: LayoutDashboard },
    { title: "Tickets", to: "/tickets", icon: Ticket, badge: c?.active },
    { title: "Customers", to: "/customers", icon: Users },
    { title: "Analytics", to: "/analytics", icon: BarChart3 },
  ] as const;

  const views = [
    { title: "My open tickets", icon: CircleUser, search: { assignee: "me", status: ["Open", "In Progress", "Pending"] }, badge: c?.mine, key: "assignee=me" },
    { title: "Unassigned", icon: UserX, search: { assignee: "unassigned", status: ["Open", "In Progress", "Pending"] }, badge: c?.unassigned, key: "assignee=unassigned" },
    { title: "Urgent", icon: Zap, search: { priority: ["Urgent"], status: ["Open", "In Progress", "Pending"] }, badge: c?.urgent, key: "priority=" },
    { title: "SLA breached", icon: AlertTriangle, search: { sla: "breached", status: ["Open", "In Progress", "Pending"] }, badge: c?.breached, key: "sla=breached" },
  ] as const;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-14 justify-center border-b px-3">
        <Link to="/" onClick={close}>
          <Logo collapsed={state === "collapsed"} />
        </Link>
      </SidebarHeader>

      <SidebarContent className="pt-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {main.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild isActive={isActive(item.to) && !(item.to === "/tickets" && views.some((v) => search.includes(v.key)))} tooltip={item.title}>
                    <Link to={item.to} onClick={close}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                  {"badge" in item && !!item.badge && <SidebarMenuBadge className="tabular">{item.badge}</SidebarMenuBadge>}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Views</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {views.map((v) => (
                <SidebarMenuItem key={v.title}>
                  <SidebarMenuButton
                    asChild
                    tooltip={v.title}
                    isActive={pathname === "/tickets" && search.includes(v.key)}
                  >
                    <Link to="/tickets" search={v.search as never} onClick={close}>
                      <v.icon />
                      <span>{v.title}</span>
                    </Link>
                  </SidebarMenuButton>
                  {!!v.badge && (
                    <SidebarMenuBadge className={v.title === "SLA breached" ? "tabular text-destructive" : "tabular"}>
                      {v.badge}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/settings")} tooltip="Settings">
                  <Link to="/settings" onClick={close}>
                    <Settings />
                    <span>Settings</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
                  <UserAvatar name={user.name} className="size-8" />
                  <div className="grid flex-1 text-left leading-tight">
                    <span className="truncate text-sm font-medium">{user.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{workspace?.name}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-60">
                <DropdownMenuLabel className="font-normal">
                  <p className="text-sm font-medium">{user.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate({ to: "/settings" })}>
                  <CircleUser className="mr-2 size-4" /> Profile & workspace
                </DropdownMenuItem>
                <DropdownMenuItem onClick={toggle}>
                  {theme === "dark" ? <Sun className="mr-2 size-4" /> : <Moon className="mr-2 size-4" />}
                  {theme === "dark" ? "Light mode" : "Dark mode"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate({ to: "/tickets", search: { status: ["Open"] } as never })}>
                  <Inbox className="mr-2 size-4" /> Open queue
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => {
                    logout();
                    navigate({ to: "/login" });
                  }}
                >
                  <LogOut className="mr-2 size-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
