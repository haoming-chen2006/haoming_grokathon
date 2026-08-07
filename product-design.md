# Grok Build Software Project Control Room

## 1. Product Summary

A local visual workspace where users supervise multiple Grok Build coding agents working together to turn a software design document into reviewed, tested, and merge-ready code.
use /Users/haoming/openui/verifiables.md to understand if yo completed the loop (this is a checklist)

The product combines:

* **Grok Build** as the coding-agent execution, prompting, skills, and tool-use backbone;
* **OpenUI** as the foundation for launching, displaying, and reopening agent sessions;
* a Google-Docs-like product and technical design document;
* repository, branch, worktree, test, and pull-request tracking;
* Linear-style engineering tasks and dependencies;
* Git-style code and document review;
* reusable coding agents, prompts, skills, workflows, hooks, and MCP tools;
* per-agent cost tracking and spending limits.

The user can see:

* which Grok agent owns each requirement;
* which branch or worktree it is modifying;
* which files it changed;
* whether its tests pass;
* which agents are blocked;
* what implementation decisions agents are discussing;
* how much each task costs;
* whether the implementation still matches the design document.

### One-line pitch

> Watch a team of Grok Build agents turn a software design document into reviewed, tested code—requirement by requirement, branch by branch, and dollar by dollar.

---

## 2. Coding-First Product Positioning

This is not primarily a general document-writing product.

It is a **software-project control layer for Grok Build**.

The initial supported project type is software development:

* web applications;
* APIs;
* developer tools;
* infrastructure changes;
* repository migrations;
* bug-fix projects;
* refactors;
* test-coverage projects;
* documentation tied directly to code.

The document remains central because it defines what the code should accomplish.

The repository remains central because it proves what has actually been implemented.

### Product relationship

```text
Design document
Defines what should be built
        ↓
Task and dependency plan
Defines who builds each part
        ↓
Grok Build agents
Modify isolated worktrees
        ↓
Tests, diffs, reviews, and merges
Prove what was built
```

The long-term architecture may support research and other professional projects, but the Grokathon implementation and product pitch are coding-first.

---

## 3. Two-Phase Workflow

The product divides software projects into two explicit phases.

## Phase 1: Design Development

The user and Grok agents develop or refine:

* product requirements;
* technical design;
* architecture;
* API contracts;
* implementation constraints;
* milestones;
* acceptance criteria;
* test requirements;
* rollout plan.

During this phase, agents primarily:

* inspect the repository;
* ask clarifying questions;
* identify technical risks;
* propose design changes;
* decompose the project into implementation tasks.

No implementation begins until the user approves the plan.

## Phase 2: Design Execution

Approved requirements become coding tasks.

Grok agents:

* create isolated branches or worktrees;
* edit source files;
* run commands;
* install dependencies when permitted;
* run tests and linters;
* exchange implementation artifacts;
* propose code changes;
* identify design deviations;
* request reviews;
* prepare merge-ready outputs.

The system continuously compares:

```text
Approved design
versus
Current implementation
versus
Test evidence
```

---

## 4. Core Product Principle

> The design document is the implementation contract, and the repository is the execution environment.

The canonical design document is read-only to coding agents by default.

Agents may:

* read approved requirements;
* inspect the repository;
* search the codebase;
* create isolated worktrees;
* edit code in assigned worktrees;
* run builds, tests, and linters;
* use Grok Build tools;
* use project MCP tools;
* communicate with other agents;
* submit code branches and patches;
* propose design-document changes;
* attach test results and implementation evidence;
* request clarification or permission.

Agents may not silently rewrite approved requirements.

When implementation reveals that the design must change, the agent submits a design suggestion.

Example:

```text
Original requirement:
Authentication should open inside a modal.

Frontend Agent finding:
The OAuth provider blocks embedded authentication.

Proposed change:
Use a full-page OAuth redirect flow.

[Accept] [Reject] [Discuss]
```

