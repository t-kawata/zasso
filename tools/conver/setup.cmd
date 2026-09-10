@echo off
REM A thin launcher: it locates the Node implementation and adds no logic of its own.
REM .cmd rather than .ps1 because PowerShell blocks .ps1 under its default execution
REM policy, and .cmd is the only form that also works when double-clicked.
node "%~dp0install.js" %*
