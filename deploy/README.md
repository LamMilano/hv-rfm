# Triển khai HV-RFM (Hệ thống điều phối hàng chờ) lên domain

Mục tiêu: `https://mri.example.vn` chạy thật. Kiến trúc:

```
Trình duyệt ──HTTPS──> Nginx (443) ──proxy──> Node/Express (127.0.0.1:3003) ──> Postgres (localhost:5432)
                                                     │
                                                     └─ phục vụ luôn frontend đã build (frontend/dist)
```

Node vừa chạy API vừa trả giao diện tĩnh (khi `NODE_ENV=production`). Nginx chỉ đứng trước làm TLS + reverse proxy. Các lệnh dưới **dán thẳng vào SSH** trên server (Ubuntu; ví dụ dưới dùng IP `192.168.1.10` — thay bằng IP của bạn).

---

## 0. Yêu cầu một lần

```bash
node -v    # cần >= 20. Nếu chưa có:
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx postgresql
```

## 1. Lấy mã nguồn về server

```bash
sudo mkdir -p /opt/mri-waitlist && sudo chown $USER /opt/mri-waitlist
# Cách A: git
git clone https://github.com/<owner>/<repo>.git /opt/mri-waitlist
# Cách B: scp từ máy dev (chạy ở máy Windows, Git Bash):
#   scp -r ./* user@<server>:/opt/mri-waitlist/
```

Bố cục phải giữ `backend/` và `frontend/` nằm cạnh nhau trong `/opt/mri-waitlist` (Node tìm `../../frontend/dist`).

## 2. Build backend + frontend

```bash
cd /opt/mri-waitlist/backend  && npm ci && npm run build
cd /opt/mri-waitlist/frontend && npm ci && npm run build
```

## 3. Cấu hình `.env` (bí mật)

```bash
cd /opt/mri-waitlist/backend
cp ../deploy/.env.production.example .env
nano .env     # điền: mật khẩu DB, JWT_SECRET, HIS_PUSH_API_KEY
# Sinh chuỗi ngẫu nhiên:
openssl rand -hex 32   # → dán vào JWT_SECRET
openssl rand -hex 24   # → dán vào HIS_PUSH_API_KEY
```

## 4. Dựng cơ sở dữ liệu

DB `mri_waitlist` đã có sẵn. Tạo 7 bảng + dữ liệu nền (chạy lại nhiều lần an toàn):

```bash
cd /opt/mri-waitlist/backend
# Cách A (khuyến nghị, không cần Node): chạy script trọn gói bằng psql
psql "$DATABASE_URL" -f src/db/setup-server.sql
# Cách B: dùng script Node
npm run migrate && npm run seed
```

> Seed tạo tài khoản admin lối vào dự phòng **admin / admin123** — xem bước 8 để ĐỔI ngay.

## 5. Chạy backend như dịch vụ (systemd)

```bash
sudo cp /opt/mri-waitlist/deploy/mri-backend.service /etc/systemd/system/
# Nếu thư mục không phải /opt/mri-waitlist hoặc user chạy khác www-data → sửa lại trong file.
sudo chown -R www-data:www-data /opt/mri-waitlist
sudo systemctl daemon-reload
sudo systemctl enable --now mri-backend
sudo systemctl status mri-backend --no-pager
curl -s localhost:3003/api/health      # phải trả {"status":"ok",...}
```

## 6. Nginx (reverse proxy)

```bash
sudo cp /opt/mri-waitlist/deploy/nginx-mri.conf /etc/nginx/sites-available/mri.example.vn
sudo ln -sf /etc/nginx/sites-available/mri.example.vn /etc/nginx/sites-enabled/
# Gỡ trang mặc định "Welcome to nginx" nếu đang chiếm:
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Mở `http://mri.example.vn/dang-nhap` — phải thấy trang đăng nhập (không còn trang nginx mặc định).

## 7. HTTPS (chứng chỉ tự ký cho mạng nội bộ)

