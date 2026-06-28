#!/bin/bash
echo "🚀 Model Gateway 启动..."
echo ""
echo "📡 启动后端服务..."
node server.js &
SERVER_PID=$!
sleep 2
echo "🖥️ 启动图形界面..."
npm start
kill $SERVER_PID 2>/dev/null
