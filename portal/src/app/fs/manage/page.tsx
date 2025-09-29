import { apiFetch } from "@/lib/api";
import type {
  TenantSummary,
  ExtensionSummary,
  PaginatedResult,
  TenantLookupItem,
} from "@/lib/types";
import { DomainExtensionManager } from "@/components/fs/domain-extension-manager";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function ManagePage() {
  const [tenants, extensions, tenantOptions, metrics] = await Promise.all([
    apiFetch<PaginatedResult<TenantSummary>>("/tenants?page=1&pageSize=6", { cache: "no-store" }),
    apiFetch<PaginatedResult<ExtensionSummary>>("/extensions?page=1&pageSize=10", { cache: "no-store" }),
    apiFetch<TenantLookupItem[]>("/tenants/options", { cache: "no-store" }),
    apiFetch<{
      tenantCount: number;
      routingConfiguredCount: number;
      extensionCount: number;
      topTenant: { id: string; name: string; domain: string; extensionCount: number } | null;
    }>("/tenants/metrics", { cache: "no-store" }),
  ]);

  const tenantCount = metrics.tenantCount;
  const extensionCount = metrics.extensionCount;
  const tenantWithRouting = metrics.routingConfiguredCount;
  const avgExtensions = tenantCount > 0 ? (extensionCount / tenantCount).toFixed(1) : "0";
  const topTenant = metrics.topTenant;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quản lý Domain & Extension"
        description="Thêm mới, chỉnh sửa domain (tenant) và extension phục vụ FreeSWITCH."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="glass-surface border-none">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Số lượng tenant</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{tenantCount}</div>
            <p className="text-xs text-muted-foreground mt-1">{tenantWithRouting} tenant đã cấu hình routing.</p>
          </CardContent>
        </Card>
        <Card className="glass-surface border-none">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Số lượng extension</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{extensionCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Trung bình {avgExtensions} extension mỗi tenant.</p>
          </CardContent>
        </Card>
        <Card className="glass-surface border-none">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Tenant hoạt động nhất</CardTitle>
          </CardHeader>
          <CardContent>
            {topTenant ? (
              <div className="space-y-1">
                <div className="text-base font-semibold">{topTenant.name}</div>
                <p className="text-xs text-muted-foreground">{topTenant.domain}</p>
                <Badge variant="secondary" className="mt-2">
                  {topTenant.extensionCount} extension
                </Badge>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Chưa có dữ liệu tenant.</p>
            )}
          </CardContent>
        </Card>
      </div>
      <DomainExtensionManager
        initialTenants={tenants}
        initialExtensions={extensions}
        tenantOptions={tenantOptions}
      />
    </div>
  );
}
