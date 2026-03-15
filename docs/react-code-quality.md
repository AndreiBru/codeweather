# Monitoring and Maintaining React Code Quality Over Time

---

## Table of Contents

1. [Introduction](#introduction)
2. [Code Metrics — What to Track and Why](#code-metrics)
3. [Cognitive Complexity](#cognitive-complexity)
4. [Coupling and Instability with dependency-cruiser](#coupling-and-instability)
5. [Code Churn](#code-churn)
6. [Hotspot Analysis](#hotspot-analysis)
7. [CodeScene and X-Ray](#codescene-and-xray)
8. [Putting It All Together — A Monitoring Rhythm](#putting-it-all-together)

---

## 1. Introduction

Code quality in a React project isn't a one-time audit — it's a signal that drifts over time. Files get busier. Dependencies accumulate. A component that was simple in month one becomes the most-changed, most-complex file in the codebase by month twelve, and nobody quite noticed it happening.

The goal of this guide is to give you a concrete, repeatable set of tools and practices to **detect degradation early**, understand where your real risk lives, and make informed decisions about where to invest refactoring effort.

The approach here does not require expensive tooling to get started. Most of the techniques are buildable from git history, static analysis, and a few open-source tools — with CodeScene as an optional layer for teams that want a polished, automated view.

---

## 2. Code Metrics — What to Track and Why

### The core signals

There are several categories of metric worth tracking in a React codebase. Not all are equally useful, and some are actively misleading if treated as targets rather than signals.

**Complexity** measures how hard code is to understand and test. The two most relevant variants are cyclomatic complexity (number of paths through code) and cognitive complexity (how hard the code is to reason about — covered in detail in the next section).

**Coupling** measures how entangled modules are with each other. In React this shows up as components that import from too many places, or shared hooks that everything depends on. Covered in section 4.

**Size** is a crude but useful proxy. A 1,500-line component file is almost always doing too much. Tracking file and function size over time reveals growth before it becomes a crisis.

**Churn** measures how frequently files change, derived from git history. On its own it's noisy. Combined with complexity it becomes one of the most actionable signals available. Covered in section 5.

**Dependency health** covers outdated packages and known vulnerabilities. Tools like Dependabot handle this automatically and are outside the scope of this guide, but worth having running in CI regardless.

### Snapshots vs. trends

A single measurement tells you where you are. A series of measurements over time tells you which direction you're drifting — and drift is almost always the real problem.

A codebase where complexity is high but stable is a different situation from one where complexity has doubled in three months. The first is a known constraint; the second is a warning sign.

The practical implication: run your metrics on a schedule (weekly or monthly), store the output, and compare over time. The tooling to do this doesn't need to be sophisticated — a dated file in a `/metrics` folder in your repo is enough to start.

### What not to do

Do not set numeric targets for metrics and enforce them in CI without careful thought. Teams game metrics. A coverage target of 80% produces tests written to hit 80%, not tests written to catch bugs. A complexity limit of 10 produces functions artificially split at the limit, not genuinely simpler code.

Use metrics as **conversation starters and navigation tools**, not as pass/fail gates.

---

## 3. Cognitive Complexity

### What it is

Cognitive complexity was developed by SonarSource as an improvement on cyclomatic complexity. Cyclomatic complexity counts the number of independent paths through code — useful, but it treats all control flow equally. A flat `switch` with ten cases scores the same as three deeply nested `if` blocks, even though the nested version is significantly harder to understand.

Cognitive complexity weights control flow by context. It penalizes:

- **Nesting** — each additional level of indentation adds more to the score than the previous level
- **Control flow breaks** — `break`, `continue`, `return` inside loops
- **Recursion**
- **Complex boolean expressions** — long `&&` and `||` chains

### Reading the score

| Score | Interpretation |
|---|---|
| 0–5 | Simple, easy to understand |
| 6–10 | Moderate — worth watching |
| 11–20 | Complex — consider refactoring |
| 20+ | High risk — prioritise refactoring |

These thresholds are guidelines, not rules. A score of 18 in a well-tested, rarely-changed utility function is less concerning than a score of 12 in a component that changes every sprint.

### React-specific patterns that inflate cognitive complexity

**Deeply nested conditional rendering** is the most common culprit in React:

```jsx
// High cognitive complexity — deeply nested ternaries
function OrderStatus({ order }) {
  return (
    <div>
      {order.status === 'pending'
        ? <Spinner />
        : order.status === 'failed'
          ? order.retryable
            ? <RetryButton />
            : <ErrorMessage />
          : order.items.length > 0
            ? <ItemList items={order.items} />
            : <EmptyState />}
    </div>
  );
}
```

**Refactored — lower complexity:**

```jsx
function OrderStatus({ order }) {
  if (order.status === 'pending') return <Spinner />;
  if (order.status === 'failed') return <FailedOrder order={order} />;
  return order.items.length > 0
    ? <ItemList items={order.items} />
    : <EmptyState />;
}

function FailedOrder({ order }) {
  return order.retryable ? <RetryButton /> : <ErrorMessage />;
}
```

**Hooks with complex branching logic** are another common source. A custom hook that handles multiple async states with conditional side effects can accumulate cognitive complexity quickly. Extracting sub-hooks or separating concerns helps.

### Tooling

**ESLint** with the `complexity` rule enforces cyclomatic complexity, not cognitive. It's a rough proxy but better than nothing:

```json
// .eslintrc
{
  "rules": {
    "complexity": ["warn", 10]
  }
}
```

**SonarCloud** (free for public repos, paid for private) calculates true cognitive complexity and tracks it over time with trend charts. It integrates directly with GitHub pull requests, surfacing complexity increases in code review.

**CodeClimate** is an alternative with a cleaner UI. It grades files from A to F and tracks how grades drift over time per PR.

---

## 4. Coupling and Instability with dependency-cruiser

### The concepts

**Afferent coupling (Ca)** is the number of modules that depend on a given module — arrows pointing *in*. High Ca means many things rely on this module. It is stable but changes are high-risk, because a modification ripples outward.

**Efferent coupling (Ce)** is the number of modules a given module depends on — arrows pointing *out*. High Ce means this module reaches out to many things. It is fragile, because changes elsewhere can break it.

**Instability** is a score derived from both:

```
I = Ce / (Ca + Ce)
```

Score ranges from 0 to 1:

- **0 (maximally stable)** — many things depend on it, it depends on little. A shared utility or design system component. Hard to change without broad impact.
- **1 (maximally unstable)** — nothing depends on it, it depends on many things. A page-level component or feature entry point. Easy to change in isolation.

Neither extreme is inherently bad. The key principle is the **stable dependencies rule**: stable modules should not depend on unstable ones. If your core business logic depends on a volatile UI helper, that is a structural smell — a change in the UI layer can cascade into the domain.

### React-specific challenges

A few things make coupling analysis trickier in React than in Java or C#:

**Barrel files** (`index.js` that re-exports everything from a folder) can make every file appear to depend on an entire module, obscuring real relationships. Configure dependency-cruiser to look through them.

**Dynamic imports** (`React.lazy`, `import()`) are not always captured by static analysis. They represent real coupling but may be invisible to the tool.

**Hooks as hidden coupling** — a custom hook that calls three different API clients and reads from a global store is tightly coupled even if its import signature looks simple.

### Setting up dependency-cruiser

Install it:

```bash
npm install --save-dev dependency-cruiser
npx depcruise --init
```

This creates a `.dependency-cruiser.js` config file.

### Visualising the dependency graph

Generate a visual graph of your `src/` directory:

```bash
npx depcruise src \
  --output-type dot \
  --config .dependency-cruiser.js \
  | dot -T svg > dependency-graph.svg
```

Open the SVG in a browser. Dense clusters of arrows between modules indicate tight coupling. Isolated nodes indicate things that depend on many others but nothing depends on them (high instability — often fine for pages, worth questioning for shared logic).

You can also scope to a specific folder:

```bash
npx depcruise src/features/checkout \
  --output-type dot | dot -T svg > checkout-deps.svg
```

### Writing rules to enforce architecture

This is where dependency-cruiser goes beyond visualisation and becomes an **active architectural guardrail**. You define rules in your config file, and violations fail CI.

**Rule: domain logic must not import from UI components**

```javascript
// .dependency-cruiser.js
module.exports = {
  forbidden: [
    {
      name: "domain-not-allowed-to-use-ui",
      comment: "Domain logic should be independent of UI rendering",
      severity: "error",
      from: { path: "^src/domain" },
      to: { path: "^src/components" },
    }
  ]
};
```

**Rule: features must not directly import from other features**

Enforces that cross-feature communication goes through a shared layer, not direct imports between feature folders:

```javascript
{
  name: "no-cross-feature-imports",
  comment: "Features should not import from each other directly",
  severity: "warn",
  from: { path: "^src/features/([^/]+)/" },
  to: {
    path: "^src/features/([^/]+)/",
    pathNot: "^src/features/$1/"  // same feature is fine
  }
}
```

**Rule: no circular dependencies**

Circular dependencies are almost always an abstraction problem — two modules that depend on each other should probably share a third:

```javascript
{
  name: "no-circular",
  severity: "error",
  from: {},
  to: { circular: true }
}
```

**Rule: shared components must not import from feature-specific code**

```javascript
{
  name: "shared-components-stay-generic",
  comment: "Components in /shared must not depend on feature-specific modules",
  severity: "error",
  from: { path: "^src/components/shared" },
  to: { path: "^src/features" }
}
```

### Running validation in CI

Add to your `package.json`:

```json
{
  "scripts": {
    "depcruise": "depcruise src --config .dependency-cruiser.js"
  }
}
```

Then call `npm run depcruise` in your CI pipeline. Violations at `error` severity fail the build. `warn` severity surfaces in output without failing.

### Approximating instability scores

dependency-cruiser doesn't compute Ca/Ce/Instability scores directly, but you can extract them from its JSON output:

```bash
npx depcruise src --output-type json > deps.json
```

Then process with a small script:

```javascript
// analyse-instability.js
const data = require('./deps.json');

const ca = {};
const ce = {};

for (const module of data.modules) {
  const file = module.source;
  ce[file] = module.dependencies.length;
  for (const dep of module.dependencies) {
    ca[dep.resolved] = (ca[dep.resolved] || 0) + 1;
  }
}

const results = Object.keys(ce).map(file => {
  const caVal = ca[file] || 0;
  const ceVal = ce[file] || 0;
  const total = caVal + ceVal;
  const instability = total === 0 ? 0 : ceVal / total;
  return { file, ca: caVal, ce: ceVal, instability };
});

// Sort by instability descending
results
  .sort((a, b) => b.instability - a.instability)
  .slice(0, 20)
  .forEach(r =>
    console.log(
      `${r.instability.toFixed(2)} | ca:${r.ca} ce:${r.ce} | ${r.file}`
    )
  );
```

Run with:

```bash
node analyse-instability.js
```

**Interpreting the output for a React project:**

| What you see | What it means |
|---|---|
| Page components near I=1.0 | Expected — they compose many things, nothing imports them |
| Shared hooks near I=0.8–1.0 | Worth investigating — hooks with high Ce but low Ca are fragile |
| `utils/` files near I=0.0 | Stable and depended upon — changes here are high-risk |
| Domain logic with I>0.5 | Smell — core logic should lean toward stability |
| Any file with circular dependency | Structural problem, resolve promptly |

---

## 5. Code Churn

### What it is

Churn is simply how often a file changes, measured from git history. It is extracted from version control and requires no additional tooling beyond git itself.

### Basic churn extraction

Files changed most frequently in the last 90 days:

```bash
git log --since="90 days ago" \
  --name-only \
  --pretty=format: \
  | grep -E '\.(ts|tsx|js|jsx)$' \
  | sort | uniq -c | sort -rn \
  | head -30
```

This gives you a ranked list: the number on the left is the churn count, the path on the right is the file.

### Why raw churn is noisy

A file changed 40 times could mean:
- It is the most important, actively developed file in the codebase (healthy)
- It keeps getting bug-fixed because the abstraction is wrong (unhealthy)
- It absorbs unrelated changes because the code is not well-separated (unhealthy)
- It gets touched every time a dependency is bumped (noise)

Context matters. Raw churn needs to be filtered and combined with other signals to be useful.

### Filtering by commit type

If your team uses [Conventional Commits](https://www.conventionalcommits.org/) (`fix:`, `feat:`, `refactor:`, etc.), you can isolate the most meaningful kind of churn — bug-fix churn:

```bash
git log --since="90 days ago" \
  --grep="^fix" \
  --name-only \
  --pretty=format: \
  | grep -E '\.(ts|tsx)$' \
  | sort | uniq -c | sort -rn \
  | head -20
```

A file that appears 15 times in `fix:` commits is a much stronger signal than one that appears in `feat:` commits. It's telling you bugs keep happening in the same place.

### Combining churn with file size

Churn on a 20-line file is fine. Churn on a 900-line component is a problem. Pair the two:

```bash
# Get top churned files, then check their current size
git log --since="90 days ago" \
  --name-only --pretty=format: \
  | sort | uniq -c | sort -rn \
  | head -20 \
  | awk '{print $2}' \
  | xargs wc -l 2>/dev/null | sort -rn
```

Large files with high churn are your most urgent candidates for refactoring.

### Tracking churn over time

Run the same command monthly and store the output:

```bash
mkdir -p metrics
git log --since="90 days ago" --name-only --pretty=format: \
  | grep -E '\.(ts|tsx|js|jsx)$' \
  | sort | uniq -c | sort -rn \
  | head -30 > metrics/churn-$(date +%Y-%m).txt
```

Over several months you build a picture of which files are persistently high-churn (structural problems), which were temporarily high-churn (feature development), and which have calmed down after a refactor (validation that the work was worth doing).

---

## 6. Hotspot Analysis

### The concept

Hotspot analysis comes from Adam Tornhill's work in *Your Code as a Crime Scene* (implemented in his tool CodeScene). The core insight is simple: **not all complex code is a problem, and not all frequently-changed code is a problem — but complex code that changes frequently is always a problem.**

The formula is:

```
hotspot score ≈ complexity × churn
```

This produces a ranking where the files at the top are simultaneously hard to understand and frequently touched — every change is difficult to make and easy to get wrong.

**The quadrant view:**

| | Low churn | High churn |
|---|---|---|
| **Low complexity** | Fine — leave it alone | Fine — it's just busy |
| **High complexity** | Low urgency — it's stable | **Hotspot — act here** |

A complex file that is rarely touched does not need urgent attention. You will likely never need to change it. A complex file that changes constantly is where your team is suffering every sprint.

### A practical hotspot script (no CodeScene required)

This script combines churn count with current file size as a proxy for complexity, and produces a ranked list:

```bash
#!/bin/bash
# hotspots.sh — find high-churn, high-size files in your React project

SINCE="90 days ago"
EXT="ts|tsx|js|jsx"

echo "churn | lines | score | file"
echo "------|-------|-------|-----"

git log --since="$SINCE" --name-only --pretty=format: \
  | grep -E "\.($EXT)$" \
  | sort | uniq -c \
  | while read count file; do
      if [ -f "$file" ]; then
        lines=$(wc -l < "$file")
        score=$((count * lines))
        echo "$count | $lines | $score | $file"
      fi
    done \
  | sort -t'|' -k3 -rn \
  | head -20
```

Make it executable and run it:

```bash
chmod +x hotspots.sh
./hotspots.sh
```

The `score` column (churn × lines) is a rough hotspot rank. Files at the top of the list deserve the most attention.

### Interpreting the results

**Hotspot is a shared hook that everything imports** — high Ce, complex, frequently changed. This is your most dangerous kind of hotspot. Changes here affect everything downstream. Prioritise splitting or simplifying it.

**Hotspot is a large feature component (e.g. `CheckoutForm.tsx`)** — common in React. The component has grown to handle too many concerns. Consider extracting sub-components, splitting form logic into a custom hook, or separating validation from rendering.

**Hotspot is a router or entry point file** — often accumulates changes as features are added. Less alarming if the complexity is low despite the churn. Worth monitoring but not always urgent.

**Hotspot is a utility file with many importers** — high Ca (stable) but also high churn. This is fragile in the opposite direction — every change risks breaking many dependents. This file needs tests more urgently than a refactor.

### Saving hotspot snapshots over time

```bash
./hotspots.sh > metrics/hotspots-$(date +%Y-%m).txt
```

Comparing this month's top-20 to last month's reveals whether the same files keep appearing (chronic problem) or whether the list is rotating (healthy development activity).

---

## 7. CodeScene and X-Ray

### What CodeScene adds over DIY scripts

The git scripts in sections 5 and 6 give you 70% of the value at zero cost. CodeScene adds:

- A polished UI with historical trend charts for all metrics
- Code health scores that combine multiple signals automatically
- Developer-level analysis — who has knowledge of which code, and where knowledge is concentrated in a single person (a risk factor)
- True function-level analysis via X-Ray (see below)

**Pricing:** Free for public repositories. Paid (team/enterprise pricing) for private repos. The free tier is a reasonable way to evaluate whether the full product is worth it for your team.

### X-Ray — function-level hotspot analysis

File-level hotspot analysis is a navigation tool. It tells you *which file* to look at. X-Ray tells you *which function inside that file* is actually the problem.

A 1,500-line file might contain:
- 20 functions that are boring, stable, and simple
- 2 functions that are complex and change with every sprint

File-level analysis treats those 1,500 lines as a single signal. X-Ray separates them.

**What X-Ray surfaces:**

- Churn ranking per function within a file
- Cognitive complexity score per function
- A combined code health score per function
- Functions whose health has degraded over time
- High-churn functions with no test coverage (particularly high risk)

**Why this matters in practice:**

Instead of "refactor `orderProcessor.ts`" — a vague, large task — X-Ray tells you "the `applyDiscountRules` function inside `orderProcessor.ts` accounts for 60% of the churn and has cognitive complexity of 24." That is an actionable, scoped piece of work.

### DIY approximations of X-Ray

Getting function-level churn from git alone is hard. Git tracks line changes, not function changes — a modified line inside a function looks the same as a modified line in a comment.

**The `-L` flag** — tracks changes to a specific function by name across history. Useful for investigating a function you already suspect, but does not scale to whole-codebase scanning:

```bash
git log -L :applyDiscountRules:src/checkout/orderProcessor.ts
```

**ESLint complexity rule** — gives you per-function complexity across the codebase (cyclomatic, not cognitive, but still useful as a starting point):

```json
{
  "rules": {
    "complexity": ["warn", 10],
    "max-lines-per-function": ["warn", { "max": 50 }]
  }
}
```

Run ESLint and pipe the output to a file for tracking:

```bash
npx eslint src --format json > metrics/complexity-$(date +%Y-%m).json
```

**tree-sitter** is a parser library that can break files into an AST (abstract syntax tree) at the function level. Combined with git diff output, it enables true function-level churn analysis. It is significantly more complex to set up but is the closest DIY equivalent to what CodeScene does internally. Worth exploring if your team is committed to this kind of analysis without paying for tooling.

### When to invest in CodeScene

The DIY approach is the right starting point. Add CodeScene when:

- Your team is consistently using the git metrics and wants a faster, more visual workflow
- You want X-Ray's function-level precision without building your own AST tooling
- You want to track knowledge distribution (who owns which code) as a risk signal
- You have private repos and the pricing is justifiable against the time saved

The single most important precondition is that **someone on the team owns the question** of whether the metrics are getting better or worse. Tooling without ownership produces dashboards nobody looks at — "metric theater." The scripts are enough if someone actually runs them and acts on what they find.

---

## 8. Putting It All Together — A Monitoring Rhythm

### Suggested cadence

**On every PR (automated in CI):**
- dependency-cruiser rules validation (`npm run depcruise`) — catches architectural violations immediately
- ESLint complexity warnings — surfaces new complexity introductions in code review

**Monthly (manual or scheduled script):**
- Run `hotspots.sh` and save output to `/metrics/hotspots-YYYY-MM.txt`
- Run churn analysis and save to `/metrics/churn-YYYY-MM.txt`
- Regenerate dependency graph SVG and compare to previous month

**Quarterly (team review):**
- Compare monthly snapshots — which files are persistently in the top-20?
- Review dependency-cruiser rules — are they still reflecting the architecture you want?
- Identify one or two hotspots to address in the upcoming quarter

### A minimal `/metrics` folder structure

```
/metrics
  /churn
    2025-01.txt
    2025-02.txt
    2025-03.txt
  /hotspots
    2025-01.txt
    2025-02.txt
    2025-03.txt
  /graphs
    dependency-graph-2025-01.svg
    dependency-graph-2025-03.svg
  README.md   ← notes on what changed and why, per quarter
```

The `README.md` in the metrics folder is where the real value accumulates — brief notes like "hotspot `CheckoutForm.tsx` refactored in February, dropped from score 8400 to 1200 by Q2" turn raw numbers into institutional memory.

### The mindset

Metrics are a **navigation system**, not a scorecard. The goal is not a low complexity score — the goal is a codebase where your team can move quickly with confidence, and where the parts that are risky are known, watched, and addressed deliberately.

A codebase that has three known hotspots and a plan to address two of them next quarter is in a much healthier position than one with unknown hotspots and no visibility into where the pain lives.

> *"The goal is not perfect code. The goal is code whose problems are visible."*
