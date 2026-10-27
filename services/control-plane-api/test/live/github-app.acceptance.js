if (process.env.RUN_LIVE_GITHUB_APP_ACCEPTANCE !== "true") {
  console.log(
    "SKIP: set RUN_LIVE_GITHUB_APP_ACCEPTANCE=true with an isolated GitHub App installation",
  );
  process.exit(0);
}
throw new Error(
  "Live acceptance requires operator-provided fixture IDs; follow docs/GITHUB_APP.md",
);
