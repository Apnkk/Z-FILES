import os from "os";

const VIRTUAL_INTERFACE = /vpn|radmin|tailscale|vmware|virtual|hyper-v|vethernet|bluetooth|tunnel|loopback/i;

export function getNetworkInterfaces() {
  const results = [];
  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) {
        results.push({ name, ip: address.address });
      }
    }
  }
  return results;
}

export function scoreNetworkInterface(name, ip) {
  const lower = name.toLowerCase();
  if (VIRTUAL_INTERFACE.test(lower)) return -100;
  if (ip.startsWith("169.254.") || ip.startsWith("26.")) return -100;

  let score = 0;
  if (/wi-?fi|wlan|wireless/i.test(lower)) score += 50;
  if (/ethernet|eth/i.test(lower)) score += 40;
  if (ip.startsWith("192.168.")) score += 30;
  else if (ip.startsWith("10.")) score += 25;
  else if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) score += 20;
  return score;
}

export function getPreferredLocalIp() {
  const interfaces = getNetworkInterfaces();
  if (!interfaces.length) return "127.0.0.1";
  return [...interfaces].sort(
    (a, b) => scoreNetworkInterface(b.name, b.ip) - scoreNetworkInterface(a.name, a.ip)
  )[0].ip;
}
