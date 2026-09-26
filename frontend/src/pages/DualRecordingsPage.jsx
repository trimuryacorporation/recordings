import { useDeferredValue, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Download, Headphones, RefreshCw, Search, Trash2, UploadCloud, UserRound } from "lucide-react";
import { Badge, Button, Card, EmptyState, ErrorState, Input, PageHeader, Skeleton } from "../components/ui/primitives";
import { useApiResource } from "../hooks/useApiResource";
import { api, fetchBinary } from "../services/api";
import { downloadCombinedTracks, downloadTrack } from "../utils/audioDownload";

function useAuthenticatedAudio(url) {
  const [state, setState] = useState({ url: "", loading: Boolean(url), error: "" });

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    if (!url) {
      setState({ url: "", loading: false, error: "" });
      return undefined;
    }

    setState({ url: "", loading: true, error: "" });
    fetchBinary(url)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ url: objectUrl, loading: false, error: "" });
      })
      .catch((error) => {
        if (active) setState({ url: "", loading: false, error: error instanceof Error ? error.message : "Unable to load audio." });
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return state;
}

function formatDuration(value) {
  const totalSeconds = Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function ParticipantTrack({ label, track, downloading, onDownload }) {
  const audio = useAuthenticatedAudio(track?.playbackUrl);
  const storedDuration = track?.mediaFileId?.durationSeconds ?? track?.durationSeconds;
  const [duration, setDuration] = useState(storedDuration);

  useEffect(() => {
    setDuration(storedDuration);
  }, [storedDuration, track?.id]);

  return (
    <section className="min-w-0 px-5 py-5 sm:px-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
            <UserRound size={17} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted">Participant</p>
            <p className="font-semibold text-ink">Participant {label}</p>
            {track && <p className="mt-0.5 text-xs font-medium text-muted">Duration {formatDuration(duration)}</p>}
          </div>
        </div>
        {track ? (
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 text-xs font-semibold text-success sm:inline-flex">
              <CheckCircle2 size={15} /> Ready
            </span>
            <Button type="button" variant="secondary" className="h-8 !px-3" disabled={downloading} onClick={onDownload}>
              <Download size={14} /> {downloading ? "Downloading..." : "Download"}
            </Button>
          </div>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-warning">
            <Clock3 size={15} /> Waiting
          </span>
        )}
      </div>

      {track && audio.url ? (
        <audio
          aria-label={`Participant ${label} recording`}
          className="h-11 w-full"
          controls
          preload="metadata"
          src={audio.url}
          onLoadedMetadata={(event) => {
            if (Number.isFinite(event.currentTarget.duration)) setDuration(event.currentTarget.duration);
          }}
        />
      ) : track ? (
        <div className="flex min-h-11 items-center gap-3 rounded-md border border-line bg-slate-50 px-4 py-3 text-sm text-muted">
          <RefreshCw className={audio.loading ? "shrink-0 animate-spin" : "shrink-0 text-danger"} size={17} />
          <span>{audio.loading ? "Loading audio..." : audio.error}</span>
        </div>
      ) : (
        <div className="flex min-h-11 items-center gap-3 rounded-md border border-dashed border-line bg-slate-50 px-4 py-3 text-sm text-muted">
          <UploadCloud className="shrink-0 text-slate-400" size={18} />
          <span>Audio upload is in progress</span>
        </div>
      )}
    </section>
  );
}

function DeleteConfirmationModal({ count, deleting, onCancel, onConfirm }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !deleting) onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [deleting, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleting) onCancel(); }}>
      <section className="w-full max-w-sm rounded-lg border border-line bg-white shadow-xl" role="dialog" aria-modal="true" aria-labelledby="delete-recording-title">
        <div className="flex items-start gap-3 p-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-danger">
            <AlertTriangle size={20} />
          </span>
          <div>
            <h2 id="delete-recording-title" className="font-semibold text-ink">Are you sure you want to delete?</h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              {count === 1 ? "This recording" : `${count} selected recordings`} and associated audio will be permanently deleted.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-line bg-slate-50 px-5 py-3">
          <Button type="button" variant="secondary" disabled={deleting} onClick={onCancel}>No</Button>
          <Button type="button" variant="danger" disabled={deleting} onClick={onConfirm}>
            <Trash2 size={15} /> {deleting ? "Deleting..." : "Yes, Delete"}
          </Button>
        </div>
      </section>
    </div>
  );
}

