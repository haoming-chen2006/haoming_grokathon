## 22. Verifiable Completion Checklist

This section defines the objective completion criteria for the project.

A coding agent loop must work through every required item, collect evidence, and continue fixing the implementation until:

* every required item is marked **PASS**;
* every required automated test passes;
* every required manual verification has recorded evidence;
* no placeholder implementation remains;
* no unresolved critical blocker remains.

The agent must not claim the project is complete merely because files were created or the application compiles.

---

### 22.1 Verification Rules

For every checklist item, record:

```text
Status: PASS | FAIL | BLOCKED | NOT TESTED
Evidence:
- command executed;
- test output;
- file paths;
- screenshot or UI observation;
- API response;
- Git branch or commit;
- explanation.

Next action:
- none when passed;
- exact repair required when failed;
- exact external dependency when blocked.
```

A valid completed item must contain reproducible evidence.

Invalid evidence includes:

* “This should work.”
* “The implementation appears correct.”
* “The code was added.”
* “The UI component exists.”
* “Tests were not run, but the logic looks valid.”

---

### 22.2 Loop Behavior

The verification loop follows this sequence:

```text
1. Read this checklist.
2. Inspect the current repository and running application.
3. Select the highest-priority item that is not passing.
4. Reproduce or test the required behavior.
5. Implement the smallest necessary fix.
6. Run targeted tests.
7. Run relevant regression tests.
8. Record evidence.
9. Update the checklist status.
10. Continue until all required items pass.
```

The loop must stop and ask for human input when:

* an action requires credentials that were not provided;
* an irreversible operation requires approval;
* the project would exceed its spending limit;
* requirements contradict one another;
* a required external service is unavailable;
* completing one requirement would violate another approved requirement.

---

### 22.3 Build and Installation

#### V-001: Repository installs successfully

Required result:

* project dependencies install from a clean environment;
* installation instructions are documented;
* no undocumented manual file changes are required.

Evidence:

```text
Installation command:
Command exit code:
Relevant output:
```

#### V-002: Development server starts

Required result:

* backend and frontend services start successfully;
* expected local URLs are documented;
* startup does not produce an unrecoverable error.

Evidence:

```text
Startup command:
Frontend URL:
Backend URL:
Health status:
```

#### V-003: Production build succeeds

Required result:

* frontend production build passes;
* backend compilation or validation passes;
* no type-checking or bundling failure remains.

Evidence:

```text
Build command:
Type-check command:
Exit codes:
```

---

### 22.4 Grok Build Integration

#### V-004: Grok Build is detected

Required result:

* the application verifies that the `grok` executable is installed;
* the installed version is displayed;
* a missing installation produces a useful setup message.

Evidence:

```text
Detection command:
Detected version:
Failure-state test:
```

#### V-005: ACP session launches successfully

Required result:

* the backend launches Grok Build using the configured ACP command;
* the process establishes a valid ACP session;
* startup, disconnect, and failure events reach the frontend.

Expected command:

```bash
grok --no-auto-update agent stdio
```

Evidence:

```text
Session ID:
Process status:
ACP initialization event:
```

#### V-006: Multiple visible Grok agents can run

Required result:

* at least four independent top-level Grok sessions can be created;
* each session has a separate identity, task, status, and transcript;
* stopping one session does not stop unrelated sessions.

Required agent templates:

* Planner;
* Implementation Agent;
* Test Agent;
* Reviewer.

Evidence:

```text
Agent IDs:
Concurrent session count:
Isolation test:
```

#### V-007: Grok session persistence works

Required result:

* session metadata survives application restart;
* reconnectable sessions can be reopened;
* disconnected sessions are visibly marked;
* expensive work does not restart automatically.

Evidence:

```text
Restart procedure:
Restored session IDs:
Observed behavior:
```

---

### 22.5 Repository and Worktree Isolation

#### V-008: Repository can be opened

Required result:

