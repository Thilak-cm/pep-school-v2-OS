#!/usr/bin/env python3
"""
AI Coach Playground - Interactive script to test and refine coach prompts
Mimics the AI Coach feature from the Montessori OS app
"""

import argparse
import json
import sys
import re
import os
from typing import Dict, List, Optional, Tuple, Any
from pathlib import Path
from openai import OpenAI
from rich.console import Console
from rich.panel import Panel
from rich.prompt import Prompt, Confirm
from rich.table import Table

# Firebase Admin SDK
try:
    import firebase_admin
    from firebase_admin import credentials, firestore
    FIREBASE_AVAILABLE = True
except ImportError:
    FIREBASE_AVAILABLE = False
    firestore = None  # Define as None when not available

# Initialize console
console = Console()

if not FIREBASE_AVAILABLE:
    console.print("[yellow]Warning: firebase-admin not installed. Firebase features disabled.[/yellow]")
    console.print("[dim]Install with: pip install firebase-admin[/dim]\n")

# Project root (assumes script is in scripts/admin/)
PROJECT_ROOT = Path(__file__).parent.parent.parent
FIREBASE_SERVICE_ACCOUNT = PROJECT_ROOT / "firebase-service-account.json"
COACH_CONSTANTS_FILE = PROJECT_ROOT / "functions" / "config" / "coachConstants.js"
ENV_FILES = [
    PROJECT_ROOT / "montessori-os" / ".env",
    PROJECT_ROOT / ".env",
]

# Nudge constants (from coach/constants.js)
NUDGE_IDS = {
    'DURATION': 'duration',
    'MODALITY': 'modality', 
    'INDEPENDENCE': 'independence',
    'EVIDENCE': 'evidence',
    'SUBJECTIVE': 'subjective'
}

CHIPS = {
    'duration': ['<5m', '5–10m', '10–20m', '20m+'],
    'modality': ['Material', 'Pen & paper', 'Mental'],
    'independence': ['Independent', 'Peer pair', 'Small group', 'Teacher-guided'],
    'evidence': ['# attempts', '# correct', 'Add quote'],
    'subjective': []
}

MAX_NUDGES = 5


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


def load_coach_constants() -> Dict:
    """Load model parameters from functions/config/coachConstants.js"""
    default_config = {
        "model": "gpt-4o",
        "temperature": 0,
        "max_tokens": 1000
    }
    
    if not COACH_CONSTANTS_FILE.exists():
        console.print(f"[yellow]Warning: {COACH_CONSTANTS_FILE} not found. Using defaults.[/yellow]")
        return default_config
    
    try:
        with open(COACH_CONSTANTS_FILE, 'r') as f:
            content = f.read()
        
        # Extract from coachConstants.js (ES6 export format)
        # Look for COACH_MODEL_INFO = { ... } (may span multiple lines)
        match = re.search(r'COACH_MODEL_INFO\s*=\s*\{([^}]+)\}', content, re.DOTALL)
        if match:
            config_body = match.group(1)
            # Parse key-value pairs manually
            config = {}
            # Extract model
            model_match = re.search(r'model:\s*["\']([^"\']+)["\']', config_body)
            if model_match:
                config['model'] = model_match.group(1)
            # Extract temperature
            temp_match = re.search(r'temperature:\s*(\d+(?:\.\d+)?)', config_body)
            if temp_match:
                config['temperature'] = float(temp_match.group(1))
            # Extract max_tokens
            tokens_match = re.search(r'max_tokens:\s*(\d+)', config_body)
            if tokens_match:
                config['max_tokens'] = int(tokens_match.group(1))
            
            # Fill defaults for missing values
            config.setdefault('model', default_config['model'])
            config.setdefault('temperature', default_config['temperature'])
            config.setdefault('max_tokens', default_config['max_tokens'])
            
            return config
        else:
            console.print("[yellow]Warning: Could not parse coachConstants.js. Using defaults.[/yellow]")
            return default_config
    except Exception as e:
        console.print(f"[yellow]Warning: Error reading coachConstants.js: {e}. Using defaults.[/yellow]")
        return default_config


