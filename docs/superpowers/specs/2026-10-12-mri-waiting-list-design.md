# Thiết kế: Hệ thống hàng đợi MRI (MRI Waiting List)

- **Ngày:** 2026-10-12
- **Trạng thái:** Bản thiết kế chờ duyệt
- **Bối cảnh tổ chức:** Hệ thống Y tế Hùng Vương — phòng MRI (2 phòng)

---

## 1. Bối cảnh & vấn đề

Hiện tại: bệnh nhân được chỉ định MRI trên HIS → đến phòng MRI → KTV cấp số thứ tự thủ công. Bệnh viện có **2 phòng MRI**.

Hai nỗi đau cần giải quyết:

1. **Mất thông tin ngược về phòng khám.** Bác sĩ chỉ định xong không biết bệnh nhân đã chụp chưa, còn bao lâu tới lượt → không tư vấn/hẹn bệnh nhân chính xác được.
2. **Bệnh nhân đi lại nhiều lần** vì không biết khi nào tới lượt → phải lên xuống giữa phòng khám và phòng MRI để hỏi/chờ.

## 2. Mục tiêu & phạm vi

**Mục tiêu:** Một lớp "hàng đợi + trạng thái real-time" nằm giữa phòng MRI và phòng khám — số hóa việc cấp số, hiển thị trạng thái + thời gian dự kiến cho bác sĩ (web + màn hình tổng) và bệnh nhân (màn hình chờ sảnh + SMS/Zalo).

**Trong phạm vi giai đoạn 1:**
- Tiếp nhận chỉ định MRI từ HIS (push API, một chiều).
- Quản lý hàng đợi 2 phòng (mỗi phòng một hàng riêng), có chỉnh sửa thủ công bởi KTV.
- Máy trạng thái ca chụp, bao gồm "quá lượt".
- Nhãn ưu tiên gợi ý + chen số thủ công.
- Ước tính giờ hẹn dự kiến bằng thời lượng cấu hình tĩnh.
- Web KTV, web bác sĩ, màn hình tổng tại khoa, màn hình chờ tại sảnh.
- Nhật ký thay đổi.
- Thông báo SMS/Zalo khi đặt giờ hẹn & khi đổi giờ.
- Đăng nhập qua hệ tài khoản bệnh viện (apihrm) + lối vào dự phòng nội bộ.

**Ngoài phạm vi giai đoạn 1 (để ngỏ cho tương lai):**
- Ước tính thời gian động bằng AI/học từ lịch sử (thiết kế để cắm sau qua interface).
- Ghi ngược trạng thái/kết quả về HIS.
- Bệnh nhân tự tra cứu qua QR/web điện thoại.
- SSO bằng ticket từ cổng HRM.

## 3. Quyết định đã chốt (từ phiên brainstorm)

| # | Vấn đề | Quyết định |
|---|---|---|
| 1 | Tích hợp HIS | HIS **push** chỉ định MRI sang hệ thống, **một chiều**, qua API. Không ghi ngược HIS. |
| 2 | Cập nhật trạng thái | **KTV bấm tay** trên màn hình (gọi → bắt đầu → hoàn thành). |
| 3 | Mô hình hàng đợi | **Mỗi phòng một hàng riêng.** |
| 4 | Phân phòng | Theo **mã HH** (mã ID danh mục dịch vụ), qua cấu hình ánh xạ mã HH → phòng. |
| 5 | Ước tính thời gian | Giai đoạn đầu: **thời lượng cấu hình tĩnh theo loại**; tương lai: AI/động (sau interface). |
| 6 | GD bác sĩ | **Cả hai**: web tra cứu cá nhân + màn hình tổng tại khoa. |
| 7 | GD bệnh nhân | **Màn hình chờ tại sảnh MRI + thông báo SMS/Zalo.** |
| 8 | Nền tảng | Web app nhẹ, cùng họ công nghệ HV-MRM. |
| 9 | Nguồn ưu tiên | **HIS gợi ý + KTV duyệt.** |
| 10 | Cơ chế chen | **KTV tự quyết vị trí chen** (hệ thống chỉ gắn nhãn gợi ý, không tự sắp xếp). |
| 11 | Kích hoạt thông báo | Khi **được đặt giờ hẹn** và khi **giờ hẹn thay đổi**. |
| 12 | Quá lượt | **Giữ chờ, KTV gọi lại tùy ý** (khu "quá lượt – chờ gọi lại" riêng). |
| 13 | Real-time | **SSE (Server-Sent Events).** Bọc sau interface để có thể đổi sang polling nếu cần. |
| 14 | Hạ tầng | **Đã có sẵn** (mô hình như HV-MRM: Node + PostgreSQL sau Nginx). |
| 15 | Hiển thị TV sảnh | **Chỉ họ tên đầy đủ + số thứ tự** (không thông tin y khoa). |
| 16 | Đăng nhập | Hệ tài khoản bệnh viện **apihrm** + lối vào dự phòng nội bộ. |

