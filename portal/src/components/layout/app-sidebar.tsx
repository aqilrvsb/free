"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
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
} from "@/components/ui/sidebar"
import type { LucideIcon } from "lucide-react"
import {
  Activity,
  FileAudio,
  GitBranch,
  Globe2,
  LayoutDashboard,
  PhoneIncoming,
  RadioTower,
  ScrollText,
  UserCog,
  Users,
  Waves,
  Settings,
  Workflow,
  ShieldCheck,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"

type NavRole = string;

type PermissionKey =
  | "view_dashboard"
  | "view_cdr"
  | "view_recordings"
  | "view_channels"
  | "manage_gateways"
  | "manage_tenants"
  | "manage_dialplan"
  | "manage_inbound"
  | "manage_outbound"
  | "manage_ivr"
  | "manage_settings"
  | "manage_recordings"
  | "manage_portal_users"
  | "manage_roles";

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
          permission: "view_channels",
        },
        {
          title: "Đăng ký",
          description: "Thiết bị SIP",
          href: "/fs/registrations",
          icon: RadioTower,
          permission: "view_channels",
        },
        {
          title: "Ghi âm",
          description: "Tệp lưu lại",
          href: "/recordings",
          icon: FileAudio,
          permission: "view_recordings",
        },
      ],
    },
    {
      label: "Quản trị",
      items: [
        {
          title: "Domain & Extension",
          description: "Thiết lập tenant và máy nhánh",
          href: "/fs/manage",
          icon: UserCog,
          roles: ["admin"],
          permission: "manage_tenants",
        },
        {
          title: "Portal Users",
          description: "Quản lý tài khoản đăng nhập",
          href: "/admin/users",
          icon: Users,
          roles: ["admin"],
          permission: "manage_portal_users",
        },
        {
          title: "Role & Quyền",
          description: "Tạo role và phân quyền",
          href: "/admin/roles",
          icon: ShieldCheck,
          roles: ["admin"],
          permission: "manage_roles",
        },
        {
          title: "Gateway / Trunk",
          description: "Kết nối Telco bên ngoài",
          href: "/fs/gateways",
          icon: Globe2,
          roles: ["admin"],
          permission: "manage_gateways",
        },
        {
          title: "Dialplan",
          description: "Quy tắc gọi nội bộ & outbound",
          href: "/fs/dialplan",
          icon: GitBranch,
          roles: ["admin"],
          permission: "manage_dialplan",
        },
        {
          title: "Outbound Routing",
          description: "Quy tắc gọi ra ngoài",
          href: "/fs/outbound",
          icon: RadioTower,
          roles: ["admin"],
          permission: "manage_outbound",
        },
        {
          title: "Inbound Routing",
          description: "Định tuyến DID vào",
          href: "/fs/inbound",
          icon: PhoneIncoming,
          roles: ["admin", "operator"],
          permission: "manage_inbound",
        },
        {
          title: "IVR",
          description: "Kịch bản trả lời tự động",
          href: "/fs/ivr",
          icon: Workflow,
          roles: ["admin", "operator"],
          permission: "manage_ivr",
        },
        {
          title: "FS Settings",
          description: "Điều chỉnh port & kết nối",
          href: "/fs/settings",
          icon: Settings,
          roles: ["admin"],
          permission: "manage_settings",
        },
        {
          title: "System Recordings",
          description: "Kho âm thanh dùng chung",
          href: "/fs/system-recordings",
          icon: FileAudio,
          roles: ["admin", "operator"],
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
  return items.filter((item) => {
    const roleAllowed = !item.roles || item.roles.length === 0 || Boolean(userRole && item.roles.includes(userRole))
    const permissionAllowed = !item.permission || Boolean(permissions?.[item.permission])
    return roleAllowed && permissionAllowed
  })
}

export function AppSidebar({ userRole, isAuthenticated, permissions }: AppSidebarProps) {
  const pathname = usePathname()
  const sections = NAV_SECTIONS.map((section) => ({
    label: section.label,
    items: filterNavItems(section.items, userRole, isAuthenticated, permissions),
  })).filter((section) => section.items.length > 0)

  return (
    <Sidebar collapsible="icon" className="backdrop-blur-xl">
      <SidebarHeader className="gap-4 px-3 pb-4 pt-6">
        <div className="glass-surface relative overflow-hidden rounded-2xl px-3 py-3">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/25 via-orange-400/15 to-transparent" />
          <div className="relative flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-full border border-primary/40 bg-primary/90 text-primary-foreground font-semibold shadow-lg shadow-primary/30">
                PBX
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold tracking-tight">PBX Portal</span>
                <span className="text-xs text-muted-foreground">Giám sát FreeSWITCH realtime</span>
              </div>
            </div>
          </div>
          <div className="w-full flex justify-end pt-2">
            <Badge variant="secondary" className="border border-primary/30 bg-primary/10 text-xs font-medium text-primary">
              Stable · v1.0
            </Badge>
          </div>
        </div>
        <SidebarInput
          placeholder="Tìm kiếm (Ctrl+B)"
          className="hidden h-9 rounded-xl border border-border/70 bg-white/70 text-sm placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-primary/60 md:block"
        />
      </SidebarHeader>
      <SidebarContent className="space-y-6 px-2 pb-6">
        {sections.map((section, index) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel className="px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/65">
              {section.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
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
                        <Link
                          href={item.href}
                          className="flex w-full items-center gap-3"
                        >
                          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary group-data-[active=true]/sidebar-menu-button:bg-primary group-data-[active=true]/sidebar-menu-button:text-primary-foreground">
                            <Icon className="size-4" />
                          </span>
                          <div className="flex min-w-0 flex-col text-left leading-tight">
                            <span className="truncate text-sm font-medium">
                              {item.title}
                            </span>
                            {item.description ? (
                              <span className="text-xs text-muted-foreground group-data-[collapsible=icon]/sidebar-menu-button:hidden truncate">
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
            {index < NAV_SECTIONS.length - 1 ? <SidebarSeparator /> : null}
          </SidebarGroup>
        ))}
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
