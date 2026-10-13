@echo off
chcp 65001 >nul
where node >nul 2>nul || (echo ثبّت Node.js اولا من https://nodejs.org ثم اعد التشغيل & pause & exit /b 1)
call npm install || (echo فشل التثبيت & pause & exit /b 1)
call npm run dist || (echo فشل البناء & pause & exit /b 1)
echo تم. ستجد المثبّت داخل المجلد dist
pause
