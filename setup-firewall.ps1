#Requires -RunAsAdministrator

param(
    [int]$Port = 4789
)

$ruleName = "Z-Files (TCP $Port)"

$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Firewall rule already exists: $ruleName"
    exit 0
}

New-NetFirewallRule `
    -DisplayName $ruleName `
    -Direction Inbound `
    -Protocol TCP `
    -LocalPort $Port `
    -Action Allow `
    -Profile Private, Domain | Out-Null

Write-Host "Firewall rule added for TCP port $Port."
