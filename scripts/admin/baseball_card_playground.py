#!/usr/bin/env python3
"""
Baseball Card Playground - Interactive CLI to test the "Coach Pepper's summary" prompt
- Lets you pick classroom, student, and time window (default 42 days / 6 weeks)
- Fetches notes from Firestore via firebase-admin
- Runs the baseball card prompt against OpenAI and renders a CLI card
"""

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from rich.console import Console
from rich.panel import Panel
from rich.prompt import Prompt, Confirm
from rich.table import Table
from rich.text import Text

# OpenAI SDK
try:
  from openai import OpenAI
except ImportError as e:
  print("Missing dependency: openai\nInstall with: pip install openai")
  sys.exit(1)

# Firebase Admin SDK
try:
  import firebase_admin
  from firebase_admin import credentials, firestore
  FIREBASE_AVAILABLE = True
except ImportError:
  FIREBASE_AVAILABLE = False
  firestore = None  # type: ignore

console = Console()

# Paths
PROJECT_ROOT = Path(__file__).parent.parent.parent
FIREBASE_SERVICE_ACCOUNT = PROJECT_ROOT / "firebase-service-account.json"
ENV_FILES = [
  PROJECT_ROOT / "montessori-os" / ".env",
  PROJECT_ROOT / ".env",
]

# Defaults (aligned with baseball_card_spec.md)
DEFAULT_WINDOW_DAYS = 42
DEFAULT_MODEL = "gpt-4o-mini"
DEFAULT_TEMPERATURE = 0


def ensure_openai_key() -> Optional[str]:
  """Ensure OPENAI_API_KEY is set (prefers DEV_OPENAI_API_KEY, then VITE_OPENAI_SPEECH_TO_TEXT_API_KEY in .env)."""
  existing = os.environ.get("OPENAI_API_KEY")
  if existing:
    return existing

  dev_key = os.environ.get("DEV_OPENAI_API_KEY")
  if dev_key:
    os.environ["OPENAI_API_KEY"] = dev_key
    return dev_key

  for env_path in ENV_FILES:
    if not env_path.exists():
      continue
    try:
      for raw_line in env_path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
          continue
        key, value = line.split("=", 1)
        key_name = key.strip()
        if key_name not in ("DEV_OPENAI_API_KEY", "VITE_OPENAI_SPEECH_TO_TEXT_API_KEY"):
          continue
        cleaned = value.strip().strip('"').strip("'")
        if cleaned:
          os.environ["OPENAI_API_KEY"] = cleaned
          console.print(f"[dim]Loaded OPENAI_API_KEY from {env_path} ({key_name})[/dim]")
          return cleaned
    except Exception as e:
      console.print(f"[yellow]Warning: Could not read {env_path}: {e}[/yellow]")

  return None


def ensure_firebase() -> Optional[Any]:
  """Initialize Firebase Admin and return Firestore client."""
  if not FIREBASE_AVAILABLE:
    console.print("[red]firebase-admin not installed. Install with: pip install firebase-admin[/red]")
    return None

  if not FIREBASE_SERVICE_ACCOUNT.exists():
    console.print(f"[red]Missing service account at {FIREBASE_SERVICE_ACCOUNT}[/red]")
    return None

  try:
    try:
      return firestore.client()
    except ValueError:
      cred = credentials.Certificate(str(FIREBASE_SERVICE_ACCOUNT))
      firebase_admin.initialize_app(cred)
      return firestore.client()
  except Exception as e:  # pragma: no cover - defensive
    console.print(f"[red]Failed to init Firebase: {e}[/red]")
    return None


def list_classrooms(db) -> List[Dict[str, Any]]:
  """Return active classrooms sorted by name."""
  classrooms = []
  try:
    docs = db.collection("classrooms").stream()
    for doc in docs:
      data = doc.to_dict() or {}
      status = data.get("status", "active")
      if status == "archived":
        continue
      classrooms.append({
        "id": doc.id,
        "name": data.get("name") or doc.id,
        "programId": data.get("programId")
      })
  except Exception as e:
    console.print(f"[red]Error loading classrooms: {e}[/red]")
  classrooms.sort(key=lambda c: c.get("name", ""))
  return classrooms


def select_from_list(items: List[Dict[str, Any]], label_key: str, title: str) -> Optional[Dict[str, Any]]:
  if not items:
    console.print(f"[red]No {title.lower()} found[/red]")
    return None

  console.print(f"\n[bold]{title}[/bold]")
  for idx, item in enumerate(items, start=1):
    console.print(f"{idx}. {item.get(label_key, 'Unknown')}")

  choice = Prompt.ask(f"Select {title[:-1].lower()}", default="1")
  try:
    index = int(choice) - 1
    if 0 <= index < len(items):
      return items[index]
  except ValueError:
    pass
  console.print("[yellow]Invalid selection[/yellow]")
  return None