def init_firebase() -> Optional[Any]:
    """Initialize Firebase Admin and return Firestore client"""
    if not FIREBASE_AVAILABLE:
        return None
    
    if not FIREBASE_SERVICE_ACCOUNT.exists():
        console.print(f"[red]Error: Firebase service account not found at {FIREBASE_SERVICE_ACCOUNT}[/red]")
        return None
    
    try:
        # Check if already initialized
        try:
            db = firestore.client()
            return db
        except ValueError:
            # Not initialized, initialize now
            cred = credentials.Certificate(str(FIREBASE_SERVICE_ACCOUNT))
            firebase_admin.initialize_app(cred)
            db = firestore.client()
            return db
    except Exception as e:
        console.print(f"[red]Error initializing Firebase: {e}[/red]")
        return None


def get_firebase_final_prompt(verbose: bool = False) -> Optional[str]:
    """Read finalPrompt from Firestore ai_prompts/coach document

    Deprecated for richer config needs. Prefer get_firebase_coach_config().
    """
    if not FIREBASE_AVAILABLE:
        if verbose:
            console.print("[red]Error: firebase-admin not installed[/red]")
        return None
    
    db = init_firebase()
    if not db:
        if verbose:
            console.print("[red]Error: Failed to initialize Firebase connection[/red]")
        return None
    
    try:
        if verbose:
            console.print("[dim]Connecting to Firestore...[/dim]")
        doc_ref = db.collection('ai_prompts').document('coach')
        doc = doc_ref.get()
        
        if doc.exists:
            data = doc.to_dict()
            final_prompt = data.get('finalPrompt')
            if final_prompt:
                if verbose:
                    console.print(f"[green]✓ Successfully loaded finalPrompt ({len(final_prompt)} chars)[/green]")
                return final_prompt
            else:
                if verbose:
                    console.print("[yellow]Warning: finalPrompt field not found in Firestore document[/yellow]")
                    console.print(f"[dim]Available fields: {list(data.keys()) if data else 'none'}[/dim]")
                return None
        else:
            if verbose:
                console.print("[yellow]Warning: ai_prompts/coach document not found in Firestore[/yellow]")
            return None
    except Exception as e:
        if verbose:
            console.print(f"[red]Error reading from Firestore: {e}[/red]")
            import traceback
            console.print(f"[dim]{traceback.format_exc()}[/dim]")
        return None


def get_firebase_coach_config(verbose: bool = False) -> Optional[Dict[str, Any]]:
    """Read coach config from Firestore ai_prompts/coach document.

    Returns dict with keys: finalPrompt (str|None), enabledNudges (list),
    maxReturnNudges (int|None). Falls back gracefully if fields are missing.
    """
    if not FIREBASE_AVAILABLE:
        if verbose:
            console.print("[red]Error: firebase-admin not installed[/red]")
        return None

    db = init_firebase()
    if not db:
        if verbose:
            console.print("[red]Error: Failed to initialize Firebase connection[/red]")
        return None

    try:
        if verbose:
            console.print("[dim]Connecting to Firestore...[/dim]")
        doc_ref = db.collection('ai_prompts').document('coach')
        doc = doc_ref.get()

        if not doc.exists:
            if verbose:
                console.print("[yellow]Warning: ai_prompts/coach document not found in Firestore[/yellow]")
            return None

        data = doc.to_dict() or {}
        final_prompt = data.get('finalPrompt')
        enabled = data.get('enabledNudges') or []
        max_n = data.get('maxReturnNudges')

        if final_prompt and verbose:
            console.print(f"[green]✓ Successfully loaded finalPrompt ({len(final_prompt)} chars)[/green]")
        if isinstance(max_n, int) and max_n > 0 and verbose:
            console.print(f"[green]✓ maxReturnNudges from Firestore: {max_n}[/green]")

        return {
            'finalPrompt': final_prompt,
            'enabledNudges': enabled,
            'maxReturnNudges': max_n if isinstance(max_n, int) and max_n > 0 else None,
        }
    except Exception as e:
        if verbose:
            console.print(f"[red]Error reading coach config from Firestore: {e}[/red]")
            import traceback
            console.print(f"[dim]{traceback.format_exc()}[/dim]")
        return None