Agents may directly modify code inside their assigned worktree, but code does not enter the main branch without the required review and merge process.

---

## 5. Foundation Repositories

### Grok Build

https://github.com/xai-org/grok-build

Grok Build provides:

* coding-agent sessions;
* repository context;
* file editing;
* shell execution;
* web tools;
* skills;
* personas;
* subagents;
* MCP integration;
* hooks;
* session persistence;
* worktree-aware coding workflows;
* ACP embedding.

### OpenUI fork

https://github.com/JJ27/openui

### OpenUI upstream

https://github.com/Fallomai/openui

OpenUI provides the starting architecture for:

* spawning local coding agents;
* persistent sessions;
* agent status cards;
* embedded terminal views;
* WebSocket streaming;
* drag-and-drop agent organization;
* session restoration;
* project-local storage.

### Agent Client Protocol

https://github.com/agentclientprotocol/agent-client-protocol

https://github.com/agentclientprotocol/typescript-sdk

ACP connects the OpenUI-based backend to each visible Grok Build process.

### Model Context Protocol

https://github.com/modelcontextprotocol/typescript-sdk

https://github.com/modelcontextprotocol/servers

MCP exposes controlled project, document, repository, task, artifact, and agent-communication tools.

---

## 6. System Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│ OpenUI-Based Software Project Workspace                      │
│                                                              │
│ Agent Control Room     Design Document     Coding Skills     │
│ Live Sessions          Requirement Map     Tool Library      │
│ Branch/Test Status     Suggestions         Cost Tracking     │
│ Diff Review            Repository View     Merge Controls    │
└──────────────────────────────┬───────────────────────────────┘
                               │
                    Bun/Hono Orchestration Server
                               │
                    ACP over JSON-RPC stdio
          ┌────────────────────┼────────────────────┐
          │                    │                    │
   Grok Planner         Grok Backend Agent   Grok Frontend Agent
   ACP process          ACP process          ACP process
          │                    │                    │
          └────────────────────┼────────────────────┘
                               │
                   Grok Test and Review Agents
                               │
                      Project MCP Servers
                               │
     Design Doc · Repo · Tasks · Messages · Tests · Artifacts
```

---

## 7. Responsibility Split

## Grok Build handles

* repository understanding;
* code search;
* model interaction;
* implementation reasoning;
* prompt execution;
* file editing;
* shell commands;
* builds and tests;
* built-in web and coding tools;
* reusable agent definitions;
* reusable coding skills;
* personas;
* native subagents;
* MCP tool calls;
* session context;
* authentication;
* worktree execution.

## The orchestration server handles

* project state;
* repository metadata;
* approved design-document versions;
* requirements;
* visible top-level agents;
* task assignments;
* dependencies;
* worktree and branch ownership;
* agent communication;
* permissions;
* costs and budgets;
* document suggestions;
* code-review state;
* test evidence;
* merge approvals;
* project progress;
* event history.

## The OpenUI-based frontend handles

* agent cards and status;
* session launch and restoration;
* live Grok transcripts;
* design-document display;
* requirement-to-code mapping;
* branch and worktree status;
* changed-file summaries;
* test-result visualization;
* code and document review;
* cost and progress visualization;
* reusable coding-agent configuration.

---

## 8. Main Product Objects

## Software Project

Contains:

* repository;
* base branch;
* project goal;
* canonical design document;
* requirements;
* milestones;
* coding agents;
* tasks and dependencies;
* branches and worktrees;
* test requirements;
* budget;
* activity history.

## Requirement

A statement describing expected software behavior.

Each requirement contains:

* description;
* acceptance criteria;
* related design section;
* assigned implementation tasks;
* owning agent;
* affected files or modules;
* test coverage;
* implementation status;
* related branch;
* review status.

Example:

```text
Requirement AUTH-03

Users remain signed in after refreshing the page.