function RecordingCard({ recording, downloading, deleting, selected, onSelect, onDelete, onDownloadTrack, onDownloadCombined }) {
  const tracks = ["A", "B"].map((label) => ({
    label,
    track: recording.tracks?.find((item) => item.participantLabel === label)
  }));
  const readyCount = tracks.filter(({ track }) => track).length;
  const taskCode = recording.task?.taskCode ?? "Dual session";
  const title = recording.task?.scriptId?.title ?? recording.project?.name ?? "Recording";

  return (
    <Card
      bodyClassName="p-0"
      headerClassName="px-5 py-3.5 sm:px-6"
      title={(
        <div className="flex min-w-0 items-center gap-3">
          <input
            aria-label={`Select ${title}`}
            className="h-4 w-4 shrink-0 accent-teal-700"
            type="checkbox"
            checked={selected}
            onChange={(event) => onSelect(event.target.checked)}
          />
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-teal-50 text-brand">
            <Headphones size={18} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{title}</p>
            <p className="truncate text-xs font-normal text-muted">{taskCode}</p>
          </div>
        </div>
      )}
      action={(
        <div className="flex items-center gap-2">
          {readyCount === 2 && (
            <Button type="button" variant="secondary" className="h-8 !px-3" disabled={downloading === "combined"} onClick={onDownloadCombined}>
              <Download size={14} /> {downloading === "combined" ? "Combining..." : "Download combined"}
            </Button>
          )}
          {readyCount === 2 ? <Badge tone="success">Complete</Badge> : <Badge tone="warning">{readyCount} of 2 ready</Badge>}
          <Button type="button" variant="danger" className="h-8 !px-2.5" title="Delete recording" aria-label={`Delete ${title}`} disabled={deleting} onClick={onDelete}>
            <Trash2 size={14} />
          </Button>
        </div>
      )}
    >
      <div className="grid divide-y divide-line md:grid-cols-2 md:divide-x md:divide-y-0">
        {tracks.map(({ label, track }) => (
          <ParticipantTrack
            key={label}
            label={label}
            track={track}
            downloading={downloading === label}
            onDownload={() => onDownloadTrack(track, label)}
          />
        ))}
      </div>
    </Card>
  );
}

