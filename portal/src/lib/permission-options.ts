import type { PermissionKey } from "@/lib/permissions";
import type { PortalRoleSummary } from "@/lib/types";

export interface PermissionOption {
  key: PermissionKey;
  label: string;
  description?: string;
  group: string;
}

export const PERMISSION_OPTIONS: PermissionOption[] = [
{ key: "view_dashboard", label: "Xem Dashboard", description: "Truy cập trang tổng quan", group: "Giám sát" },
{ key: "view_cdr", label: "Xem CDR", description: "Truy cập nhật ký cuộc gọi", group: "Giám sát" },
{ key: "view_channels", label: "Xem trạng thái kênh", description: "Theo dõi channels và realtime calls", group: "Giám sát" },
{ key: "view_calls", label: "Xem cuộc gọi realtime", description: "Truy cập trang giám sát cuộc gọi", group: "Giám sát" },
{ key: "view_registrations", label: "Xem đăng ký SIP", description: "Truy cập trang theo dõi thiết bị SIP", group: "Giám sát" },
  { key: "view_recordings", label: "Xem ghi âm", description: "Truy cập danh sách file ghi âm", group: "Giám sát" },
  { key: "manage_tenants", label: "Quản lý tenant", description: "Thêm/sửa Domain & Extension", group: "Quản trị" },
  { key: "manage_portal_users", label: "Quản lý portal user", description: "Quản lý tài khoản đăng nhập", group: "Quản trị" },
  { key: "manage_roles", label: "Quản lý role", description: "Tạo và phân quyền role", group: "Quản trị" },
  { key: "manage_gateways", label: "Quản lý gateway", description: "Thêm/sửa gateway & trunk", group: "Quản trị" },
  { key: "manage_dialplan", label: "Quản lý dialplan", description: "Điều chỉnh quy tắc dialplan", group: "Quản trị" },
  { key: "manage_outbound", label: "Quản lý outbound", description: "Quy tắc gọi ra", group: "Quản trị" },
  { key: "manage_inbound", label: "Quản lý inbound", description: "Định tuyến DID vào", group: "Quản trị" },
  { key: "manage_ivr", label: "Quản lý IVR", description: "Kịch bản trả lời tự động", group: "Quản trị" },
  { key: "manage_settings", label: "Cấu hình hệ thống", description: "Thay đổi cấu hình FreeSWITCH", group: "Quản trị" },
  { key: "manage_recordings", label: "Quản lý ghi âm", description: "Xử lý ghi âm hệ thống", group: "Quản trị" },
  { key: "manage_extensions", label: "Quản lý extension", description: "Thêm/sửa/xoá máy nhánh SIP", group: "Quản trị" },
  { key: "manage_security", label: "Quản lý bảo mật", description: "Quản lý Fail2Ban & firewall", group: "Quản trị" },
  { key: "view_billing", label: "Xem billing", description: "Xem báo cáo cước và số dư", group: "Quản trị" },
  { key: "manage_agents", label: "Quản lý agent", description: "Gán extension, nhóm và KPI cho agent", group: "Quản trị" },
  { key: "manage_sub_agents", label: "Quản lý agent cấp dưới", description: "Tạo và quản lý agent thuộc quyền", group: "Quản trị" },
  { key: "manage_own_groups", label: "Quản lý nhóm của mình", description: "Tạo và chỉnh sửa nhóm agent thuộc quyền", group: "Quản trị" },
  { key: "manage_billing", label: "Quản lý billing", description: "Cấu hình billing và xem báo cáo", group: "Quản trị" },
];

export const PERMISSION_KEYS = new Set<PermissionKey>(PERMISSION_OPTIONS.map((option) => option.key));

export function filterValidPermissions(list: string[] | undefined): PermissionKey[] {
  if (!Array.isArray(list)) {
    return [];
  }
  const normalized = new Set<PermissionKey>();
  list.forEach((item) => {
    if (typeof item === "string" && PERMISSION_KEYS.has(item as PermissionKey)) {
      normalized.add(item as PermissionKey);
    }
  });
  return Array.from(normalized.values());
}

export const FALLBACK_ROLE_DEFS: PortalRoleSummary[] = [
  {
    key: "viewer",
    name: "Viewer",
    description: "Chỉ xem dashboard, CDR, recordings",
    permissions: ["view_dashboard", "view_cdr", "view_recordings", "view_channels", "view_calls", "view_registrations", "view_billing"],
    isSystem: true,
  },
  {
    key: "operator",
    name: "Operator",
    description: "Quản lý inbound/outbound, IVR và recordings",
    permissions: [
      "view_dashboard",
      "view_cdr",
      "view_recordings",
      "view_channels",
      "view_calls",
      "view_registrations",
      "view_billing",
      "manage_inbound",
      "manage_outbound",
      "manage_ivr",
    ],
    isSystem: true,
  },
  {
    key: "tenant_admin",
    name: "Tenant Administrator",
    description: "Quản trị tenant trong phạm vi được chỉ định",
    permissions: [
      "view_dashboard",
      "view_cdr",
      "view_recordings",
      "view_channels",
      "view_calls",
      "view_registrations",
      "manage_gateways",
      "manage_dialplan",
      "manage_inbound",
      "manage_outbound",
      "view_billing",
      "manage_ivr",
      "manage_extensions",
      "manage_agents",
      "manage_sub_agents",
      "manage_own_groups",
    ],
    isSystem: true,
  },
  {
    key: "super_admin",
    name: "Super Administrator",
    description: "Toàn quyền quản trị hệ thống",
    permissions: [
      "view_dashboard",
      "view_cdr",
      "view_recordings",
      "view_channels",
      "view_calls",
      "view_registrations",
      "manage_gateways",
      "manage_tenants",
      "manage_dialplan",
      "manage_inbound",
      "manage_outbound",
      "view_billing",
      "manage_billing",
      "manage_ivr",
      "manage_settings",
      "manage_recordings",
      "manage_extensions",
      "manage_portal_users",
      "manage_roles",
      "manage_security",
      "manage_agents",
      "manage_sub_agents",
      "manage_own_groups",
    ],
    isSystem: true,
  },
  {
    key: "agent_lead",
    name: "Agent Lead",
    description: "Quản lý agent cấp dưới và nhóm của mình",
    permissions: [
      "view_dashboard",
      "view_cdr",
      "view_recordings",
      "view_channels",
      "view_registrations",
      "manage_agents",
      "manage_portal_users",
      "manage_sub_agents",
      "manage_own_groups",
    ],
    isSystem: true,
  },
  {
    key: "agent",
    name: "Agent",
    description: "Xem KPI và lịch sử cuộc gọi cá nhân",
    permissions: ["view_dashboard", "view_cdr", "view_recordings"],
    isSystem: true,
  },
];
