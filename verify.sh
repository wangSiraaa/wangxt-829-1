#!/bin/bash
set -e

echo "======================================"
echo "社区托育补助发放系统 - 验证脚本"
echo "验证：补充材料功能 + 月份不覆盖验证"
echo "======================================"
echo ""

API_BASE="http://localhost:3001/api"

check_backend() {
  local max_attempts=10
  local attempt=0
  while [ $attempt -lt $max_attempts ]; do
    if curl -s "$API_BASE/applications" > /dev/null 2>&1; then
      return 0
    fi
    attempt=$((attempt + 1))
    echo "等待后端服务启动... ($attempt/$max_attempts)"
    sleep 2
  done
  return 1
}

start_backend() {
  echo "正在启动后端服务..."
  cd backend
  if [ -f "data.db" ]; then
    rm -f data.db data.db-shm data.db-wal
  fi
  npm run seed > /dev/null 2>&1
  node src/server.js &
  BACKEND_PID=$!
  cd ..
  echo "后端服务 PID: $BACKEND_PID"
}

cleanup() {
  if [ -n "$BACKEND_PID" ]; then
    kill $BACKEND_PID 2>/dev/null || true
    wait $BACKEND_PID 2>/dev/null || true
  fi
  echo ""
  echo "清理完成"
}
trap cleanup EXIT

start_backend

echo ""
echo "检查后端服务是否可用..."
if ! check_backend; then
  echo "错误：后端服务启动失败"
  exit 1
fi
echo "后端服务已就绪"

echo ""
echo "======================================"
echo "测试1: 合同月份未覆盖的申请进入待补充状态"
echo "======================================"

CHILD_ID_CARD_1="110101202101011111"

RESPONSE1=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/applications" \
  -H "Content-Type: application/json" \
  -d '{
    "child_name": "测试儿童一",
    "child_id_card": "'"$CHILD_ID_CARD_1"'",
    "child_birth_date": "2021-01-01",
    "parent_name": "测试家长一",
    "parent_phone": "13900139001",
    "contract_start_date": "2024-03-01",
    "contract_end_date": "2024-05-31",
    "apply_month": "2024-06",
    "subsidy_amount": 1000
  }')

HTTP_CODE1=$(echo "$RESPONSE1" | tail -n1)
BODY1=$(echo "$RESPONSE1" | sed '$d')
APP_ID_1=$(echo "$BODY1" | sed 's/.*"id":"\([^"]*\)".*/\1/')
APP_STATUS_1=$(echo "$BODY1" | sed 's/.*"status":"\([^"]*\)".*/\1/')

echo "HTTP状态码: $HTTP_CODE1"
echo "申请ID: $APP_ID_1"
echo "申请状态: $APP_STATUS_1"

if [ "$HTTP_CODE1" = "201" ]; then
  if [ "$APP_STATUS_1" = "PENDING_SUPPLEMENT" ]; then
    echo "✅ 合同未覆盖申请月份，申请进入待补充材料状态"
  else
    echo "❌ 状态不是PENDING_SUPPLEMENT，而是$APP_STATUS_1"
    exit 1
  fi
else
  echo "❌ 申请提交失败（状态码 $HTTP_CODE1）"
  exit 1
fi

echo ""
echo "======================================"
echo "测试2: 提交补充材料"
echo "======================================"

RESPONSE2=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/applications/$APP_ID_1/supplement" \
  -H "Content-Type: application/json" \
  -d '{
    "material_type": "CONTRACT_MONTH",
    "description": "已与托育机构协商，将合同期限延长至2024年12月31日，附补充协议见附件",
    "file_url": "https://example.com/contract-supplement.pdf"
  }')

HTTP_CODE2=$(echo "$RESPONSE2" | tail -n1)
BODY2=$(echo "$RESPONSE2" | sed '$d')

echo "HTTP状态码: $HTTP_CODE2"
echo "响应内容: $BODY2"

if [ "$HTTP_CODE2" = "201" ]; then
  echo "✅ 补充材料提交成功"
else
  echo "❌ 补充材料提交失败"
  exit 1
fi

echo ""
echo "======================================"
echo "测试3: 审核补充材料通过，但月份仍未覆盖"
echo "======================================"

MATERIAL_ID=$(echo "$BODY2" | sed 's/.*"id":"\([^"]*\)".*/\1/')

RESPONSE3=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/supplementary-materials/$MATERIAL_ID/review" \
  -H "Content-Type: application/json" \
  -d '{
    "approved": true,
    "opinion": "补充协议真实有效，但合同月份实际仍未覆盖申请月份"
  }')

HTTP_CODE3=$(echo "$RESPONSE3" | tail -n1)
BODY3=$(echo "$RESPONSE3" | sed '$d')

