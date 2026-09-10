$ErrorActionPreference = 'Stop'

$changed = @(git diff --name-only HEAD^ HEAD)
$documentationOnly = $changed.Count -gt 0 -and ($changed | Where-Object {
  $_ -notmatch '^(\.github/|docs/)' -and
  $_ -notmatch '(^|/)(README|CHANGELOG)(\.|$)' -and
  $_ -notmatch '(^|/)tests/' -and
  $_ -notmatch '(^|/)\.env\.example$' -and
  $_ -notmatch '^scripts/install-(minipc-services|production-task)\.ps1$'
}).Count -eq 0

if ($documentationOnly) {
  Write-Output 'Documentation/test-only change: version increment not required.'
  exit 0
}

$current = node -e "process.stdout.write(require('./package.json').version)"
$previousJson = git show 'HEAD^:package.json'
$previous = $previousJson | node -e "let s=''; process.stdin.on('data', d => s += d).on('end', () => process.stdout.write(JSON.parse(s).version))"

if ([version]$current -le [version]$previous) {
  throw "Production code changed but package.json version was not incremented: $previous -> $current"
}

Write-Output "Production version accepted: $previous -> $current"
