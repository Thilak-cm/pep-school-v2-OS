# Coach Pepper Telegram Bot — Setup Guide

Replicable setup for running Coach Pepper via Claude Code Channels on your machine.

## Prerequisites

- Claude Code installed and authenticated
- Access to the `pep-os` Firebase project
- A Telegram account
- Node.js 20+

## Step 1: Install Bun

The Telegram channel plugin requires Bun.

```bash
curl -fsSL https://bun.sh/install | bash
```

Add to `~/.zprofile` so subprocesses can find it:

```bash
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.zprofile
```

Close and reopen your terminal, then verify:

```bash
which bun
```

## Step 2: Install the Telegram channel plugin

Start a Claude Code session and run:

```
/plugin install telegram@claude-plugins-official
```

## Step 3: Create and configure a Telegram bot

1. Open [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot`, pick a name and username
3. Copy the bot token (looks like `123456789:AAH...`)
4. Run in Claude Code:

```
/telegram:configure <your-bot-token>
```

This writes the token to `~/.claude/channels/telegram/.env`.

## Step 4: Firebase service account

You need Editor access on the `pep-os` Firebase project (ask Thilak if you don't have it).

1. Go to [Firebase Console → Project Settings → Service Accounts](https://console.firebase.google.com/project/pep-os/settings/serviceaccounts/adminsdk)
2. Click **Generate new private key** — this generates YOUR OWN key tied to your access
3. Save the file as `firebase-service-account.json` at the repo root
4. Verify it's gitignored (it should be — check `.gitignore`)
5. The service account needs the **Cloud Datastore User** role. If queries fail with PERMISSION_DENIED, add the role at [Google Cloud IAM](https://console.cloud.google.com/iam-admin/iam?project=pep-os).

**Do not share service account keys via email or chat.** Each person should generate their own.

## Step 5: Install MCP server dependencies

```bash
cd mcp-server && npm install && cd ..
```

## Step 6: Verify MCP server connects

```bash
claude mcp list
```

You should see `pep-os-firestore: ... - ✓ Connected`. If not, the `.mcp.json` in the repo root should auto-register it.

## Step 7: Add the `ct` shell alias

Add this to your `~/.zshrc`:

```bash
alias ct="PATH=\"\$HOME/.bun/bin:\$PATH\" claude --channels plugin:telegram@claude-plugins-official --append-system-prompt \"\$(cat $(pwd)/coach-pepper-instructions.md)\""
```

Replace `$(pwd)` with the absolute path to the repo if needed.

Then: `source ~/.zshrc`

## Step 8: Launch and pair

```bash
ct
```

You should see: `Listening for channel messages from: plugin:telegram@claude-plugins-official`

DM your bot on Telegram. It will reply with a 6-character pairing code. In the Claude Code session:

```
/telegram:access pair <code>
```

Then lock it down:

```
/telegram:access policy allowlist
```

## Step 9: Test

Send these messages to your bot on Telegram (one at a time, wait for each response):

1. `who are you` — should introduce itself as Coach Pepper
2. `list all classrooms` — should return classroom data from Firestore
3. `how is [student name] doing?` — should fetch student data + baseball card
4. `compare [student A] and [student B]` — should fetch both and compare

## Known Issues

**Messages occasionally don't reach Claude Code.** The Telegram plugin uses long-polling which sometimes silently drops its connection. If a message isn't getting through after 30 seconds (check the Claude Code terminal for `← telegram` lines), restart the session with `ct`.

**One message at a time.** Claude Code processes messages sequentially. Don't send follow-ups until you see the response. Sending duplicates while Claude is processing can cause queued messages to be dropped.

**Session must be running.** Unlike a webhook-based bot, this only works while `ct` is running on your machine. Close the laptop lid = bot goes offline.

## Architecture

```
Telegram → Channel Plugin (long-poll) → Claude Code → Firestore MCP Server → Firestore
                                          ↑
                              coach-pepper-instructions.md
                              (appended as system prompt)
```

All components run locally on your machine. No cloud infrastructure beyond Firestore itself.

## Files Reference

| File | Purpose |
|---|---|
| `.mcp.json` | Registers Firestore MCP server with Claude Code |
| `mcp-server/index.js` | MCP server entry point |
| `mcp-server/tools.js` | 5 Firestore query tools |
| `coach-pepper-instructions.md` | Coach Pepper identity and behavior |
| `~/.claude/channels/telegram/.env` | Bot token (local, not in repo) |
| `~/.claude/channels/telegram/access.json` | Allowlist (local, not in repo) |
| `firebase-service-account.json` | Firebase auth (gitignored) |
