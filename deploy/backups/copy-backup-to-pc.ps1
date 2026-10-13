param(
    [string]$Destination = (Join-Path $PSScriptRoot '../../backups/automatic'),
    [string]$PrivateKey = (Join-Path $env:USERPROFILE '.ssh/copahue-hotel-vps')
)
$ErrorActionPreference = 'Stop'
$Destination = [IO.Path]::GetFullPath($Destination)
New-Item -ItemType Directory -Force -Path $Destination | Out-Null
$userSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
& icacls.exe $Destination /inheritance:r /grant:r "*$($userSid):(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron proteger los respaldos de la PC.' }
$mutex = New-Object Threading.Mutex($false, 'Local\CopahueHotelBackupDownload')
if (-not $mutex.WaitOne(0)) { exit 0 }
try {
    $sshOptions = @('-i', $PrivateKey, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=15')
    $export = & ssh.exe @sshOptions 'root@162.35.114.196' '/usr/local/sbin/hotel-backup export'
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar la copia cifrada en el VPS.' }
    $info = ($export -join "`n") | ConvertFrom-Json
    if ($info.file -notmatch '^/var/backups/hotel-admin-automatic/exports/hotel-admin-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}\.tar\.gz$' -or $info.sha256 -notmatch '^[a-f0-9]{64}$') { throw 'Respuesta de respaldo no valida.' }
    $filename = Split-Path $info.file -Leaf
    $partial = Join-Path $Destination ($filename + '.partial')
    $complete = Join-Path $Destination $filename
    & scp.exe @sshOptions "root@162.35.114.196:$($info.file)" $partial
    if ($LASTEXITCODE -ne 0) { throw 'La descarga del respaldo fallo.' }
    if ((Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash.ToLowerInvariant() -ne $info.sha256) { throw 'El respaldo descargado no supera la comprobacion de integridad.' }
    Move-Item -LiteralPath $partial -Destination $complete
    $keyFile = Join-Path $Destination 'restic-recovery-key.txt'
    if (-not (Test-Path -LiteralPath $keyFile)) {
        & scp.exe @sshOptions 'root@162.35.114.196:/etc/hotel-backup/restic-password' ($keyFile + '.partial')
        if ($LASTEXITCODE -ne 0) { throw 'Falta guardar la clave de recuperacion fuera del VPS.' }
        Move-Item -LiteralPath ($keyFile + '.partial') -Destination $keyFile
    }
    $info | Add-Member -NotePropertyName downloaded -NotePropertyValue ([DateTime]::UtcNow.ToString('o'))
    $info | Add-Member -NotePropertyName local_file -NotePropertyValue $complete
    $info | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Destination 'last-success.json') -Encoding UTF8
    $errorFile = Join-Path $Destination 'last-error.json'
    if (Test-Path -LiteralPath $errorFile) { Remove-Item -LiteralPath $errorFile }
    # Preserve seven complete exports. Each contains the repository's retained history.
    $old = Get-ChildItem -LiteralPath $Destination -File -Filter 'hotel-admin-*.tar.gz' | Sort-Object LastWriteTimeUtc -Descending | Select-Object -Skip 7
    foreach ($file in $old) {
        $resolved = [IO.Path]::GetFullPath($file.FullName)
        if (-not $resolved.StartsWith($Destination + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Ruta de limpieza no valida.' }
        Remove-Item -LiteralPath $resolved
    }
    Write-Output 'Respaldo cifrado descargado a la PC e integridad verificada.'
} catch {
    @{failed=[DateTime]::UtcNow.ToString('o');message='La copia externa fallo. Revisar conexion, tarea programada y registro local.'} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Destination 'last-error.json') -Encoding UTF8
    throw
} finally {
    $mutex.ReleaseMutex(); $mutex.Dispose()
}
