# Agent Guidelines

See [README.md](README.md) for the repo layout, setup, and commands.

## Language and Framework Guides

Read the matching guide before writing or reviewing code of that kind:

- [TypeScript](docs/guidelines/typescript.md) — any `.ts` / `.tsx` file
- [React](docs/guidelines/react.md) — React components (`.tsx`)
- [Tailwind CSS](docs/guidelines/tailwind.md) — styling, `.css` files, and UI components

## Tailwind Utility Classes

Style everything with Tailwind utilities from the theme in `packages/ui/src/styles/globals.css`, never with custom classes:

- **Colors** come from the semantic tokens (`bg-primary`, `text-muted-foreground`, `border-border`, `text-destructive`). No hex or `oklch` values in classes (`bg-[#a41e35]`) and no raw palette colors (`text-red-600`); `white` and `black` only for text on course colors and for scrims (`bg-black/30`). A color the theme lacks becomes a token in `globals.css` first.
- **`style` props** are only for values computed at runtime (positions, widths, column counts, tints derived from a course color), and any color in them comes from a theme variable (`var(--border)`).
- **Sizes** come from Tailwind's default scales: `min-w-24` not `min-w-[96px]`, `ring-3` not `ring-[3px]`, `-top-2.5` not `top-[-10px]`, `max-w-360` not `max-w-[90rem]`, `grow basis-64` not `flex-[1_1_16rem]`. Tailwind IntelliSense flags exact matches as non-canonical and offers the replacement.
- **Round to the nearest step** when no utility matches exactly: `text-xs` for `11px`, `text-sm` for `13px`, `text-base` for `15px`, `rounded-sm` for `5px`, `max-w-5/6` for `85%`, `-ml-1.25` for `-0.3rem`. A pixel or two off the design is better than an arbitrary value or a custom size token.
- **No new CSS classes** or `@apply` rules for component styling; compose utilities in `className`, with `cva` for variants and `cn` to merge. The same goes for `@utility`, `@custom-variant` and `@layer components` in CSS.
- **No `!` important** (`h-auto!`). When a class loses to a component's base class, repeat the base class's variant so `cn` replaces it: `group-data-horizontal/tabs:h-auto` over the list's `group-data-horizontal/tabs:h-8`.
- **Hover and other state colors are tokens too**: `hover:bg-primary-hover` and `hover:bg-secondary-hover`, not `hover:bg-primary/80` or `hover:bg-[color-mix(…)]`.
- **Don't add size tokens to the theme**; round to the default scale instead. New theme tokens are for colors (and their hover shades) only.
- **Arbitrary values are only for what no utility can express, even rounded**: grid templates (`grid-cols-[15rem_minmax(0,1fr)]`), `clamp()` / `calc()` with runtime parts (`calc(100vw-3rem)`), viewport units (`max-h-[60vh]`), easing curves, and variant selectors (`data-[side=left]:`).
- **The other custom syntaxes follow the same rule**: CSS variable shorthand (`w-(--anchor-width)`) and arbitrary properties (`[--card-spacing:--spacing(4)]`) only for variables set at runtime or scoped to one component; arbitrary variants (`[&_svg]:`, `[&>a]:`) only for elements a utility variant can't reach (`*:` for direct children); arbitrary container sizes (`@[7.5rem]:`) only below the smallest container step (`@3xs`, 16rem).

The exceptions are pages drawn outside the stylesheet, such as `opengraph-image.tsx` and `icon.svg`, which use hex constants named after the token they match.

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
