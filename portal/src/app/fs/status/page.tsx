import { apiFetch } from "@/lib/api";
import type { CommandResult, FsStatusParsed, FsStatusResponse } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/common/page-header";

export const dynamic = "force-dynamic";

export default async function FsStatusPage() {
  const fallbackStatus: FsStatusResponse = {
    raw: "",
    parsed: {
      state: "Không rõ",
      uptime: "-",
      sessionsSinceStartup: "0",
      sessionPeak: "0",
      sessionRate: "0",
      maxSessions: "0",
      minIdleCpu: "0",
      stackUsage: "0",
    },
  };
  const fallbackSofia: CommandResult = {
    raw: "",
    parsed: {},
  };

  const [status, sofia] = await Promise.all([
    apiFetch<FsStatusResponse>("/fs/status", {
      cache: "no-store",
      fallbackValue: fallbackStatus,
      suppressError: true,
      onError: (error) => console.warn("[fs status] Không thể tải core status", error),
    }),
    apiFetch<CommandResult>("/fs/sofia", {
      cache: "no-store",
      fallbackValue: fallbackSofia,
      suppressError: true,
      onError: (error) => console.warn("[fs status] Không thể tải sofia jsonstatus", error),
    }),
  ]);

  const parsed = status.parsed ?? ({} as FsStatusParsed);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trạng thái FreeSWITCH"
        description="Theo dõi thông số core và phản hồi từ lệnh sofia jsonstatus."
      />
      <Card>
        <CardHeader>
          <CardTitle>Core status</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              <TableRow>
                <TableHead>Trạng thái</TableHead>
                <TableCell>{parsed.state || "-"}</TableCell>
              </TableRow>
              <TableRow>
                <TableHead>Uptime</TableHead>
                <TableCell>{parsed.uptime || "-"}</TableCell>
              </TableRow>
              <TableRow>
                <TableHead>Số phiên từ khi khởi động</TableHead>
                <TableCell>{parsed.sessionsSinceStartup || "-"}</TableCell>
              </TableRow>
              <TableRow>
                <TableHead>Đỉnh phiên</TableHead>
                <TableCell>{parsed.sessionPeak || "-"}</TableCell>
              </TableRow>
              <TableRow>
                <TableHead>Tốc độ phiên</TableHead>
                <TableCell>{parsed.sessionRate || "-"}</TableCell>
              </TableRow>
              <TableRow>
                <TableHead>Max sessions</TableHead>
                <TableCell>{parsed.maxSessions || "-"}</TableCell>
              </TableRow>
              <TableRow>
                <TableHead>CPU dự phòng tối thiểu</TableHead>
                <TableCell>{parsed.minIdleCpu || "-"}</TableCell>
              </TableRow>
              <TableRow>
                <TableHead>Stack usage</TableHead>
                <TableCell>{parsed.stackUsage || "-"}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sofia jsonstatus (tóm tắt)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <pre className="bg-muted rounded-md p-4 text-xs overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(sofia.parsed, null, 2)}
          </pre>
          <details>
            <summary className="cursor-pointer text-sm text-primary">Xem raw response</summary>
            <pre className="bg-muted rounded-md p-4 text-xs overflow-x-auto whitespace-pre-wrap mt-2">
              {sofia.raw}
            </pre>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}
