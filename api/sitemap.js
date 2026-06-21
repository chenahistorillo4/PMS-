const PUBLIC_ROUTES = [
  { path: "/home", priority: "1.0", changefreq: "daily" },
  { path: "/about", priority: "0.8", changefreq: "monthly" },
  { path: "/booking", priority: "0.9", changefreq: "daily" },
  { path: "/schedule", priority: "0.9", changefreq: "daily" },
  { path: "/login", priority: "0.5", changefreq: "monthly" },
  { path: "/register", priority: "0.5", changefreq: "monthly" },
];

function resolveSiteUrl(req) {
  if (process.env.REACT_APP_SITE_URL) {
    return process.env.REACT_APP_SITE_URL.replace(/\/$/, "");
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  }

  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (host) {
    return `https://${String(host).split(",")[0].trim()}`;
  }

  return "https://ferry-app-minsu.vercel.app";
}

function buildSitemap(siteUrl) {
  const lastmod = new Date().toISOString().split("T")[0];
  const urls = PUBLIC_ROUTES.map(
    ({ path: routePath, priority, changefreq }) => `  <url>
    <loc>${siteUrl}${routePath}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`
  ).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

module.exports = (req, res) => {
  const siteUrl = resolveSiteUrl(req);
  const xml = buildSitemap(siteUrl);

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
  res.status(200).send(xml);
};