Owner: Backend Agent
Branch: agent/auth-session
Tests: 4/4 passing
Implementation: complete
Review: pending
```

## Coding Agent

Each agent has:

* name and avatar;
* Grok session;
* coding role;
* persona;
* reusable skills;
* tools;
* repository permissions;
* worktree;
* branch;
* spending limit;
* current task;
* current status.

Example agents:

* Planner
* Repository Explorer
* Backend Engineer
* Frontend Engineer
* Test Engineer
* Security Reviewer
* Integration Reviewer

## Coding Task

A unit of implementation work.

Each task contains:

* objective;
* linked requirement;
* assigned agent;
* branch or worktree;
* dependencies;
* expected files or modules;
* completion criteria;
* required tests;
* status;
* cost;
* conversation thread;
* code-review state.

## Code Artifact

An output created during implementation.

Examples:

* branch;
* commit;
* patch;
* diff;
* API contract;
* database migration;
* test report;
* benchmark;
* screenshot;
* build artifact;
* deployment log.

## Design Suggestion

A proposed modification to the approved specification.

Each suggestion shows:

* originating agent;
* affected requirement;
* original text;
* proposed text;
* implementation reason;
* affected code;
* risks;
* cost;
* accept, reject, or request-revision controls.

---

## 9. Grok Agent Model

The product uses two levels of agents.

## Visible top-level coding agents

Each major user-facing role runs as a separate Grok Build ACP process.

Examples:

* Planner
* Backend Agent
* Frontend Agent
* Test Agent
* Reviewer

Each visible agent:

* has its own Grok session;
* appears as an OpenUI card;
* owns tasks and requirements;
* works in an isolated branch or worktree;
* can be opened and messaged directly;
* has separate usage and cost records;
* can be paused, stopped, or resumed;
* receives project-specific prompts, skills, and MCP tools.

Sessions launch through:

```bash
grok --no-auto-update agent stdio
```

## Internal Grok subagents

A visible coding agent may spawn native Grok subagents for temporary parallel work.

Example:

```text
Backend Agent
├── Database-schema explorer
├── Authentication-library researcher
└── Session-race-condition investigator
```

Internal subagents appear as expandable child tasks inside the parent card.

They do not need full top-level canvas nodes unless the user promotes them into independently controlled agents.

---

## 10. Main Coding Workflow

## Step 1: Open a repository

The user selects:

* local repository;
* base branch;
* project name;
* project objective;
* budget;
* optional deadline;
* existing issue, PRD, or technical design.

The application inspects:

* repository structure;
* language and framework;
* build commands;
* test commands;
* lint commands;
* existing contribution instructions;
* current Git status.

## Step 2: Create or import the design document

The user may:

* write a new PRD;
* import a technical design;
* paste an issue;
* generate an initial design with Grok;
* connect an existing design to the repository.

The design should define:

* required behavior;
* architecture;
* constraints;
* acceptance criteria;
* test expectations;
* rollout requirements.

## Step 3: Configure the coding-agent team

Example:

```text
Planner
Persona: Senior Technical Lead
Skills:
- Repository Analysis
- Task Decomposition
- Dependency Planning

Backend Agent
Persona: Careful Backend Engineer
Skills:
- API Implementation
- Database Migrations
- Unit Testing

Frontend Agent
Persona: Product-Focused Frontend Engineer
Skills:
- React Implementation
- Accessibility Checks
- Component Testing

Reviewer
Persona: Skeptical Staff Engineer
Skills:
- Code Review
- Security Review
- Design Compliance
```

Each agent receives:

* agent definition;
* persona;
* selected skills;
* selected MCP tools;
* repository permissions;
* shell permissions;
* task budget;
* worktree policy;
* review requirements.

## Step 4: Planner analyzes design and repository

The Planner reads:

* project objective;
* approved design;
* repository structure;
* relevant existing code;
* tests;
* available agents;
* project budget.

The Planner proposes:

* implementation milestones;
* coding tasks;
* requirement ownership;
* dependencies;
* branches or worktrees;
* expected files;
* required tests;
* review gates;
* integration order.

Example:

```text
Milestone 1: Authentication API
Owner: Backend Agent
Dependencies: none
Worktree: auth-backend

