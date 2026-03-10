export default async function handler(req, res) {
  const rawUrl = String(req.query.url || "");
  if (!rawUrl) {
    return res.status(400).json({ error: "Missing image url" });
  }

  let remote;
  try {
    remote = new URL(rawUrl);
  } catch {
    return res.status(400).json({ error: "Invalid image url" });
  }

  if (!/^https?:$/.test(remote.protocol)) {
    return res.status(400).json({ error: "Unsupported protocol" });
  }

  try {
    const upstream = await fetch(remote.toString(), {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        referer: "https://www.youtube.com/",
      },
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: "Failed to fetch image" });
    }

    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    const bytes = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.status(200).send(bytes);
  } catch {
    return res.status(500).json({ error: "Proxy image failed" });
  }
}

