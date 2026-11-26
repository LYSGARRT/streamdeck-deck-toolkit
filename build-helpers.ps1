# Compiles the small Windows helper programs in helper\ into com.lysgarrt.decktoolkit.sdPlugin\bin\.
# Uses the C# compiler that ships with Windows (.NET Framework 4.x) – no Visual Studio needed.
# The SwitchBot helper additionally needs the Windows 10/11 SDK (for Windows.winmd) and the
# .NET Framework 4.8 reference assemblies (".NET Framework 4.8 Developer Pack").
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$fw   = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319"
$csc  = "$fw\csc.exe"
$bin  = Join-Path $root "com.lysgarrt.decktoolkit.sdPlugin\bin"
$fac  = "${env:ProgramFiles(x86)}\Reference Assemblies\Microsoft\Framework\.NETFramework\v4.8\Facades"

function Build($name, [string[]]$refs) {
  $args = @("/nologo", "/nowarn:1701,162", "/target:exe", "/out:$bin\$name.exe") + ($refs | ForEach-Object { "/reference:$_" }) + @("$root\helper\$name.cs")
  & $csc @args
  if ($LASTEXITCODE -ne 0) { throw "$name failed" }
  Write-Host "built $name.exe"
}

Build "ddc"     @("System.Management.dll")
Build "volume"  @()
Build "headset" @()
Build "avatar"  @("System.Drawing.dll")
$winmd = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\UnionMetadata\*\Windows.winmd" -ErrorAction SilentlyContinue |
  Sort-Object { [version]$_.Directory.Name } -ErrorAction SilentlyContinue | Select-Object -Last 1
if ((Test-Path $fac) -and $winmd) {
  Build "switchbot" @($winmd.FullName, "$fw\System.Runtime.WindowsRuntime.dll", "$fac\System.Runtime.dll",
                      "$fac\System.Threading.Tasks.dll", "$fac\System.Runtime.InteropServices.WindowsRuntime.dll")
} else {
  Write-Warning "Skipping switchbot.exe: needs the Windows 10/11 SDK (UnionMetadata\Windows.winmd) and the .NET Framework 4.8 Developer Pack."
}