def get_system_prompt(enabled_nudges: List[str]) -> str:
    """Generate system prompt based on enabled nudges"""
    
    if not enabled_nudges:
        return """You are Coach Pepper. Coach feature is disabled. Return empty nudges array."""
    
    # Build nudge blocks based on enabled nudges
    nudge_blocks = []
    
    if 'duration' in enabled_nudges:
        nudge_blocks.append("- duration: academic activity is described; trigger:no time range (e.g. \"5–10 min\") appears.")
    
    if 'modality' in enabled_nudges:
        nudge_blocks.append("- modality: academic activity is described; trigger: does not specify the method (Material / Pen & paper / Mental).")
    
    if 'independence' in enabled_nudges:
        nudge_blocks.append("- independence: academic activity is described; trigger: does not state independence level (independent, peer, teacher-guided, etc.).")
    
    if 'evidence' in enabled_nudges:
        nudge_blocks.append("- evidence: the note makes a claim (understood, did well, grasped, struggled, etc.); trigger: gives no supporting detail such as number or quote.")
    
    if 'subjective' in enabled_nudges:
        nudge_blocks.append("- subjective: the note uses emotional adjectives (happy, sad, lazy, always, etc.); trigger: without an objective observation line.")
    
    nudge_blocks_text = "\n\n".join(nudge_blocks)
    
    return f"""
You are Coach Pepper, a Montessori observation coach that inspects one teacher note and identifies objective information gaps.

How to respond
- Read the note carefully and understand its meaning.
- Evaluate each nudge type independently — whether or not another applies.
- A note may trigger multiple nudges at once; include all that clearly fit.
- If no nudge fits confidently, return an empty array.
- Output strict JSON with top-level "nudges", which is an array of objects.  
   Each object must include exactly:
   - "id": string (the nudge type)
   - "reason": short explanation of what’s missing
   - "confidence": numeric value between 0 and 1

Example outputs:
1. 
   {{
     "nudges": [
       {{ "id": "duration", "reason": "Missing time range.", "confidence": 0.8 }},
       {{ "id": "modality", "reason": "No activity method specified.", "confidence": 0.6 }},
       {{ "id": "subjective", "reason": "Includes emotional adjective without objective observation.", "confidence": 0.7 }}
     ]
   }}
2. 
   {{
     "nudges": []
   }}

Nudge types and triggers:
{nudge_blocks_text}
"""


def call_openai(note_text: str, system_prompt: str, model_config: Dict, enabled_nudges: List[str]) -> Dict:
    """Call OpenAI API to get coach response"""
    client = OpenAI()
    
    user_prompt = f"""INPUT:
{json.dumps({"note_text": note_text})}"""
    
    try:
        response = client.chat.completions.create(
            model=model_config.get("model", "gpt-4o"),
            temperature=model_config.get("temperature", 0),
            max_tokens=model_config.get("max_tokens", 1000),
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ]
        )
        
        content = response.choices[0].message.content
        # Uncomment for debugging:
        console.print(f"[dim]Raw API response: {content}[/dim]")
        
        # Strip markdown code fences if present
        content = content.strip()
        if content.startswith("```json"):
            content = content[7:]  # Remove ```json
        elif content.startswith("```"):
            content = content[3:]  # Remove ```
        if content.endswith("```"):
            content = content[:-3]  # Remove closing ```
        content = content.strip()
        
        result = json.loads(content)
        console.print(f"[dim]Parsed nudges: {result}[/dim]")
        
        return result
    except json.JSONDecodeError as e:
        console.print(f"[red]JSON parse error: {e}[/red]")
        console.print(f"[yellow]Response: {content}[/yellow]")
        return {"nudges": []}
    except Exception as e:
        console.print(f"[red]API error: {e}[/red]")
        return {"nudges": []}


def display_nudges(nudges: List) -> None:
    """Pretty print nudges - expected format: [{id, reason, confidence}, ...]"""
    if not nudges:
        console.print("[yellow]No nudges suggested[/yellow]")
        return
    
    # Primary format: array of objects with id, reason, confidence
    if nudges and isinstance(nudges[0], dict):
        table = Table(title="Suggested Nudges")
        table.add_column("ID", style="cyan")
        table.add_column("Reason", style="white")
        table.add_column("Confidence", justify="right", style="magenta")
        
        for nudge in nudges:
            nudge_id = nudge.get('id', 'unknown')
            reason = nudge.get('reason', '')
            confidence_val = nudge.get('confidence', 0)
            
            # Handle confidence as number or string
            if isinstance(confidence_val, str):
                try:
                    confidence_val = float(confidence_val)
                except ValueError:
                    confidence_val = 0
            
            confidence_pct = float(confidence_val) * 100
            table.add_row(
                nudge_id,
                reason,
                f"{confidence_pct:.0f}%"
            )
        
        console.print(table)
    # Backward compatibility: array of strings
    elif nudges and isinstance(nudges[0], str):
        console.print("\n[bold green]Suggested Nudges:[/bold green]")
        for nudge_id in nudges:
            console.print(f"  • {nudge_id}")
    else:
        console.print("[yellow]Unknown nudge format[/yellow]")


