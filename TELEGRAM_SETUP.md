# Coach Pepper Telegram Bot — Setup Guide

## Firebase service account

You have Editor access on the `pep-os` Firebase project. Generate your own key:

1. [Firebase Console → Project Settings → Service Accounts](https://console.firebase.google.com/project/pep-os/settings/serviceaccounts/adminsdk) → **Generate new private key**
2. Save as `firebase-service-account.json` at the repo root (already gitignored)
3. If queries fail with PERMISSION_DENIED, add the **Cloud Datastore User** role to the service account at [Google Cloud IAM](https://console.cloud.google.com/iam-admin/iam?project=pep-os)

## MCP server

```bash
cd mcp-server && npm install && cd ..
claude mcp list   # should show pep-os-firestore: ✓ Connected
```

## Configure the bot

The bot is `@coachpepperbot` on Telegram. Run `/telegram:configure <token>` in Claude Code with the bot token.

## Shell alias

Add to `~/.zshrc`:

```bash
alias ct="PATH=\"\$HOME/.bun/bin:\$PATH\" claude --channels plugin:telegram@claude-plugins-official --append-system-prompt \"\$(cat /path/to/repo/coach-pepper-instructions.md)\""
```

Update the path, then `source ~/.zshrc`.

## Launch, pair, lock down

```bash
ct
```

DM the bot → get a pairing code → `/telegram:access pair <code>` → `/telegram:access policy allowlist`

## Test

One message at a time, wait for each response:

1. `who are you`
2. `list all classrooms`
3. `how is [student name] doing?`
4. `compare [student A] and [student B]`

## Known Issues

**Messages occasionally don't reach Claude Code.** The plugin uses long-polling which sometimes silently drops its connection. If a message isn't getting through after 30s, restart with `ct`.

**One message at a time.** Claude processes sequentially. Don't send follow-ups until you see the response.

**Session must be running.** Close the laptop lid = bot goes offline.
