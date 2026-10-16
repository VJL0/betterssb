# Agent Guidelines

See [README.md](README.md) for the repo layout, setup, and commands.

## Language and Framework Guides

Read the matching guide before writing or reviewing code of that kind:

- [TypeScript](docs/guidelines/typescript.md) — any `.ts` / `.tsx` file
- [React](docs/guidelines/react.md) — React components (`.tsx`)
- [Tailwind CSS](docs/guidelines/tailwind.md) — styling, `.css` files, and UI components

## Skills

Skills live in `.agents/skills/`. Claude Code only loads skills from `.claude/skills/`, so each new skill needs a matching symlink there:

```bash
ln -s ../../.agents/skills/<name> .claude/skills/<name>
```

## Clean Code

These apply to all code in the repo.

### Constants Over Magic Numbers

- Replace hard-coded values with named constants
- Use descriptive constant names that explain the value's purpose
- Keep constants at the top of the file or in a dedicated constants file

### Meaningful Names

- Variables, functions, and classes should reveal their purpose
- Names should explain why something exists and how it's used
- Avoid abbreviations unless they're universally understood

### Smart Comments

- Don't comment on what the code does - make the code self-documenting
- Use comments to explain why something is done a certain way
- Document APIs, complex algorithms, and non-obvious side effects

### Single Responsibility

- Each function should do exactly one thing
- Functions should be small and focused
- If a function needs a comment to explain what it does, it should be split

### DRY (Don't Repeat Yourself)

- Extract repeated code into reusable functions
- Share common logic through proper abstraction
- Maintain single sources of truth

### Clean Structure

- Keep related code together
- Organize code in a logical hierarchy
- Use consistent file and folder naming conventions

### Encapsulation

- Hide implementation details
- Expose clear interfaces
- Move nested conditionals into well-named functions

### Code Quality Maintenance

- Refactor continuously
- Fix technical debt early
- Leave code cleaner than you found it

### Testing

- Write tests before fixing bugs
- Keep tests readable and maintainable
- Test edge cases and error conditions

### Version Control

- Write clear commit messages
- Make small, focused commits
- Use meaningful branch names

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
