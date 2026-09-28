@echo off
rem  production launcher - double-click me.
rem  all logic lives in tools\launch.ps1 (node detection, port, build, start).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\launch.ps1" prod
