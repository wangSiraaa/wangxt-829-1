#!/bin/bash
set -e

echo "======================================"
echo "社区托育补助发放系统 - 启动脚本"
echo "======================================"

if [ ! -d "backend/node_modules" ] || [ ! -d "frontend/node_modules" ]; then
  echo "正在安装依赖..."
  npm run install:all
fi

if [ ! -f "backend/data.db" ]; then
  echo "正在初始化数据库和种子数据..."
  npm run seed
fi

echo ""
echo "启动后端服务 (端口 3001)..."
cd backend
node src/server.js &
BACKEND_PID=$!

cd ..

echo "等待后端服务启动..."
sleep 3

echo ""
echo "启动前端服务 (端口 5173)..."
cd frontend
npm run dev &
FRONTEND_PID=$!

cd ..

echo ""
echo "======================================"
echo "系统已启动！"
echo "前端地址: http://localhost:5173"
echo "后端API:  http://localhost:3001/api"
echo "======================================"
echo ""
echo "按 Ctrl+C 停止服务"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo '服务已停止'" EXIT

wait