## 4. Kiến trúc tổng thể

```
   HIS ──(POST /api/his/orders — push chỉ định)──▶  [Backend: Express + TS + PostgreSQL]
                                                           │
                                           REST (thao tác) │ SSE (đẩy cập nhật)
                                                           ▼
        ┌──────────────┬───────────────┬─────────────────┬──────────────────┐
        │  Web KTV     │  Web bác sĩ   │ Màn hình tổng   │ Màn hình chờ sảnh │
        │ (điều hàng   │ (ca của tôi)  │ (khoa khám, TV) │ (TV công khai)    │
        │  đợi)        │               │                 │                   │
        └──────────────┴───────────────┴─────────────────┴──────────────────┘
                                                           │
                                                 [Module thông báo] ──▶ SMS/Zalo
```

**Luồng dữ liệu chính:**
1. HIS gọi `POST /api/his/orders` khi có chỉ định mới → backend xác thực → adapter ánh xạ payload → tạo `order` ở trạng thái `cho` → ánh xạ mã HH ra phòng → tính nhãn ưu tiên gợi ý → xếp cuối hàng phòng đó → đẩy SSE → (nếu đặt được giờ hẹn) tạo thông báo.
2. KTV thao tác qua REST: gọi số, có mặt→bắt đầu, hoàn thành, quá lượt, gọi lại, chen/đổi thứ tự, sửa giờ, chuyển phòng, duyệt nhãn ưu tiên.
3. Mỗi thay đổi hàng đợi → ghi DB + ghi `change_log` + đẩy sự kiện SSE xuống mọi màn hình đang mở → giao diện tự vẽ lại.
4. Khi "giờ hẹn dự kiến" được đặt/đổi → module thông báo gửi SMS/Zalo.

**Stack:**
- Frontend: Vue 3 + Vite + Tailwind + Pinia + Vue Router (như HV-MRM).
- Backend: Express 5 + TypeScript + PostgreSQL (`pg`) + JWT, chạy sau Nginx.

## 5. Mô hình dữ liệu (PostgreSQL)

| Bảng | Vai trò | Trường chính |
|---|---|---|
| `orders` | Mỗi chỉ định MRI = 1 bản ghi | `id`, `ma_his` (mã chỉ định HIS, duy nhất), `ma_bn`, `ho_ten`, `tuoi`, `sdt`, `ma_hh`, `room_id`, `status`, `queue_pos` (vị trí trong hàng của phòng), `gio_hen` (giờ hẹn dự kiến, nullable), `gio_hen_thu_cong` (bool — KTV đã ghi đè), `priority_type_id` (nullable), `priority_confirmed` (bool), `created_at`, `updated_at` |
| `rooms` | 2 phòng MRI | `id`, `ma_phong`, `ten`, `active` |
| `hh_routing` | Ánh xạ mã HH → phòng + thời lượng | `ma_hh`, `room_id`, `thoi_luong_phut` |
| `priority_types` | Danh mục nhóm ưu tiên | `id`, `ma`, `ten`, `quy_tac_goi_y` (mô tả/biểu thức gợi ý từ dữ liệu HIS, vd tuổi ≥ 75) |
| `change_log` | Nhật ký thay đổi | `id`, `order_id`, `loai` (gọi/bắt đầu/hoàn thành/quá lượt/gọi lại/đổi thứ tự/đổi giờ/chuyển phòng/hủy/duyệt ưu tiên), `gia_tri_cu`, `gia_tri_moi`, `user_id`, `ly_do` (nullable), `created_at` |
| `notifications` | Hàng chờ gửi SMS/Zalo | `id`, `order_id`, `loai` (`dat_gio` / `doi_gio`), `noi_dung`, `trang_thai` (chờ/đã gửi/lỗi), `created_at`, `sent_at` |
| `users` | KTV, bác sĩ, admin | `id`, `ma_nv` (nullable), `ho_ten`, `role` (ktv/bac_si/admin), `ma_bs` (để lọc "ca của tôi", nullable), `nguon_xac_thuc` (`hrm`/`noi_bo`), `password_hash` (bcrypt, chỉ khi nội bộ), `active` |

