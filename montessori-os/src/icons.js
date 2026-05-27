/**
 * Icon Naming Convention
 * ─────────────────────
 * All icons are sourced from lucide-react (thin, consistent stroke style).
 * Import icons from this barrel file — never import directly from lucide-react
 * or @mui/icons-material in component files.
 *
 * Naming rules:
 *   1. Use the canonical Lucide name (e.g., `ChevronDown`, `Mic`, `Sparkles`).
 *   2. When a semantic alias improves readability at the call site, add one
 *      (e.g., `ReportIcon`, `ViewIcon`) — keep the canonical export too.
 *   3. One icon per concept: don't import two different icons for the same action.
 *
 * Adding a new icon:
 *   1. Find it at https://lucide.dev/icons
 *   2. Add the named import from 'lucide-react' below
 *   3. Re-export it (add a semantic alias if helpful)
 *   4. Run `npm run test -- src/icons.test.js` to verify
 */

export {
  // ── Navigation ──
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  ArrowRight,
  ArrowLeftRight,
  Home,

  // ── Actions ──
  X,
  Plus,
  MoreHorizontal,
  Search,
  Filter,
  Pencil,
  Share2,
  Download,
  RefreshCw,
  RotateCcw,
  Check,
  CheckCheck,
  Copy,
  Save,
  Send,
  Upload,
  FileUp,
  Trash2,
  LogOut,
  Link,
  Zap,
  Undo,
  MoveUp,
  MoveDown,

  // ── Status / Indicators ──
  Eye,
  CircleCheck,
  CircleAlert,
  XCircle,
  TriangleAlert,
  Info,
  Flag,
  Star,
  TrendingUp,
  TrendingDown,
  MinusCircle,
  Circle,
  Dot,

  // ── Media ──
  Mic,
  Image,
  Video,
  Play,
  CirclePlay,
  Pause,
  Square,
  Paperclip,
  AudioLines,

  // ── Content ──
  FileText,
  File,
  StickyNote,
  BookOpen,
  Type,
  Clock,
  Calendar,
  History,

  // ── People ──
  User,
  Users,
  UserPlus,
  UserCog,

  // ── App-specific ──
  Bell,
  Inbox,
  Settings,
  Lock,
  GraduationCap,
  BarChart3,
  MessageCircle,
  MessageSquare,
  Sparkles,
  Brain,
  ShieldCheck, // design spec "ShieldKey" — no ShieldKey in Lucide
  FlaskConical,
  Lightbulb,
  Bug,
  Paintbrush,
  Gauge,
  ListChecks,
  ClipboardList,
  ThumbsUp,
} from 'lucide-react';
