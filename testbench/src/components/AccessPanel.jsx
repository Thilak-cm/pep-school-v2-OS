import { useState, useEffect, useMemo } from "react";
import {
  collection, getDocs, doc, setDoc, deleteDoc, Timestamp,
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
import Divider from "@mui/material/Divider";
import Alert from "@mui/material/Alert";

export default function AccessPanel() {
  const { user } = useAuth();

  // All users (loaded once on mount)
  const [allUsers, setAllUsers] = useState(null);
  const [usersLoading, setUsersLoading] = useState(true);

  // Granted users state
  const [grants, setGrants] = useState([]); // [{ uid, name, email, allowedFeatures }]
  const [grantsLoading, setGrantsLoading] = useState(true);

  // Filter state
  const [filterQuery, setFilterQuery] = useState("");

  // Edit/grant dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogUser, setDialogUser] = useState(null); // { uid, name, email }
  const [dialogFeatures, setDialogFeatures] = useState([]); // string[]
  const [saving, setSaving] = useState(false);

  // Load all users + grants on mount
  useEffect(() => {
    loadUsers();
    loadGrants();
  }, []);

  const loadUsers = async () => {
    setUsersLoading(true);
    try {
      const snap = await getDocs(collection(db, "users"));
      const users = snap.docs.map((d) => ({
        uid: d.id,
        name: d.data().displayName || d.data().name || d.id,
        email: d.data().email || "",
        role: d.data().role || "none",
      }));
      setAllUsers(users);
    } catch (err) {
      console.error("Failed to load users:", err);
      setAllUsers([]);
    }
    setUsersLoading(false);
  };

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

  // Live-filtered user list
  const filteredUsers = useMemo(() => {
    if (!allUsers) return [];
    const q = filterQuery.trim().toLowerCase();
    if (q.length === 0) return allUsers;
    return allUsers.filter((u) => u.name.toLowerCase().includes(q));
  }, [allUsers, filterQuery]);

  // Open grant dialog for a user
  const openGrantDialog = (targetUser) => {
    const existing = grants.find((g) => g.uid === targetUser.uid);
    setDialogUser(targetUser);
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

      {/* User list with live filter */}
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <TextField
          size="small"
          label="Filter by name"
          placeholder="Start typing to filter..."
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          fullWidth
          sx={{ mb: 1 }}
        />

        {usersLoading && filterQuery.trim().length > 0 ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : filterQuery.trim().length > 0 ? (
          <List dense sx={{ maxHeight: 320, overflow: "auto" }}>
            {filteredUsers.map((t) => {
              const isSuperadmin = t.role === "superadmin";
              const alreadyGranted = grants.some((g) => g.uid === t.uid);
              return (
                <ListItem
                  key={t.uid}
                  secondaryAction={
                    isSuperadmin ? (
                      <Chip label="Full Access" size="small" color="success" variant="outlined" />
                    ) : (
                      <Button
                        size="small"
                        variant={alreadyGranted ? "outlined" : "contained"}
                        onClick={() => openGrantDialog(t)}
                      >
                        {alreadyGranted ? "Edit" : "Grant Access"}
                      </Button>
                    )
                  }
                >
                  <ListItemText
                    primary={
                      <Box component="span" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        {t.name}
                        <Chip label={t.role} size="small" variant="outlined" sx={{ fontSize: 10, height: 20 }} />
                      </Box>
                    }
                    secondary={isSuperadmin ? "Superadmins have access to all features by default" : t.email}
                  />
                </ListItem>
              );
            })}
            {filteredUsers.length === 0 && filterQuery.trim().length > 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                No users matching &quot;{filterQuery.trim()}&quot;
              </Typography>
            )}
          </List>
        ) : null}
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