def handle_nudge_selection(nudge_id: str, note_text: str) -> Optional[Dict]:
    """Interactive selection for a nudge"""
    chips = CHIPS.get(nudge_id, [])
    
    if not chips:
        # Subjective nudge - ask for objective line
        console.print(f"\n[bold]Nudge: {nudge_id}[/bold]")
        objective_line = Prompt.ask("Write an objective observation line", default="")
        if objective_line:
            return {"objective_line": objective_line}
        return None
    
    console.print(f"\n[bold]Nudge: {nudge_id}[/bold]")
    console.print(f"Note: {note_text[:100]}...")
    
    # Evidence is special - needs attempts/correct or quote
    if nudge_id == 'evidence':
        choice = Prompt.ask(
            f"Choose option",
            choices=['attempts', 'quote', 'skip'],
            default='skip'
        )
        
        if choice == 'skip':
            return None
        elif choice == 'attempts':
            attempts = int(Prompt.ask("Total attempts", default="0"))
            correct = int(Prompt.ask("Correct attempts", default="0"))
            return {"evidence_attempts": attempts, "evidence_correct": correct}
        else:  # quote
            quote = Prompt.ask("Add a quote", default="")
            return {"evidence_quote": quote}
    
    # Regular chip selection
    console.print(f"\nChoose option:")
    for i, chip in enumerate(chips, 1):
        console.print(f"{i}. {chip}")
    
    choice = Prompt.ask("Select option", default="")
    try:
        idx = int(choice) - 1
        if 0 <= idx < len(chips):
            selected_chip = chips[idx]
            return {nudge_id: selected_chip}
    except ValueError:
        pass
    
    return None


def build_observation_text(note_text: str, selections: Dict[str, Dict]) -> str:
    """Append selections to note text"""
    lines = []
    
    for nudge_id, selection in selections.items():
        if not selection:
            continue
        
        if nudge_id == 'duration':
            duration = selection.get(nudge_id, '')
            if duration:
                lines.append(f"Duration: {duration}")
        elif nudge_id == 'modality':
            modality = selection.get(nudge_id, '')
            if modality:
                lines.append(f"Modality: {modality}")
        elif nudge_id == 'independence':
            independence = selection.get(nudge_id, '')
            if independence:
                lines.append(f"Independence: {independence}")
        elif nudge_id == 'evidence':
            attempts = selection.get('evidence_attempts')
            correct = selection.get('evidence_correct')
            quote = selection.get('evidence_quote')
            
            if attempts is not None and correct is not None:
                lines.append(f"Evidence: {correct}/{attempts} correct")
            elif quote:
                lines.append(f"Evidence: \"{quote}\"")
        elif nudge_id == 'subjective':
            objective_line = selection.get('objective_line', '')
            if objective_line:
                lines.append(f"Objective note: {objective_line}")
    
    if lines:
        return f"{note_text}\n" + "\n".join(lines)
    return note_text


def show_enabled_nudges(enabled_nudges: List[str]) -> None:
    """Display which nudges are currently enabled"""
    console.print("\n🔧 [bold]Enabled Nudges[/bold]")
    if not enabled_nudges:
        console.print("[yellow]None (Coach disabled)[/yellow]")
        return
    
    table = Table(show_header=False)
    table.add_column("Status", style="green")
    table.add_column("Nudge ID", style="cyan")
    
    for nudge_id in ['duration', 'modality', 'independence', 'evidence', 'subjective']:
        status = "✓" if nudge_id in enabled_nudges else "✗"
        table.add_row(status, nudge_id)
    
    console.print(table)


def toggle_nudges(enabled_nudges: List[str]) -> List[str]:
    """Interactive nudge toggling"""
    console.print("\n🎛️  [bold]Toggle Nudges[/bold]")
    
    for i, nudge_id in enumerate(['duration', 'modality', 'independence', 'evidence', 'subjective'], 1):
        status = "✓" if nudge_id in enabled_nudges else "✗"
        console.print(f"{i}. {status} {nudge_id}")
    
    console.print("6. Done")
    
    choice = Prompt.ask("\nToggle nudge [1-5] or Done [6]", default="6")
    
    try:
        idx = int(choice) - 1
        if 0 <= idx < 5:
            nudge_id = ['duration', 'modality', 'independence', 'evidence', 'subjective'][idx]
            if nudge_id in enabled_nudges:
                enabled_nudges.remove(nudge_id)
                console.print(f"[yellow]Disabled {nudge_id}[/yellow]")
            else:
                enabled_nudges.append(nudge_id)
                console.print(f"[green]Enabled {nudge_id}[/green]")
    except ValueError:
        pass
    
    return enabled_nudges


