# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, with the newest release first.

## [Unreleased]

- Ongoing work goes here as the app evolves.

## [0.3.0] - 2026-03-10

### Added

- Structured metrics for stats, unused code, duplication, and circular dependency checks.
- Snapshot history persisted under `.codeweather/snapshots/` for full runs.
- Git metadata capture for snapshots when running inside a repository.
- Terminal trend line comparing the current run against the previous snapshot.
- `history` subcommand for terminal inspection of prior snapshots.
- Self-contained HTML dashboard generation with Chart.js charts, range controls, and a snapshot table.
- `dashboard --output <path>` to write the HTML dashboard to a custom location.
- Snapshot retention control via `history.maxSnapshots`.
- Dedicated tests for metric parsing, runner behavior, dashboard rendering, and config-sensitive check behavior.
- Shared helper utilities for CLI arg sanitization, metric lookup, and cross-platform file opening.

### Changed

- Version updated to `0.3.0`.
- CLI metadata and package description now reflect trend history and dashboard support.
- Markdown reports now include the computed trend line when a previous snapshot exists.
- `stats.exclude` now actually affects `scc` runs by converting glob-like patterns into `--not-match` regex filters.
- `unused`, `duplicates`, and `cycles` now derive pass/warn state from structured metrics first, with stdout parsing only as fallback behavior.
- Dashboard and history functionality now reuse shared snapshot summary logic instead of duplicating metric extraction logic.

### Fixed

- Resolved the mismatch between documented stats exclusions and actual `scc` invocation behavior.
- Prevented false `pass` results when non-default reporters or output formats hide human-readable warning text.
- Added `.codeweather/` to the repository ignore rules so normal tool usage does not dirty the worktree.

### Docs

- README updated for history, dashboard generation, dashboard output control, retention settings, and project `.gitignore` guidance.
- Release guide updated to use the `0.3.0` version line as the current baseline.
