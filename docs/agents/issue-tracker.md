# Issue tracker: GitHub

Issues and specs live in GitHub Issues for `elBenz/pi-ensemble`. Use `gh`.

## Conventions

- Create: `gh issue create`
- Read: `gh issue view <number> --comments`
- List: `gh issue list`
- Comment: `gh issue comment <number>`
- Label: `gh issue edit <number> --add-label/--remove-label`
- Close: `gh issue close <number>`

External pull requests are not a triage request surface.

When a skill says “publish to the issue tracker,” create a GitHub issue.
When it says “fetch the relevant ticket,” read that issue and its comments.

Use GitHub sub-issues and native issue dependencies where available. Otherwise,
use task lists and `Blocked by: #<number>` lines.
