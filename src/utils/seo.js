const DEFAULT_SITE_NAME = "PMS Ferry";
const DEFAULT_DESCRIPTION =
  "Book ferry tickets online for Pinamalayan, Marinduque, and Sibale routes. View schedules, pay with GCash, and manage bookings with PMS Ferry.";
const DEFAULT_KEYWORDS =
  "PMS Ferry, ferry booking, Pinamalayan, Marinduque, Sibale, boat ticket, ferry schedule, Philippines ferry";

const PUBLIC_ROUTES = new Set([
  "/",
  "/home",
  "/about",
  "/login",
  "/register",
  "/booking",
  "/schedule",
]);

const ROUTE_SEO = {
  "/": {
    title: "PMS Ferry | Online Ferry Booking – Pinamalayan, Marinduque, Sibale",
    description: DEFAULT_DESCRIPTION,
  },
  "/home": {
    title: "PMS Ferry | Online Ferry Booking – Pinamalayan, Marinduque, Sibale",
    description: DEFAULT_DESCRIPTION,
  },
  "/about": {
    title: "About PMS Ferry | Pinamalayan – Marinduque – Sibale Routes",
    description:
      "Learn about PMS Ferry, our mission, and how we provide reliable online ferry reservations for travelers in Oriental Mindoro and Marinduque.",
  },
  "/login": {
    title: "Login | PMS Ferry",
    description: "Sign in to your PMS Ferry account to book tickets and manage reservations.",
  },
  "/register": {
    title: "Create Account | PMS Ferry",
    description: "Register for a PMS Ferry account to book ferry tickets online.",
  },
  "/booking": {
    title: "Book Ferry Tickets | PMS Ferry",
    description:
      "Search available ferry trips and book tickets online for Pinamalayan, Marinduque, and Sibale.",
  },
  "/schedule": {
    title: "Ferry Schedule | PMS Ferry",
    description: "View up-to-date PMS Ferry schedules and departure times.",
  },
};

function getSiteOrigin() {
  if (typeof window !== "undefined" && window.location.origin) {
    return window.location.origin;
  }

  const configured = process.env.REACT_APP_SITE_URL;
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  return "";
}

function upsertMetaTag(attribute, key, content) {
  if (!content || typeof document === "undefined") {
    return;
  }

  let element = document.head.querySelector(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }

  element.setAttribute("content", content);
}

function upsertLinkTag(rel, href) {
  if (!href || typeof document === "undefined") {
    return;
  }

  let element = document.head.querySelector(`link[rel="${rel}"]`);
  if (!element) {
    element = document.createElement("link");
    element.setAttribute("rel", rel);
    document.head.appendChild(element);
  }

  element.setAttribute("href", href);
}

function removeStructuredData() {
  document
    .querySelectorAll('script[data-seo="structured-data"]')
    .forEach((node) => node.remove());
}

function addStructuredData(origin) {
  removeStructuredData();

  const payload = {
    "@context": "https://schema.org",
    "@type": "TravelAgency",
    name: DEFAULT_SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    url: `${origin}/home`,
    areaServed: ["Pinamalayan", "Marinduque", "Sibale", "Philippines"],
    serviceType: "Ferry ticket booking",
  };

  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.setAttribute("data-seo", "structured-data");
  script.textContent = JSON.stringify(payload);
  document.head.appendChild(script);
}

export function getSeoForPath(pathname) {
  const normalized = pathname === "/" ? "/home" : pathname;
  return (
    ROUTE_SEO[pathname] ||
    ROUTE_SEO[normalized] || {
      title: `${DEFAULT_SITE_NAME} | Ferry Booking`,
      description: DEFAULT_DESCRIPTION,
    }
  );
}

export function shouldIndexPath(pathname) {
  return PUBLIC_ROUTES.has(pathname);
}

export function updatePageSeo(pathname) {
  const seo = getSeoForPath(pathname);
  const origin = getSiteOrigin();
  const canonicalPath = pathname === "/" ? "/home" : pathname;
  const canonicalUrl = origin ? `${origin}${canonicalPath}` : canonicalPath;
  const indexable = shouldIndexPath(pathname);
  const imageUrl = origin ? `${origin}/homebg.png` : "/homebg.png";

  document.title = seo.title;

  upsertMetaTag("name", "description", seo.description);
  upsertMetaTag("name", "keywords", DEFAULT_KEYWORDS);
  upsertMetaTag("name", "robots", indexable ? "index, follow" : "noindex, nofollow");
  upsertMetaTag("name", "author", DEFAULT_SITE_NAME);

  upsertMetaTag("property", "og:title", seo.title);
  upsertMetaTag("property", "og:description", seo.description);
  upsertMetaTag("property", "og:type", "website");
  upsertMetaTag("property", "og:site_name", DEFAULT_SITE_NAME);
  upsertMetaTag("property", "og:url", canonicalUrl);
  upsertMetaTag("property", "og:image", imageUrl);
  upsertMetaTag("property", "og:locale", "en_PH");

  upsertMetaTag("name", "twitter:card", "summary_large_image");
  upsertMetaTag("name", "twitter:title", seo.title);
  upsertMetaTag("name", "twitter:description", seo.description);
  upsertMetaTag("name", "twitter:image", imageUrl);

  upsertLinkTag("canonical", canonicalUrl);

  if (indexable && origin && (pathname === "/" || pathname === "/home" || pathname === "/about")) {
    addStructuredData(origin);
  } else {
    removeStructuredData();
  }
}

export { DEFAULT_SITE_NAME, DEFAULT_DESCRIPTION };
