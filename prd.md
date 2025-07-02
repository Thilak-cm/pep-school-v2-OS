# Montessori Observation Hub – PRD (v1.0 & v1.5)

## 🎯 Goal
Give every teacher a mobile-first way to capture, browse, and report classroom observations. Cut report-prep time from hours to minutes.

## 👥 Target Users
- ~50 Teachers
- 12–14 Classrooms
- 1–3 Admins/Principals

## 🚀 Release Plan
- **v1.0 (Week 8)**: 2-class pilot
- **v1.5 (Week 12)**: Full-school rollout + polish features

---

## ✅ Must-Have Features (v1.0)
### Teachers
- Google Sign-in
- Add voice/text note (≤ 5 min speech)
- Tag picker (curriculum areas like Practical Life, Language, etc.)
- Quick group selection (multi-child tagging)
- View student timeline (reverse chrono, filter by tag/date)
- Edit/delete own notes within 24 hours

### Admins/Principals
- Bulk upload roster and attendance (via Google Sheet)
- Live dashboard (obs volume, curriculum coverage, teacher activity)
- Generate report: select date range → Google Doc grouped by tag
- View child portfolio (spider chart of curriculum note count)

---

## ✨ Features Coming in v1.5
### Teachers
- ⭐ Star "Magic Moments" → auto-draft email to parents
- AI-powered "Next Step" suggestions (after each note)
- Classroom activity badge (note count/week)
- Silent push if inactive for 10 days

### Admins
- Tag usage heatmap
- CSV export for filtered notes
- Better error messages for bulk uploads

---

## 📊 Success Metrics
| Version | Metric | Target |
|---------|--------|--------|
| v1.0 | Pilot teacher adoption | ≥ 80% log ≥ 2 notes in Week 2 |
| v1.0 | Report generation time | ≤ 2 min for Google Doc |
| v1.5 | School adoption | ≥ 90% log ≥ 2 notes/week by Week 4 |
| v1.5 | Data hygiene | <10% unused tags |

---

## 🧱 Information Architecture
### Firestore Data Model
```ts
classrooms: { id, name, teacher_ids[] }
students: { uid, name, dob, classroom_id, status }
observations: { id, student_uid, staff_uid, timestamp, text, tags[], starred?, edited_at? }
attendance: { date, student_uid, present }
assessments: { id, student_uid, assessment_type, result, date }
tags: { id, name, description }
```

### Access Control
```ts
allow create: if teacher is assigned to student’s classroom
allow update/delete: only author within 24h
allow read: teachers (own class), admins (all)
```

---

## 🛠 Tech Stack
- Frontend: React + Vite PWA
- Backend: Firebase (Auth, Firestore, Cloud Functions)
- STT: Google Speech-to-Text API
- Docs: Google Docs API
- Charts: Chart.js or Canvas

---

## 🗓 Project Schedule (96h Cap)
| Week | Focus |
|------|-------|
| 1 | Repo + Firebase + Google SSO |
| 2 | CRUD for Classrooms + Students |
| 3 | Voice capture + STT POC |
| 4 | Timeline + Tag/date filters + Group select |
| 5 | Tag manager UI |
| 6 | Bulk roster + dashboard (obs volume + heatmap) |
| 7 | Report gen + child portfolio widget |
| 8 | Pilot test + fix bugs → v1.0 |
| 9–12 | Polish features → v1.5 |

---

## 🔜 Intern Tasks
- [ ] Mock 7 core screens in Figma
- [ ] Capture 30s audio, transcribe to Firestore, render in timeline
- [ ] CRUD for Classrooms + Students with sample data

---

## 📎 Open Items (from Rahul)
- Final tag list (CSV or Google Sheet)
- Sample report template (Google Doc)
- Hosting/STT budget ceiling (to propose post-analytics)
