import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "dotenv";
import type { NextConfig } from "next";

const picktripEnvPath =
  process.env.PICKTRIP_PUBLIC_ENV_PATH ??
  path.resolve(process.cwd(), "../Picktrip_web_app/.env.local");
const picktripPublicEnv = (() => {
  try {
    const parsed = parse(readFileSync(picktripEnvPath));
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? parsed.NEXT_PUBLIC_MAPBOX_TOKEN;
    return token ? { NEXT_PUBLIC_MAPBOX_TOKEN: token } : {};
  } catch {
    return {};
  }
})();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: { root: process.cwd() },
  env: picktripPublicEnv,
};

export default nextConfig;
