import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Tooltip from "@mui/material/Tooltip";
import Chip from "@mui/material/Chip";
import LockIcon from "@mui/icons-material/Lock";
import { TOOL_CATALOG_META } from "../../../functions/config/toolCatalog.js";

/**
 * ToolChecklist — toggleable list of agent tools.
 *
 * Props:
 * - enabledTools: string[] of currently enabled tool IDs
 * - allowedTools: string[] of tools the agent is permitted to use (from config)
 * - allowedScopes: string[] of scopes the agent is permitted (e.g. ["student"])
 * - onChange(newEnabledTools): callback with updated list
 */
export default function ToolChecklist({ enabledTools, allowedTools, allowedScopes, onChange }) {
  function handleToggle(toolId) {
    if (enabledTools.includes(toolId)) {
      // Turning off — also disable any tools that have this as a prerequisite
      const dependents = TOOL_CATALOG_META
        .filter((t) => t.prerequisites?.includes(toolId))
        .map((t) => t.id);
      onChange(enabledTools.filter((id) => id !== toolId && !dependents.includes(id)));
    } else {
      onChange([...enabledTools, toolId]);
    }
  }

  const enabledCount = enabledTools.length;
  const totalAllowed = allowedTools.length;

  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 2, p: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
        <Typography variant="subtitle2" fontWeight={600}>Agent Tools</Typography>
        <Chip
          label={`${enabledCount} of ${totalAllowed}`}
          size="small"
          variant="outlined"
          color={enabledCount === 0 ? "error" : "default"}
          sx={{ height: 22, fontSize: 11 }}
        />
      </Box>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {TOOL_CATALOG_META.map((tool) => {
          const scopeAllowed = !allowedScopes || allowedScopes.includes(tool.scope);
          const agentAllowed = allowedTools.includes(tool.id);
          const permitted = scopeAllowed && agentAllowed;
          const checked = enabledTools.includes(tool.id);

          if (!permitted) {
            return (
              <Tooltip key={tool.id} title={`Not available — agent only has ${allowedScopes?.join(", ")} scope`} arrow placement="right">
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.25, opacity: 0.4 }}>
                  <LockIcon sx={{ fontSize: 16, color: "text.disabled", ml: "2px" }} />
                  <Typography variant="body2" color="text.disabled" sx={{ fontSize: 13 }}>
                    {tool.label}
                  </Typography>
                </Box>
              </Tooltip>
            );
          }

          // Disable if prerequisites are not enabled
          const prereqsMet = !tool.prerequisites?.length || tool.prerequisites.every((p) => enabledTools.includes(p));
          const disabled = !prereqsMet;

          return (
            <FormControlLabel
              key={tool.id}
              sx={{ ml: -0.5, mr: 0, "& .MuiFormControlLabel-label": { fontSize: 13 } }}
              control={
                <Checkbox
                  size="small"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => handleToggle(tool.id)}
                  sx={{ py: 0.25 }}
                />
              }
              label={
                <Tooltip title={disabled ? `Requires ${tool.prerequisites.join(", ")}` : tool.description} arrow placement="right">
                  <span style={disabled ? { opacity: 0.5 } : undefined}>{tool.label}</span>
                </Tooltip>
              }
            />
          );
        })}
      </Box>
    </Box>
  );
}
