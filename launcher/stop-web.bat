@echo off
echo Arret des serveurs RepartiX...

echo Arret du backend (port 4001)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :4001 ^| findstr LISTENING') do (
    taskkill /F /PID %%a 2>nul
)

echo Arret du frontend (port 4000)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :4000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a 2>nul
)

echo Serveurs arretes.
pause
