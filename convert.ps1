$content = Get-Content -Path 'C:\agent\model-gateway\README.md' -Raw -Encoding Unicode
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText('C:\agent\model-gateway\README.md', $content, $utf8NoBom)
Write-Host "Converted to UTF-8 without BOM"
