@echo off
title ShelfLedger POS
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or not in PATH.
  echo Install Node.js LTS from https://nodejs.org then try again.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo First run: installing dependencies...
  call npm install
)

if not exist "prisma\dev.db" (
  echo Setting up database...
  call npx prisma migrate dev --name init
  call npm run db:seed
)

echo.
echo Starting ShelfLedger...
echo Open your browser to: http://localhost:3000
echo.
echo Leave this window open while using the site.
echo Press Ctrl+C to stop the server.
echo.

start "" "http://localhost:3000"
call npm run dev
pause
