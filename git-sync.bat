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

:: 检查是否有冲突文件
for /f "tokens=*" %%a in ('git diff --name-only --diff-filter=U 2^>nul') do (
    if not "%%a"=="" (
        echo [错误] 存在未解决的冲突文件: %%a
        echo 请手动解决冲突后重试
        exit /b 1
    )
)

:: 检查是否有变更
git diff --quiet
git diff --quiet --cached
if %errorlevel% equ 0 (
    echo [信息] 没有需要提交的变更
    goto :pull
)

:: 添加所有变更
echo [1/4] 添加变更...
git add .

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
exit /b 0