def interactive_session(note_text: str, system_prompt: str, model_config: Dict, enabled_nudges: List[str], max_return_nudges: Optional[int] = None) -> None:
    """Interactive session with coach nudges

    If max_return_nudges is provided, mimic backend behavior by limiting
    the number of nudges returned to this value.
    """
    console.print("\n[bold blue]Running Coach...[/bold blue]")
    console.print(f"[dim]Model: {model_config.get('model', 'gpt-4o')}, "
                  f"Temperature: {model_config.get('temperature', 0)}, "
                  f"Max Tokens: {model_config.get('max_tokens', 1000)}[/dim]")
    if max_return_nudges and max_return_nudges > 0:
        console.print(f"[dim]Max Return Nudges: {max_return_nudges} (backend limit)[/dim]")

    # Call OpenAI
    response = call_openai(note_text, system_prompt, model_config, enabled_nudges)
    nudges = response.get('nudges', [])

    # Apply maxReturnNudges limit to mirror Cloud Function
    if max_return_nudges and max_return_nudges > 0:
        original_count = len(nudges)
        nudges = nudges[:max_return_nudges]
        if original_count > len(nudges):
            console.print(f"[yellow]Note: Limited from {original_count} to {len(nudges)} nudges (maxReturnNudges={max_return_nudges})[/yellow]")

    console.print(f"\n[bold green]Coach Response[/bold green]")
    display_nudges(nudges)
    
    if not nudges:
        console.print("[yellow]No enhancements suggested[/yellow]")
        return
    
    # Collect selections
    selections = {}
    
    # Extract nudge IDs from array of objects (primary format) or array of strings (backward compatibility)
    nudge_ids = []
    if nudges and isinstance(nudges[0], dict):
        # Primary format: [{id, reason, confidence}, ...]
        nudge_ids = [n.get('id') for n in nudges if isinstance(n, dict) and n.get('id')]
    elif nudges and isinstance(nudges[0], str):
        # Backward compatibility: ["duration", "modality", ...]
        nudge_ids = nudges
    
    for nudge_id in nudge_ids:
        if nudge_id:
            selection = handle_nudge_selection(nudge_id, note_text)
            if selection:
                selections[nudge_id] = selection
    
    if not selections:
        console.print("[yellow]No selections made[/yellow]")
        return
    
    # Show final text
    final_text = build_observation_text(note_text, selections)
    
    console.print("\n[bold green]Final Observation Text[/bold green]")
    console.print(Panel(final_text, border_style="green"))
    
    # Save option
    if Confirm.ask("\nSave to file?", default=False):
        filename = Prompt.ask("Filename", default="observation.txt")
        with open(filename, 'w') as f:
            f.write(final_text)
        console.print(f"[green]Saved to {filename}[/green]")


