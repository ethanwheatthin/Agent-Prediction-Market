@echo off
:: AgentArena — All-in-one startup script (Windows)
:: Starts: PostgreSQL, Redis (via Docker), Backend, Frontend
::
:: Usage:
::   start.bat          start everything
::   start.bat --stop   stop Docker services and kill background processes
::   start.bat --reset  stop + wipe DB volumes, then start fresh

setlocal EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
:: Remove trailing backslash
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

set "BACKEND_DIR=%SCRIPT_DIR%\backend"
set "FRONTEND_DIR=%SCRIPT_DIR%\frontend"
set "LOG_DIR=%SCRIPT_DIR%\.logs"
set "PID_FILE=%SCRIPT_DIR%\.pids"

:: ─── Argument handling ───────────────────────────────────────────────────────
if "%~1"=="--stop"  goto :stop_services
if "%~1"=="--reset" goto :reset_services

goto :main

:: ─── Helpers ─────────────────────────────────────────────────────────────────
:log
echo [%TIME:~0,8%] %*
goto :eof

:ok
echo [%TIME:~0,8%] OK  %*
goto :eof

:warn
echo [%TIME:~0,8%] WARN  %*
goto :eof

:err
echo [%TIME:~0,8%] ERR  %*
goto :eof

:section
echo.
echo ===  %*  ===
goto :eof

:: ─── Stop ────────────────────────────────────────────────────────────────────
:stop_services
call :section "Stopping Services"

if exist "%PID_FILE%" (
  for /f "tokens=*" %%p in (%PID_FILE%) do (
    taskkill /PID %%p /F >nul 2>&1 && call :log Killed process %%p
  )
  del /f "%PID_FILE%" >nul 2>&1
)

call :log Stopping Docker containers...
docker compose -f "%SCRIPT_DIR%\docker-compose.yml" stop postgres redis >nul 2>&1
call :ok Services stopped
goto :eof

:: ─── Reset ───────────────────────────────────────────────────────────────────
:reset_services
call :section "Resetting (wiping volumes)"
docker compose -f "%SCRIPT_DIR%\docker-compose.yml" down -v >nul 2>&1
if exist "%PID_FILE%" del /f "%PID_FILE%" >nul 2>&1
call :ok Volumes wiped
goto :main

:: ─── Main ────────────────────────────────────────────────────────────────────
:main

:: ─── Dependency checks ───────────────────────────────────────────────────────
call :section "Checking Dependencies"

where docker >nul 2>&1
if errorlevel 1 (
  call :err docker not found. Install Docker Desktop and retry.
  exit /b 1
)
call :ok docker found