export function DualRecordingsPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [downloading, setDownloading] = useState({});
  const [selectedIds, setSelectedIds] = useState([]);
  const [pendingDeleteIds, setPendingDeleteIds] = useState([]);
  const [deleting, setDeleting] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const deferredSearch = useDeferredValue(search);
  const params = new URLSearchParams({ page: String(page), pageSize: "100" });
  if (deferredSearch.trim()) params.set("search", deferredSearch.trim());
  const recordings = useApiResource(`/api/recordings-dual?${params}`, { items: [], total: 0, page: 1, pageSize: 100, totalPages: 1 });
  const normalizedRecordings = Array.isArray(recordings.data)
    ? (() => {
        const query = deferredSearch.trim().toLowerCase();
        const filtered = query
          ? recordings.data.filter((recording) => [
              recording.recordingCode,
              recording.task?.taskCode,
              recording.task?.scriptId?.title,
              recording.project?.name
            ].some((value) => String(value ?? "").toLowerCase().includes(query)))
          : recordings.data;
        const totalPages = Math.max(1, Math.ceil(filtered.length / 100));
        const safePage = Math.min(page, totalPages);
        return {
          items: filtered.slice((safePage - 1) * 100, safePage * 100),
          total: filtered.length,
          page: safePage,
          pageSize: 100,
          totalPages
        };
      })()
    : {
        items: recordings.data?.items ?? [],
        total: recordings.data?.total ?? 0,
        page: recordings.data?.page ?? 1,
        pageSize: recordings.data?.pageSize ?? 100,
        totalPages: recordings.data?.totalPages ?? 1
      };

  const fileBase = (recording) => (recording.task?.taskCode ?? recording.recordingCode ?? "dual-recording").replace(/[^a-zA-Z0-9_-]/g, "_");
  async function handleTrackDownload(recording, track, label) {
    if (!track) return;
    setDownloadError("");
    setDownloading((current) => ({ ...current, [recording.id]: label }));
    try {
      await downloadTrack(track.playbackUrl, `${fileBase(recording)}-participant-${label}.wav`);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Audio download failed.");
    } finally {
      setDownloading((current) => ({ ...current, [recording.id]: "" }));
    }
  }

  async function handleCombinedDownload(recording) {
    const tracks = ["A", "B"].map((label) => recording.tracks?.find((track) => track.participantLabel === label));
    if (tracks.some((track) => !track)) return;
    setDownloadError("");
    setDownloading((current) => ({ ...current, [recording.id]: "combined" }));
    try {
      await downloadCombinedTracks(tracks.map((track) => track.playbackUrl), `${fileBase(recording)}-combined.wav`);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Unable to combine the audio tracks.");
    } finally {
      setDownloading((current) => ({ ...current, [recording.id]: "" }));
    }
  }

  function requestDelete(ids) {
    if (ids.length) setPendingDeleteIds(ids);
  }

  async function confirmDelete() {
    const ids = pendingDeleteIds;
    if (!ids.length) return;
    setDeleting(true);
    setDownloadError("");
    try {
      await api(ids.length === 1 ? `/api/recordings-dual/${ids[0]}` : "/api/recordings-dual", {
        method: "DELETE",
        ...(ids.length > 1 ? { body: JSON.stringify({ ids }) } : {})
      });
      setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
      setPendingDeleteIds([]);
      await recordings.reload();
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Unable to delete the recording.");
    } finally {
      setDeleting(false);
    }
  }

  const visibleIds = normalizedRecordings.items.map((recording) => recording.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin Review"
        title="Dual Recordings"
        action={<Button variant="secondary" onClick={recordings.reload} disabled={recordings.loading}><RefreshCw className={recordings.loading ? "animate-spin" : ""} size={16} />Refresh</Button>}
      />
      {recordings.error && <ErrorState message={recordings.error} onRetry={recordings.reload} />}
      {downloadError && <ErrorState message={downloadError} />}
      <div className="flex flex-col gap-3 rounded-lg border border-line bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <label className="relative w-full sm:max-w-md">
          <span className="sr-only">Search dual recordings</span>
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted" />
          <Input className="pl-9" placeholder="Search task, script or project" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
        </label>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              className="h-4 w-4 accent-teal-700"
              type="checkbox"
              checked={allVisibleSelected}
              onChange={(event) => setSelectedIds((current) => event.target.checked
                ? [...new Set([...current, ...visibleIds])]
                : current.filter((id) => !visibleIds.includes(id)))}
            />
            Select page
          </label>
          {selectedIds.length > 0 && (
            <Button type="button" variant="danger" className="h-9" disabled={deleting} onClick={() => requestDelete(selectedIds)}>
              <Trash2 size={15} /> {deleting ? "Deleting..." : `Delete (${selectedIds.length})`}
            </Button>
          )}
          <p className="shrink-0 text-sm text-muted">{normalizedRecordings.total} results</p>
        </div>
      </div>
      {recordings.loading ? (
        <div className="space-y-4">
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
        </div>
      ) : normalizedRecordings.items.length ? (
        <div className="space-y-4">
          {normalizedRecordings.items.map((recording) => (
            <RecordingCard
              key={recording.id}
              recording={recording}
              downloading={downloading[recording.id]}
              deleting={deleting}
              selected={selectedIds.includes(recording.id)}
              onSelect={(checked) => setSelectedIds((current) => checked ? [...new Set([...current, recording.id])] : current.filter((id) => id !== recording.id))}
              onDelete={() => requestDelete([recording.id])}
              onDownloadTrack={(track, label) => handleTrackDownload(recording, track, label)}
              onDownloadCombined={() => handleCombinedDownload(recording)}
            />
          ))}
        </div>
      ) : !recordings.error ? (
        <Card><EmptyState title="No dual recordings yet" body="Uploaded dual sessions will appear here for review." /></Card>
      ) : null}
      {!recordings.loading && normalizedRecordings.total > 0 && (
        <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">Page {normalizedRecordings.page} of {normalizedRecordings.totalPages} | 100 per page</p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft size={16} />Previous</Button>
            <Button type="button" variant="secondary" disabled={page >= normalizedRecordings.totalPages} onClick={() => setPage((current) => current + 1)}>Next<ChevronRight size={16} /></Button>
          </div>
        </div>
      )}
      {pendingDeleteIds.length > 0 && (
        <DeleteConfirmationModal
          count={pendingDeleteIds.length}
          deleting={deleting}
          onCancel={() => setPendingDeleteIds([])}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
