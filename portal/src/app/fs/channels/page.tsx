import { apiFetch } from "@/lib/api";
import type { CommandResult, FsChannelList } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/common/page-header";
import { extractChannelRows, extractChannelCount } from "@/lib/channels";
import { LocalTime } from "@/components/common/local-time";
import { getServerTimezone } from "@/lib/server-timezone";

export const dynamic = "force-dynamic";

export default async function ChannelsPage() {
  const channels = await apiFetch<CommandResult<FsChannelList>>("/fs/channels", { cache: "no-store" });
  const items = extractChannelRows(channels.parsed);
  const total = extractChannelCount(channels.parsed);
  const timezone = await getServerTimezone();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kênh hoạt động"
        description="Danh sách các cuộc gọi/phiên đang mở trên FreeSWITCH."
      />
      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <CardTitle>Kênh đang hoạt động</CardTitle>
          <div className="text-sm text-muted-foreground">{total} kênh</div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>UUID</TableHead>
                  <TableHead>Chiều</TableHead>
                  <TableHead>Caller</TableHead>
                  <TableHead>Đích</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Bắt đầu</TableHead>
                  <TableHead>Ứng dụng</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((channel) => (
                  <TableRow key={channel.uuid}>
                    <TableCell className="font-mono text-xs">{channel.uuid}</TableCell>
                    <TableCell>{channel.direction}</TableCell>
                    <TableCell>
                      {channel.cid_name ? `${channel.cid_name} (${channel.cid_num})` : channel.cid_num || "-"}
                    </TableCell>
                    <TableCell>{channel.dest || "-"}</TableCell>
                    <TableCell>{channel.state}</TableCell>
                    <TableCell>
                      <LocalTime value={channel.created} serverTimezone={timezone} preset="datetime" />
                    </TableCell>
                    <TableCell>{channel.application || "-"}</TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      Không có kênh nào hoạt động.
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
