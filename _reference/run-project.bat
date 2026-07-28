@echo off
setlocal EnableExtensions

set ROOT=%~dp0
if "%ROOT:~-1%"=="\" set ROOT=%ROOT:~0,-1%

if "%~1"=="" goto usage
set PROJECT=%~1
shift

for /f "delims=" %%A in ('echo %PROJECT%^| findstr /R "^[A-Za-z0-9_][A-Za-z0-9_]*$"') do set _MATCH=%%A
if not defined _MATCH (
  echo ERROR: invalid project name "%PROJECT%".
  echo Use letters, numbers, and underscores only.
  exit /b 2
)

set DOSBOX_EXE=D:\Dropbox\windows-apps\dosbox ece\DOSBox.exe
if not "%DOSBOX_EXE_OVERRIDE%"=="" set DOSBOX_EXE=%DOSBOX_EXE_OVERRIDE%
set DOSBOX_CONF=%ROOT%\assets\dosbox.conf
set WINPOS=%DOSBOX_WINPOS%
if "%WINPOS%"=="" set WINPOS=0,0

:parse_args
if "%~1"=="" goto args_done
if /i "%~1"=="--winpos" (
  if "%~2"=="" (
    echo ERROR: --winpos requires X,Y.
    exit /b 2
  )
  set WINPOS=%~2
  shift
  shift
  goto parse_args
)
if /i "%~1"=="--dosbox-conf" (
  if "%~2"=="" (
    echo ERROR: --dosbox-conf requires a path.
    exit /b 2
  )
  set DOSBOX_CONF=%ROOT%\%~2
  shift
  shift
  goto parse_args
)

echo ERROR: unknown argument "%~1".
goto usage

:args_done
set SDL_VIDEO_CENTERED=0
set SDL_VIDEO_WINDOW_POS=%WINPOS%

set SRC_DIR=%ROOT%\src\%PROJECT%
set SRC_ENTRY=%SRC_DIR%\%PROJECT%.asm
set WORK=%ROOT%\dist\%PROJECT%
set NASM_SRC=%ROOT%\assets\dos-nasm
set NASM_DST=%WORK%\nasm
set DOS_BUILD_TEMPLATE=%ROOT%\assets\buildprj.bat
set DOS_BUILD=%WORK%\buildprj.bat

if not exist "%DOSBOX_EXE%" (
  echo ERROR: DOSBox not found at "%DOSBOX_EXE%"
  exit /b 1
)

if not exist "%DOSBOX_CONF%" (
  echo ERROR: DOSBox config not found at "%DOSBOX_CONF%"
  exit /b 1
)

if not exist "%SRC_ENTRY%" (
  echo ERROR: source entry file missing: "%SRC_ENTRY%"
  exit /b 1
)

if not exist "%NASM_SRC%\nasm.exe" (
  echo ERROR: NASM tools missing under "%NASM_SRC%"
  exit /b 1
)

if not exist "%DOS_BUILD_TEMPLATE%" (
  echo ERROR: missing DOS build script template: "%DOS_BUILD_TEMPLATE%"
  exit /b 1
)

if exist "%WORK%\src" rmdir /s /q "%WORK%\src"
if exist "%WORK%\dist" rmdir /s /q "%WORK%\dist"
if exist "%WORK%\nasm" rmdir /s /q "%WORK%\nasm"
if exist "%DOS_BUILD%" del /q "%DOS_BUILD%"

if not exist "%WORK%" mkdir "%WORK%"
if not exist "%WORK%\src\%PROJECT%" mkdir "%WORK%\src\%PROJECT%"
if not exist "%WORK%\dist\%PROJECT%" mkdir "%WORK%\dist\%PROJECT%"
if not exist "%NASM_DST%" mkdir "%NASM_DST%"

xcopy "%SRC_DIR%\*" "%WORK%\src\%PROJECT%\" /E /I /Y /Q >nul
if errorlevel 1 (
  echo ERROR: failed to stage project source folder.
  exit /b 1
)

xcopy "%NASM_SRC%\*" "%NASM_DST%\" /E /I /Y /Q >nul
if errorlevel 1 (
  echo ERROR: failed to stage NASM tools.
  exit /b 1
)

copy /y "%DOS_BUILD_TEMPLATE%" "%DOS_BUILD%" >nul
if errorlevel 1 (
  echo ERROR: failed to stage DOS build script.
  exit /b 1
)

"%DOSBOX_EXE%" -conf "%DOSBOX_CONF%" -c "mount c \"%WORK%\"" -c "c:" -c "call c:\buildprj.bat %PROJECT%"
if errorlevel 1 exit /b 1

exit /b 0

:usage
echo Usage: run-project.bat ^<project^> [--winpos X,Y] [--dosbox-conf REL_PATH]
echo Example: run-project.bat hello --winpos 40,20
exit /b 2
