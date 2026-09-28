@echo off
rem  development launcher (next dev with Turbopack) - double-click me.
rem  all logic lives in tools\launch.ps1.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\launch.ps1" dev
