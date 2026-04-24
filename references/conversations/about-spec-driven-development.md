Great, I have a thorough picture of the current state of the art. Here's a comprehensive guide:

---

## Spec-Driven Development for AI Agents: A Practical Guide

This is one of the most important practices in AI-assisted development right now. Here's how to do it well, based on what's actually working in production.

---

### The Core Mental Model

There's a useful distinction between _specs_ and the more general _context documents_ for a codebase. General context covers things like rules files or high-level product descriptions — relevant across all AI coding sessions. Specs, on the other hand, are only relevant to the tasks that actually create or change that particular piece of functionality.

Think of it as three layers:

**Layer 1 — Memory Bank** (always loaded, always true)
**Layer 2 — Specs** (feature/domain-specific contracts)
**Layer 3 — Tasks** (discrete units of work an agent executes)

---

### The Four-Phase SDD Workflow

The proven pattern is: **Spec → Plan → Tasks → Implement**. The coding agent knows _what_ to build (specification), _how_ to build it (plan), and _what to work on_ (task). Your role is to verify at each phase.

Critically, when moving from requirements to plan, you're not asking the agent to start coding yet — you're asking it to _think first_. This step matters: don't move to coding until the plan is validated.

---

### Your File/Folder Structure

Given you already have CLAUDE.md files, plans, specs, and reviews, here's the clean layout to converge on:

```
project-root/
├── CLAUDE.md                    # ≤200 lines, always loaded
│                                # build commands, top conventions, pointers
│
├── .claude/
│   ├── rules/                   # Auto-loaded alongside CLAUDE.md
│   │   ├── code-style.md        # Formatting, naming conventions
│   │   ├── testing.md           # Test requirements & patterns
│   │   ├── api-conventions.md   # Service contracts, REST/RPC rules
│   │   └── security.md          # Auth, secrets, data handling rules
│   │
│   ├── docs/                    # Loaded ON DEMAND by skills/agents
│   │   ├── architecture.md      # System design, ADRs, tech decisions
│   │   ├── services.md          # Your existing service descriptions
│   │   └── data-models.md       # Schemas, relationships
│   │
│   └── commands/                # Slash commands (/project:review etc.)
│
├── specs/
│   ├── _template.md             # Your spec template (see below)
│   ├── feature-auth.md
│   ├── feature-payments.md
│   └── feature-notifications.md
│
└── tasks/
    ├── active/
    │   └── task-001-auth-endpoint.md
    ├── done/
    └── backlog/
```

Keep your root CLAUDE.md under 200 lines — longer files consume more context and adherence actually drops. If instructions are growing large, split them using `.claude/rules/` files.

---

### What Goes in Each Spec File

A spec for an AI agent needs to answer six questions. Leave any of them open and the agent will answer them for you, in ways you won't like:

```markdown
# Spec: [Feature Name]

## 1. Outcome

What does "done" look like in user/system terms?
(Not "build auth" — "A user can sign up, verify email, and log in. Session persists across refreshes.")

## 2. Scope

### In scope

- ...

### Explicitly OUT of scope

- ...
  (The out-of-scope list matters as much as in-scope. Agents expand scope if you don't close the door.)

## 3. Constraints

- Tech stack requirements
- Performance/SLA requirements
- Integration contracts with other services
- What NOT to touch

## 4. Prior Decisions

- Why we chose X over Y
- Architectural decisions already made
- Links to relevant ADRs or reviews

## 5. Task Breakdown

- [ ] Task A: [concrete, isolated, testable]
- [ ] Task B: ...

## 6. Verification Criteria

- What tests must pass
- What edge cases must be handled
- Acceptance criteria in observable terms
```

The spec is your _contract_ with the AI agent — it defines success in user terms, not technical jargon. Be specific enough that another developer could implement without asking for clarification.

---

### Converting Your Existing Files

Here's a practical approach to migrate your current docs:

**CLAUDE.md files** → Keep as is, but audit for length. Strip anything that's a procedure or only relevant to one subsystem — move those to `.claude/rules/` or `specs/`.

**project_specs.md** → Break apart by feature/domain into individual files in `specs/`. One feature = one file.

**plans/** → These become the "Plan" sections inside spec files, or task files in `tasks/backlog/`. A plan without a parent spec should get one written around it.

**reviews/** → Extract the _decisions made_ into the `Prior Decisions` section of the relevant spec. The reasoning behind decisions is gold for agents.

**service configs** → Document in `.claude/docs/services.md`. Reference from relevant spec files.

---

### Key Principles That Actually Matter

**Specs are living documents.** Don't write and forget. Update the spec as you and the agent make decisions or discover new info. Treat it as version-controlled documentation — commit it to the repo.

**Human-curated beats auto-generated.** Per ETH research, LLM-generated context files _reduced_ task success rates while increasing inference costs by over 20%. Human-curated files yielded roughly a 4-percentage-point improvement. Write them manually.

**Short and specific beats long and vague.** Context file bloat reduces task success. More rules do not produce better performance. Silent rule dropout in long sessions is a documented issue — keep files short and place critical rules early.

**Separate planning from implementation.** Once specs are finalized, hand them to the coding agent to generate code, using your CLAUDE.md/AGENTS.md for technical requirements like architectural style and constraints. The planning phase is a human-in-the-loop iterative process.

**Use an adversarial verification pattern.** The most underused pattern in SDD is assigning a separate agent to _check_ the work rather than trusting the implementing agent to self-verify. A Coordinator breaks down the spec into tasks for Implementor sub-agents; a Verifier agent then checks output against the spec before marking work complete.

---

### Tools Worth Knowing

- **GitHub Spec Kit** — A CLI that bootstraps SDD scaffolding. Templates define what a spec looks like, what a technical plan encompasses, and how tasks are broken down for agents to pick up and execute.
- **Amazon Kiro** — Another tool with predefined SDD workflows, alongside GitHub Spec Kit.
- **Claude Code Plan Mode** — Restricts the agent to read-only operations so it can analyze your codebase and draft a spec without writing any code. Ideal for the planning phase.

---

### The Most Common Mistake

If you don't decide what you're building and _why_ before handing off to agents, the codebase becomes the de-facto specification — a collection of seemingly disjoint components that are hard to maintain, evolve, and debug. Code is a binding artifact; once written, it's very hard to decouple from.

Your existing files are valuable raw material — the goal is to distill them into the clean six-section spec format above, one feature at a time, so every agent session starts with a clear contract rather than archaeology.