* user can select a local Git repository;
* base branch and current Git status are displayed;
* invalid directories are rejected clearly.

Evidence:

```text
Repository path:
Base branch:
Git status:
```

#### V-009: Agent worktrees are isolated

Required result:

* each implementation agent receives a separate Git branch and worktree;
* changes made by one agent do not appear in another agent’s worktree;
* branch and worktree paths are visible in the interface.

Evidence:

```text
Agent:
Branch:
Worktree:
Isolation test:
```

#### V-010: Changed files and diffs are displayed

Required result:

* agent cards or review pages show changed files;
* the user can inspect a diff;
* unrelated repository changes are not attributed to the wrong agent.

Evidence:

```text
Changed files:
Diff location:
Attribution test:
```

#### V-011: Main branch is protected

Required result:

* agents cannot silently write directly to the main branch;
* merging requires an explicit approved action;
* rejected work remains isolated.

Evidence:

```text
Protected branch:
Attempted direct-write result:
Merge approval record:
```

---

### 22.6 Design Document and Requirements

#### V-012: Design document can be created or imported

Required result:

* user can create a document;
* user can import or paste an existing design;
* content persists after page reload.

Evidence:

```text
Document ID:
Import method:
Persistence test:
```

#### V-013: Requirements are trackable

Required result:

* design sections can be represented as explicit requirements;
* each requirement has an ID, status, owner, and acceptance criteria;
* selecting a requirement reveals related implementation activity.

Evidence:

```text
Requirement IDs:
Assigned owners:
Linked UI view:
```

#### V-014: Canonical document is protected

Required result:

* coding agents receive read access by default;
* agents cannot directly rewrite approved content without scoped permission;
* unauthorized document writes are rejected by the backend.

Evidence:

```text
Agent permission:
Rejected operation:
Backend response:
```

#### V-015: Design suggestions work

Required result:

* an agent can propose a document change;
* the suggestion includes original content, proposed content, explanation, and author;
* user can accept, reject, edit, or request revision;
* accepted suggestions create a new document version.

Evidence:

```text
Suggestion ID:
Original version:
Resulting version:
Review action:
```

#### V-016: Version conflicts are detected

Required result:

* suggestions contain a base document version;
* stale suggestions are not silently applied;
* conflicts trigger rebase, rerun, or human review.

Evidence:

```text
Base version:
Current version:
Conflict behavior:
```

---

### 22.7 Planning and Task Execution

#### V-017: Planner generates an implementation plan

Required result:

* Planner reads the design and repository;
* Planner returns structured milestones, tasks, dependencies, owners, and tests;
* plan is editable before execution.

Evidence:

```text
Plan ID:
Tasks generated:
Dependencies generated:
```

#### V-018: User approval gates execution

Required result:

* proposed tasks do not launch automatically;
* user can edit assignments and budgets;
* Grok coding sessions launch only after approval.

Evidence:

```text
Plan state before approval:
Approval event:
Agents launched:
```

#### V-019: Dependencies affect agent status

Required result:

* blocked tasks are shown as waiting;
* dependency completion can unblock the next agent;
* the status transition is visible without page refresh.

Evidence:

```text
Blocked task:
Dependency:
Observed status transition:
```

#### V-020: Progress uses objective milestones

Required result:

* progress comes from completed deliverables and reviews;
* progress is not based solely on a model-generated percentage;
* project progress updates when tests, reviews, or merges complete.

Evidence:

```text
Progress formula:
Completed checks:
Displayed percentage:
```

---

### 22.8 Agent Visualization

#### V-021: Agent command center works

Required result:

* all visible Grok agents appear on the OpenUI-derived canvas;
* agents can be moved and organized;
* layout persists after restart.

Evidence:

```text
Displayed agents:
Persistence test:
```

#### V-022: Agent states are accurate

Required result:

The UI supports:

