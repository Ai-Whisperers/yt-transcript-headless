@echo off
REM Docker Cleanup Script (Windows)
REM Prevents build cache and temporary data accumulation
REM Run periodically to maintain clean Docker environment

echo ============================================
echo   Docker Cleanup Script (Windows)
echo ============================================
echo.

REM Show current disk usage
echo Current Docker disk usage:
docker system df
echo.

set /p CONFIRM="Proceed with cleanup? (y/n): "
if /i not "%CONFIRM%"=="y" (
    echo Cleanup cancelled
    exit /b 0
)

echo.
echo Removing stopped containers...
docker container prune -f

echo.
echo Removing dangling images...
docker image prune -f

echo.
echo Removing unused build cache...
docker builder prune -f

echo.
echo Removing unused volumes...
docker volume prune -f

echo.
echo Removing unused networks...
docker network prune -f

echo.
echo Disk usage after cleanup:
docker system df

echo.
echo Cleanup complete!
pause