> Domain này chỉ truy cập trong mạng viện (LAN) nên **không dùng Let's Encrypt/certbot
> được** (certbot cần xác thực từ Internet). Dùng chứng chỉ **tự ký (self-signed)**.
> File `nginx-mri.conf` đã có sẵn khối `listen 443` + chuyển hướng 80→443, chỉ cần tạo
> chứng chỉ ở đúng đường dẫn rồi reload.

```bash
# 1) Tạo chứng chỉ tự ký (hiệu lực 10 năm) — ghi đúng chỗ nginx-mri.conf trỏ tới
sudo mkdir -p /etc/nginx/ssl
sudo openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/mri.key \
  -out /etc/nginx/ssl/mri.crt \
  -subj "/C=VN/ST=HCM/L=HCM/O=Ten Benh Vien/CN=mri.example.vn" \
  -addext "subjectAltName=DNS:mri.example.vn,IP:192.168.1.10"

# 2) Mở cổng 443 nếu đang bật firewall ufw
sudo ufw allow 443/tcp 2>/dev/null || true

# 3) Kiểm tra cấu hình và reload
sudo nginx -t && sudo systemctl reload nginx
```

Mở `https://mri.example.vn` — trình duyệt cảnh báo "Your connection is not
private" (bình thường với chứng chỉ tự ký) → bấm **Advanced → Proceed** là vào được.
Nếu DNS nội bộ chưa trỏ domain, vẫn vào được bằng `https://192.168.1.10` (chứng chỉ có
SAN IP nên vẫn khớp).

> **Bỏ cảnh báo trên máy client:** cài `/etc/nginx/ssl/mri.crt` làm *Trusted Root
> Certification Authority* cho từng máy, hoặc đẩy hàng loạt qua Group Policy nếu dùng AD.
>
> **Nếu sau này domain ra được Internet** thì mới chuyển sang chứng chỉ miễn phí:
> `sudo apt-get install -y certbot python3-certbot-nginx && sudo certbot --nginx -d mri.example.vn`

## 8. ĐỔI mật khẩu admin (bắt buộc trước khi dùng thật)

1. Đăng nhập `https://mri.example.vn/dang-nhap` bằng **admin / admin123**.
2. Vào **Quản trị → Người dùng → + Thêm**: tạo một admin mới (nguồn *Nội bộ*, mật khẩu mạnh), hoặc cấp quyền cho các mã nhân viên HIS (KTV/bác sĩ).
3. Khóa tài khoản `admin` mặc định (nút **Khóa**).

## 9. Bàn giao cho IT (HIS push)

- Endpoint: `POST https://mri.example.vn/api/his/orders`
- Header: `X-API-Key: <HIS_PUSH_API_KEY trong .env>`
- Thân: JSON 1 chỉ định hoặc mảng nhiều chỉ định. Trường cần xem `docs/yeu-cau-tich-hop-HIS-push-chi-dinh-MRI.md`.
- Nếu HIS đặt tên trường khác mặc định, chỉnh ánh xạ trong bảng `app_settings` khóa `his_anh_xa` (JSON) — không phải sửa code.

---

## Cập nhật phiên bản sau này

```bash
cd /opt/mri-waitlist && git pull
cd backend  && npm ci && npm run build
cd ../frontend && npm ci && npm run build
sudo systemctl restart mri-backend
```

## Xử lý sự cố nhanh

| Triệu chứng | Kiểm tra |
|---|---|
| 502 Bad Gateway | `systemctl status mri-backend`, `journalctl -u mri-backend -f` |
| Vào `https://` báo không kết nối được (ERR_CONNECTION_REFUSED) | Chưa có khối `listen 443` hoặc chưa tạo chứng chỉ ở `/etc/nginx/ssl/` → xem bước 7; kiểm tra cổng 443 mở (`sudo ufw status`) và nginx đang nghe (`sudo ss -ltnp | grep 443`) |
| Đăng nhập báo "không truy cập được dữ liệu" | DB chưa chạy / sai `DATABASE_URL` |
| SSE không cập nhật realtime | Đã dùng `location /api/stream` (tắt buffering) trong nginx chưa |
| Dừng ngay khi khởi động (production) | Thiếu `DATABASE_URL`/`JWT_SECRET` trong `.env` (fail-fast) |
