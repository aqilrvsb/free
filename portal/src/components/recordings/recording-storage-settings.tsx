"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RecordingStorageConfig } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { displayError, displaySuccess } from "@/lib/toast";

interface RecordingStorageSettingsProps {
  initialConfig: RecordingStorageConfig;
}

export function RecordingStorageSettings({ initialConfig }: RecordingStorageSettingsProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"local" | "cdn">(initialConfig.mode);
  const [cdnBaseUrl, setCdnBaseUrl] = useState(
    initialConfig.cdnBaseUrl || initialConfig.aws?.cdnEndpoint || "",
  );
  const [provider, setProvider] = useState<"s3" | null>(
    initialConfig.mode === "cdn" ? initialConfig.provider ?? null : null,
  );
  type AwsField = "accessKeyId" | "secretAccessKey" | "endpoint" | "cdnEndpoint" | "region" | "bucketName";
  const [awsConfig, setAwsConfig] = useState<Record<AwsField, string>>({
    accessKeyId: initialConfig.aws?.accessKeyId ?? "",
    secretAccessKey: initialConfig.aws?.secretAccessKey ?? "",
    endpoint: initialConfig.aws?.endpoint ?? "",
    cdnEndpoint: initialConfig.aws?.cdnEndpoint ?? "",
    region: initialConfig.aws?.region ?? "",
    bucketName: initialConfig.aws?.bucketName ?? "",
  });
  const [loading, setLoading] = useState(false);

  const isCdnMode = mode === "cdn";

  const handleAwsChange = (field: AwsField, value: string) => {
    setAwsConfig((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);

    try {
      const payload: RecordingStorageConfig = { mode };

      if (isCdnMode) {
        const trimmedBase = cdnBaseUrl.trim();
        if (trimmedBase) {
          payload.cdnBaseUrl = trimmedBase;
        }

        if (provider) {
          payload.provider = provider;
        }

        if (provider === "s3") {
          payload.aws = {
            accessKeyId: awsConfig.accessKeyId.trim(),
            secretAccessKey: awsConfig.secretAccessKey.trim(),
            endpoint: awsConfig.endpoint.trim() || undefined,
            cdnEndpoint: awsConfig.cdnEndpoint.trim() || undefined,
            region: awsConfig.region.trim(),
            bucketName: awsConfig.bucketName.trim(),
          };

          if (!payload.cdnBaseUrl && payload.aws.cdnEndpoint) {
            payload.cdnBaseUrl = payload.aws.cdnEndpoint;
          }
        }
      }

      const result = await apiFetch<RecordingStorageConfig>("/settings/recordings-storage", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
        cache: "no-store",
      });

      setMode(result.mode);
      setCdnBaseUrl(result.cdnBaseUrl ?? result.aws?.cdnEndpoint ?? "");
      setProvider(result.mode === "cdn" ? result.provider ?? null : null);
      if (result.provider === "s3" && result.aws) {
        setAwsConfig({
          accessKeyId: result.aws.accessKeyId ?? "",
          secretAccessKey: result.aws.secretAccessKey ?? "",
          endpoint: result.aws.endpoint ?? "",
          cdnEndpoint: result.aws.cdnEndpoint ?? "",
          region: result.aws.region ?? "",
          bucketName: result.aws.bucketName ?? "",
        });
      } else {
        setAwsConfig({
          accessKeyId: "",
          secretAccessKey: "",
          endpoint: "",
          cdnEndpoint: "",
          region: "",
          bucketName: "",
        });
      }

      displaySuccess("Đã lưu cấu hình lưu trữ ghi âm.");
      router.refresh();
    } catch (err) {
      console.error("Failed to update recording storage", err);
      displayError(err, "Không thể lưu cấu hình. Vui lòng kiểm tra log.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="glass-surface space-y-4 rounded-2xl border-none p-5">
      <div>
        <h3 className="text-lg font-medium">Tuỳ chọn lưu trữ ghi âm</h3>
        <p className="text-sm text-muted-foreground">
          Chọn nơi phục vụ file ghi âm cho portal. Nếu chọn CDN, đảm bảo FreeSWITCH hoặc hệ thống đồng bộ sẽ tải ghi âm lên CDN theo đường dẫn tương ứng.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="recording-mode">Chế độ lưu trữ</Label>
          <select
            id="recording-mode"
            value={mode}
            onChange={(event) => setMode(event.target.value as 'local' | 'cdn')}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="local">Lưu và phát trực tiếp từ backend</option>
            <option value="cdn">Phục vụ file từ CDN</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="recording-cdn">CDN base URL</Label>
          <Input
            id="recording-cdn"
            value={cdnBaseUrl}
            onChange={(event) => setCdnBaseUrl(event.target.value)}
            placeholder="https://cdn.example.com/recordings"
            disabled={!isCdnMode}
          />
          <p className="text-xs text-muted-foreground">
            Sử dụng khi đã đồng bộ file ghi âm lên CDN. Ví dụ: https://cdn.example.com/recordings
          </p>
        </div>
      </div>

      {isCdnMode ? (
        <div className="space-y-4 rounded-md border border-dashed border-input/60 bg-muted/20 p-4">
          <div className="space-y-1">
            <h4 className="text-sm font-medium">Thiết lập CDN nâng cao</h4>
            <p className="text-xs text-muted-foreground">
              Chọn nhà cung cấp tương ứng khi cần lấy thông tin truy cập dịch vụ S3 hoặc tương thích (ví dụ: AWS S3, DigitalOcean Spaces, MinIO).
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="recording-provider">Nhà cung cấp</Label>
              <select
                id="recording-provider"
                value={provider ?? ''}
                onChange={(event) => setProvider(event.target.value ? 's3' : null)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Không dùng</option>
                <option value="s3">S3 / DigitalOcean Spaces / MinIO</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Để trống nếu chỉ cần cung cấp URL phát CDN.
              </p>
            </div>
          </div>

          {provider === 's3' ? (
            <div className="space-y-4 rounded-md border border-border/80 bg-background/60 p-4">
              <div className="space-y-1">
                <h5 className="text-sm font-medium">Thông tin kết nối S3</h5>
                <p className="text-xs text-muted-foreground">
                  Khớp với các biến môi trường AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_END_POINT, AWS_CDN_END_POINT, AWS_REGION và AWS_BUCKET_NAME.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="s3-access-key">Access key ID</Label>
                  <Input
                    id="s3-access-key"
                    value={awsConfig.accessKeyId}
                    onChange={(event) => handleAwsChange('accessKeyId', event.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="s3-secret-key">Secret access key</Label>
                  <Input
                    id="s3-secret-key"
                    type="password"
                    value={awsConfig.secretAccessKey}
                    onChange={(event) => handleAwsChange('secretAccessKey', event.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="s3-region">Region</Label>
                  <Input
                    id="s3-region"
                    value={awsConfig.region}
                    onChange={(event) => handleAwsChange('region', event.target.value)}
                    placeholder="sgp1"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="s3-bucket">Bucket name</Label>
                  <Input
                    id="s3-bucket"
                    value={awsConfig.bucketName}
                    onChange={(event) => handleAwsChange('bucketName', event.target.value)}
                    placeholder="villshipdev"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="s3-endpoint">S3 endpoint (tuỳ chọn)</Label>
                  <Input
                    id="s3-endpoint"
                    value={awsConfig.endpoint}
                    onChange={(event) => handleAwsChange('endpoint', event.target.value)}
                    placeholder="sgp1.digitaloceanspaces.com"
                  />
                  <p className="text-xs text-muted-foreground">
                    Bỏ trống khi dùng AWS S3 chuẩn.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="s3-cdn-endpoint">CDN endpoint (tuỳ chọn)</Label>
                  <Input
                    id="s3-cdn-endpoint"
                    value={awsConfig.cdnEndpoint}
                    onChange={(event) => handleAwsChange('cdnEndpoint', event.target.value)}
                    placeholder="https://sgp1.digitaloceanspaces.com/recordings"
                  />
                  <p className="text-xs text-muted-foreground">
                    Nếu bỏ trống, hệ thống sẽ dùng CDN base URL bên trên.
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={loading}>
          {loading ? "Đang lưu..." : "Lưu cấu hình"}
        </Button>
      </div>
    </form>
  );
}
