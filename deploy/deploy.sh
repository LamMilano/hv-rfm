#!/usr/bin/env bash
# Deploy MRI waiting list lên server nội bộ — chạy từ máy dev (Git Bash), ở bất kỳ đâu:
#   bash deploy/deploy.sh
# Các bước: kiểm tra local (typecheck + test) → sao lưu code trên server → đẩy mã nguồn
# (tar qua ssh) → npm ci nếu lockfile đổi → build 2 phía → migrate DB → pm2 restart → health.
# Cần SSH key tới server (không hỏi mật khẩu). Không cần sudo.
set -euo pipefail

# Host SSH lấy từ biến MRI_HOST, hoặc file deploy/deploy.local.env (không commit), vd:
#   MRI_HOST=user@10.0.0.5
[ -f "$(dirname "$0")/deploy.local.env" ] && . "$(dirname "$0")/deploy.local.env"
HOST="${MRI_HOST:?Chưa đặt MRI_HOST (user@host) — export MRI_HOST=... hoặc tạo deploy/deploy.local.env}"
APP="mri-waitlist"            # thư mục app trong home trên server
PM2_NAME="mri-backend"
SSH="ssh -o BatchMode=yes -o ConnectTimeout=10 $HOST"

cd "$(dirname "$0")/.."
buoc() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }

buoc "Kiểm tra local: typecheck + test backend, typecheck frontend"
(cd backend && npx tsc --noEmit && npx vitest run --reporter=dot)
(cd frontend && npx vue-tsc --noEmit -p tsconfig.app.json)

buoc "Ghi nhận lockfile trên server (để biết có cần npm ci)"
LOCK_CU=$($SSH "cd $APP && cat backend/package-lock.json frontend/package-lock.json 2>/dev/null | md5sum" | cut -d' ' -f1)
LOCK_MOI=$(cat backend/package-lock.json frontend/package-lock.json | md5sum | cut -d' ' -f1)

buoc "Sao lưu code hiện tại trên server"
TS=$(date +%Y%m%d-%H%M%S)
$SSH "cd $APP && mkdir -p ~/mri-backups && tar czf ~/mri-backups/mri-$TS.tgz backend/src frontend/src deploy && ls -t ~/mri-backups/*.tgz | tail -n +11 | xargs -r rm --"
echo "   → ~/mri-backups/mri-$TS.tgz (giữ 10 bản gần nhất)"

buoc "Đẩy mã nguồn lên $HOST:~/$APP"
tar czf - backend/src backend/package.json backend/package-lock.json backend/tsconfig.json \
          frontend/src frontend/public frontend/index.html frontend/package.json frontend/package-lock.json \
          frontend/vite.config.ts frontend/tsconfig.json frontend/tsconfig.app.json frontend/tsconfig.node.json \
          deploy 2>/dev/null \
  | $SSH "cd $APP && tar xzf -"

if [ "$LOCK_CU" != "$LOCK_MOI" ]; then
  buoc "Lockfile đổi → npm ci hai phía"
  $SSH "cd $APP/backend && npm ci --no-audit --no-fund && cd ../frontend && npm ci --no-audit --no-fund"
fi

buoc "Build backend + chạy migration"
$SSH "cd $APP/backend && npm run build && npm run migrate"

buoc "Build frontend"
$SSH "cd $APP/frontend && npm run build"

buoc "Khởi động lại $PM2_NAME"
$SSH "pm2 restart $PM2_NAME --update-env >/dev/null && pm2 save >/dev/null && pm2 describe $PM2_NAME | grep -E 'status|restarts'"

buoc "Health check"
sleep 2
$SSH "curl -fsS localhost:3003/api/health" && echo
printf '\n\033[1;32m✔ Deploy xong (%s). Khôi phục nếu cần: cd ~/%s && tar xzf ~/mri-backups/mri-%s.tgz rồi chạy lại build + pm2 restart.\033[0m\n' "$TS" "$APP" "$TS"
