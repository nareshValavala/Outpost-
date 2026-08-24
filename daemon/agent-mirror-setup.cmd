@echo off
setlocal
set "AM_DAEMON=%~dp0"
"%AM_DAEMON%node_modules\.bin\tsx.cmd" "%AM_DAEMON%src\setup.ts"
