import { defineConfig } from "astro/config";

const site = process.env.SITE_URL ?? "https://crewlight.qiu.works";

export default defineConfig({
  output: "static",
  site,
  trailingSlash: "always",
});
