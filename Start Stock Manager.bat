@echo off
REM Starts the background server, then opens the Stock Manager app.
REM Keep the black window that appears open in the background while you work — closing it stops the app.

cd /d "%~dp0apps\api"
start "Stock Manager - background server" cmd /k "node_modules\.bin\tsx.CMD" watch --env-file=.env src\server.ts

cd /d "%~dp0apps\web"
start "Stock Manager - web server" cmd /k "node_modules\.bin\vite.CMD" preview --port 5173 --strictPort

timeout /t 5 /nobreak >nul

start "" "%~dp0desktop-app\dist\win-unpacked\Surani and Sons.exe"

REM If you'd rather use it in a normal web browser instead of (or alongside) the app window,
REM open this address any time while the black windows above are running: http://localhost:5173
