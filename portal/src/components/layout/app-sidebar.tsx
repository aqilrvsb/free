"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { cn } from "@/lib/utils"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar"
import type { LucideIcon } from "lucide-react"
import {
  ChevronDown,
  Activity,
  FileAudio,
  GitBranch,
  LayoutDashboard,
  PhoneIncoming,
  PhoneOutgoing,
  RadioTower,
  ScrollText,
  UserCog,
  Users,
  Waves,
  Settings,
  Workflow,
  ShieldCheck,
  PhoneCall,
  ShieldAlert,
  DollarSign,
} from "lucide-react"

type NavRole = string;

type PermissionKey =
  | "view_dashboard"
  | "view_cdr"
  | "view_recordings"
  | "view_channels"
  | "view_calls"
  | "view_registrations"
  | "view_billing"
  | "manage_gateways"
  | "manage_tenants"
  | "manage_dialplan"
  | "manage_inbound"
  | "manage_outbound"
  | "manage_ivr"
  | "manage_settings"
  | "manage_recordings"
  | "manage_extensions"
  | "manage_portal_users"
  | "manage_roles"
  | "manage_security"
  | "manage_billing"
  | "manage_agents";

interface NavItem {
  title: string
  description?: string
  href: string
  icon: LucideIcon
  exact?: boolean
  roles?: NavRole[]
  permission?: PermissionKey
}

const NAV_SECTIONS: Array<{
  label: string
  items: NavItem[]
}> = [
    {
      label: "Tổng quan",
      items: [
        {
          title: "Dashboard",
          description: "Bảng điều khiển thời gian thực",
          href: "/",
          icon: LayoutDashboard,
          exact: true,
        },
      ],
    },
    {
      label: "Giám sát",
      items: [
        {
          title: "CDR",
          description: "Nhật ký cuộc gọi",
          href: "/cdr",
          icon: ScrollText,
          permission: "view_cdr",
        },
        {
          title: "Trạng thái",
          description: "Core & Sofia",
          href: "/fs/status",
          icon: Activity,
          permission: "view_channels",
        },
        {
          title: "Kênh",
          description: "Phiên đang hoạt động",
          href: "/fs/channels",
          icon: Waves,
          permission: "view_channels",
        },
        {
          title: "Cuộc gọi",
          description: "Theo dõi realtime",
          href: "/fs/calls",
          icon: Activity,
          permission: "view_calls",
        },
        {
          title: "Đăng ký",
          description: "Thiết bị SIP",
          href: "/fs/registrations",
          icon: RadioTower,
          permission: "view_registrations",
        },
      ],
    },
    {
      label: "Quản trị",
      items: [
        {
          title: "Domains",
          description: "Quản lý tenant & cấu hình dialplan",
          href: "/fs/manage",
          icon: UserCog,
          roles: ["super_admin"],
          permission: "manage_tenants",
        },
        {
          title: "Extensions",
          description: "Quản lý danh sách máy nhánh",
          href: "/fs/extensions",
          icon: PhoneCall,
          // roles: ["super_admin", "tenant_admin", "agent_lead"],
          permission: "manage_extensions",
        },
        {
          title: "Agents",
          description: "Gán extension & KPI",
          href: "/fs/agents",
          icon: Workflow,
          // roles: ["super_admin", "tenant_admin", "agent_lead"],
          permission: "manage_agents",
        },
        {
          title: "Auto Dialer",
          description: "Chiến dịch gọi tự động",
          href: "/fs/auto-dialer",
          icon: Workflow,
          // roles: ["super_admin", "tenant_admin", "operator"],
          permission: "manage_outbound",
        },
        {
          title: "Portal Users",
          description: "Quản lý tài khoản đăng nhập",
          href: "/admin/users",
          icon: Users,
          // roles: ["super_admin", "tenant_admin", "agent_lead"],
          permission: "manage_portal_users",
        },
        {
          title: "Role & Quyền",
          description: "Tạo role và phân quyền",
          href: "/admin/roles",
          icon: ShieldCheck,
          roles: ["super_admin"],
          permission: "manage_roles",
        },
        {
          title: "Gateway / Trunk",
          description: "Kết nối Telco bên ngoài",
          href: "/fs/gateways",
          icon: RadioTower,
          roles: ["super_admin"],
          permission: "manage_gateways",
        },
        {
          title: "Dialplan",
          description: "Quy tắc gọi nội bộ & outbound",
          href: "/fs/dialplan",
          icon: GitBranch,
          roles: ["super_admin"],
          permission: "manage_dialplan",
        },
        {
          title: "Outbound Routing",
          description: "Quy tắc gọi ra ngoài",
          href: "/fs/outbound",
          icon: PhoneOutgoing,
          roles: ["super_admin", "tenant_admin"],
          permission: "manage_outbound",
        },
        {
          title: "Caller ID Pool",
          description: "Quản lý Caller ID quay ra",
          href: "/fs/outbound/caller-ids",
          icon: PhoneCall,
          roles: ["super_admin", "tenant_admin"],
          permission: "manage_outbound",
        },
        {
          title: "Billing",
          description: "Cước gọi và cấu hình billing",
          href: "/fs/billing",
          icon: DollarSign,
          // roles: ["super_admin", "tenant_admin"],
          permission: "view_billing",
        },
        {
          title: "Inbound Routing",
          description: "Định tuyến DID vào",
          href: "/fs/inbound",
          icon: PhoneIncoming,
          roles: ["super_admin", "tenant_admin", "operator"],
          permission: "manage_inbound",
        },
        {
          title: "IVR",
          description: "Kịch bản trả lời tự động",
          href: "/fs/ivr",
          icon: Workflow,
          roles: ["super_admin", "tenant_admin", "operator"],
          permission: "manage_ivr",
        },
        {
          title: "FS Settings",
          description: "Điều chỉnh port & kết nối",
          href: "/fs/settings",
          icon: Settings,
          roles: ["super_admin", "tenant_admin"],
          permission: "manage_settings",
        },
        {
          title: "Security",
          description: "Fail2Ban & firewall",
          href: "/security",
          icon: ShieldAlert,
          roles: ["super_admin"],
          permission: "manage_security",
        },
        {
          title: "System Recordings",
          description: "Kho âm thanh dùng chung",
          href: "/fs/system-recordings",
          icon: FileAudio,
          roles: ["super_admin", "tenant_admin", "operator"],
          permission: "manage_recordings",
        },
        {
          title: "Recordings",
          description: "Tệp ghi âm cuộc gọi",
          href: "/recordings",
          icon: FileAudio,
          permission: "manage_recordings",
        },
      ],
    },
  ]