where node >nul 2>&1
if errorlevel 1 (
  call :err node not found. Install Node.js 18+ from https://nodejs.org and retry.
  exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do set "NODE_VER=%%v"
set "NODE_MAJOR=%NODE_VER:~1,2%"
if %NODE_MAJOR% LSS 18 (
  call :err Node.js 18+ required. Found %NODE_VER%
  exit /b 1
)
call :ok Node.js %NODE_VER%

where npm >nul 2>&1
if errorlevel 1 (
  call :err npm not found.
  exit /b 1
)
call :ok npm found

docker info >nul 2>&1
if errorlevel 1 (
  call :err Docker daemon is not running. Start Docker Desktop and retry.
  exit /b 1
)
call :ok Docker daemon running

:: ─── Prepare log directory ───────────────────────────────────────────────────
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
if exist "%PID_FILE%" del /f "%PID_FILE%" >nul 2>&1

:: ─── Setup .env files ────────────────────────────────────────────────────────
call :section "Environment Setup"

if not exist "%BACKEND_DIR%\.env" (
  copy "%BACKEND_DIR%\.env.example" "%BACKEND_DIR%\.env" >nul
  call :ok Created backend\.env from example
) else (
  call :ok backend\.env already exists
)

if not exist "%FRONTEND_DIR%\.env" (
  if exist "%FRONTEND_DIR%\.env.example" (
    copy "%FRONTEND_DIR%\.env.example" "%FRONTEND_DIR%\.env" >nul
    call :ok Created frontend\.env from example
  )
) else (
  call :ok frontend\.env already exists
)

:: ─── Install dependencies ────────────────────────────────────────────────────
call :section "Installing Dependencies"

if not exist "%BACKEND_DIR%\node_modules" (
  call :log Installing backend dependencies...
  call npm install --prefix "%BACKEND_DIR%" --silent
  if errorlevel 1 ( call :err npm install failed for backend & exit /b 1 )
  call :ok Backend dependencies installed
) else (
  call :ok Backend dependencies already installed
)

if not exist "%FRONTEND_DIR%\node_modules" (
  call :log Installing frontend dependencies...
  call npm install --prefix "%FRONTEND_DIR%" --silent
  if errorlevel 1 ( call :err npm install failed for frontend & exit /b 1 )
  call :ok Frontend dependencies installed
) else (
  call :ok Frontend dependencies already installed
)

:: ─── Start Docker infra ──────────────────────────────────────────────────────
call :section "Starting Infrastructure (PostgreSQL + Redis)"

call :log Starting postgres and redis via Docker Compose...
docker compose -f "%SCRIPT_DIR%\docker-compose.yml" up -d postgres redis --remove-orphans
if errorlevel 1 (
  call :err Failed to start Docker services.
  exit /b 1
)

:: Wait for PostgreSQL
call :log Waiting for PostgreSQL to be ready...
set WAITED=0
:wait_pg
docker compose -f "%SCRIPT_DIR%\docker-compose.yml" exec -T postgres pg_isready -U agentarena -q >nul 2>&1
if not errorlevel 1 goto :pg_ready
set /a WAITED+=1
if %WAITED% GEQ 30 (
  call :err PostgreSQL did not become ready within 30s
  exit /b 1
)
<nul set /p ="  Waiting... %WAITED%s"$'\r'
timeout /t 1 /nobreak >nul
goto :wait_pg
:pg_ready
call :ok PostgreSQL is ready

:: Wait for Redis
call :log Waiting for Redis to be ready...
set WAITED=0
:wait_redis
docker compose -f "%SCRIPT_DIR%\docker-compose.yml" exec -T redis redis-cli ping 2>nul | findstr /i "PONG" >nul 2>&1
if not errorlevel 1 goto :redis_ready
set /a WAITED+=1
if %WAITED% GEQ 30 (
  call :err Redis did not become ready within 30s
  exit /b 1
)
timeout /t 1 /nobreak >nul
goto :wait_redis
:redis_ready
call :ok Redis is ready

:: ─── Run Prisma migrations ───────────────────────────────────────────────────
call :section "Running Database Migrations"

call :log Running Prisma generate...
cd /d "%BACKEND_DIR%"
call npx prisma generate --silent >nul 2>&1

call :log Running Prisma migrate deploy...
call npx prisma migrate deploy 2>&1
if errorlevel 1 (
  call :err Prisma migration failed
  exit /b 1
)
call :ok Migrations complete
cd /d "%SCRIPT_DIR%"

:: ─── Start Backend ───────────────────────────────────────────────────────────
call :section "Starting Backend (port 4000)"

set "BACKEND_LOG=%LOG_DIR%\backend.log"
call :log Starting backend dev server... (log: .logs\backend.log^)

:: Start backend in a new window (already cd'd into BACKEND_DIR from Prisma step)
cd /d "%BACKEND_DIR%"
start "AgentArena-Backend" cmd /k "call npm run dev"

:: Grab the PID of the cmd window we just spawned
:: Use WMIC to find the most recently started node process
timeout /t 2 /nobreak >nul
for /f "tokens=2" %%p in ('tasklist /fi "imagename eq node.exe" /fo list ^| findstr /i "PID"') do (
  set BACKEND_PID=%%p
)
if defined BACKEND_PID (
  echo !BACKEND_PID! >> "%PID_FILE%"
)

:: Poll /health
call :log Waiting for backend to be ready...
set WAITED=0
:wait_backend
curl -sf http://localhost:4000/health >nul 2>&1
if not errorlevel 1 goto :backend_ready
set /a WAITED+=1
if %WAITED% GEQ 45 (
  call :err Backend did not start within 45s. Check .logs\backend.log
  type "%BACKEND_LOG%"
  exit /b 1
)
timeout /t 1 /nobreak >nul
goto :wait_backend
:backend_ready
call :ok Backend is ready at http://localhost:4000

:: ─── Start Frontend ──────────────────────────────────────────────────────────
call :section "Starting Frontend (port 5173)"

set "FRONTEND_LOG=%LOG_DIR%\frontend.log"
call :log Starting frontend dev server... (log: .logs\frontend.log^)

cd /d "%FRONTEND_DIR%"
start "AgentArena-Frontend" cmd /k "call npm run dev"

timeout /t 2 /nobreak >nul
for /f "tokens=2" %%p in ('tasklist /fi "imagename eq node.exe" /fo list ^| findstr /i "PID"') do (
  set FRONTEND_PID=%%p
)
if defined FRONTEND_PID (
  echo !FRONTEND_PID! >> "%PID_FILE%"
)

:: Poll port 5173
call :log Waiting for frontend to be ready...
set WAITED=0
:wait_frontend
curl -sf http://localhost:5173 >nul 2>&1
if not errorlevel 1 goto :frontend_ready
set /a WAITED+=1
if %WAITED% GEQ 45 (
  call :err Frontend did not start within 45s. Check .logs\frontend.log
  type "%FRONTEND_LOG%"
  exit /b 1
)
timeout /t 1 /nobreak >nul
goto :wait_frontend
:frontend_ready
call :ok Frontend is ready at http://localhost:5173

:: ─── Summary ─────────────────────────────────────────────────────────────────
echo.
echo ==================================================
echo   AgentArena is running!
echo ==================================================
echo.
echo   Frontend    -^>  http://localhost:5173
echo   Backend API -^>  http://localhost:4000
echo   Health      -^>  http://localhost:4000/health
echo   Agent guide -^>  http://localhost:4000/agent.md
echo.
echo   PostgreSQL  -^>  localhost:5433  (agentarena/agentarena)
echo   Redis       -^>  localhost:6379
echo.
echo   Logs:  .logs\backend.log  ^|  .logs\frontend.log
echo.
echo   To register an agent:
echo     curl -s -X POST http://localhost:4000/agents/register ^
echo       -H "Content-Type: application/json" ^
echo       -d "{\"name\":\"MyAgent\",\"persona\":\"Momentum trader\"}"
echo.
echo   Backend and frontend are running in minimized windows.
echo   Close those windows (or run: start.bat --stop) to shut down.
echo.

:: Open browser
start "" http://localhost:5173

:: Stream logs to this window
call :log Streaming logs (Ctrl+C to stop log view - services keep running):
echo.
powershell -Command "Get-Content '%BACKEND_LOG%','%FRONTEND_LOG%' -Wait -Tail 0 | ForEach-Object { Write-Host $_ }"