**Trạng thái** (`orders.status`): `cho` · `dang_goi` · `dang_chup` · `qua_luot` · `hoan_thanh` · `huy`.

**Tách "vị trí hàng đợi" khỏi "giờ hẹn dự kiến":**
- `queue_pos` là thứ tự do KTV sắp (kéo-thả/chen).
- `gio_hen` mặc định tính tự động từ vị trí × thời lượng chuẩn các ca trước trong cùng phòng; nhưng KTV **ghi đè tay được** (khi đó `gio_hen_thu_cong = true`, hệ thống không tự tính đè lên nữa).

## 6. Máy trạng thái & quy tắc hàng đợi

```
   [cho] ──gọi──▶ [dang_goi] ──BN có mặt──▶ [dang_chup] ──xong──▶ [hoan_thanh]
      ▲                  │
      │                  └──BN vắng mặt──▶ [qua_luot]
      │                                        │
      └──────────── KTV gọi lại ───────────────┘

   Nhánh phụ (KTV chủ động, mọi lúc): chuyển phòng • hủy ([huy])
```

**Nguyên tắc hàng đợi (gom mọi yêu cầu về một mối):**
- Mỗi phòng có **một hàng đợi có thứ tự chỉnh tay**. KTV: kéo đổi thứ tự, chen ca ưu tiên vào bất kỳ vị trí nào, gọi lại ca quá lượt, chuyển ca sang phòng kia, sửa giờ hẹn.
- Hệ thống chỉ **gắn nhãn gợi ý** (ưu tiên từ HIS, cờ quá lượt…) để KTV nhìn mà quyết — **không tự ý sắp xếp**.
- Mỗi hành động của KTV = một bản ghi `change_log` (ai, lúc nào, đổi gì, lý do) → đẩy SSE → (nếu ảnh hưởng `gio_hen`) kích hoạt thông báo.
- "Quá lượt" là trạng thái riêng, hiển thị ở khu "chờ gọi lại" trên màn hình KTV; KTV tự quyết khi nào gọi lại và chen vào đâu.

## 7. Tiếp nhận từ HIS

**Endpoint:** `POST /api/his/orders` — xác thực bằng API key/token (header riêng cho HIS, khác JWT người dùng).

**Xử lý:** xác thực → adapter ánh xạ payload → tạo `order` (`cho`) → ánh xạ mã HH ra phòng → tính nhãn ưu tiên gợi ý → xếp cuối hàng phòng → đẩy SSE → (nếu đặt được giờ hẹn) tạo `notification` loại `dat_gio`.

**Adapter payload linh hoạt:** cấu hình khai báo "trường nào trong payload HIS → trường nào của hệ thống", để nếu HIS đổi format hoặc chưa biết chính xác format thì không phải sửa code lõi.

**Chống trùng:** `ma_his` là khóa duy nhất → push lại cùng mã chỉ định không tạo bản ghi trùng (idempotent).

**Phụ thuộc ngoài (cần chốt sớm với đội HIS):** danh sách trường trong payload, cách xác thực, địa chỉ HIS gọi tới được backend nội bộ.

## 8. Xác thực & phân quyền

Theo tài liệu tích hợp apihrm (đã kiểm chứng 10/09/2026, rút kinh nghiệm từ HV-MRM).

**Mô hình:** dùng apihrm **chỉ để hỏi "mã NV + mật khẩu có đúng không"**; app **tự cấp phiên JWT riêng**. Vai trò (ktv/bac_si/admin), phòng, quyền lấy từ CSDL app, không dùng `role[]` của HRM.

