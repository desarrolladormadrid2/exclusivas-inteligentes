@echo off
title Exclusivas Inteligentes - CRM local
cd /d "%~dp0"
node migrate.mjs
node seed.mjs
start "" /b node server-local.mjs
start "" /b npm run dev
timeout /t 5 /nobreak >nul
start "" "http://localhost:3000"
echo.
echo Exclusivas Inteligentes esta funcionando en http://localhost:3000
echo No cierres esta ventana mientras uses el CRM.
echo Para cerrar todo utiliza cerrar-excluvas.bat