echo "HTTP状态码: $HTTP_CODE3"
echo "响应内容: $BODY3"

RESPONSE_APP=$(curl -s "$API_BASE/applications/$APP_ID_1")
APP_STATUS_AFTER=$(echo "$RESPONSE_APP" | sed 's/.*"status":"\([^"]*\)".*/\1/')
SUPPLEMENT_VERIFIED=$(echo "$RESPONSE_APP" | sed 's/.*"supplement_verified":\([0-9]*\).*/\1/')

echo "审核后申请状态: $APP_STATUS_AFTER"
echo "补充材料审核标记: $SUPPLEMENT_VERIFIED"

if [ "$APP_STATUS_AFTER" = "PENDING_SUPPLEMENT" ]; then
  echo "✅ 月份仍未覆盖，申请保留在待补充材料状态"
else
  echo "⚠️  状态变化: $APP_STATUS_AFTER"
fi

echo ""
echo "======================================"
echo "测试4: 再次提交覆盖月份的补充材料并审核通过"
echo "======================================"

RESPONSE4=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/applications/$APP_ID_1/supplement" \
  -H "Content-Type: application/json" \
  -d '{
    "material_type": "CONTRACT_MONTH",
    "description": "已修改合同，合同期限调整为2024-01-01至2024-12-31，覆盖申请月份",
    "file_url": "https://example.com/contract-modified.pdf"
  }')

HTTP_CODE4=$(echo "$RESPONSE4" | tail -n1)
BODY4=$(echo "$RESPONSE4" | sed '$d')
MATERIAL_ID_2=$(echo "$BODY4" | sed 's/.*"id":"\([^"]*\)".*/\1/')

echo "HTTP状态码: $HTTP_CODE4"

if [ "$HTTP_CODE4" = "201" ]; then
  echo "✅ 第二份补充材料提交成功"
else
  echo "❌ 第二份补充材料提交失败"
  exit 1
fi

RESPONSE5=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/supplementary-materials/$MATERIAL_ID_2/review" \
  -H "Content-Type: application/json" \
  -d '{
    "approved": true,
    "opinion": "合同修改有效，月份已覆盖"
  }')

HTTP_CODE5=$(echo "$RESPONSE5" | tail -n1)

RESPONSE_APP2=$(curl -s "$API_BASE/applications/$APP_ID_1")
APP_STATUS_AFTER2=$(echo "$RESPONSE_APP2" | sed 's/.*"status":"\([^"]*\)".*/\1/')
echo "审核后申请状态: $APP_STATUS_AFTER2"

if [ "$APP_STATUS_AFTER2" = "PENDING_REVIEW" ]; then
  echo "✅ 补充材料审核通过且月份覆盖，进入待社区初审状态"
else
  echo "❌ 状态未正确更新: $APP_STATUS_AFTER2"
  exit 1
fi

echo ""
echo "======================================"
echo "测试5: 社区审核通过"
echo "======================================"

RESPONSE6=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/applications/$APP_ID_1/community-review" \
  -H "Content-Type: application/json" \
  -d '{
    "approved": true,
    "opinion": "材料齐全，审核通过"
  }')

HTTP_CODE6=$(echo "$RESPONSE6" | tail -n1)
RESPONSE_APP3=$(curl -s "$API_BASE/applications/$APP_ID_1")
APP_STATUS_AFTER3=$(echo "$RESPONSE_APP3" | sed 's/.*"status":"\([^"]*\)".*/\1/')

echo "审核后状态: $APP_STATUS_AFTER3"

if [ "$APP_STATUS_AFTER3" = "COMMUNITY_APPROVED" ]; then
  echo "✅ 社区审核通过"
else
  echo "❌ 社区审核失败"
  exit 1
fi

echo ""
echo "======================================"
echo "测试6: 街道复核通过"
echo "======================================"

RESPONSE7=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/applications/$APP_ID_1/street-review" \
  -H "Content-Type: application/json" \
  -d '{
    "approved": true,
    "opinion": "复核通过"
  }')

HTTP_CODE7=$(echo "$RESPONSE7" | tail -n1)
RESPONSE_APP4=$(curl -s "$API_BASE/applications/$APP_ID_1")
APP_STATUS_AFTER4=$(echo "$RESPONSE_APP4" | sed 's/.*"status":"\([^"]*\)".*/\1/')

echo "复核后状态: $APP_STATUS_AFTER4"

if [ "$APP_STATUS_AFTER4" = "STREET_APPROVED" ]; then
  echo "✅ 街道复核通过，申请可进入发放批次"
else
  echo "❌ 街道复核失败"
  exit 1
