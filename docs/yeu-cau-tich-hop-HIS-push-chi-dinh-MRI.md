# Dữ liệu chỉ định MRI cần lấy từ HIS

**Gửi:** Bộ phận IT · **Từ:** Dự án hàng đợi MRI (phòng MRI) · **Ngày:** 2026-10-12

Phòng MRI đang làm hệ thống hàng đợi. Nhờ IT cung cấp **dữ liệu chỉ định chụp MRI** từ HIS (một chiều HIS → MRI). Dưới đây là các trường cần.

## Trường dữ liệu cần

| Trường | Bắt buộc | Dùng để |
|---|---|---|
| Mã chỉ định (duy nhất) | ✅ | Khóa định danh, chống trùng |
| Họ tên bệnh nhân | ✅ | Hiển thị + gọi số |
| Mã dịch vụ MRI (mã HH) | ✅ | Xếp đúng phòng |
| Tên dịch vụ / loại chụp | ✅ | Hiển thị |
| Mã bệnh nhân | nên có | Đối chiếu |
| Tuổi (hoặc ngày sinh) | nên có | Ưu tiên người cao tuổi |
| Số điện thoại | nên có | Nhắn tin báo giờ hẹn |
| Bác sĩ chỉ định | nên có | Lọc "ca của tôi" cho bác sĩ |

## Kèm theo

- **Danh mục mã dịch vụ MRI (mã HH)** đầy đủ: mã + tên.

## Cần IT cho biết

1. HIS lấy dữ liệu theo cách nào: **HIS đẩy sang** hay **mình gọi API lấy**?
2. Tên trường thực tế HIS trả (mình sẽ ánh xạ lại, không cần trùng tên ở trên).
3. Đầu mối kỹ thuật để hai bên test.

**Liên hệ:** *(điền tên + số điện thoại)*