function isActivePath(pathname: string, item: NavItem) {
  if (item.exact) {
    return pathname === item.href
  }
  if (item.href === "/") {
    return pathname === "/"
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}

interface AppSidebarProps {
  userRole?: NavRole
  isAuthenticated?: boolean
  permissions?: Record<PermissionKey, boolean>
}

function filterNavItems(
  items: NavItem[],
  userRole?: NavRole,
  isAuthenticated?: boolean,
  permissions?: Record<PermissionKey, boolean>,
) {
  if (!isAuthenticated) {
    return []
  }
  const normalizedRole = userRole === "admin" ? "super_admin" : userRole
  return items.filter((item) => {
    const roleAllowed =
      !item.roles || item.roles.length === 0 || Boolean(normalizedRole && item.roles.includes(normalizedRole))
    const permissionAllowed = !item.permission || Boolean(permissions?.[item.permission])
    return roleAllowed && permissionAllowed
  })
}

export function AppSidebar({ userRole, isAuthenticated, permissions }: AppSidebarProps) {
  const pathname = usePathname()
  const { open } = useSidebar()
  const sections = NAV_SECTIONS.map((section) => ({
    label: section.label,
    items: filterNavItems(section.items, userRole, isAuthenticated, permissions),
  })).filter((section) => section.items.length > 0)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})

  return (
    <Sidebar
      collapsible="icon"
      className="backdrop-blur-xl border-r border-border/60 bg-background/85 supports-[backdrop-filter]:bg-background/70"
    >
      <SidebarHeader
        data-active={open}
        className="gap-4 rounded-3xl border border-border/50 bg-background/75 px-2 pb-4 pt-6 shadow-sm data-[active=true]:px-4"
      >
        {open ? (
          <div className="relative flex items-center gap-3 overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/15 via-primary/10 to-transparent px-4 py-3">
            <div className="flex size-9 items-center justify-center rounded-full border border-primary/40 bg-primary/90 text-primary-foreground font-semibold shadow-lg shadow-primary/30">
              PBX
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold tracking-tight">PBX Portal</span>
              <span className="text-xs text-muted-foreground">FreeSWITCH realtime</span>
            </div>
          </div>
        ) : (
          <div className="flex size-10 items-center justify-center rounded-2xl border border-primary/30 bg-primary/90 text-primary-foreground font-semibold shadow-lg shadow-primary/30">
            PBX
          </div>
        )}
        <SidebarInput
          placeholder="Tìm kiếm (Ctrl+B)"
          className="hidden h-9 rounded-xl border border-border/70 bg-white/70 text-sm placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-primary/60 md:block"
        />
      </SidebarHeader>
      <SidebarContent className="space-y-4 px-2 pb-6">
        {sections.map((section, index) => {
          const defaultExpanded = index === 0
          const resolved = expandedSections[section.label]
          const isExpanded = open ? (resolved ?? defaultExpanded) : false
          const showContent = !open || isExpanded
          return (
            <SidebarGroup key={section.label} data-open={showContent}>
              <SidebarGroupLabel asChild>
                <button
                  type="button"
                  className="group flex w-full items-center justify-between rounded-xl px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/70 transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  onClick={() =>
                    setExpandedSections((prev) => {
                      const current = prev[section.label]
                      const next = current ?? defaultExpanded
                      return { ...prev, [section.label]: !next }
                    })
                  }
                >
                  <span className="truncate">{section.label}</span>
                  <ChevronDown
                    className={cn(
                      "size-4 shrink-0 transition-transform duration-200",
                      showContent && open ? "rotate-0" : "-rotate-90",
                    )}
                  />
                </button>
              </SidebarGroupLabel>
              <SidebarGroupContent
                className={cn(
                  "space-y-1 transition-all duration-200",
                  open && !showContent && "pointer-events-none max-h-0 overflow-hidden opacity-0",
                )}
              >
                <SidebarMenu>
                  {section.items.map((item) => {
                    const Icon = item.icon
                    const active = isActivePath(pathname, item)
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          className="group relative overflow-hidden rounded-xl border border-transparent bg-transparent ring-0 transition-all duration-200 ease-out hover:border-primary/40 hover:bg-primary/10 hover:pl-3 data-[active=true]:border-primary/60 data-[active=true]:bg-primary/15 data-[active=true]:pl-3 py-5"
                          tooltip={item.title}
                        >
                          <Link href={item.href} className="flex w-full items-center gap-3">
                            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary group-data-[active=true]/sidebar-menu-button:bg-primary group-data-[active=true]/sidebar-menu-button:text-primary-foreground">
                              <Icon className="size-4" />
                            </span>
                            <div className="flex min-w-0 flex-col text-left leading-tight">
                              <span className="truncate text-sm font-medium">{item.title}</span>
                              {item.description ? (
                                <span className="truncate text-xs text-muted-foreground group-data-[collapsible=icon]/sidebar-menu-button:hidden">
                                  {item.description}
                                </span>
                              ) : null}
                            </div>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
              {index < sections.length - 1 ? <SidebarSeparator /> : null}
            </SidebarGroup>
          )
        })}
      </SidebarContent>
      {/* <SidebarFooter className="px-3 pb-6 pt-4">
        <div className="glass-surface relative overflow-hidden rounded-2xl px-4 py-4 text-xs text-muted-foreground">
          <div className="absolute inset-0 bg-gradient-to-tr from-orange-500/15 via-transparent to-transparent" />
          <div className="relative flex flex-col gap-2">
            <p className="text-sm font-semibold text-foreground">Trung tâm điều hành PBX</p>
            <p className="leading-relaxed">
              FreeSWITCH · NestJS · Next.js được đồng bộ realtime.
            </p>
            <Link
              href="/fs/status"
              className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
            >
              Xem trạng thái hệ thống
            </Link>
          </div>
        </div>
      </SidebarFooter> */}
      <SidebarRail />
    </Sidebar>
  )
}
