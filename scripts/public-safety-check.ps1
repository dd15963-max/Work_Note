[CmdletBinding()]
param(
  [ValidateSet("full", "staged", "tracked")]
  [string]$Mode = "full"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-RepositoryRoot {
  $root = (& git rev-parse --show-toplevel 2>$null)
  if ($LASTEXITCODE -eq 0 -and $root) {
    return (Resolve-Path -LiteralPath $root.Trim()).Path
  }

  return (Resolve-Path -LiteralPath ".").Path
}

function ConvertTo-RepositoryPath {
  param(
    [string]$FullPath,
    [string]$RootPath
  )

  $baseUri = [Uri]($RootPath.TrimEnd("\") + "\")
  $pathUri = [Uri]$FullPath
  return [Uri]::UnescapeDataString($baseUri.MakeRelativeUri($pathUri).ToString()).Replace("/", "\")
}

function Test-IsInsideGitDirectory {
  param(
    [string]$FullPath,
    [string]$RootPath
  )

  $gitPath = Join-Path $RootPath ".git"
  return $FullPath.StartsWith($gitPath, [System.StringComparison]::OrdinalIgnoreCase)
}

function Test-IsIgnoredWorkspaceDirectory {
  param(
    [string]$FullPath,
    [string]$RootPath
  )

  $relativePath = ConvertTo-RepositoryPath -FullPath $FullPath -RootPath $RootPath
  $segments = @($relativePath.ToLowerInvariant().Split("\", [System.StringSplitOptions]::RemoveEmptyEntries))
  return $segments -contains "node_modules" -or $segments -contains ".vite"
}

function Get-CandidatePaths {
  param(
    [string]$Mode,
    [string]$RootPath
  )

  if ($Mode -eq "staged") {
    return @(& git diff --cached --name-only --diff-filter=ACMR)
  }

  if ($Mode -eq "tracked") {
    return @(& git ls-files)
  }

  $files = Get-ChildItem -LiteralPath $RootPath -Recurse -File -Force |
    Where-Object {
      -not (Test-IsInsideGitDirectory -FullPath $_.FullName -RootPath $RootPath) -and
      -not (Test-IsIgnoredWorkspaceDirectory -FullPath $_.FullName -RootPath $RootPath)
    }

  return @($files | ForEach-Object { ConvertTo-RepositoryPath -FullPath $_.FullName -RootPath $RootPath })
}

function Read-FileSample {
  param(
    [string]$FullPath,
    [int]$MaxChars = 262144
  )

  $reader = [System.IO.StreamReader]::new($FullPath, [System.Text.Encoding]::UTF8, $true)
  try {
    $buffer = New-Object char[] $MaxChars
    $count = $reader.Read($buffer, 0, $buffer.Length)
    if ($count -le 0) {
      return ""
    }
    return -join $buffer[0..($count - 1)]
  }
  finally {
    $reader.Dispose()
  }
}

function Test-BackupJsonContent {
  param([string]$FullPath)

  if (-not (Test-Path -LiteralPath $FullPath -PathType Leaf)) {
    return $false
  }

  try {
    $sample = Read-FileSample -FullPath $FullPath
  }
  catch {
    return $false
  }

  if ($sample.Contains('"backupCreatedAt"') -or
      $sample.Contains('"backupType"') -or
      $sample.Contains('"attachmentStorage"')) {
    return $true
  }

  return $sample.Contains('"companies"') -and
    $sample.Contains('"notes"') -and
    $sample.Contains('"settlementTasks"') -and
    $sample.Contains('"accounts"')
}

function Get-SensitiveReason {
  param(
    [string]$RepositoryPath,
    [string]$RootPath
  )

  if ([string]::IsNullOrWhiteSpace($RepositoryPath)) {
    return $null
  }

  $normalized = $RepositoryPath.Replace("/", "\").TrimStart("\")
  $lowerPath = $normalized.ToLowerInvariant()
  $name = [System.IO.Path]::GetFileName($lowerPath)
  $extension = [System.IO.Path]::GetExtension($lowerPath)
  $segments = @($lowerPath.Split("\", [System.StringSplitOptions]::RemoveEmptyEntries))

  $blockedDirectories = @("data", "attachments", "backups", "exports")
  foreach ($directory in $blockedDirectories) {
    if ($segments -contains $directory) {
      return "blocked data directory '$directory'"
    }
  }

  $blockedExtensions = @(
    ".zip", ".7z", ".rar", ".tar", ".gz", ".tgz",
    ".bak", ".backup", ".csv",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".hwp", ".hwpx",
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic"
  )

  if ($blockedExtensions -contains $extension) {
    return "blocked file extension '$extension'"
  }

  $koreanBackup = ([char]0xBC31).ToString() + ([char]0xC5C5).ToString()
  $blockedNameFragments = @(
    "backup",
    "full-backup",
    "pre-import",
    "pre-full-import",
    "pre-json-merge",
    "pre-full-merge",
    "sales-note-export",
    "work-note-full-backup",
    $koreanBackup
  )

  foreach ($fragment in $blockedNameFragments) {
    if ($name.Contains($fragment)) {
      return "backup-like file name"
    }
  }

  if ($extension -eq ".json") {
    $fullPath = Join-Path $RootPath $normalized
    if (Test-BackupJsonContent -FullPath $fullPath) {
      return "work note backup JSON content"
    }
  }

  return $null
}

$repoRoot = Get-RepositoryRoot
Set-Location -LiteralPath $repoRoot

$candidatePaths = @(Get-CandidatePaths -Mode $Mode -RootPath $repoRoot) |
  Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
  Sort-Object -Unique

$findings = @()

foreach ($path in $candidatePaths) {
  $reason = Get-SensitiveReason -RepositoryPath $path -RootPath $repoRoot
  if ($reason) {
    $findings += [PSCustomObject]@{
      Path = $path
      Reason = $reason
    }
  }
}

if ($findings.Count -gt 0) {
  Write-Host ""
  Write-Host "Public safety check failed." -ForegroundColor Red
  Write-Host "The following files look like backups, exports, attachments, or customer documents:"
  Write-Host ""
  foreach ($finding in $findings) {
    Write-Host ("- {0} ({1})" -f $finding.Path, $finding.Reason)
  }
  Write-Host ""
  Write-Host "Move these files outside the Git folder before publishing or pushing."
  exit 1
}

Write-Host ("Public safety check passed ({0})." -f $Mode) -ForegroundColor Green
