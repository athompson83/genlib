# SPDX-License-Identifier: Apache-2.0
param([Parameter(Mandatory=$true)][ValidatePattern('^\d+\.\d+\.\d+$')][string]$Version,
 [Parameter(Mandatory=$true)][string]$UpdateFeed)
$ErrorActionPreference='Stop'
$feed=[Uri]$UpdateFeed
if(-not $feed.IsAbsoluteUri -or $feed.Scheme -ne 'https' -or $feed.UserInfo -or $feed.Query -or $feed.Fragment){throw 'Trusted HTTPS update feed required'}
$root=Split-Path $PSScriptRoot -Parent
Push-Location $PSScriptRoot
try {
  dotnet tool restore
  if($LASTEXITCODE -ne 0){throw 'Tool restore failed'}
  dotnet publish "$root/avalonia/GenlibInventory.csproj" -c Release "-p:GenlibUpdateFeed=$UpdateFeed" "-p:Version=$Version" -r win-x64 --self-contained true -o "$root/artifacts/win-x64"
  if($LASTEXITCODE -ne 0){throw 'Publish failed'}
  dotnet tool run vpk pack --packId dev.genlib.inventory --packVersion $Version --packDir "$root/artifacts/win-x64" --mainExe GenlibInventory.exe --outputDir "$root/artifacts/releases"
  if($LASTEXITCODE -ne 0){throw 'Package failed'}
} finally {Pop-Location}
