const SITE_URL =
  (process.env.REACT_APP_SITE_URL || "").replace(/\/$/, "") ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL.replace(/\/$/, "")}` : "") ||
  "https://ferry-app-minsu.vercel.app";

const PUBLIC_ROUTES = [
  { path: "/home", priority: "1.0", changefreq: "daily" },
  { path: "/about", priority: "0.8", changefreq: "monthly" },
  { path: "/booking", priority: "0.9", changefreq: "daily" },
  { path: "/schedule", priority: "0.9", changefreq: "daily" },
  { path: "/login", priority: "0.5", changefreq: "monthly" },
  { path: "/register", priority: "0.5", changefreq: "monthly" },
];

function buildSitemapXml() {
  const lastmod = new Date().toISOString().split("T")[0];
  const urls = PUBLIC_ROUTES.map(
    ({ path, priority, changefreq }) =>
      `  <url>\n    <loc>${SITE_URL}${path}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`
  ).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

module.exports = (req, res) => {
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=3600, must-revalidate");

  if (req.method === "HEAD") {
    res.status(200).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).end("Method Not Allowed");
    return;
  }

  res.status(200).end(buildSitemapXml());
};
