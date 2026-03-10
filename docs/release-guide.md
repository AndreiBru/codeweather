# Release Guide

A beginner-friendly guide to maintaining and releasing the `codeweather` npm package.

## 1. Making a New Release — The Big Picture

The release flow for an npm package is basically three steps:

1. **Bump the version** in `package.json`
2. **Publish** the new version to npm
3. (Optionally) **tag** the release in git

npm has built-in commands that help with all of this.

## 2. How Version Numbers Work (Semver)

The version in `package.json` follows **semver** (semantic versioning): `MAJOR.MINOR.PATCH`.

| Part | When to bump | Example |
|---|---|---|
| **PATCH** (0.3.0 → 0.3.**1**) | Bug fixes, small tweaks that don't change how people use your tool | Fixed a typo in output |
| **MINOR** (0.3.0 → 0.**4**.0) | New features that don't break existing usage | Added a new `--json` flag |
| **MAJOR** (0.3.0 → **1**.0.0) | Breaking changes — something that would make existing users' stuff stop working | Renamed a CLI command, changed config format |

Since the package is on `0.x.x`, it's in "pre-1.0" territory. By convention, this signals "this is still evolving and the API isn't fully stable yet." Many packages stay at `0.x` for a while — that's perfectly fine.

## 3. The `npm version` Command

This is the main command you'll use. It does **three things at once**:

```bash
npm version patch    # 0.3.0 → 0.3.1
npm version minor    # 0.3.0 → 0.4.0
npm version major    # 0.3.0 → 1.0.0
```

When you run one of these, npm will:

1. **Update** `package.json` — changes the `"version"` field automatically
2. **Git commit** — creates a commit with the message `v0.2.2` (or whatever the new version is)
3. **Git tag** — creates a git tag like `v0.3.1`

So one command handles the version bump, the commit, and the tag. You don't need to manually edit `package.json`.

**Important caveat:** `npm version` will refuse to run if you have uncommitted changes in your working directory. So always commit (or stash) your work first, then bump.

## 4. Publishing to npm

After bumping:

```bash
npm publish
```

That's it. This uploads whatever is in your `files` array (in this case, `dist` and `bin`) to the npm registry. People can then `npm install codeweather` and get the new version.

### Typical full workflow

```bash
# 1. Make sure everything is committed and tests pass
pnpm test
pnpm build

# 2. Bump the version (this commits + tags automatically)
npm version patch

# 3. Publish to npm
npm publish

# 4. Push the commit and tag to GitHub
git push && git push --tags
```

## 5. Key Things to Keep in Mind as a Maintainer

### The `files` array is your friend

`package.json` has a `files` field that controls what gets included in the package people download. Only `dist` and `bin` are shipped — source code, tests, and config files stay out. This keeps the package small. You can always check what would be published by running:

```bash
npm pack --dry-run
```

### Always build before publishing

`npm publish` just ships whatever files exist on disk. It doesn't run the build automatically. So if you forget to run `pnpm build` before `npm publish`, you'll ship stale code. A common safeguard is adding a `prepublishOnly` script:

```json
"scripts": {
  "prepublishOnly": "pnpm build"
}
```

This runs automatically right before every `npm publish`, so you can never accidentally ship without building.

### Test your package locally before publishing

You can run `npm pack` to create a `.tgz` file (the exact thing that would be uploaded to npm), then install it in another project to verify it works:

```bash
npm pack                              # creates codeweather-0.3.1.tgz
cd /some/other/project
npm install /path/to/codeweather-0.2.2.tgz
```

### Don't publish secrets

Double-check you're not shipping `.env` files, tokens, or config with real credentials. The `files` whitelist approach is the safest — only what's explicitly listed gets published.

### Keep a changelog

As the package grows, users will appreciate knowing what changed between versions. Even a simple `CHANGELOG.md` with a few bullet points per version goes a long way.

### The `engines` field

`package.json` has an `engines` field set to `"node": ">=18"`. This tells users (and tools) which Node.js versions the package supports. Keep this accurate.

### npm provenance (nice to have)

If you publish from a GitHub Actions workflow, you can add `--provenance` to your publish command. This adds a verified badge on npmjs.com showing the package was built from your actual GitHub repo — builds trust with users.

## Quick Reference Cheat Sheet

| What you want to do | Command |
|---|---|
| See current version | `npm version` (no args) |
| Bug fix release | `npm version patch` |
| New feature release | `npm version minor` |
| Breaking change release | `npm version major` |
| Preview what gets published | `npm pack --dry-run` |
| Publish to npm | `npm publish` |
| Push version tag to GitHub | `git push --tags` |
