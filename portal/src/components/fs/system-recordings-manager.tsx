"use client";

import { useMemo, useState } from "react";
import type { SystemRecordingSummary } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { resolveClientBaseUrl } from "@/lib/browser";
import { buildAuthHeaders } from "@/lib/client-auth";
import { displayError, displaySuccess, displayWarning } from "@/lib/toast";

interface SystemRecordingsManagerProps {
  initialRecordings: SystemRecordingSummary[];
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("vi-VN");
}

export function SystemRecordingsManager({ initialRecordings }: SystemRecordingsManagerProps) {
  const [recordings, setRecordings] = useState<SystemRecordingSummary[]>(initialRecordings);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const apiBase = useMemo(
    () => resolveClientBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL),
    [],
  );

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setSelectedFile(file ?? null);
    if (file && !name.trim()) {
      setName(file.name.replace(/\.[^/.]+$/, ""));
    }
  };

  const resetUpload = () => {
    setSelectedFile(null);
    setName("");
    const input = document.getElementById("system-recording-file") as HTMLInputElement | null;
    if (input) {
      input.value = "";
    }
  };

  const uploadRecording = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!apiBase || !selectedFile) {
      displayWarning("Vui lòng chọn file âm thanh");
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);
    if (name.trim()) {
      formData.append("name", name.trim());
    }

    setUploading(true);
    try {
      const response = await fetch(`${apiBase}/fs/system-recordings`, {
        method: "POST",
        body: formData,
        headers: buildAuthHeaders(),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const recording = (await response.json()) as SystemRecordingSummary;
      setRecordings((prev) => [recording, ...prev]);
      resetUpload();
      displaySuccess("Đã tải lên file ghi âm.");
    } catch (error) {
      console.error("Failed to upload system recording", error);
      displayError(error, "Không thể upload file. Vui lòng kiểm tra kích thước và định dạng.");
    } finally {
      setUploading(false);
    }
  };

  const removeRecording = async (recording: SystemRecordingSummary) => {
    if (!apiBase) return;
    if (!confirm(`Xóa file ${recording.name}?`)) {
      return;
    }
    try {
      const response = await fetch(`${apiBase}/fs/system-recordings/${recording.id}`, {
        method: "DELETE",
        headers: buildAuthHeaders(),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      setRecordings((prev) => prev.filter((item) => item.id !== recording.id));
      displaySuccess("Đã xóa file ghi âm.");
    } catch (error) {
      console.error("Failed to delete system recording", error);
      displayError(error, "Không thể xóa file. Vui lòng xem log backend.");
    }
  };

  const copyToClipboard = async (value?: string | null) => {
    if (!value) {
      displayWarning("Không có nội dung để sao chép.");
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      displaySuccess(`Đã sao chép: ${value}`);
    } catch (error) {
      console.error("Failed to copy", error);
      displayError(error, "Không thể sao chép vào clipboard.");
    }
  };

  return (
    <div className="space-y-6">
      <Card className="glass-surface border-none">
        <CardHeader>
          <CardTitle>Upload âm thanh mẫu</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={uploadRecording} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="system-recording-file">Chọn file âm thanh</Label>
              <Input
                id="system-recording-file"
                type="file"
                accept="audio/*"
                onChange={handleFile}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="system-recording-name">Tên hiển thị</Label>
              <Input
                id="system-recording-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ví dụ: Lời chào tổng đài"
              />
            </div>
            <div className="md:col-span-2 flex items-center gap-3">
              <Button type="submit" disabled={uploading || !selectedFile}>
                {uploading ? "Đang tải lên…" : "Tải lên"}
              </Button>
              <Button type="button" variant="ghost" onClick={resetUpload}>
                Hủy chọn
              </Button>
              <p className="text-xs text-muted-foreground">
                Hỗ trợ định dạng WAV/MP3 tối đa 20 MB. File sẽ được lưu tại $${'{recordings_dir}'}/system/... hoặc đồng bộ lên CDN tuỳ cấu hình.
              </p>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {recordings.map((recording) => {
          const downloadHref = `${apiBase}${recording.downloadUrl}`;
          const playbackValue = recording.playbackUrl ?? "";
          const storageLabel = recording.storageMode === "cdn" ? "CDN" : "Local";
          return (
            <Card key={recording.id} className="glass-surface border-none">
              <CardHeader className="flex flex-col gap-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span>{recording.name}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{formatBytes(recording.sizeBytes)}</Badge>
                    <Badge variant={recording.storageMode === "cdn" ? "default" : "outline"}>
                      {storageLabel}
                    </Badge>
                  </div>
                </CardTitle>
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>File gốc: {recording.originalFilename}</div>
                  <div>Thời gian: {formatDate(recording.createdAt)}</div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {playbackValue ? (
                  <div className="space-y-1">
                    <span className="text-muted-foreground">Playback path</span>
                    <div className="flex items-center gap-2">
                      <code className="rounded-xl bg-muted/70 px-2 py-1 text-xs">
                        {playbackValue}
                      </code>
                      <Button type="button" size="sm" variant="outline" onClick={() => void copyToClipboard(playbackValue)}>
                        Copy
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    Playback path chưa sẵn sàng.
                  </div>
                )}
                {recording.storageMode === "cdn" && recording.cdnUrl ? (
                  <div className="space-y-1">
                    <span className="text-muted-foreground">CDN URL</span>
                    <div className="flex items-center gap-2">
                      <code className="rounded-xl bg-muted/70 px-2 py-1 text-xs">
                        {recording.cdnUrl}
                      </code>
                      <Button type="button" size="sm" variant="outline" onClick={() => void copyToClipboard(recording.cdnUrl)}>
                        Copy
                      </Button>
                    </div>
                  </div>
                ) : null}
                <audio controls className="w-full rounded-xl bg-card/80">
                  <source src={downloadHref} type={recording.mimetype || 'audio/wav'} />
                  Trình duyệt của bạn không hỗ trợ phát audio.
                </audio>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" asChild>
                    <a href={downloadHref}>Tải về</a>
                  </Button>
                  <Button type="button" variant="destructive" size="sm" onClick={() => void removeRecording(recording)}>
                    Xóa
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {recordings.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border/80 bg-card/60 p-6 text-sm text-muted-foreground">
            Chưa có system recording nào. Hãy tải lên âm thanh để sử dụng trong IVR.
          </div>
        )}
      </div>
    </div>
  );
}
