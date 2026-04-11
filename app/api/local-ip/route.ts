import { networkInterfaces } from "os";

export async function GET() {
  const nets = networkInterfaces();
  let ip = "localhost";

  for (const iface of Object.values(nets)) {
    for (const net of iface ?? []) {
      if (net.family === "IPv4" && !net.internal) {
        ip = net.address;
        break;
      }
    }
    if (ip !== "localhost") break;
  }

  return Response.json({ ip });
}