Milestone 2: Login interface
Owner: Frontend Agent
Dependency: authentication API contract
Worktree: auth-frontend

Milestone 3: Integration tests
Owner: Test Agent
Dependencies: Milestones 1 and 2

Milestone 4: Security review
Owner: Reviewer
Dependencies: complete implementation
```

The user approves or edits the plan before code execution begins.

## Step 5: Create isolated worktrees

The orchestration server creates one isolated coding environment per implementation agent.

Example:

```text
Backend Agent
Worktree: .agents/auth-backend
Branch: agent/auth-backend

Frontend Agent
Worktree: .agents/auth-frontend
Branch: agent/auth-frontend
```

This prevents agents from overwriting one another’s changes.

## Step 6: Agents implement tasks in parallel

Agents can:

* inspect files;
* modify assigned modules;
* create new files;
* run commands;
* run tests;
* call MCP tools;
* ask other agents questions;
* submit implementation artifacts.

The UI shows real coding activity:

```text
Backend Agent
Working: implementing refresh-token rotation
Files changed: 6
Tests: 18/20 passing
Branch: agent/auth-backend
Cost: $0.71
```

## Step 7: Agents exchange structured implementation handoffs

Example API handoff:

```text
Backend Agent → Frontend Agent

Authentication endpoint is ready.

POST /api/auth/login
Response schema: artifact/auth-contract-v2
Branch: agent/auth-backend
Tests: 12/12 passing
```

Example bug report:

```text
Test Agent → Backend Agent

Concurrent refresh requests can issue two valid tokens.

Failing test:
tests/auth/session_refresh_test.py

[Open test] [Open branch] [Reply]
```

Every message references:

* requirement;
* coding task;
* file;
* branch;
* artifact;
* test;
* review;
* or blocker.

## Step 8: Agents submit code for review

A completed coding task produces:

* branch or patch;
* changed-file list;
* diff;
* test results;
* implementation summary;
* known limitations;
* related design requirements;
* cost.

Example:

```text
Backend Agent submission

Branch: agent/auth-backend
Files changed: 8
Lines: +412 / -37
Unit tests: 22/22 passing
Lint: passing
Requirements covered: AUTH-01, AUTH-02, AUTH-03
Cost: $0.84

[View Diff] [Request Review] [Request Changes]
```

## Step 9: Agents propose design changes when necessary

Agents must not silently deviate from the approved design.

Example:

```text
Frontend Agent proposes a design change

Original:
Authentication opens inside a modal.

Problem:
The selected OAuth provider blocks embedded authentication.

Proposed:
Use a redirect flow and return users to the original route.

Affected files:
src/auth/Login.tsx
src/routes/oauth-callback.tsx

