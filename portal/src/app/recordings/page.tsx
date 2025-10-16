import { apiFetch, API_BASE_URL } from "@/lib/api";
import type { RecordingMetadata, RecordingStorageConfig, PaginatedResult, PortalUserSummary } from "@/lib/types";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RecordingsTable } from "@/components/recordings/recordings-table";
import { RecordingStorageSettings } from "@/components/recordings/recording-storage-settings";
import { PaginationControls } from "@/components/common/pagination";
import { cookies } from "next/headers";
import { parsePortalUserCookie } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

interface RecordingsPageProps {
  searchParams?: Promise<Record<string, string | string[]>>;
}

function getParam(value: string | string[] | undefined, fallback = "") {
  if (Array.isArray(value)) {
    return value[0] ?? fallback;
  }
  return value ?? fallback;
}

const PAGE_SIZE = 25;

export default async function RecordingsPage({ searchParams }: RecordingsPageProps) {
  const cookieStore = await cookies();
  const rawUser = cookieStore.get("portal_user")?.value ?? null;
  let currentUser = parsePortalUserCookie(rawUser);

  if (!currentUser) {
    currentUser = await apiFetch<PortalUserSummary | null>("/auth/profile", {
      cache: "no-store",
      fallbackValue: null,
      suppressError: true,
      onError: (error) => console.warn("[recordings] Không thể tải profile", error),
    });
  }

  const canManageRecordings = hasPermission(currentUser, "manage_recordings");
  if (!canManageRecordings) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Ghi âm"
          description="Bạn không có quyền truy cập trang quản lý ghi âm."
        />
      </div>
    );
  }

  const resolvedSearchParams = (await (searchParams ?? Promise.resolve({}))) as Record<
    string,
    string | string[]
  >;
  const pageParam = getParam(resolvedSearchParams.page, "1");
  const page = Math.max(1, Number.parseInt(pageParam, 10) || 1);
  const search = getParam(resolvedSearchParams.search).trim();

  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(PAGE_SIZE),
  });
  if (search) {
    query.set("search", search);
  }

  const fallbackRecordings: PaginatedResult<RecordingMetadata> = {
    items: [],
    total: 0,
    page,
    pageSize: PAGE_SIZE,
  };
  const fallbackStorageConfig: RecordingStorageConfig = {
    mode: "local",
  };

  const [recordings, storageConfig] = await Promise.all([
    apiFetch<PaginatedResult<RecordingMetadata>>(`/recordings?${query.toString()}`, {
      cache: "no-store",
      fallbackValue: fallbackRecordings,
      suppressError: true,
      onError: (error) => console.warn("[recordings] Không thể tải danh sách ghi âm", error),
    }),
    apiFetch<RecordingStorageConfig>("/settings/recordings-storage", {
      cache: "no-store",
      fallbackValue: fallbackStorageConfig,
      suppressError: true,
      onError: (error) => console.warn("[recordings] Không thể tải cấu hình lưu trữ", error),
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ghi âm"
        description="Danh sách các file ghi âm được FreeSWITCH lưu vào volume được cấu hình."
      />
      <RecordingStorageSettings initialConfig={storageConfig} />
      <Card className="glass-surface border-none">
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-lg font-semibold">Danh sách ghi âm</CardTitle>
          <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            {recordings.total} file
          </div>
        </CardHeader>
        <CardContent>
          <RecordingsTable
            recordings={recordings.items}
            apiBaseUrl={API_BASE_URL}
            storageConfig={storageConfig}
          />
          <div className="mt-6">
            <PaginationControls
              page={recordings.page}
              pageSize={recordings.pageSize}
              total={recordings.total}
              basePath="/recordings"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