* Working;
* Waiting;
* Needs Review;
* Complete;
* Idle or Stopped;
* Failed.

Each status must contain text in addition to color.

Evidence:

```text
State:
Trigger:
Frontend display:
```

#### V-023: Live session drawer works

Required result:

* clicking an agent opens its Grok session;
* transcript and tool activity stream live;
* user can send a message;
* user can pause or stop the agent.

Evidence:

```text
Agent ID:
Stream event:
Control action:
```

#### V-024: Current coding activity is visible

Required result:

Where available, the interface displays:

* active command;
* current tool;
* current task;
* latest changed file;
* branch;
* tests;
* blocker.

Evidence:

```text
Observed event:
Displayed value:
```

---

### 22.9 Multi-Agent Communication

#### V-025: Structured messages work

Required result:

Agents can send:

* questions;
* answers;
* dependency requests;
* implementation handoffs;
* failing-test reports;
* review requests;
* user escalations.

Every message is linked to a task, requirement, file, branch, test, or artifact.

Evidence:

```text
Message ID:
Sender:
Recipient:
Linked object:
```

#### V-026: Agent handoffs work

Required result:

* one agent can produce an artifact;
* another agent receives the artifact and related context;
* the handoff is visible to the user.

Example:

```text
Backend Agent → Frontend Agent
API contract artifact ready.
```

Evidence:

```text
Artifact ID:
Sending agent:
Receiving agent:
```

#### V-027: Conversations do not loop indefinitely

Required result:

* message exchanges have configurable limits;
* repeated unanswered messages do not create infinite agent loops;
* escalation occurs when agents cannot resolve a dependency.

Evidence:

```text
Configured limit:
Loop-prevention test:
Escalation result:
```

---

### 22.10 MCP Tools

#### V-028: Project MCP server connects

Required result:

* Grok Build can discover the custom Project MCP server;
* registered project tools appear to the agent;
* failed connections are reported clearly.

Evidence:

```text
Server name:
Tools discovered:
Connection result:
```

#### V-029: Read tools return scoped project context

Required result:

Tools such as the following return correct project data:

```text
get_project
get_requirements
get_requirement
get_technical_design
get_repository_summary
get_branch_status
```

Evidence:

```text
Tool:
Request:
Response summary:
```

#### V-030: Mutation tools enforce permissions

Required result:

Restricted tools validate:

* agent identity;
* task ownership;
* document permission;
* branch permission;
* approval state;
* budget state.

Evidence:

```text
Tool:
Authorized test:
Unauthorized test:
```

#### V-031: Agent communication tools work through MCP

Required result:

At minimum, verify:

```text
send_agent_message
handoff_code_artifact
report_failing_test
request_agent_review
escalate_to_user
```

Evidence:

```text
Tool:
Result:
Visible UI event:
```

---

### 22.11 Code Execution and Testing

#### V-032: Agent can modify code in its worktree

Required result:

* Grok agent can inspect and edit assigned repository files;
* modifications stay within its worktree;
* changed files are reported to the orchestration server.

Evidence:

```text
Agent:
Modified files:
Branch:
```

#### V-033: Agent can run repository commands

Required result:

* approved shell commands execute;
* exit codes and output are captured;
* dangerous or disallowed commands require approval or are rejected.

Evidence:

```text
Command:
Exit code:
Permission behavior:
```

#### V-034: Test results are recorded

Required result:

* project test commands can be configured or detected;
* test output is linked to an agent and task;
* passing and failing test counts appear in the UI.

Evidence:

```text
Test command:
Passed:
Failed:
Linked task:
```

#### V-035: Failed tests block completion

Required result:

* a task with required failing tests cannot become Complete;
* failure creates a visible blocker;
* rerunning tests updates the status.

Evidence:

```text
Task:
Failing test:
Blocked state:
```

#### V-036: Reviewer checks design compliance

Required result:

Reviewer compares:

* approved requirements;
* code changes;
* test evidence;
* known deviations.

