$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$warnings = @()
function Read-Class($name, $props) {
    try { @(Get-CimInstance -ClassName $name -OperationTimeoutSec 8 | Select-Object -Property $props) }
    catch { $script:warnings += "$name unavailable"; @() }
}
$cpu = Read-Class 'Win32_Processor' @('Name','Manufacturer','NumberOfCores','NumberOfLogicalProcessors','L2CacheSize','L3CacheSize','CurrentClockSpeed','MaxClockSpeed','SocketDesignation','Architecture','AddressWidth')
$memory = Read-Class 'Win32_PhysicalMemory' @('DeviceLocator','BankLabel','Capacity','Manufacturer','PartNumber','ConfiguredClockSpeed','Speed','SMBIOSMemoryType','DataWidth','TotalWidth')
$board = Read-Class 'Win32_BaseBoard' @('Manufacturer','Product','Version')
$bios = Read-Class 'Win32_BIOS' @('SMBIOSBIOSVersion','Manufacturer')
$os = Read-Class 'Win32_OperatingSystem' @('Caption','Version','BuildNumber','TotalVisibleMemorySize')
$cache = Read-Class 'Win32_CacheMemory' @('Level','InstalledSize','Purpose')
$gpu = @(Read-Class 'Win32_VideoController' @('Name','PNPDeviceID','DriverVersion','AdapterRAM','Status','VideoProcessor') | Where-Object { $_.PNPDeviceID -like 'PCI\*' })
$gpus = @()
foreach ($g in $gpu) {
    $pci = $null
    try {
        $bus = (Get-PnpDeviceProperty -InstanceId $g.PNPDeviceID -KeyName 'DEVPKEY_Device_BusNumber' -ErrorAction Stop).Data
        $address = (Get-PnpDeviceProperty -InstanceId $g.PNPDeviceID -KeyName 'DEVPKEY_Device_Address' -ErrorAction Stop).Data
        if ($null -ne $bus -and $null -ne $address) { $pci = '{0:x2}:{1:x2}.{2:x1}' -f $bus,($address -shr 16),($address -band 0xffff) }
    } catch { }
    $gpus += [pscustomobject]@{ name=$g.Name; pnp=$g.PNPDeviceID; driver=$g.DriverVersion; pci=$pci; status=$g.Status; processor=$g.VideoProcessor }
}
[pscustomobject]@{ cpu=@($cpu); memory=@($memory); board=@($board); bios=@($bios); os=@($os); cache=@($cache); gpus=@($gpus); warnings=@($warnings) } | ConvertTo-Json -Depth 6 -Compress