[Accept] [Reject] [Discuss]
```

If accepted, the design document receives a new version and affected agents are notified.

## Step 10: Test and review agents validate implementation

The Test Agent verifies:

* acceptance criteria;
* unit tests;
* integration tests;
* regression behavior;
* build status;
* lint status.

The Reviewer verifies:

* code quality;
* security;
* design compliance;
* API compatibility;
* unimplemented requirements;
* undocumented deviations;
* merge conflicts.

## Step 11: Merge approved work

The user can:

* approve a branch;
* request revisions;
* ask another Grok agent to review;
* merge branches in dependency order;
* reject an implementation;
* rerun failed tests;
* pause work when the budget is exceeded.

## Step 12: Finalize the software project

The completed project preserves:

* final design document;
* requirement history;
* accepted code branches;
* commits and diffs;
* test evidence;
* rejected alternatives;
* agent conversations;
* cost history;
* implementation provenance.

---

## 11. Main Interface

The application contains three connected views.

## A. Software Project Document

This is the default project view.

```text
┌──────────────────────────────────────────────────────────────┐
│ Authentication Project · 72% · $4.12/$10 · [Pause All]      │
│ Grok agents: 3 working · 1 waiting · 1 review required      │
├──────────────┬───────────────────────────┬───────────────────┤
│ Requirements │ Design Document           │ Implementation    │
│              │                           │                   │
│ AUTH-01 ✓    │ Authentication Design     │ Backend Agent     │
│ AUTH-02 ●    │                           │ 🟢 Working         │
│ AUTH-03 ●    │ Session requirements...   │ 18/20 tests       │
│ AUTH-04 ○    │                           │ $0.71             │
│              │ [Design suggestion]       │ [Open Session]    │
└──────────────┴───────────────────────────┴───────────────────┘
```

### Top bar

Displays:

* project progress;
* cost and budget;
* active Grok agents;
* passing and failing tests;
* pending code reviews;
* pending design suggestions;
* pause-all control.

### Left panel

Displays:

* requirements;
* milestones;
* coding tasks;
* task dependencies;
* assigned agents;
* implementation status;
* review status;
* test status.

### Center document

Displays:

* approved product requirements;
* approved technical design;
* architecture;
* API contracts;
* acceptance criteria;
* design suggestions;
* implementation-status badges.

### Right implementation panel

Displays information connected to the selected requirement:

* assigned agent;
* worktree and branch;
* current coding action;
* changed files;
* tests;
* blockers;
* cost;
* related messages;
* open-session button.

---

## B. Agent Command Center

This retains OpenUI’s visual canvas.

```text
┌ Planner ─────────────┐  ┌ Backend Agent ──────────┐
│ 🟡 Waiting            │  │ 🟢 Working               │
│ Waiting for API work  │  │ Editing auth/session.ts │
│ Cost: $0.22           │  │ Tests: 18/20            │
└───────────────────────┘  └─────────────────────────┘

┌ Frontend Agent ──────┐  ┌ Reviewer ───────────────┐
│ 🟡 Blocked            │  │ 🔴 Idle                  │
│ Needs API contract    │  │ Starts after code ready │
│ Cost: $0.16           │  │ Cost: $0.00             │
└───────────────────────┘  └─────────────────────────┘
```

Each coding-agent card shows:

* agent role;
* status;
* current task;
* branch;
* worktree;
* latest file or command;
* tests;
* cost;
* blocker;
* review state.

Clicking a card opens:

* live Grok transcript;
* terminal activity;
* tools used;
* files changed;
* Git diff;
* tests;
* internal subagents;
* messages;
* pause and stop controls.

---

## C. Code Review View

This view connects implementation directly to requirements.

```text
Requirement AUTH-03
Users remain signed in after refreshing.

Implementation:
Branch: agent/auth-backend
Files changed: 4
Tests: 4/4 passing

Diff:
+ session refresh handler
+ token rotation
+ persistence test

Reviewer:
No design violations found.

