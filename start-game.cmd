@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 20.19+ or 22.12+ first.
  pause
  exit /b 1
)
if not exist node_modules call npm install
if errorlevel 1 (
  echo Dependency installation failed. Please check your connection and retry.
  pause
  exit /b 1
)
call npm run dev -- --port 5173 --strictPort --open
