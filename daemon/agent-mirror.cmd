@echo off
REM Windows wrapper for agent-mirror. Drop this in a directory on your PATH,
REM then run `agent-mirror` from any project directory.
setlocal
set "AM_DAEMON=%~dp0"
"%AM_DAEMON%node_modules\.bin\tsx.cmd" "%AM_DAEMON%src\cli.ts" %*
