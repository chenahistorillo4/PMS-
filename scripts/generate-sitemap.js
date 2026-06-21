const fs = require("fs");
const path = require("path");

function resolveSiteUrl() {
  if (process.env.REACT_APP_SITE_URL) {
    return process.env.REACT_APP_SITE_URL.replace(/\/$/, "");
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  }

  return "https://ferry-app-minsu.vercel.app";
}

const PUBLIC_ROUTES = [
  { path: "/home", priority: "1.0", changefreq: "daily" },
  { path: "/about", priority: "0.8", changefreq: "monthly" },
  { path: "/booking", priority: "0.9", changefreq: "daily" },
  { path: "/schedule", priority: "0.9", changefreq: "daily" },
  { path: "/login", priority: "0.5", changefreq: "monthly" },
  { path: "/register", priority: "0.5", changefreq: "monthly" },
];

const siteUrl = resolveSiteUrl();
const lastmod = new Date().toISOString().split("T")[0];

const urls = PUBLIC_ROUTES.map(
  ({ path: routePath, priority, changefreq }) => `  <url>
    <loc>${siteUrl}${routePath}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`
).join("\n");

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

const outputDir = path.join(__dirname, "..", "public", "sitemap");
const outputPath = path.join(outputDir, "sitemap.xml");
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, sitemap, "utf8");
console.log(`Generated sitemap/sitemap.xml for ${siteUrl}`);
