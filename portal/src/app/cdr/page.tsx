import { apiFetch } from "@/lib/api";
import type { PaginatedCdrResponse } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { CdrFilter } from "@/components/cdr/cdr-filter";
import { PaginationControls } from "@/components/common/pagination";
import { PageHeader } from "@/components/common/page-header";
import { LocalTime } from "@/components/common/local-time";
import { getServerTimezone } from "@/lib/server-timezone";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

export const dynamic = "force-dynamic";

function resolveStatusVariant(status: string) {
  switch (status) {
    case "answered":
      return "default" as const;
    case "busy":
    case "failed":
      return "destructive" as const;
    case "cancelled":
    case "no_answer":
      return "secondary" as const;
    default:
      return "outline" as const;
  }
}

interface CdrPageProps {
  searchParams?: Promise<Record<string, string | string[]>>;
}

function getSearchParamValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export default async function CdrPage({ searchParams }: CdrPageProps) {
  const resolvedSearchParams = (await (searchParams ?? Promise.resolve({}))) as Record<string, string | string[]>;
  const pageParam = getSearchParamValue(resolvedSearchParams.page) ?? "1";
  const page = Math.max(1, Number.parseInt(pageParam, 10) || 1);
  const direction = getSearchParamValue(resolvedSearchParams.direction) ?? "";
  const callUuid = getSearchParamValue(resolvedSearchParams.callUuid) ?? "";

  const query = new URLSearchParams({ page: String(page), pageSize: "25" });
  if (direction) {
    query.set("direction", direction);
  }
  if (callUuid) {
    query.set("callUuid", callUuid);
  }

  const fallbackCdr: PaginatedCdrResponse = {
    items: [],
    total: 0,
    page,
    pageSize: 25,
  };

  const cdr = await apiFetch<PaginatedCdrResponse>(`/cdr?${query.toString()}`, {
    cache: "no-store",
    fallbackValue: fallbackCdr,
    suppressError: true,
    onError: (error) => console.warn("[cdr] Không thể tải CDR", error),
  });
  const recordingsBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || "http://localhost:3000";
  const cdrItems = cdr.items ?? fallbackCdr.items;
  const totalRecords = cdr.total ?? fallbackCdr.total;
  const currentPage = cdr.page ?? fallbackCdr.page;
  const currentPageSize = cdr.pageSize ?? fallbackCdr.pageSize;
  const timezone = await getServerTimezone();

  return (
    <div className="space-y-6">
      <PageHeader
        title="CDR"
        description="Lọc và tra cứu lịch sử cuộc gọi được lưu trong MySQL."
      />
      <Card>
        <CardHeader>
          <CardTitle>Bộ lọc</CardTitle>
        </CardHeader>
        <CardContent>
          <CdrFilter />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <CardTitle>Danh sách CDR</CardTitle>
          <PaginationControls page={currentPage} pageSize={currentPageSize} total={totalRecords} />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Call UUID</TableHead>
                  {/* <TableHead>Leg</TableHead> */}
                  <TableHead>Chiều</TableHead>
                  <TableHead>Từ</TableHead>
                  <TableHead>Đến</TableHead>
                  <TableHead>Thời lượng</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Bắt đầu</TableHead>
                  <TableHead>Trả lời</TableHead>
                  <TableHead>Kết thúc</TableHead>
                  <TableHead>Ghi âm</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cdrItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="truncate max-w-[150px]">
                      <Link href={`/cdr/${item.callUuid}`} className="text-primary hover:underline">
                        <Tooltip>
                          <TooltipTrigger>
                            <span className="truncate">{item.callUuid}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {item.callUuid}
                          </TooltipContent>
                        </Tooltip>
                      </Link>
                    </TableCell>
                    {/* <TableCell>
                      <Badge variant={item.leg === "A" ? "default" : "secondary"}>{item.leg ?? "-"}</Badge>
                    </TableCell> */}
                    <TableCell>{item.direction ?? "-"}</TableCell>
                    <TableCell>{item.fromNumber ?? "-"}</TableCell>
                    <TableCell>{item.toNumber ?? "-"}</TableCell>
                    <TableCell>
                      {item.durationSeconds}s
                      {item.billSeconds ? (
                        <span className="text-xs text-muted-foreground"> (bill {item.billSeconds}s)</span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant={resolveStatusVariant(item.finalStatus)}>{item.finalStatusLabel}</Badge>
                    </TableCell>
                    <TableCell>
                      <LocalTime value={item.startTime} serverTimezone={timezone} />
                    </TableCell>
                    <TableCell>
                      <LocalTime value={item.answerTime} serverTimezone={timezone} />
                    </TableCell>
                    <TableCell>
                      <LocalTime value={item.endTime} serverTimezone={timezone} />
                    </TableCell>
                    <TableCell>
                      {item.recordingUrl ? (
                        <audio
                          controls
                          preload="none"
                          className="h-8 max-w-[220px]"
                          src={new URL(item.recordingUrl, recordingsBaseUrl).toString()}
                        >
                          <Link href={new URL(item.recordingUrl, recordingsBaseUrl).toString()} target="_blank">
                            Tải xuống
                          </Link>
                        </audio>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {cdrItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground">
                      Không có dữ liệu.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
