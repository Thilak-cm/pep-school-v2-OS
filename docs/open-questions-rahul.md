# Open Questions for Rahul

Living doc of pending decisions. Update answers inline as they come.

---

## PEP-132: Batch Writing Analysis

**Q1: Should batch analysis re-include previously analyzed images?**
- Currently we only analyze NEW images since last run
- We pass previous analysis text as context (longitudinal thread preserved)
- Alternative: re-send all images every time (expensive, but fresh holistic read)
- Or hybrid: always include last N months?
- **Answer:**

**Q2: Min sample threshold — is 3 the right default?**
- Below this we skip writing analysis for that student that week
- **Answer:**

**Q3: Prompt refinement — review Sudarshan's output**
- Live at students/2025-GUL-030/ai_summaries/writing_analysis
- VLM self-selected 6 dimensions: letterFormation, numeralFormation, spacingAndLayout, baselineAndSizeControl, writingStamina, phoneticEncoding
- Right level of detail? Right framing?
- **Answer:**

**Q4: Need archived history of past writing analyses?**
- Currently overwrite each run — past insights baked into new via prompt
- Alternative: archive to history/ subcollection before overwriting
- **Answer:**

---

## PEP-147: Handwriting Rubric

**Q5: Can he share the school's handwriting evaluation rubric?**
- PEP-147 blocked on this
- **Answer:**

---

## PEP-37: Material Usage Intelligence

**Q6: Predefined list of Montessori materials per program?**
- Free-text VLM tagging unreliable — need canonical list
- He created this issue — does he have a list?
- **Answer:**
