# Issue tracker: GitHub

Specs and work tickets for this repository live in GitHub Issues at `Shoamirg/garageos`. Use the `gh` CLI from this repository.

## Operations

- Create: `gh issue create --title "..." --body-file <file>`
- Read: `gh issue view <number> --comments`
- List: `gh issue list --state open`
- Update: `gh issue edit <number> ...` and `gh issue comment <number> --body-file <file>`
- Close: `gh issue close <number>`

Use GitHub issue dependencies for blocking relationships when available. Otherwise, put `Blocked by: #<number>` near the top of the blocked issue.

## Pull requests as a triage surface

PRs as a request surface: no. Incoming requests are tracked as issues.