**Luồng:**
```
Người dùng gõ mã NV + mật khẩu
 └─ App tra users trong CSDL (lấy mã NV chuẩn, kiểm tra active, xem nguon_xac_thuc)
     ├─ nguon_xac_thuc = hrm → POST ${HIS_AUTH_URL} (vd https://hrm.example.vn/api/v2/Auth/login)
     │     body: { "manv": "<5 chữ số>", "passwordHash": "<mật khẩu thường>" }
     │     → đúng/sai/lý do trượt
     └─ nguon_xac_thuc = noi_bo → so bcrypt với password_hash trong CSDL
   Nếu đúng: app cấp JWT phiên riêng. Token HRM: bỏ, không lưu.
```

**Quy tắc bắt buộc (từ tài liệu):**
- Chuẩn hóa mã NV: `/^\d{1,5}$/` → `padStart(5,'0')`. Mã NV đúng 5 chữ số → hỏi HRM; còn lại (admin, dùng chung, mã chứng chỉ hành nghề) → mật khẩu nội bộ.
- `passwordHash` gửi **mật khẩu thường** (không tự băm).
- Dùng **v2** (`/api/v2/Auth/login`); chỉ căn cứ `success === true`, không bám hình dạng `data`.
- Đọc `code` để báo đúng lý do: `PASSWORD_EXPIRED`, `USER_LOCKED`, `USER_NOT_FOUND`, `INVALID_PASSWORD`. **Phân biệt rõ "trả lời là sai" với "không nhận được trả lời"** — HTTP ≥ 500/timeout/lỗi mạng → "Hệ thống tài khoản không phản hồi", KHÔNG báo "sai mật khẩu".
- Chịu được 2 khuôn phản hồi (có `success`/`code`, và `ProblemDetails` của ASP.NET), không sập khi thân rỗng/không phải JSON.
- URL trong `.env` (`HIS_AUTH_URL`), timeout 8s (`AbortController`), không log mật khẩu — log `err.message` + `err.cause?.code`.
- **Luôn giữ lối vào dự phòng nội bộ** (vài tài khoản admin bcrypt) để vào sửa khi HRM/mạng có sự cố.

**Phân quyền màn hình:** KTV → web KTV (phòng mình); bác sĩ → web bác sĩ (lọc theo `ma_bs`); admin → trang cấu hình. Màn hình tổng & màn hình chờ sảnh: chỉ xem, có cơ chế truy cập riêng cho thiết bị trưng bày (không cần tài khoản cá nhân).

## 9. Ước tính thời gian (interface để thay sau)

Đặt sau một interface `UocTinhGioHen`:
- **Giai đoạn 1 — tĩnh:** `gio_hen` của một ca = thời điểm hiện tại + tổng `thoi_luong_phut` của các ca đứng trước nó trong cùng phòng (theo `hh_routing`). KTV ghi đè được.
- **Tương lai — động/AI:** thay implementation sau interface bằng module học từ lịch sử thời lượng thực tế theo loại/phòng/khung giờ — không đụng phần còn lại.

## 10. Thông báo SMS/Zalo

- **Kích hoạt:** khi `gio_hen` được **đặt lần đầu** (loại `dat_gio`) và khi `gio_hen` **thay đổi** (loại `doi_gio`, kèm lý do nếu có).
- Ghi vào bảng `notifications` (hàng chờ) → worker gửi qua nhà cung cấp SMS/Zalo.
- **Nhà cung cấp để ngỏ, cắm sau** qua interface `GuiTinNhan`; mẫu tin nhắn cấu hình được ở trang quản trị.

## 11. Các màn hình

1. **Web KTV** (mỗi phòng một phiên đăng nhập): vùng `Đang chụp` | `Hàng chờ (kéo-thả)` | `Quá lượt – chờ gọi lại` | `Hoàn thành hôm nay`. Nút: gọi số, có mặt→bắt đầu, hoàn thành, quá lượt, gọi lại, chen/đổi thứ tự, sửa giờ, chuyển phòng, duyệt nhãn ưu tiên. Mỗi thao tác → ghi nhật ký + đẩy SSE.
2. **Web bác sĩ** (đăng nhập, lọc theo `ma_bs`): danh sách **ca của tôi** — tên BN, phòng, số thứ tự, trạng thái, `gio_hen`, cập nhật real-time; có dấu hiệu khi ca bị dời giờ/chen (để bác sĩ biết mà tư vấn).
3. **Màn hình tổng tại khoa khám** (TV, chỉ xem): toàn cảnh hàng đợi 2 phòng.
4. **Màn hình chờ tại sảnh MRI** (TV công khai, chỉ xem): theo từng phòng — "Đang chụp: [họ tên] – số [N]", "Tiếp theo: số…". **Chỉ họ tên đầy đủ + số thứ tự**, không thông tin y khoa.

