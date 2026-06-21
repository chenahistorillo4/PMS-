import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { updatePageSeo } from "../utils/seo";

function SeoManager() {
  const location = useLocation();

  useEffect(() => {
    updatePageSeo(location.pathname);
  }, [location.pathname]);

  return null;
}

export default SeoManager;
