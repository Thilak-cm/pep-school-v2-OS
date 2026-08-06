# Shared subagent definitions

This directory is the source of truth for Pep OS subagents across Claude Code
and Codex.

Unlike skills, custom agent manifests are not portable: Claude Code expects
Markdown with YAML frontmatter while Codex expects TOML configuration layers.
Generated adapters preserve one shared prompt without pretending those runtime
settings are interchangeable.

- Edit `definitions/<agent>/agent.json` for platform metadata and model routing.
- Edit `definitions/<agent>/instructions.md` for the shared agent prompt.
- Run `npm run agents:generate` after editing a definition.
- Run `npm run agents:check` to verify that checked-in adapters are current.

Generated adapters live in `.claude/agents/*.md` and `.codex/agents/*.toml`.
Do not edit those files directly. Skills should refer to agents by `name`, not
by a platform-specific path or tool name.

The platform model settings are workload mappings, not cross-vendor model
equivalences. Read-heavy exploration uses a faster model while audit, impact,
and fixing work use a deeper reasoning model.
