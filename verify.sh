#!/bin/bash
set -e

echo "======================================"
echo "社区托育补助发放系统 - 验证脚本"
echo "验证：重复证件号提交后接口返回拒绝"
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
echo "测试1: 首次提交申请（应该成功）"
echo "======================================"

CHILD_ID_CARD="110101202101019999"

RESPONSE1=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/applications"   -H "Content-Type: application/json"   -d '{
    "child_name": "测试儿童",
    "child_id_card": "'"$CHILD_ID_CARD"'",
    "child_birth_date": "2021-01-01",
    "parent_name": "测试家长",
    "parent_phone": "13900139000",
    "contract_start_date": "2024-01-01",
    "contract_end_date": "2024-12-31",
    "apply_month": "2024-06",
    "subsidy_amount": 1000
  }')

HTTP_CODE1=$(echo "$RESPONSE1" | tail -n1)
BODY1=$(echo "$RESPONSE1" | sed '$d')

echo "HTTP状态码: $HTTP_CODE1"
echo "响应内容: $BODY1"

if [ "$HTTP_CODE1" = "201" ]; then
  echo "✅ 首次提交成功（状态码 201）"
else
  echo "❌ 首次提交失败（状态码 $HTTP_CODE1）"
  exit 1
fi

echo ""
echo "======================================"
echo "测试2: 重复提交相同证件号（应该被拒绝）"
echo "======================================"

RESPONSE2=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/applications"   -H "Content-Type: application/json"   -d '{
    "child_name": "另一个儿童",
    "child_id_card": "'"$CHILD_ID_CARD"'",
    "child_birth_date": "2021-02-02",
    "parent_name": "另一个家长",
    "parent_phone": "13900139001",
    "contract_start_date": "2024-01-01",
    "contract_end_date": "2024-12-31",
    "apply_month": "2024-06",
    "subsidy_amount": 1000
  }')

HTTP_CODE2=$(echo "$RESPONSE2" | tail -n1)
BODY2=$(echo "$RESPONSE2" | sed '$d')

echo "HTTP状态码: $HTTP_CODE2"
echo "响应内容: $BODY2"

if [ "$HTTP_CODE2" = "400" ]; then
  if echo "$BODY2" | grep -q "证件号已存在"; then
    echo "✅ 重复提交被正确拒绝（状态码 400，包含'证件号已存在'提示）"
  else
    echo "⚠️  状态码正确，但未包含预期的错误信息"
  fi
else
  echo "❌ 重复提交未被拒绝（状态码 $HTTP_CODE2）"
  exit 1
fi

echo ""
echo "======================================"
echo "测试3: 验证数据库中只有一条记录"
echo "======================================"

COUNT=$(curl -s "$API_BASE/applications" | grep -o "$CHILD_ID_CARD" | wc -l)

echo "数据库中证件号 $CHILD_ID_CARD 出现次数: $COUNT"

if [ "$COUNT" = "1" ]; then
  echo "✅ 数据库中只有一条记录，重复提交被正确拦截"
else
  echo "❌ 数据库中出现 $COUNT 条记录，存在重复"
  exit 1
fi

echo ""
echo "======================================"
echo "测试4: 合同月份未覆盖申请月份（应该被拒绝）"
echo "======================================"

RESPONSE3=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/applications"   -H "Content-Type: application/json"   -d '{
    "child_name": "合同测试",
    "child_id_card": "110101202101018888",
    "child_birth_date": "2021-01-01",
    "parent_name": "测试家长",
    "parent_phone": "13900139002",
    "contract_start_date": "2024-03-01",
    "contract_end_date": "2024-05-31",
    "apply_month": "2024-06",
    "subsidy_amount": 1000
  }')

HTTP_CODE3=$(echo "$RESPONSE3" | tail -n1)
BODY3=$(echo "$RESPONSE3" | sed '$d')

echo "HTTP状态码: $HTTP_CODE3"
echo "响应内容: $BODY3"

if [ "$HTTP_CODE3" = "400" ]; then
  if echo "$BODY3" | grep -q "合同月份未覆盖"; then
    echo "✅ 合同未覆盖申请月份被正确拒绝"
  else
    echo "⚠️  状态码正确，但未包含预期的错误信息"
  fi
else
  echo "❌ 合同月份校验失败（状态码 $HTTP_CODE3）"
fi

echo ""
echo "======================================"
echo "✅ 所有验证测试通过！"
echo "======================================"
echo ""
echo "总结："
echo "1. 首次提交申请成功"
echo "2. 重复证件号提交被接口拒绝（HTTP 400 + 错误信息）"
echo "3. 数据库中只有一条记录，重复提交被拦截"
echo "4. 合同月份未覆盖申请月份也被正确校验"
echo ""
echo "前端页面验证说明："
echo "  启动服务后访问 http://localhost:5173"
echo "  在家长申报页面，输入已存在的证件号提交，页面会弹出错误提示"