[Approve Merge] [Request Changes] [Ask Grok Reviewer]
```

---

## 12. Agent Status System

* **Green — Working:** editing files, analyzing code, running tools, or executing tests.
* **Yellow — Waiting:** blocked by another branch, contract, approval, agent, or user.
* **Blue — Needs review:** code, design change, or merge requires approval.
* **Gray — Complete:** task passed tests and required reviews.
* **Red — Idle or stopped:** session exists but is not executing.
* **Error — Failed:** command, build, test, or agent session failed.

Observable examples:

* Searching repository
* Editing `src/auth/session.ts`
* Running unit tests
* Waiting for API contract
* Resolving merge conflict
* Preparing code-review submission
* Awaiting design-change approval
* Budget limit reached

---

## 13. Coding MCP Tools

## Project and requirement tools

```text
get_project
get_requirements
get_requirement
get_technical_design
get_acceptance_criteria
update_task_progress
report_blocker
complete_task
```

## Repository tools

```text
get_repository_summary
get_branch_status
get_worktree_status
list_changed_files
get_diff
get_test_commands
get_build_commands
```

## Agent communication tools

```text
send_agent_message
ask_agent
reply_to_agent
handoff_api_contract
handoff_code_artifact
report_failing_test
request_agent_review
escalate_to_user
```

## Design suggestion tools

```text
submit_design_suggestion
revise_design_suggestion
submit_architecture_comment
request_requirement_change
request_direct_document_permission
```

## Code review tools

```text
submit_code_for_review
request_code_changes
approve_code_submission
record_test_result
record_review_result
request_merge
```

## Artifact tools

```text
create_artifact
get_artifact
attach_artifact_to_requirement
attach_test_report
attach_api_contract
attach_screenshot
```

The backend validates permissions before:

* modifying the canonical document;
* merging a branch;
* changing project requirements;
* exceeding a budget;
* running restricted commands.

---

## 14. Reusable Coding Agents, Prompts, and Skills

## Reusable coding agents

Examples:

* Repository Explorer
* Backend Engineer
* Frontend Engineer
* Test Engineer
* Security Reviewer
* Migration Specialist
* Performance Engineer
* Documentation Engineer

## Personas

Example:

```text
Careful Backend Engineer

Prefer small, reviewable changes.
Follow existing repository patterns.
Run relevant tests after every major change.
Do not modify unrelated files.
Escalate architecture changes before implementation.
```

## Coding skills

Examples:

* Repository Orientation
* React Feature Implementation
* FastAPI Endpoint Development
* Unit-Test Generation
* Integration-Test Debugging
* Database Migration
* API Contract Review
* Security Audit
* Performance Profiling
* Pull-Request Review

Example skill:

```text
Test-Driven Bug Fix

1. Reproduce the bug.
2. Locate the smallest responsible code path.
3. Add a failing regression test.
4. Implement the minimal fix.
5. Run targeted tests.
6. Run the broader relevant test suite.
7. Submit the diff and test evidence.
```

## Prompt templates

```text
Implement requirement {requirement_id} in {module}.

Constraints:
- Modify only assigned modules unless necessary.
- Follow existing project patterns.
- Add tests for all acceptance criteria.
- Report design conflicts before deviating.
```

## Coding workflows

Example:

```text
Repository analysis
        ↓
Design review
        ↓
Task decomposition
        ↓
Parallel implementation
        ↓
Unit and integration testing
        ↓
Code review
        ↓
Design-compliance review
        ↓
Human merge approval
```

---

## 15. Coding Progress Tracking

Progress comes from repository and review evidence rather than model estimates.

Example:

```text
Authentication Backend

✓ Worktree created
✓ Existing authentication code inspected
✓ API contract submitted
✓ Endpoint implemented
● Two failing tests remaining
○ Security review
○ Merge approval

Progress: 67%
```

Project progress distinguishes:

* requirement defined;
* task assigned;
* implementation started;
* code submitted;
* tests passing;
* review passed;
* merged;
* requirement complete.

---

## 16. Cost and Budget Tracking

Track cost at:

* project;
* agent;
* requirement;
* coding task;
* branch;
* model request;
* tool call;
* test or build run;
* code-review submission;
* design suggestion.

Example:

```text
Project budget:      $10.00
Spent:                $4.12
Remaining:            $5.88

