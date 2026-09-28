@echo off
rem  stops whatever is listening on port 3000 - double-click me.
rem  usage:  stop.bat        -> port 3000
rem          stop.bat 3101   -> another port
set "PORT=%~1"
if "%PORT%"=="" set "PORT=3000"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\launch.ps1" stop -Port %PORT%
