import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  engine: "classic",
  datasource: {
    url: env("DATABASE_URL"),
    // Shadow DBを使わない方針（migrate dev 非推奨）。実DBの状態を前提に migrate deploy で適用する。
  },
});