def list_students(db, classroom_id: str) -> List[Dict[str, Any]]:
  """Return students in classroom sorted by displayName."""
  students = []
  try:
    docs = db.collection("students").where("classroomId", "==", classroom_id).stream()
    for doc in docs:
      data = doc.to_dict() or {}
      students.append({
        "id": doc.id,
        "displayName": data.get("displayName") or data.get("name") or f"{data.get('firstName', '')} {data.get('lastName', '')}".strip() or doc.id,
        "raw": data
      })
  except Exception as e:
    console.print(f"[red]Error loading students: {e}[/red]")
  students.sort(key=lambda s: s.get("displayName", ""))
  return students


def _to_datetime(value: Any) -> Optional[datetime]:
  """Normalize Firestore timestamp/datetime to aware UTC datetime."""
  if value is None:
    return None
  if isinstance(value, datetime):
    if value.tzinfo is None:
      return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
  return None


def _choose_timestamp(data: Dict[str, Any]) -> Optional[datetime]:
  """Pick best timestamp for filtering/sorting."""
  for key in ("observedAt", "timestamp", "createdAt"):
    dt = _to_datetime(data.get(key))
    if dt:
      return dt
  return None


def fetch_notes(db, student_id: str, window_days: int) -> List[Dict[str, Any]]:
  """Fetch notes for student within window_days (observedAt/timestamp/createdAt)."""
  start_dt = datetime.now(timezone.utc) - timedelta(days=window_days)
  notes: Dict[str, Dict[str, Any]] = {}

  def _collect(query):
    try:
      for doc in query.stream():
        notes[doc.id] = doc.to_dict() or {}
    except Exception as e:
      console.print(f"[yellow]Warning: query fallback triggered: {e}[/yellow]")

  obs_ref = db.collection("students").document(student_id).collection("observations")

  # Primary query: observedAt >= start
  try:
    _collect(obs_ref.where("observedAt", ">=", start_dt))
  except Exception:
    pass

  # Secondary query: createdAt >= start (fallback for missing observedAt)
  try:
    _collect(obs_ref.where("createdAt", ">=", start_dt))
  except Exception:
    pass

  # If still empty, grab recent slice (last 200 by observedAt desc) and filter client-side
  if not notes:
    try:
      recent = obs_ref.order_by("observedAt", direction=firestore.Query.DESCENDING).limit(200).stream()  # type: ignore
      for doc in recent:
        notes[doc.id] = doc.to_dict() or {}
    except Exception:
      pass

  # Filter by window
  filtered: List[Dict[str, Any]] = []
  for doc_id, data in notes.items():
    ts = _choose_timestamp(data)
    if ts and ts >= start_dt:
      filtered.append({"id": doc_id, **data})

  # Sort newest first
  filtered.sort(key=lambda d: _choose_timestamp(d) or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
  return filtered


def format_notes_for_prompt(notes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
  """Trim fields to a lean prompt payload."""
  formatted = []
  for n in notes:
    formatted.append({
      "id": n.get("id"),
      "type": n.get("type"),
      "text": n.get("text") or "",
      "lessonTitle": n.get("lessonTitle") or n.get("title") or "",
      "lessonDescription": n.get("lessonDescription") or n.get("description") or "",
      "groupComment": n.get("groupComment") or "",
      "studentComment": n.get("studentComment") or "",
      "createdByName": n.get("createdByName") or n.get("teacherName") or "",
      "observedAt": _choose_timestamp(n).isoformat() if _choose_timestamp(n) else None,
      "ratings": n.get("ratings") or n.get("dimensionRatings") or {},
      "dimensionOrder": n.get("dimensionOrder") or [],
      "attendanceStatus": n.get("attendanceStatus") or "",
    })
  return formatted


def get_system_prompt() -> str:
  """Return the baseball card system prompt from spec."""
  return """You are Coach Pepper, summarizing the last <WINDOW_DAYS> days of notes for ONE student.
You receive an array of notes with various fields in them. Understand them so you can generate a structured summary output.

Rules:
- Output concise JSON only. No markdown. Return exactly one JSON object matching the schema; no extra keys.
- Summaries must be grounded ONLY in provided notes. Never invent details, diagnoses, or events.
- Keep wording clear, teacher-friendly, and brief; prefer active voice.
- Bullets: 3–7 items (depends on content size). Each bullet must include a concrete evidence clause with a date (e.g., “On Nov 18 …”).
- Lesson summary: 1–2 sentence conclusion weaving the recent lessons/overall takeaway (no heading).

Output schema:
{
  "bullets": ["...", "..."],
  "lessonSummary": "..."
}
"""


def call_openai_baseball(notes: List[Dict[str, Any]], window_days: int, model: str = DEFAULT_MODEL, temperature: float = DEFAULT_TEMPERATURE) -> Dict[str, Any]:
  client = OpenAI()
  system_prompt = get_system_prompt().replace("<WINDOW_DAYS>", str(window_days))
  user_prompt = f"Generate the last {window_days}-day summary.\n\nNotes (JSON array):\n{json.dumps(notes, ensure_ascii=False)}"

  resp = client.chat.completions.create(
    model=model,
    temperature=temperature,
    messages=[
      {"role": "system", "content": system_prompt},
      {"role": "user", "content": user_prompt}
    ]
  )
  content = resp.choices[0].message.content.strip()

  # Strip fences if present
  if content.startswith("```"):
    content = content.strip("`")
    content = content.replace("json\n", "", 1).replace("json", "", 1).strip()

  try:
    return json.loads(content)
  except json.JSONDecodeError:
    console.print("[red]Failed to parse model response as JSON[/red]")
    console.print(content)
    return {}


def render_card(result: Dict[str, Any], note_count: int, window_days: int) -> None:
  title = Text("⚡ Coach Pepper’s summary", style="bold magenta")
  pills = Text(f"[Last {window_days} days]  [Notes: {note_count}]", style="cyan")
  bullets = result.get("bullets") or []
  lesson_summary = result.get("lessonSummary") or ""

  body_lines = []
  if bullets:
    body_lines.append("[bold]What’s been happening[/bold]")
    for b in bullets:
      body_lines.append(f"• {b}")
  if lesson_summary:
    if body_lines:
      body_lines.append("")
    body_lines.append(lesson_summary)

  content = "\n".join(body_lines) if body_lines else "No content returned."
  console.print(Panel(content, title=title, subtitle=pills, border_style="magenta"))

  if note_count < 3:
    console.print("[yellow]Only a few notes in this window. Log more notes to improve the summary.[/yellow]")


def main():
  parser = argparse.ArgumentParser(description="Baseball Card Playground CLI")
  parser.add_argument("--window-days", type=int, default=DEFAULT_WINDOW_DAYS, help="Time window in days (default 42)")
  parser.add_argument("--model", type=str, default=DEFAULT_MODEL, help="OpenAI model (default gpt-4o-mini)")
  parser.add_argument("--temperature", type=float, default=DEFAULT_TEMPERATURE, help="Temperature (default 0)")
  args = parser.parse_args()

  db = ensure_firebase()
  if not db:
    sys.exit(1)

  if not ensure_openai_key():
    console.print("[red]OPENAI_API_KEY not set[/red]")
    console.print("[dim]Add DEV_OPENAI_API_KEY (preferred) or VITE_OPENAI_SPEECH_TO_TEXT_API_KEY to montessori-os/.env, or export OPENAI_API_KEY[/dim]")
    sys.exit(1)

  # Select classroom
  classrooms = list_classrooms(db)
  classroom = select_from_list(classrooms, "name", "Classrooms")
  if not classroom:
    sys.exit(1)

  # Select student
  students = list_students(db, classroom["id"])
  student = select_from_list(students, "displayName", "Students")
  if not student:
    sys.exit(1)

  # Select window days
  window_input = Prompt.ask(f"Window (days)", default=str(args.window_days))
  try:
    window_days = max(1, int(window_input))
  except ValueError:
    window_days = args.window_days

  console.print(f"\n[dim]Fetching notes for {student['displayName']} (last {window_days} days)...[/dim]")
  notes_raw = fetch_notes(db, student["id"], window_days)
  formatted_notes = format_notes_for_prompt(notes_raw)

  note_count = len(formatted_notes)
  console.print(f"[green]Found {note_count} notes[/green]")

  result = call_openai_baseball(formatted_notes, window_days, model=args.model, temperature=args.temperature)
  render_card(result, note_count, window_days)

  if Confirm.ask("Save raw model JSON to file?", default=False):
    filename = Prompt.ask("Filename", default="baseball_card_output.json")
    with open(filename, "w") as f:
      json.dump(result, f, indent=2)
    console.print(f"[green]Saved to {filename}[/green]")


if __name__ == "__main__":
  main()
