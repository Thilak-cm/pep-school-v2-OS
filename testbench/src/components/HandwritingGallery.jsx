import { useState, useEffect, useRef } from "react";
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";
import { ref, getDownloadURL } from "firebase/storage";
import { db, storage } from "../firebase.js";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import Tooltip from "@mui/material/Tooltip";
import CircularProgress from "@mui/material/CircularProgress";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CloseIcon from "@mui/icons-material/Close";
import { extractStoragePaths, buildGalleryItems, navigateGallery } from "../utils/galleryHelpers.js";
import { fetchMediaUrlsWithConcurrency } from "../utils/mediaUrlBatching.js";

/**
 * PEP-241: Handwriting image gallery with horizontal thumbnail carousel
 * and expanded lightbox view.
 *
 * Props:
 * - studentId: string | null — when set, fetches handwritten media docs
 * - onCountLoaded(count): callback with live handwritten image count
 */
export default function HandwritingGallery({ studentId, onCountLoaded }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedIndex, setExpandedIndex] = useState(null);
  const onCountLoadedRef = useRef(onCountLoaded);
  onCountLoadedRef.current = onCountLoaded;

  useEffect(() => {
    if (!studentId) {
      setItems([]);
      setExpandedIndex(null);
      onCountLoadedRef.current?.(0);
      return;
    }

    let ignore = false;
    setLoading(true);
    setError(null);
    setItems([]);
    setExpandedIndex(null);

    (async () => {
      try {
        const mediaRef = collection(db, `students/${studentId}/media`);
        const q = query(mediaRef, where("handwritten", "==", true), orderBy("observedAt", "asc"));
        const snap = await getDocs(q);
        if (ignore) return;

        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        onCountLoadedRef.current?.(docs.length);

        if (docs.length === 0) {
          setItems([]);
          setLoading(false);
          return;
        }

        const paths = extractStoragePaths(docs);
        const urlMap = await fetchMediaUrlsWithConcurrency(
          paths,
          (path) => getDownloadURL(ref(storage, path)),
          { concurrency: 6 },
        );
        if (ignore) return;

        setItems(buildGalleryItems(docs, urlMap));
      } catch {
        if (ignore) return;
        setError("Failed to load handwriting images");
      } finally {
        if (!ignore) setLoading(false);
      }
    })();

    return () => { ignore = true; };
  }, [studentId]);

  if (!studentId) return null;

  if (loading) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 2 }}>
        <CircularProgress size={20} />
        <Typography variant="body2" color="text.secondary">Loading handwriting images…</Typography>
      </Box>
    );
  }

  if (error) {
    return <Typography variant="body2" color="error" sx={{ py: 1 }}>{error}</Typography>;
  }

  if (items.length === 0) {
    return <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>No handwriting images found for this student.</Typography>;
  }

  const expanded = expandedIndex !== null ? items[expandedIndex] : null;

  return (
    <Box>
      {/* Thumbnail carousel — horizontal scroll */}
      <Box sx={{ display: "flex", gap: 1.5, overflowX: "auto", py: 1, px: 0.5, "&::-webkit-scrollbar": { height: 6 }, "&::-webkit-scrollbar-thumb": { bgcolor: "divider", borderRadius: 3 } }}>
        {items.map((item, idx) => (
          <Box
            key={item.id}
            onClick={() => setExpandedIndex(idx)}
            sx={{
              flex: "0 0 auto",
              width: 140,
              cursor: "pointer",
              borderRadius: 2,
              overflow: "hidden",
              border: 2,
              borderColor: expandedIndex === idx ? "primary.main" : "divider",
              transition: "border-color 0.2s",
              "&:hover": { borderColor: "primary.light" },
            }}
          >
            <Box
              component="img"
              src={item.url}
              alt={`Handwriting sample ${idx + 1}`}
              loading="lazy"
              sx={{ width: "100%", height: 100, objectFit: "cover", display: "block" }}
            />
            <Box sx={{ p: 0.75 }}>
              <Typography variant="caption" noWrap sx={{ display: "block", fontWeight: 500 }}>
                {item.observedAt ? new Date(item.observedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" }) : "—"}
              </Typography>
              {item.createdByName && (
                <Typography variant="caption" noWrap sx={{ display: "block", color: "text.secondary", fontSize: "0.65rem" }}>
                  {item.createdByName}
                </Typography>
              )}
              {item.curriculumArea && (
                <Chip label={item.curriculumArea} size="small" variant="outlined" sx={{ mt: 0.25, height: 18, fontSize: "0.65rem" }} />
              )}
              {item.teacherComment && (
                <Tooltip title={item.teacherComment} arrow>
                  <Typography variant="caption" noWrap sx={{ display: "block", mt: 0.25, color: "text.secondary", fontStyle: "italic", fontSize: "0.6rem" }}>
                    "{item.teacherComment}"
                  </Typography>
                </Tooltip>
              )}
            </Box>
          </Box>
        ))}
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
        {items.length} handwriting sample{items.length !== 1 ? "s" : ""}
      </Typography>

      {/* Expanded lightbox dialog */}
      <Dialog
        open={expandedIndex !== null}
        onClose={() => setExpandedIndex(null)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { bgcolor: "grey.900", color: "white" } }}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") { setExpandedIndex((i) => navigateGallery(i, -1, items.length)); e.preventDefault(); e.stopPropagation(); }
          else if (e.key === "ArrowRight") { setExpandedIndex((i) => navigateGallery(i, 1, items.length)); e.preventDefault(); e.stopPropagation(); }
        }}
      >
        <DialogContent sx={{ p: 0, position: "relative" }}>
          {/* Close button */}
          <IconButton onClick={() => setExpandedIndex(null)} sx={{ position: "absolute", top: 8, right: 8, zIndex: 2, color: "white", bgcolor: "rgba(0,0,0,0.5)", "&:hover": { bgcolor: "rgba(0,0,0,0.7)" } }}>
            <CloseIcon />
          </IconButton>

          {expanded && (
            <Box sx={{ display: "flex", flexDirection: "column" }}>
              {/* Image with navigation arrows */}
              <Box sx={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300, bgcolor: "grey.900" }}>
                {items.length > 1 && (
                  <IconButton
                    onClick={() => setExpandedIndex((i) => navigateGallery(i, -1, items.length))}
                    disabled={expandedIndex === 0}
                    sx={{ position: "absolute", left: 8, zIndex: 1, color: "white", bgcolor: "rgba(0,0,0,0.5)", "&:hover": { bgcolor: "rgba(0,0,0,0.7)" }, "&.Mui-disabled": { color: "rgba(255,255,255,0.3)" } }}
                  >
                    <ChevronLeftIcon />
                  </IconButton>
                )}

                <Box
                  component="img"
                  src={expanded.url}
                  alt={`Handwriting sample ${expandedIndex + 1}`}
                  sx={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain", display: "block", mx: "auto" }}
                />

                {items.length > 1 && (
                  <IconButton
                    onClick={() => setExpandedIndex((i) => navigateGallery(i, 1, items.length))}
                    disabled={expandedIndex === items.length - 1}
                    sx={{ position: "absolute", right: 8, zIndex: 1, color: "white", bgcolor: "rgba(0,0,0,0.5)", "&:hover": { bgcolor: "rgba(0,0,0,0.7)" }, "&.Mui-disabled": { color: "rgba(255,255,255,0.3)" } }}
                  >
                    <ChevronRightIcon />
                  </IconButton>
                )}
              </Box>

              {/* Metadata bar */}
              <Box sx={{ p: 2, display: "flex", flexWrap: "wrap", gap: 1.5, alignItems: "center", borderTop: 1, borderColor: "grey.800" }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {expandedIndex + 1} / {items.length}
                </Typography>
                {expanded.observedAt && (
                  <Chip label={new Date(expanded.observedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} size="small" sx={{ color: "white", borderColor: "grey.600" }} variant="outlined" />
                )}
                {expanded.curriculumArea && (
                  <Chip label={expanded.curriculumArea} size="small" color="primary" />
                )}
                {expanded.createdByName && (
                  <Typography variant="caption" sx={{ color: "grey.400" }}>by {expanded.createdByName}</Typography>
                )}
                {expanded.teacherComment && (
                  <Typography variant="body2" sx={{ width: "100%", color: "grey.300", fontStyle: "italic", mt: 0.5 }}>
                    "{expanded.teacherComment}"
                  </Typography>
                )}
              </Box>
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
