"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
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
  LayoutDashboard,
  RadioTower,
  ScrollText,
  UserCog,
  Waves,
  Globe2,
} from "lucide-react"

interface NavItem {
  title: string
  description?: string
  href: string
  icon: LucideIcon
  exact?: boolean
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
      },
      {
        title: "Trạng thái",
        description: "Core & Sofia",
        href: "/fs/status",
        icon: Activity,
      },
      {
        title: "Kênh",
        description: "Phiên đang hoạt động",
        href: "/fs/channels",
        icon: Waves,
      },
      {
        title: "Cuộc gọi",
        description: "Theo dõi realtime",
        href: "/fs/calls",
        icon: Activity,
      },
      {
        title: "Đăng ký",
        description: "Thiết bị SIP",
        href: "/fs/registrations",
        icon: RadioTower,
      },
      {
        title: "Ghi âm",
        description: "Tệp lưu lại",
        href: "/recordings",
        icon: FileAudio,
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
      },
      {
        title: "Gateway / Trunk",
        description: "Kết nối Telco bên ngoài",
        href: "/fs/gateways",
        icon: Globe2,
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

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-4 px-3 pb-4 pt-6">
        <div className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-primary/15 via-primary/10 to-transparent px-3 py-2 text-sm shadow-sm">
          <div className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold shadow-md">
            PBX
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold">PBX Portal</span>
            <span className="text-xs text-muted-foreground">Giám sát FreeSWITCH</span>
          </div>
        </div>
        <SidebarInput placeholder="Tìm kiếm (Ctrl+B)" className="hidden h-9 md:block" />
      </SidebarHeader>
      <SidebarContent className="px-2 pb-6">
        {NAV_SECTIONS.map((section, index) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
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
                        tooltip={item.title}
                      >
                        <Link
                          href={item.href}
                          className="flex w-full items-center gap-3"
                        >
                          <Icon className="size-4 shrink-0" />
                          <div className="flex min-w-0 flex-col text-left leading-tight">
                            <span className="truncate font-medium">
                              {item.title}
                            </span>
                            {item.description ? (
                              <span className="text-xs text-muted-foreground group-data-[collapsible=icon]/sidebar-menu-button:hidden">
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
      <SidebarFooter className="px-3 pb-6 pt-4">
        <div className="rounded-lg border border-border/80 bg-card/80 px-3 py-3 text-xs text-muted-foreground shadow-sm">
          <p className="font-medium text-foreground">Trạng thái bảng điều khiển</p>
          <p>FreeSWITCH + NestJS + Next.js</p>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
