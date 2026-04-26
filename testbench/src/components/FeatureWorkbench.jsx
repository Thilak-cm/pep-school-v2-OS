import { useState, useCallback } from "react";
import { httpsCallable } from "firebase/functions";
import { collection, addDoc, Timestamp } from "firebase/firestore";
import { cloudFunctions, db, auth } from "../firebase.js";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import Slider from "@mui/material/Slider";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import SaveIcon from "@mui/icons-material/Save";
import UploadIcon from "@mui/icons-material/Upload";
import StudentPicker from "./StudentPicker.jsx";
import PromptEditor from "./PromptEditor.jsx";
import OutputPanel from "./OutputPanel.jsx";
import RatingWidget from "./RatingWidget.jsx";
import HandwritingConfig from "./features/HandwritingConfig.jsx";
import SoulConfig from "./features/SoulConfig.jsx";

const MODELS = [
  { id: "gpt-5.4", label: "GPT-5.4" },
  { id: "gpt-5.3-instant", label: "GPT-5.3 Instant" },
  { id: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
  { id: "gpt-5.4-nano", label: "GPT-5.4 Nano" },
];

const MAX_COLUMNS = 4;

function createVariant(config) {
  return {
    systemPrompt: config?.systemPrompt || "",
    guidelinesContent: config?.guidelinesContent || "",
    model: config?.model || "gpt-5.4",
    temperature: config?.temperature ?? 0.3,
    max_tokens: config?.max_tokens || 2000,
    output: null,
    outputMeta: null,
    error: null,
    loading: false,
    rating: 5,
    notes: "",
  };
}

export default function FeatureWorkbench({ featureId }) {
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [variants, setVariants] = useState([createVariant(), createVariant()]);
  const [baseConfig, setBaseConfig] = useState(null);
  const [programFilter, setProgramFilter] = useState(null);
  const [saving, setSaving] = useState(false);

  const isSoul = featureId === "soul_generation";

  const handleConfigLoaded = useCallback((config) => {
    // If config is a function (updater), handle the SoulConfig pattern
    if (typeof config === "function") {
      setBaseConfig((prev) => config(prev));
      return;
    }
    setBaseConfig(config);
    setVariants((prev) => prev.map((v, i) =>
      i === 0 ? { ...v, ...config } : { ...v, systemPrompt: config.systemPrompt, guidelinesContent: config.guidelinesContent || "" }
    ));
  }, []);

  function addColumn() {
    if (variants.length >= MAX_COLUMNS) return;
    const base = variants[0];
    setVariants((prev) => [...prev, createVariant(base)]);
  }

  function removeColumn(idx) {
    if (variants.length <= 1) return;
    setVariants((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateVariant(idx, field, value) {
    setVariants((prev) => prev.map((v, i) => i === idx ? { ...v, [field]: value } : v));
  }

  async function runAll() {
    if (!selectedStudent) return;

    const testBenchRun = httpsCallable(cloudFunctions, "testBenchRun");

    const updated = variants.map((v) => ({ ...v, loading: true, output: null, error: null, outputMeta: null }));
    setVariants(updated);

    const promises = updated.map(async (v, idx) => {
      const start = Date.now();
      try {
        const payload = {
          feature: featureId,
          studentId: selectedStudent.id,
          systemPrompt: v.systemPrompt,
          model: v.model,
          temperature: v.temperature,
          max_tokens: v.max_tokens,
        };
        if (isSoul) {
          payload.guidelinesContent = v.guidelinesContent;
          payload.windowDays = baseConfig?.windowDays || 365;
          payload.includeInterviews = baseConfig?.includeInterviews ?? true;
        }
        const result = await testBenchRun(payload);
        const latencyMs = Date.now() - start;
        return {
          idx,
          output: result.data.output,
          outputMeta: { model: v.model, tokens: result.data.totalTokens, latencyMs },
        };
      } catch (err) {
        return { idx, error: err.message || "Unknown error" };
      }
    });

    const results = await Promise.all(promises);
    setVariants((prev) => {
      const next = [...prev];
      for (const r of results) {
        next[r.idx] = {
          ...next[r.idx],
          loading: false,
          output: r.output || null,
          error: r.error || null,
          outputMeta: r.outputMeta || null,
        };
      }
      return next;
    });
  }

  async function saveRun() {
    if (!selectedStudent) return;
    setSaving(true);
    try {
      const user = auth.currentUser;
      await addDoc(collection(db, "testbench"), {
        feature: featureId,
        studentId: selectedStudent.id,
        studentName: selectedStudent.displayName,
        timestamp: Timestamp.now(),
        variants: variants.map((v) => ({
          prompt: {
            systemPrompt: v.systemPrompt,
            guidelinesContent: v.guidelinesContent || undefined,
            model: v.model,
            temperature: v.temperature,
            max_tokens: v.max_tokens,
          },
          output: v.output || "",
          rating: v.rating,
          notes: v.notes,
        })),
        ranBy: { uid: user?.uid, name: user?.displayName || user?.email },
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1600, mx: "auto" }}>
      {/* Setup bar */}
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 3, mb: 3, flexWrap: "wrap" }}>
        <StudentPicker featureId={featureId} onSelect={setSelectedStudent} programFilter={programFilter} />

        {featureId === "handwriting_analysis" && (
          <HandwritingConfig onConfigLoaded={handleConfigLoaded} />
        )}
        {isSoul && (
          <SoulConfig
            selectedStudent={selectedStudent}
            onConfigLoaded={handleConfigLoaded}
            onProgramChange={setProgramFilter}
          />
        )}

        <Box sx={{ ml: "auto", display: "flex", gap: 1 }}>
          <Button
            variant="contained"
            startIcon={<PlayArrowIcon />}
            onClick={runAll}
            disabled={!selectedStudent || variants.some((v) => v.loading)}
          >
            Run All
          </Button>
          <Button
            variant="outlined"
            startIcon={<SaveIcon />}
            onClick={saveRun}
            disabled={saving || !variants.some((v) => v.output)}
          >
            {saving ? "Saving..." : "Save Run"}
          </Button>
        </Box>
      </Box>

      <Divider sx={{ mb: 3 }} />

      {/* Comparison columns */}
      <Box sx={{ display: "flex", gap: 2, overflowX: "auto", pb: 2 }}>
        {variants.map((v, idx) => (
          <Box
            key={idx}
            sx={{
              flex: `1 0 ${100 / variants.length - 2}%`,
              minWidth: 350,
              border: 1,
              borderColor: "divider",
              borderRadius: 2,
              p: 2,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            {/* Column header */}
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Typography variant="subtitle1" fontWeight={700}>
                Variant {String.fromCharCode(65 + idx)}
              </Typography>
              {variants.length > 1 && (
                <IconButton size="small" onClick={() => removeColumn(idx)}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              )}
            </Box>

            {/* Model + temperature */}
            <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
              <Select
                value={v.model}
                onChange={(e) => updateVariant(idx, "model", e.target.value)}
                size="small"
                sx={{ minWidth: 160 }}
              >
                {MODELS.map((m) => (
                  <MenuItem key={m.id} value={m.id}>{m.label}</MenuItem>
                ))}
              </Select>
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 40 }}>
                T={v.temperature}
              </Typography>
              <Slider
                value={v.temperature}
                onChange={(_, val) => updateVariant(idx, "temperature", val)}
                min={0}
                max={1}
                step={0.1}
                sx={{ width: 80 }}
              />
            </Box>

            {/* Prompt editor(s) */}
            <PromptEditor
              label="System Prompt"
              value={v.systemPrompt}
              onChange={(val) => updateVariant(idx, "systemPrompt", val)}
              rows={isSoul ? 10 : 14}
            />
            {isSoul && (
              <PromptEditor
                label="Guidelines Template"
                value={v.guidelinesContent}
                onChange={(val) => updateVariant(idx, "guidelinesContent", val)}
                rows={10}
                collapsed
                helperText="Per-student developmental areas — loaded from student's ai_summaries/guidelines"
              />
            )}

            {/* Output */}
            <OutputPanel output={v.output} loading={v.loading} error={v.error} meta={v.outputMeta} />

            {/* Rating */}
            {v.output && (
              <RatingWidget
                rating={v.rating}
                notes={v.notes}
                onRatingChange={(val) => updateVariant(idx, "rating", val)}
                onNotesChange={(val) => updateVariant(idx, "notes", val)}
              />
            )}
          </Box>
        ))}

        {/* Add column button */}
        {variants.length < MAX_COLUMNS && (
          <Box
            sx={{
              minWidth: 60,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: 1,
              borderColor: "divider",
              borderRadius: 2,
              borderStyle: "dashed",
              cursor: "pointer",
              "&:hover": { borderColor: "primary.main" },
            }}
            onClick={addColumn}
          >
            <AddIcon color="action" />
          </Box>
        )}
      </Box>
    </Box>
  );
}