Planner:              $0.32
Backend Agent:        $1.46
Frontend Agent:       $1.13
Test Agent:           $0.72
Reviewer:             $0.49
```

Controls:

* project cap;
* per-agent cap;
* per-task cap;
* approval threshold;
* warning threshold;
* automatic pause;
* maximum retries;
* maximum tool-call count.

---

## 17. Persistence

Persist:

* OpenUI layout;
* Grok session identifiers;
* repository path;
* base branch;
* worktrees;
* agent branches;
* design-document versions;
* requirements;
* tasks;
* conversations;
* artifacts;
* test results;
* code-review results;
* costs;
* reusable coding skills and workflows.

No expensive coding session restarts automatically after application restart without user approval.

---

## 18. Grokathon MVP Scope

The MVP should implement:

* fork of JJ27/OpenUI;
* Grok Build ACP adapter;
* one local Git repository;
* Planner, Backend, Frontend, Test, and Reviewer templates;
* design-document editor;
* requirement list;
* requirement-to-agent assignment;
* isolated branch or worktree per implementation agent;
* live coding-agent cards;
* expandable Grok sessions;
* branch and changed-file display;
* structured agent handoffs;
* one custom Project MCP server;
* design suggestions;
* code-review submissions;
* basic test-result display;
* merge approval control;
* progress tracking;
* cost tracking;
* reusable coding skills and prompts;
* session and project persistence.

---

## 19. Recommended Grokathon Demonstration

The user opens a repository containing an incomplete web application.

The design document requests:

```text
Build user authentication with:

- Google OAuth
- Email login
- Persistent sessions
- Account deletion
- Integration tests
```

The Planner inspects the repository and proposes:

```text
Backend Agent:
Authentication endpoints and sessions

Frontend Agent:
Login and account-management interface

Test Agent:
Authentication integration tests

Reviewer:
Security and design-compliance review
```

The user approves the plan.

The system creates isolated worktrees and launches Grok Build agents.

The command center shows:

```text
Backend Agent — green
Implementing session persistence
18/20 tests passing

Frontend Agent — yellow
Waiting for OAuth callback contract

Test Agent — green
Writing login integration tests

Reviewer — red
Waiting for implementation
```

The Backend Agent sends an API-contract artifact to the Frontend Agent.

The Frontend Agent changes from yellow to green.

The Frontend Agent discovers that the OAuth provider rejects embedded login and proposes a design change from modal authentication to redirect authentication.

The user accepts the design change.

The agents finish their branches.

The Test Agent reports all tests passing.

The Reviewer verifies that every approved requirement is implemented.

The final dashboard shows:

```text
Requirements implemented: 5/5
Branches approved: 3
Tests passing: 42/42
Design changes accepted: 1
Grok agents used: 5
Total cost: $3.84
```

---

## 20. Initial Non-Goals

The MVP will not include:

* general-purpose white-collar workflows;
* full GitHub or GitLab replacement;
* automatic production deployment;
* unrestricted main-branch editing;
* automatic merging without approval;
* complex merge-conflict resolution;
* deeply nested agent organizations;
* arbitrary multi-provider orchestration;
* public skill marketplace;
* enterprise access controls;
* mobile support;
* support for every programming language and build system.

---

## 21. Product Differentiation

The product is not merely:

* a multi-terminal interface;
* a coding-agent launcher;
* a prompt library;
* a project document;
* a workflow graph;
* or a pull-request dashboard.

Its core value is:

> A visual software-project control system that connects every approved requirement to the Grok agent, branch, code changes, tests, conversations, cost, and review decisions responsible for implementing it.

The main differentiators are:

* Grok Build as the coding-agent backbone;
* OpenUI-based live multi-agent observability;
* design document as an implementation contract;
* isolated coding worktrees;
* requirement-to-code traceability;
* one-click access to every Grok session;
* structured agent-to-agent engineering handoffs;
* visible branches, files, tests, and blockers;
* suggestion-based design changes;
* human-controlled code merging;
* reusable Grok coding agents, personas, prompts, and skills;
* reusable MCP project tools;
* complete implementation provenance;
* persistent sessions and project state.

## Product tagline

> From design doc to tested code—with every Grok agent, branch, decision, and dollar visible.
