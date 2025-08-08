import { json } from "@sveltejs/kit";
import { N2YO_API_KEY } from "$env/static/private";

export async function GET({ url, fetch }) {
  const lat = url.searchParams.get("lat");
  const lon = url.searchParams.get("lon");
  const alt = url.searchParams.get("alt") ?? "0";
  const radius = url.searchParams.get("radius") ?? "140";
  const category = url.searchParams.get("category") ?? "52"; //starlink

  if (!lat || !lon) {
    return json({ error: "lat and lon required" }, { status: 400 });
  }
  if (!N2YO_API_KEY) {
    return json({ error: "Missing N2YO_API_KEY" }, { status: 500 });
  }

  const upstream = `https://api.n2yo.com/rest/v1/satellite/above/${lat}/${lon}/${alt}/${radius}/${category}/?apiKey=${N2YO_API_KEY}`;

  try {
    const r = await fetch(upstream);
    const data = await r.json().catch(() => ({}));
    return json(data, { status: r.status });
  } catch {
    return json({ error: "Upstream fetch failed" }, { status: 502 });
  }
}
