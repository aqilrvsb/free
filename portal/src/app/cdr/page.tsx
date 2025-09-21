import { apiFetch } from "@/lib/api";
import type { PaginatedCdrResponse } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { CdrFilter } from "@/components/cdr/cdr-filter";
import { PaginationControls } from "@/components/common/pagination";
import { PageHeader } from "@/components/common/page-header";

interface CdrPageProps {
  searchParams?: Record<string, string | string[]>;
}

function getSearchParamValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("vi-VN");
}

export default async function CdrPage({ searchParams = {} }: CdrPageProps) {
  const pageParam = getSearchParamValue(searchParams.page) ?? "1";
  const page = Math.max(1, Number.parseInt(pageParam, 10) || 1);
  const direction = getSearchParamValue(searchParams.direction) ?? "";
  const callUuid = getSearchParamValue(searchParams.callUuid) ?? "";

  const query = new URLSearchParams({ page: String(page), pageSize: "25" });
  if (direction) {
    query.set("direction", direction);
  }
  if (callUuid) {
    query.set("callUuid", callUuid);
  }

  const cdr = await apiFetch<PaginatedCdrResponse>(`/cdr?${query.toString()}`, { revalidate: 5 });
  const recordingsBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || "http://localhost:3000";

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
          <PaginationControls page={cdr.page} pageSize={cdr.pageSize} total={cdr.total} />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Call UUID</TableHead>
                  <TableHead>Leg</TableHead>
                  <TableHead>Chiều</TableHead>
                  <TableHead>Từ</TableHead>
                  <TableHead>Đến</TableHead>
                  <TableHead>Thời lượng</TableHead>
                  <TableHead>Bắt đầu</TableHead>
                  <TableHead>Trả lời</TableHead>
                  <TableHead>Kết thúc</TableHead>
                  <TableHead>Ghi âm</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cdr.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Link href={`/cdr/${item.callUuid}`} className="text-primary hover:underline">
                        {item.callUuid}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={item.leg === "A" ? "default" : "secondary"}>{item.leg ?? "-"}</Badge>
                    </TableCell>
                    <TableCell>{item.direction ?? "-"}</TableCell>
                    <TableCell>{item.fromNumber ?? "-"}</TableCell>
                    <TableCell>{item.toNumber ?? "-"}</TableCell>
                    <TableCell>
                      {item.durationSeconds}s
                      {item.billSeconds ? (
                        <span className="text-xs text-muted-foreground"> (bill {item.billSeconds}s)</span>
                      ) : null}
                    </TableCell>
                    <TableCell>{formatDate(item.startTime)}</TableCell>
                    <TableCell>{formatDate(item.answerTime)}</TableCell>
                    <TableCell>{formatDate(item.endTime)}</TableCell>
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
                {cdr.items.length === 0 && (
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