Reviewer flags:

* missing implementation;
* missing tests;
* undocumented behavior changes;
* unrelated code changes;
* unresolved security concerns.

Evidence:

```text
Review ID:
Requirements checked:
Findings:
```

---

### 22.12 Code Review and Merge

#### V-037: Code submission contains complete evidence

Required result:

A submission includes:

* branch;
* changed files;
* diff;
* implementation summary;
* requirements covered;
* test results;
* known limitations;
* cost.

Evidence:

```text
Submission ID:
Required fields present:
```

#### V-038: User can request changes

Required result:

* user or Reviewer can reject a submission;
* feedback is sent to the responsible agent;
* the task returns to Working or Waiting;
* a revised submission can be created.

Evidence:

```text
Original submission:
Review feedback:
Revised submission:
```

#### V-039: Approved code can be merged

Required result:

* merge action requires explicit approval;
* dependency order is respected;
* merge result and commit are recorded;
* failed merge does not incorrectly complete the requirement.

Evidence:

```text
Branch:
Target:
Merge commit:
```

#### V-040: Requirement completion follows merge

Required result:

A requirement is Complete only when:

* implementation is accepted;
* required tests pass;
* required review passes;
* approved code is merged;
* accepted design changes are reflected in the document.

Evidence:

```text
Requirement:
Merge:
Tests:
Review:
```

---

### 22.13 Reusable Agents, Prompts, and Skills

#### V-041: Reusable agent templates persist

Required result:

* user can create an agent template;
* template includes persona, skills, tools, and permissions;
* template can be reused in a new project.

Evidence:

```text
Template:
First project:
Second project:
```

#### V-042: Reusable skills can be assigned

Required result:

* skills are visible in the UI;
* user can assign multiple skills to an agent;
* assigned skill instructions reach the Grok session.

Evidence:

```text
Skill:
Agent:
Session evidence:
```

#### V-043: Prompt templates support variables

Required result:

* prompt templates can contain variables;
* variables resolve using project or task data;
* unresolved required variables produce an error.

Evidence:

```text
Template:
Input variables:
Rendered prompt:
```

#### V-044: Reusable workflow can launch a project plan

Required result:

* saved workflow defines roles, stages, dependencies, and review gates;
* workflow can be applied to another repository;
* project-specific values remain editable.

Evidence:

```text
Workflow:
Applied project:
Generated stages:
```

---

### 22.14 Cost and Safety Controls

#### V-045: Usage is tracked per agent

Required result:

* each agent displays available token or monetary usage;
* usage aggregates to task and project totals;
* unavailable exact costs are clearly labeled.

Evidence:

```text
Agent usage:
Task total:
Project total:
```

#### V-046: Spending limits work

Required result:

* project cap can be configured;
* per-agent or per-task caps can be configured;
* warnings appear before configured thresholds;
* execution pauses at the hard limit.

Evidence:

```text
Configured cap:
Warning threshold:
Observed pause:
```

#### V-047: Restricted actions require approval

Required result:

Examples include:

* main-branch mutation;
* merge;
* destructive shell command;
* credential use;
* production deployment;
* spending-limit increase.

Evidence:

```text
Restricted action:
Approval request:
Result:
```

#### V-048: Secrets are not exposed

Required result:

* secrets are not stored in transcripts or project documents;
* secret values are not sent to unrelated agents;
* frontend does not display raw credentials.

Evidence:

```text
Secret-storage mechanism:
Exposure test:
```

---

### 22.15 Persistence and Recovery

#### V-049: Project state survives restart

Required result:

Persist:

* project;
* design document;
* requirements;
* task graph;
* agents;
* branches and worktrees;
* messages;
* suggestions;
* test results;
* costs;
* OpenUI layout.

Evidence:

```text
State before restart:
State after restart:
```

#### V-050: Failed agent sessions can recover

Required result:

* failed process is visibly marked;
* user can restart or replace the agent;
* task context can be restored;
* duplicate implementation is avoided.

Evidence:

```text
Failure method:
Recovery action:
Restored task:
```

#### V-051: Partial work is not lost

Required result:

* agent branch remains available after crash;
* submitted artifacts remain accessible;
* accepted document changes remain versioned.

Evidence:

```text
Crash test:
Recovered branch:
Recovered artifacts:
```

---

### 22.16 End-to-End Acceptance Test

#### V-052: Complete coding workflow succeeds

Use a repository with an intentionally incomplete feature.

Required flow:

1. Open the repository.
2. Import or create a design document.
3. Generate requirements.
4. Launch the Planner.
5. Approve the implementation plan.
6. Launch multiple Grok Build agents.
7. Create isolated worktrees.
8. Implement tasks in parallel.
9. Exchange at least one structured agent handoff.
10. Submit at least one design suggestion.
11. Accept or reject the suggestion.
12. Run tests.
13. Submit code for review.
14. Request and complete one revision.
15. Approve and merge the final implementation.
16. Mark requirements complete.
17. Restart the application.
18. Confirm that the project and sessions remain visible.

Required final evidence:

```text
Repository:
Feature:
Requirements completed:
Agents used:
Branches created:
Tests passed:
Design suggestions:
Code reviews:
Merge commit:
Total cost:
Persistence result:
```

---

### 22.17 UI Acceptance Checklist

The following must be visually accessible without inspecting backend logs:

```text
[ ] Project goal
[ ] Design document
[ ] Requirement list
[ ] Overall progress
[ ] Overall cost
[ ] Active Grok agents
[ ] Agent role
[ ] Agent status
[ ] Agent branch
[ ] Agent worktree
[ ] Agent task
[ ] Current blocker
[ ] Changed files
[ ] Test results
[ ] Pending design suggestions
[ ] Pending code reviews
[ ] Agent conversations
[ ] Open live Grok session
[ ] Pause agent
[ ] Stop agent
[ ] Request revision
[ ] Approve merge
```

---

### 22.18 Placeholder and Quality Audit

Before completion, search the repository for unfinished implementation indicators.

Check for:

```text
TODO
FIXME
HACK
placeholder
mock data
not implemented
coming soon
throw new Error
console.log
temporary
hardcoded
```

Not every match is automatically a failure, but every match must be reviewed and classified.

Also verify:

* no empty buttons;
* no controls that do nothing;
* no fabricated agent status;
* no fabricated cost;
* no hardcoded demo-only completion state;
* no test that passes without exercising the real behavior;
* no hidden manual setup omitted from documentation;
* no silently swallowed critical error.

Evidence:

```text
Search command:
Matches reviewed:
Unresolved findings:
```

---

### 22.19 Final Completion Gate

The project may be marked complete only when:

```text
[ ] V-001 through V-052 have recorded statuses.
[ ] Every required item is PASS.
[ ] No required item is NOT TESTED.
[ ] No critical item is BLOCKED.
[ ] Build succeeds.
[ ] Required tests pass.
[ ] End-to-end acceptance test passes.
[ ] UI acceptance checklist passes.
[ ] Placeholder and quality audit passes.
[ ] Design document matches the merged implementation.
[ ] Costs and usage are recorded accurately.
[ ] Final Git status is known and documented.
[ ] Final evidence report is generated.
```

The final agent response must use this format:

```text
FINAL VERIFICATION REPORT

Overall result: PASS | FAIL | BLOCKED

Passed checks:
- ...

Failed checks:
- ...

Blocked checks:
- ...

Automated commands executed:
- ...

Manual checks completed:
- ...

Branches and commits:
- ...

Tests:
- ...

Known limitations:
- ...

Remaining work:
- ...

The project is complete: YES | NO
```

The loop must output **“The project is complete: YES”** only when all required completion gates pass.
