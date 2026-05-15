import { useState, useEffect, useCallback } from "react";
import {
  collection, query, where, getDocs, doc, setDoc, deleteDoc, Timestamp,
} from "firebase/firestore";
import { db } from "../firebase.js";
import { useAuth } from "../contexts/AuthContext.js";
import { ACTIVE_FEATURES } from "../utils/featureRegistry.js";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import ListItemSecondaryAction from "@mui/material/ListItemSecondaryAction";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import CircularProgress from "@mui/material/CircularProgress";
import EditIcon from "@mui/icons-material/Edit";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import Divider from "@mui/material/Divider";
import Alert from "@mui/material/Alert";

export default function AccessPanel() {
  const { user } = useAuth();

  // Granted users state
  const [grants, setGrants] = useState([]); // [{ uid, name, email, allowedFeatures }]
  const [grantsLoading, setGrantsLoading] = useState(true);

  // Teacher search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // Edit/grant dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogUser, setDialogUser] = useState(null); // { uid, name, email }
  const [dialogFeatures, setDialogFeatures] = useState([]); // string[]
  const [saving, setSaving] = useState(false);

  // Load existing grants on mount
  useEffect(() => {
    loadGrants();
  }, []);

  const loadGrants = async () => {
    setGrantsLoading(true);
    const snap = await getDocs(collection(db, "testbench_access"));
    const entries = [];
    for (const d of snap.docs) {
      const data = d.data();
      entries.push({
        uid: d.id,
        name: data.name || d.id,
        email: data.email || "",
        allowedFeatures: data.allowedFeatures || [],
      });
    }
    setGrants(entries);
    setGrantsLoading(false);
  };

  // Search teachers by name
  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (q.length < 2) return;
    setSearching(true);
    // Query users with role=teacher whose name starts with the search string
    // Firestore doesn't support full-text search, so we use >= / < range on name
    const usersRef = collection(db, "users");
    const snap = await getDocs(
      query(
        usersRef,
        where("role", "==", "teacher"),
        where("name", ">=", q),
        where("name", "<=", q + "\uf8ff"),
      ),
    );
    const results = snap.docs.map((d) => ({
      uid: d.id,
      name: d.data().name || d.id,
      email: d.data().email || "",
    }));
    setSearchResults(results);
    setSearching(false);
  }, [searchQuery]);

  // Open grant dialog for a new user
  const openGrantDialog = (teacher) => {
    const existing = grants.find((g) => g.uid === teacher.uid);
    setDialogUser(teacher);
    setDialogFeatures(existing ? [...existing.allowedFeatures] : []);
    setDialogOpen(true);
  };

  // Open edit dialog for an existing grant
  const openEditDialog = (grant) => {
    setDialogUser({ uid: grant.uid, name: grant.name, email: grant.email });
    setDialogFeatures([...grant.allowedFeatures]);
    setDialogOpen(true);
  };

  // Toggle feature in dialog
  const toggleFeature = (featureId) => {
    setDialogFeatures((prev) =>
      prev.includes(featureId)
        ? prev.filter((f) => f !== featureId)
        : [...prev, featureId],
    );
  };

  // Save access doc
  const handleSave = async () => {
    if (!dialogUser) return;
    setSaving(true);

    if (dialogFeatures.length === 0) {
      // Remove access entirely
      await deleteDoc(doc(db, "testbench_access", dialogUser.uid));
    } else {
      await setDoc(doc(db, "testbench_access", dialogUser.uid), {
        allowedFeatures: dialogFeatures,
        name: dialogUser.name,
        email: dialogUser.email,
        grantedBy: user.uid,
        updatedAt: Timestamp.now(),
      });
    }

    setSaving(false);
    setDialogOpen(false);
    setDialogUser(null);
    setDialogFeatures([]);
    setSearchQuery("");
    setSearchResults([]);
    await loadGrants();
  };

  return (
    <Box sx={{ mt: 6 }}>
      <Divider sx={{ mb: 4 }} />
      <Typography variant="h6" fontWeight={600} gutterBottom>
        Access Control
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Grant teachers access to specific test bench features.
      </Typography>

      {/* Teacher search */}
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
          <TextField
            size="small"
            label="Search teacher by name"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            sx={{ flex: 1 }}
          />
          <Button
            variant="outlined"
            onClick={handleSearch}
            disabled={searching || searchQuery.trim().length < 2}
            startIcon={searching ? <CircularProgress size={16} /> : <PersonAddIcon />}
          >
            Search
          </Button>
        </Box>

        {searchResults.length > 0 && (
          <List dense sx={{ mt: 1 }}>
            {searchResults.map((t) => {
              const alreadyGranted = grants.some((g) => g.uid === t.uid);
              return (
                <ListItem
                  key={t.uid}
                  secondaryAction={
                    <Button
                      size="small"
                      variant={alreadyGranted ? "outlined" : "contained"}
                      onClick={() => openGrantDialog(t)}
                    >
                      {alreadyGranted ? "Edit" : "Grant Access"}
                    </Button>
                  }
                >
                  <ListItemText
                    primary={t.name}
                    secondary={t.email}
                  />
                </ListItem>
              );
            })}
          </List>
        )}

        {searchResults.length === 0 && !searching && searchQuery.trim().length >= 2 && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            No teachers found matching &quot;{searchQuery.trim()}&quot;
          </Typography>
        )}
      </Paper>

      {/* Currently granted users */}
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Granted Users ({grants.length})
      </Typography>

      {grantsLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
          <CircularProgress size={24} />
        </Box>
      ) : grants.length === 0 ? (
        <Alert severity="info" variant="outlined">
          No teachers have been granted test bench access yet.
        </Alert>
      ) : (
        <Paper variant="outlined">
          <List dense>
            {grants.map((g, i) => (
              <ListItem
                key={g.uid}
                divider={i < grants.length - 1}
              >
                <ListItemText
                  primary={g.name}
                  secondary={
                    <Box component="span" sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.5 }}>
                      {g.allowedFeatures.map((fId) => {
                        const feature = ACTIVE_FEATURES.find((f) => f.id === fId);
                        return (
                          <Chip
                            key={fId}
                            label={feature?.label || fId}
                            size="small"
                            color="primary"
                            variant="outlined"
                          />
                        );
                      })}
                    </Box>
                  }
                />
                <ListItemSecondaryAction>
                  <IconButton edge="end" size="small" onClick={() => openEditDialog(g)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        </Paper>
      )}

      {/* Grant/Edit dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>
          {dialogUser?.name ? `Manage Access — ${dialogUser.name}` : "Grant Access"}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Select which features this teacher can access. Remove all features to revoke access entirely.
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            {ACTIVE_FEATURES.map((f) => (
              <Chip
                key={f.id}
                label={f.label}
                color={dialogFeatures.includes(f.id) ? "primary" : "default"}
                variant={dialogFeatures.includes(f.id) ? "filled" : "outlined"}
                onClick={() => toggleFeature(f.id)}
                sx={{ cursor: "pointer" }}
              />
            ))}
          </Box>
          {dialogFeatures.length === 0 && (
            <Alert severity="warning" variant="outlined" sx={{ mt: 2 }}>
              Saving with no features selected will revoke this teacher&apos;s access.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : dialogFeatures.length === 0 ? "Revoke Access" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
