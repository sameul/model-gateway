@echo off
echo 🚀 Model Gateway 启动...
echo.
start /b node server.js
timeout /t 2 /nobreak >nul
echo 🖥️ 启动图形界面...
npm start
taskkill /f /im node.exe >nul 2>&1