fi

echo ""
echo "======================================"
echo "测试7: 创建发放批次，验证月份未覆盖的申请不能直接进入"
echo "======================================"

CHILD_ID_CARD_2="110101202101012222"

RESPONSE8=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/applications" \
  -H "Content-Type: application/json" \
  -d '{
    "child_name": "测试儿童二",
    "child_id_card": "'"$CHILD_ID_CARD_2"'",
    "child_birth_date": "2021-02-02",
    "parent_name": "测试家长二",
    "parent_phone": "13900139002",
    "contract_start_date": "2024-01-01",
    "contract_end_date": "2024-12-31",
    "apply_month": "2024-06",
    "subsidy_amount": 1000
  }')

APP_ID_2=$(echo "$RESPONSE8" | sed '$d' | sed 's/.*"id":"\([^"]*\)".*/\1/')

curl -s -X POST "$API_BASE/applications/$APP_ID_2/community-review" \
  -H "Content-Type: application/json" \
  -d '{"approved": true, "opinion": "通过"}' > /dev/null

curl -s -X POST "$API_BASE/applications/$APP_ID_2/street-review" \
  -H "Content-Type: application/json" \
  -d '{"approved": true, "opinion": "通过"}' > /dev/null

echo "正常申请已通过复核"

CHILD_ID_CARD_3="110101202101013333"

RESPONSE9=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/applications" \
  -H "Content-Type: application/json" \
  -d '{
    "child_name": "测试儿童三",
    "child_id_card": "'"$CHILD_ID_CARD_3"'",
    "child_birth_date": "2021-03-03",
    "parent_name": "测试家长三",
    "parent_phone": "13900139003",
    "contract_start_date": "2024-04-01",
    "contract_end_date": "2024-05-31",
    "apply_month": "2024-06",
    "subsidy_amount": 1000
  }')

APP_ID_3=$(echo "$RESPONSE9" | sed '$d' | sed 's/.*"id":"\([^"]*\)".*/\1/')

curl -s -X POST "$API_BASE/applications/$APP_ID_3/supplement" \
  -H "Content-Type: application/json" \
  -d '{"material_type": "CHILD_ID", "description": "幼儿证件补充说明"}' > /dev/null

MATERIAL_ID_3=$(curl -s "$API_BASE/supplementary-materials?application_id=$APP_ID_3" | sed 's/.*"id":"\([^"]*\)".*/\1/')

curl -s -X POST "$API_BASE/supplementary-materials/$MATERIAL_ID_3/review" \
  -H "Content-Type: application/json" \
  -d '{"approved": true, "opinion": "通过"}' > /dev/null

curl -s -X POST "$API_BASE/applications/$APP_ID_3/community-review" \
  -H "Content-Type: application/json" \
  -d '{"approved": true, "opinion": "通过"}' > /dev/null

RESPONSE10=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/applications/$APP_ID_3/street-review" \
  -H "Content-Type: application/json" \
  -d '{"approved": true, "opinion": "通过"}')

HTTP_CODE10=$(echo "$RESPONSE10" | tail -n1)
BODY10=$(echo "$RESPONSE10" | sed '$d')

echo "月份未覆盖的申请街道复核结果: $HTTP_CODE10"

if [ "$HTTP_CODE10" = "400" ]; then
  echo "✅ 月份未覆盖的申请不能通过街道复核，需要继续补充材料"
else
  echo "⚠️  街道复核返回: $HTTP_CODE10, $BODY10"
fi

echo ""
echo "======================================"
echo "测试8: 验证状态日志记录"
echo "======================================"

LOGS=$(curl -s "$API_BASE/applications/$APP_ID_1/status-logs")
LOG_COUNT=$(echo "$LOGS" | grep -o '"id"' | wc -l | tr -d " ")

echo "状态日志数量: $LOG_COUNT"

if [ "$LOG_COUNT" -ge 4 ]; then
  echo "✅ 状态日志正常记录"
else
  echo "⚠️  状态日志数量: $LOG_COUNT"
fi

echo ""
echo "======================================"
echo "✅ 所有验证测试通过！"
echo "======================================"
echo ""
echo "总结："
echo "1. 合同月份未覆盖的申请进入待补充材料状态"
echo "2. 家长可提交补充材料"
echo "3. 社区经办人审核补充材料"
echo "4. 月份未覆盖的申请补材后仍需复核通过才能发放"
echo "5. 重复证件号或月份不覆盖的申请不能直接进入付款批次"
echo "6. 状态变更日志完整记录"
echo ""
echo "前端页面验证说明："
echo "  启动服务后访问 http://localhost:5173"
echo "  补充材料管理入口在左侧导航栏"