def edit_prompt_prompt() -> str:
    """Interactive prompt editor"""
    console.print("[bold]Current system prompt (edit mode)[/bold]")
    console.print("[dim]Type your new prompt. End with 'END' on its own line.[/dim]")
    
    lines = []
    while True:
        line = input()
        if line.strip() == 'END':
            break
        lines.append(line)
    
    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="AI Coach Playground - Test and refine coach prompts"
    )
    parser.add_argument(
        'note',
        nargs='?',
        help='Observation note text to analyze'
    )
    parser.add_argument(
        '--prompt-file',
        type=str,
        help='File containing custom system prompt'
    )
    parser.add_argument(
        '--edit-prompt',
        action='store_true',
        help='Enter interactive prompt editing mode'
    )
    parser.add_argument(
        '--nudges',
        type=str,
        help='Comma-separated list of enabled nudges (e.g., "duration,modality")'
    )
    parser.add_argument(
        '--list-nudges',
        action='store_true',
        help='List all available nudges'
    )
    
    args = parser.parse_args()
    
    # Load model config from coachConstants.js
    model_config = load_coach_constants()

    # Ensure OpenAI key is available
    openai_key = ensure_openai_key()
    if not openai_key:
        console.print("[red]OPENAI_API_KEY not set[/red]")
        console.print("[dim]Add DEV_OPENAI_API_KEY (preferred) or VITE_OPENAI_SPEECH_TO_TEXT_API_KEY to montessori-os/.env, or export OPENAI_API_KEY[/dim]")
        return
    
    # List available nudges
    if args.list_nudges:
        console.print("[bold]Available Nudges:[/bold]")
        for nudge_id in ['duration', 'modality', 'independence', 'evidence', 'subjective']:
            chips = CHIPS.get(nudge_id, [])
            console.print(f"\n{nudge_id.upper()}:")
            console.print(f"  Options: {', '.join(chips) if chips else 'Free text input'}")
        return
    
    # Determine enabled nudges
    if args.nudges:
        enabled_nudges = [n.strip() for n in args.nudges.split(',') if n.strip() in ['duration', 'modality', 'independence', 'evidence', 'subjective']]
    else:
        # Default: all enabled
        enabled_nudges = ['duration', 'modality', 'independence', 'evidence', 'subjective']
    
    # Show enabled nudges
    show_enabled_nudges(enabled_nudges)
    
    # Load or generate system prompt
    local_system_prompt = None
    firebase_system_prompt = None
    
    if args.prompt_file:
        with open(args.prompt_file, 'r') as f:
            local_system_prompt = f.read()
    else:
        local_system_prompt = get_system_prompt(enabled_nudges)
    
    # Try to load Firebase prompt
    firebase_config = get_firebase_coach_config()
    firebase_system_prompt = firebase_config.get('finalPrompt') if firebase_config else None
    if firebase_system_prompt:
        console.print("[green]✓ Loaded finalPrompt from Firestore[/green]")
    else:
        console.print("[yellow]⚠ Could not load finalPrompt from Firestore. Will use local prompt.[/yellow]")
    
    # Interactive prompt editing
    if args.edit_prompt:
        local_system_prompt = edit_prompt_prompt()
    
    # Main interaction loop
    while True:
        # Menu
        console.print("\n[bold]🎮 Coach Playground Menu[/bold]")
        console.print("1. Toggle nudges")
        console.print("2. Run coach on note (Firebase finalPrompt)")
        console.print("3. Run coach on note (Local finalPrompt)")
        console.print("4. Exit")
        
        choice = Prompt.ask("Choice", default="2")
        
        if choice == "1":
            enabled_nudges = toggle_nudges(enabled_nudges)
            # Regenerate local prompt
            local_system_prompt = get_system_prompt(enabled_nudges)
            # Reload Firebase config
            firebase_config = get_firebase_coach_config()
            firebase_system_prompt = firebase_config.get('finalPrompt') if firebase_config else None
            show_enabled_nudges(enabled_nudges)
        elif choice == "2":
            # Use Firebase prompt - reload to get latest
            console.print("[dim]Loading Firebase finalPrompt...[/dim]")
            firebase_config = get_firebase_coach_config(verbose=True)
            firebase_system_prompt = firebase_config.get('finalPrompt') if firebase_config else None
            max_return_nudges = firebase_config.get('maxReturnNudges') if firebase_config else None
            system_prompt = firebase_system_prompt if firebase_system_prompt else local_system_prompt
            
            if not system_prompt:
                console.print("[red]Error: No prompt available[/red]")
                continue
            
            if firebase_system_prompt:
                console.print("[green]✓ Using Firebase finalPrompt[/green]")
            else:
                console.print("[yellow]⚠ Firebase prompt not available, using local prompt[/yellow]")
            
            # Get note text
            if args.note:
                note_text = args.note
                args.note = None  # Clear after first use
            else:
                console.print("\n[bold]Enter note text:[/bold]")
                note_text = Prompt.ask("Note")
            
            if note_text:
                interactive_session(note_text, system_prompt, model_config, enabled_nudges, max_return_nudges)
        elif choice == "3":
            # Use local prompt
            system_prompt = local_system_prompt
            console.print("[cyan]Using Local finalPrompt[/cyan]")
            
            # Get note text
            if args.note:
                note_text = args.note
                args.note = None  # Clear after first use
            else:
                console.print("\n[bold]Enter note text:[/bold]")
                note_text = Prompt.ask("Note")
            
            if note_text:
                interactive_session(note_text, system_prompt, model_config, enabled_nudges)
        elif choice == "4":
            break


if __name__ == '__main__':
    main()
