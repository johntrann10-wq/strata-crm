// Run before test files; ensures app and db can load when DATABASE_URL is unset (e.g. in CI).
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://localhost:5432/strata_test";
}
