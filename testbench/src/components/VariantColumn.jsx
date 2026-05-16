import { useState } from "react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import Slider from "@mui/material/Slider";
import TextField from "@mui/material/TextField";
import Chip from "@mui/material/Chip";
import ListSubheader from "@mui/material/ListSubheader";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";
import CheckIcon from "@mui/icons-material/Check";
import PromptEditor from "./PromptEditor.jsx";
import OutputPanel from "./OutputPanel.jsx";
import RatingWidget from "./RatingWidget.jsx";
import ConversationPanel from "./ConversationPanel.jsx";
import { MODELS_BY_PROVIDER, TEST_BENCH_MODELS } from "../utils/variantHelpers.js";

/**
 * A single comparison column in the workbench.
 *
 * Props:
 * - variant: the variant object
 * - idx: variant index
 * - featureId: current feature id
 * - canRemove: whether this column can be closed
 * - onUpdate(idx, field, value): update variant field
 * - onRemove(idx): remove/close this column
 * - conversations: conversation turns for this variant (interview mode)
 * - teacherInput: current teacher input (interview mode, shared across columns)
 * - onTeacherInputChange: setter for teacher input
 * - onSendAnswer: send the current teacher answer
 * - anyLoading: true if any variant is loading (disables input)
 * - interviewEnded: whether interview has ended
 */
export default function VariantColumn({
  variant: v,
  idx,
  featureId,
  canRemove,
  onUpdate,
  onRemove,
  conversations,
  teacherInput,
  onTeacherInputChange,
  onSendAnswer,
  anyLoading,
  interviewEnded,
  areaPickPhase,
  areaPool,
  pickedAreas,
  onToggleArea,
  onConfirmAreas,
  onCancelAreas,
  allVariantsReady,
  studentName,
}) {
  const [editingName, setEditingName] = useState(false);

  const isSoul = featureId === "soul_generation";
  const isInterview = featureId === "interview_question_gen";
  const turns = conversations || [];

  return (
    <Box
      sx={{
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
      {/* Column header with editable name */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          {editingName ? (
            <>
              <TextField
                size="small"
                value={v.name}
                onChange={(e) => onUpdate(idx, "name", e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") setEditingName(false); }}
                autoFocus
                sx={{ width: 180 }}
                slotProps={{ input: { sx: { fontWeight: 700 } } }}
              />
              <IconButton size="small" onClick={() => setEditingName(false)} color="primary">
                <CheckIcon fontSize="small" />
              </IconButton>
            </>
          ) : (
            <>
              <Typography variant="subtitle1" fontWeight={700}>
                {v.name}
              </Typography>
              <IconButton size="small" onClick={() => setEditingName(true)} sx={{ color: "primary.main" }}>
                <EditIcon fontSize="small" />
              </IconButton>
            </>
          )}
        </Box>
        {canRemove && (
          <IconButton size="small" onClick={() => onRemove(idx)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
      </Box>

      {/* Model + temperature */}
      <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
        <Select
          value={v.model}
          onChange={(e) => onUpdate(idx, "model", e.target.value)}
          size="small"
          sx={{ minWidth: 200 }}
        >
          {MODELS_BY_PROVIDER.map((group) => [
            <ListSubheader key={group.provider}>{group.provider}</ListSubheader>,
            ...group.models.map((m) => (
              <MenuItem key={m.id} value={m.id}>{m.label}</MenuItem>
            )),
          ])}
        </Select>
        {isInterview && !TEST_BENCH_MODELS.find((m) => m.id === v.model)?.supportsJsonMode && (
          <Chip label="No JSON mode" size="small" color="warning" variant="outlined" sx={{ fontSize: "0.7rem" }} />
        )}
        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 40 }}>
          T={v.temperature}
        </Typography>
        <Slider
          value={v.temperature}
          onChange={(_, val) => onUpdate(idx, "temperature", val)}
          min={0}
          max={1}
          step={0.1}
          sx={{ width: 80 }}
        />
      </Box>

      {/* Prompt editor(s) */}
      <PromptEditor
        label={isInterview ? "Instruction Template" : "System Prompt"}
        value={v.systemPrompt}
        onChange={(val) => onUpdate(idx, "systemPrompt", val)}
        rows={isSoul || isInterview ? 10 : 14}
      />
      {isSoul && (
        <PromptEditor
          label="Guidelines Template"
          value={v.guidelinesContent}
          onChange={(val) => onUpdate(idx, "guidelinesContent", val)}
          rows={10}
          collapsed
          helperText="Per-student developmental areas — loaded from student's ai_summaries/guidelines"
        />
      )}

      {/* Output / Conversation */}
      {isInterview ? (
        <ConversationPanel
          turns={turns}
          loading={v.loading}
          error={v.error}
          teacherInput={teacherInput}
          onTeacherInputChange={onTeacherInputChange}
          onSendAnswer={onSendAnswer}
          inputDisabled={anyLoading}
          ended={interviewEnded}
          areaPickPhase={areaPickPhase}
          areaPool={areaPool}
          pickedAreas={pickedAreas}
          onToggleArea={onToggleArea}
          onConfirmAreas={onConfirmAreas}
          onCancelAreas={onCancelAreas}
          allVariantsReady={allVariantsReady}
          studentName={studentName}
        />
      ) : (
        <OutputPanel output={v.output} loading={v.loading} error={v.error} meta={v.outputMeta} featureId={featureId} />
      )}

      {/* Rating */}
      {(isInterview ? (turns.length > 0 && !v.loading) : v.output) && (
        <RatingWidget
          rating={v.rating}
          notes={v.notes}
          onRatingChange={(val) => onUpdate(idx, "rating", val)}
          onNotesChange={(val) => onUpdate(idx, "notes", val)}
        />
      )}
    </Box>
  );
}
