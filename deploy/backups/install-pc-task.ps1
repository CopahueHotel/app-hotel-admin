$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'copy-backup-to-pc.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $script + '"')
$triggers = @(New-ScheduledTaskTrigger -Daily -At '09:15'; New-ScheduledTaskTrigger -AtLogOn -User ([Security.Principal.WindowsIdentity]::GetCurrent().Name))
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'CopahueHotel-RespaldoExterno' -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Description 'Descarga cifrada del respaldo de Administracion al iniciar sesion y diariamente a las 09:15.' -Force | Out-Null
Write-Output 'Tarea de respaldo externo instalada. Requiere PC encendida, sesion iniciada y conexion al VPS.'
