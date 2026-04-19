@echo off
chcp 65001 >nul
echo [Git Sync] 开始同步...

:: 检查是否在 git 仓库中
git rev-parse --git-dir >nul 2>&1
if errorlevel 1 (
    echo [错误] 当前目录不是 Git 仓库
    exit /b 1
)

:: 检查是否有进行中的合并/变基
git rev-parse --verify MERGE_HEAD >nul 2>&1
if %errorlevel% equ 0 (
    echo [警告] 检测到未完成的合并，正在中止...
    git merge --abort
)

git rev-parse --verify REBASE_HEAD >nul 2>&1
if %errorlevel% equ 0 (
    echo [警告] 检测到未完成的变基，正在中止...
    git rebase --abort
)

:: 检查远程仓库
git remote get-url origin >nul 2>&1
if errorlevel 1 (
    echo [错误] 未配置远程仓库 origin
    echo 请先运行: git remote add origin ^<仓库地址^>
    exit /b 1
)

:: 获取当前分支
for /f "tokens=*" %%a in ('git rev-parse --abbrev-ref HEAD') do set BRANCH=%%a
echo [信息] 当前分支: %BRANCH%

:: 检查并更新 .gitignore
echo [检查] 验证 .gitignore 配置...
if not exist .gitignore (
    echo [创建] .gitignore 文件...
    (
        echo # Dependencies
        echo node_modules/
        echo **/node_modules/
        echo.
        echo # Python
        echo __pycache__/
        echo *.pyc
        echo *.pyo
        echo *.pyd
        echo .Python
        echo.
        echo # Lock files
        echo package-lock.json
        echo yarn.lock
        echo bun.lock
        echo.
        echo # Environment
        echo .env
        echo .env.local
        echo.
        echo # OS
        echo .DS_Store
        echo Thumbs.db
    ) > .gitignore
    git add .gitignore
    echo [信息] 已创建 .gitignore 并添加 Python 缓存忽略规则
) else (
    findstr /C:"__pycache__/" .gitignore >nul 2>&1
    if errorlevel 1 (
        echo [更新] 添加 Python 缓存规则到 .gitignore...
        (
            echo.
            echo # Python cache
            echo __pycache__/
            echo *.pyc
            echo *.pyo
            echo *.pyd
        ) >> .gitignore
        git add .gitignore
    )
)
for /f "tokens=*" %%a in ('git diff --name-only --diff-filter=U 2^>nul') do (
    if not "%%a"=="" (
        echo [错误] 存在未解决的冲突文件: %%a
        echo 请手动解决冲突后重试
        exit /b 1
    )
)

:: 检查是否有变更（包括未跟踪文件）
for /f "tokens=*" %%a in ('git status --porcelain 2^>nul') do (
    if not "%%a"=="" (
        set HAS_CHANGES=1
        goto :has_changes
    )
)
set HAS_CHANGES=0

:has_changes
if %HAS_CHANGES% equ 0 (
    echo [信息] 没有需要提交的变更
    goto :pull
)

:: 显示变更摘要
echo.
echo === 待提交变更 ===
git status --short
echo.

:: 添加所有变更（包括新文件）
echo [1/4] 添加所有变更（含新文件）...
git add -A

:: 生成提交信息（使用时间戳）
for /f "tokens=*" %%a in ('powershell -Command "Get-Date -Format 'yyyy-MM-dd HH:mm:ss'"') do set TIMESTAMP=%%a
set MESSAGE=Sync: %TIMESTAMP%

:: 提交
echo [2/4] 提交: %MESSAGE%
git commit -m "%MESSAGE%" >nul 2>&1
if errorlevel 1 (
    echo [错误] 提交失败
    exit /b 1
)

:: 拉取更新
:pull
echo [3/4] 拉取远程更新...
git pull origin %BRANCH% --rebase >nul 2>&1
if errorlevel 1 (
    echo [错误] 拉取失败，可能存在冲突
    echo.
    echo === 冲突文件 ===
    git diff --name-only --diff-filter=U
    echo.
    echo 解决方案:
    echo 1. 手动编辑冲突文件，解决冲突标记 (^<^<^< / === / ^>^>^>)
    echo 2. 运行: git add .
    echo 3. 运行: git rebase --continue
    echo 4. 重新运行 git-sync.bat
    echo.
    exit /b 1
)

:: 推送
echo [4/4] 推送到远程...
git push origin %BRANCH% >nul 2>&1
if errorlevel 1 (
    echo [错误] 推送失败
    exit /b 1
)

echo [完成] 同步成功！
echo.
echo === 最新提交 ===
git log --oneline -3
echo.
exit /b 0