## 12. Cấu hình (trang quản trị)

- **Ánh xạ mã HH → phòng** + **thời lượng chuẩn** mỗi loại.
- **Danh mục nhóm ưu tiên** + quy tắc gợi ý từ HIS.
- **Adapter payload HIS**: khai báo trường HIS → trường hệ thống.
- **Thông báo**: mẫu tin "đặt giờ"/"đổi giờ"; cấu hình nhà cung cấp SMS/Zalo.
- Quản lý `users`, `rooms`.

## 13. Real-time (SSE) & hạ tầng

- Endpoint SSE (vd `GET /api/stream`): client (các màn hình) mở kết nối, backend đẩy sự kiện khi hàng đợi đổi. Sự kiện mang **loại thay đổi + lý do** để màn hình không "nhảy số khó hiểu".
- Tận dụng auto-reconnect sẵn có của `EventSource` cho màn hình treo 24/7.
- **Nginx:** tắt buffering cho đường SSE (`proxy_buffering off;`, `X-Accel-Buffering: no`), tắt timeout đóng kết nối sớm.
- Lớp real-time **bọc sau interface** (publisher) → có thể đổi SSE↔polling mà không đụng phần còn lại.

## 14. Bảo mật & riêng tư

- Dữ liệu bệnh nhân → bắt buộc đăng nhập (JWT), phân vai trò, nhật ký thao tác.
- **Màn hình TV công khai (sảnh): chỉ họ tên + số thứ tự**, không chẩn đoán/lý do chỉ định.
- Endpoint HIS push dùng khóa riêng, tách khỏi JWT người dùng.
- Không log mật khẩu; secrets trong `.env`.

## 15. Giai đoạn 1 vs tương lai

- **Giai đoạn 1:** toàn bộ phần "Trong phạm vi" ở §2, ước tính thời gian tĩnh, SMS/Zalo qua một nhà cung cấp.
- **Tương lai:** ước tính động AI; (có thể) ghi ngược HIS; bệnh nhân tự tra cứu QR; SSO ticket HRM.

## 16. Rủi ro & phụ thuộc

| Rủi ro/Phụ thuộc | Giảm thiểu |
|---|---|
| Format payload HIS chưa chốt | Adapter cấu hình được; chốt sớm với đội HIS |
| Đường HIS → backend nội bộ bị chặn | Xác minh sớm; test từ chính máy chủ production |
| apihrm/mạng sự cố | Lối vào dự phòng nội bộ; phân biệt "sai" vs "không kết nối" |
| Proxy nuốt SSE | Cấu hình Nginx; đường lùi sang polling sau interface |
| Nhà cung cấp SMS/Zalo chưa chốt | Interface `GuiTinNhan`, cắm sau |

## 17. Tiêu chí nghiệm thu (phác thảo)

- HIS push một chỉ định → xuất hiện đúng phòng theo mã HH, trạng thái `cho`, có nhãn ưu tiên gợi ý (nếu đủ điều kiện), đẩy SSE tới màn hình.
- KTV thực hiện đủ vòng đời: gọi → bắt đầu → hoàn thành; và nhánh quá lượt → gọi lại.
- KTV chen/đổi thứ tự/sửa giờ/chuyển phòng → ghi `change_log`, đẩy SSE, cập nhật mọi màn hình < 1s.
- Đặt/đổi `gio_hen` → sinh `notification` đúng loại.
- Đăng nhập: tài khoản HRM đúng → vào được; từng mã lỗi → đúng câu báo; HRM sập → "không kết nối" (không phải "sai mật khẩu"); lối vào dự phòng nội bộ hoạt động.
- Màn hình sảnh chỉ hiện họ tên + số thứ tự.
