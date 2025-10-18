# External Extensions API

Các endpoint dưới đây dành cho service bên ngoài quản lý extension FreeSWITCH thông qua module `external/extensions`. Tất cả endpoint đều yêu cầu `X-API-Key` hoặc header `Authorization: Bearer <token>` tương ứng với giá trị cấu hình `EXTERNAL_EXTENSIONS_TOKEN` trong backend.

- Base URL: `https://<host>/external/extensions`
- Header bắt buộc: `X-API-Key: <token>` (hoặc `Authorization: Bearer <token>` nếu tích hợp dạng Bearer)
- Mọi payload đều sử dụng `application/json`

## 1. Tạo extension

```
POST /external/extensions
```

Body:

```json
{
  "id": "1001",
  "tenantId": "tenant1",
  "password": "optional",        // nếu bỏ trống hệ thống tự sinh
  "displayName": "Agent 1001"    // tuỳ chọn
}
```

Phản hồi `201 Created`:

```json
{
  "id": "1001",
  "tenantId": "tenant1",
  "displayName": "Agent 1001",
  "password": "p@ssW0rd",
  "tenantName": "Tenant One",
  "tenantDomain": "tenant1.local",
  "outboundProxy": "203.0.113.10"
  "createdAt": "2024-10-16T03:10:53.000Z",
  "updatedAt": "2024-10-16T03:10:53.000Z"
}
```

## 2. Lấy thông tin extension

```
GET /external/extensions/{id}
```

Query:

- `tenantId`: ưu tiên dùng để xác định extension.
- `tenantDomain`: dùng khi không có `tenantId`.

Ví dụ:

```
GET /external/extensions/1001?tenantId=tenant1
```

Phản hồi `200 OK` trả về cấu trúc như ở trên.

## 3. Cập nhật extension

```
PUT /external/extensions/{id}
```

Query: tương tự GET.

Body cho phép cập nhật `tenantId` (khi cần xác định), `password`, `displayName`.

```json
{
  "tenantId": "tenant1",
  "password": "NewPass123",
  "displayName": "Agent 1001 - Updated"
}
```

Phản hồi `200 OK` trả về thông tin extension mới nhất.

## 4. Xoá extension

```
DELETE /external/extensions/{id}
```

Query: `tenantId` hoặc `tenantDomain` để xác định extension cần xoá.

Phản hồi `200 OK`:

```json
{
  "success": true
}
```

Khi xoá, hệ thống sẽ tự động gỡ liên kết extension khỏi các agent liên quan trước khi xoá bản ghi.

## Ví dụ Curl

```bash
curl -X POST "https://api.example.com/external/extensions" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: <token>" \\
  -d '{
        "id": "1001",
        "tenantId": "tenant1",
        "password": "S1pSecret",
        "displayName": "Agent 1001"
      }'
```

```bash
curl -X DELETE "https://api.example.com/external/extensions/1001?tenantId=tenant1" \\
  -H "X-API-Key: <token>"
```

## Lưu ý

- `outboundProxy` ưu tiên đọc từ biến môi trường `EXTERNAL_EXTENSIONS_PROXY`. Nếu biến này trống, hệ thống sử dụng `EXT_SIP_IP` (khi giá trị không phải `auto/auto-nat`). Trong trường hợp các biến đều thiết lập `auto`, hệ thống đọc trực tiếp IP đang được FreeSWITCH công bố (qua `sofia jsonstatus`). Giá trị được chuẩn hoá về dạng host thuần, ví dụ `42.96.18.238`.
- Nếu cùng một `id` tồn tại ở nhiều tenant, bắt buộc truyền `tenantId` hoặc `tenantDomain` để xác định chính xác bản ghi.
- Các lỗi phổ biến:
  * `409 Conflict` – extension đã tồn tại trong tenant
  * `404 Not Found` – tenant hoặc extension không tồn tại
  * `400 Bad Request` – thiếu thông tin xác định tenant khi có nhiều extension trùng ID
- Mọi thay đổi có hiệu lực ngay đối với FreeSWITCH thông qua cơ chế dialplan động và realtime event.
