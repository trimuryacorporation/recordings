import { ChevronDown, LogOut, Mic, Pause, Play, RotateCcw, Square, UserCircle, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, Card, ErrorState } from "../components/ui/primitives";
import { useApiResource } from "../hooks/useApiResource";
import { api, currentUser, logout } from "../services/api";

const finishedStatuses = new Set(["QA_PENDING", "APPROVED", "REJECTED"]);

export function ScriptRecordingPage() {
  const tasks = useApiResource("/api/tasks");
  const [completedIds, setCompletedIds] = useState([]);
  const [stream, setStream] = useState(null);
  const [recorder, setRecorder] = useState(null);
  const [blob, setBlob] = useState(null);
  const [recordingState, setRecordingState] = useState("READY");
  const [countdown, setCountdown] = useState(null);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const timer = useRef(null);
  const countdownTimer = useRef(null);
  const discardCurrent = useRef(false);
  const profileMenu = useRef(null);
  const activeSessionId = useRef(null);
  const liveRequested = useRef(false);
  const navigate = useNavigate();
  const user = currentUser();
  const scripted = user?.recordingMode !== "NON_SCRIPTED";
  const availableTasks = scripted ? tasks.data.filter((task) => !finishedStatuses.has(task.status) && !completedIds.includes(task.id)) : [];
  const task = availableTasks[0];
  const previewUrl = useMemo(() => (blob ? URL.createObjectURL(blob) : ""), [blob]);
  const recordingActive = recorder && recorder.state !== "inactive";

  useEffect(() => {
    let media;
    navigator.mediaDevices?.getUserMedia({ audio: true })
      .then((nextMedia) => { media = nextMedia; setStream(nextMedia); })
      .catch(() => setError("Microphone permission is required to record scripts."));
    return () => media?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => () => previewUrl && URL.revokeObjectURL(previewUrl), [previewUrl]);
  useEffect(() => () => {
    window.clearInterval(timer.current);
    window.clearInterval(countdownTimer.current);
  }, []);

  useEffect(() => {
    function closeProfile(event) {
      if (event.key === "Escape" || (event.type === "pointerdown" && !profileMenu.current?.contains(event.target))) setProfileOpen(false);
    }
    document.addEventListener("pointerdown", closeProfile);
    document.addEventListener("keydown", closeProfile);
    return () => {
      document.removeEventListener("pointerdown", closeProfile);
      document.removeEventListener("keydown", closeProfile);
    };
  }, []);

  function startTimer() {
    window.clearInterval(timer.current);
    timer.current = window.setInterval(() => setSeconds((value) => value + 1), 1000);
  }

  function startRecording() {
    if (!stream || (scripted && !task)) return;
    const chunks = [];
    discardCurrent.current = false;
    const nextRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
    nextRecorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
    nextRecorder.onstop = () => {
      if (!discardCurrent.current) setBlob(new Blob(chunks, { type: "audio/webm" }));
    };
    nextRecorder.start(1000);
    setRecorder(nextRecorder);
    setBlob(null);
    setSeconds(0);
    setRecordingState("RECORDING");
    startTimer();
    if (scripted) {
      liveRequested.current = true;
      startLiveSession();
    }
  }

  async function startLiveSession() {
    try {
      const session = await api("/api/recording-sessions", { method: "POST", body: JSON.stringify({ taskId: task.id }) });
      await api(`/api/recording-sessions/${session.id}/ready`, { method: "POST", body: JSON.stringify({ label: "A", cameraReady: false }) });
      await api(`/api/recording-sessions/${session.id}/start`, { method: "POST", body: "{}" });
      activeSessionId.current = session.id;
      if (!liveRequested.current)
        await api(`/api/recording-sessions/${session.id}/stop`, { method: "POST", body: "{}" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to publish live recording status.");
    }
  }

  function beginCountdown() {
    let remaining = 5;
    setCountdown(remaining);
    setRecordingState("GET READY");
    countdownTimer.current = window.setInterval(() => {
      remaining -= 1;
      if (remaining === 0) {
        window.clearInterval(countdownTimer.current);
        setCountdown(null);
        startRecording();
      } else {
        setCountdown(remaining);
      }
    }, 1000);
  }

  function cancelCountdown() {
    window.clearInterval(countdownTimer.current);
    setCountdown(null);
    setRecordingState("READY");
  }

  function togglePause() {
    if (!recorder) return;
    if (recorder.state === "recording") {
      recorder.pause();
      window.clearInterval(timer.current);
      setRecordingState("PAUSED");
    } else if (recorder.state === "paused") {
      recorder.resume();
      startTimer();
      setRecordingState("RECORDING");
    }
  }

  function stopRecording() {
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
    liveRequested.current = false;
    window.clearInterval(timer.current);
    setRecordingState("PREVIEW");
    if (activeSessionId.current) {
      api(`/api/recording-sessions/${activeSessionId.current}/stop`, { method: "POST", body: "{}" }).catch(() => undefined);
    }
  }

  function rerecord() {
    liveRequested.current = false;
    if (activeSessionId.current)
      api(`/api/recording-sessions/${activeSessionId.current}/stop`, { method: "POST", body: "{}" }).catch(() => undefined);
    window.clearInterval(countdownTimer.current);
    setCountdown(null);
    discardCurrent.current = true;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    window.clearInterval(timer.current);
    setRecorder(null);
    setBlob(null);
    setSeconds(0);
    setRecordingState("READY");
  }

  async function submit() {
    if (!blob || (scripted && !task)) return;
    setSubmitting(true);
    setError("");
    try {
      const hash = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
      const checksum = btoa(String.fromCharCode(...new Uint8Array(hash)));
      const upload = await api("/api/uploads/initiate", {
        method: "POST",
        body: JSON.stringify({ fileName: `${scripted ? task.id : `manual-${Date.now()}`}.webm`, mimeType: blob.type, size: blob.size, checksum, recordingType: "SINGLE" })
      });
      if (scripted) {
        let sessionId = activeSessionId.current;
        if (!sessionId) {
          const session = await api("/api/recording-sessions", { method: "POST", body: JSON.stringify({ taskId: task.id }) });
          sessionId = session.id;
        }
        await api(`/api/uploads/${upload.uploadId}/complete`, {
          method: "POST",
          body: JSON.stringify({ taskId: task.id, sessionId, durationSeconds: seconds, kind: "audio", timestamps: { localStopEpochMs: Date.now() } })
        });
        setCompletedIds((ids) => [...ids, task.id]);
      } else {
        await api(`/api/uploads/${upload.uploadId}/complete`, {
          method: "POST",
          body: JSON.stringify({ manual: true, durationSeconds: seconds, kind: "audio", timestamps: { localStopEpochMs: Date.now() } })
        });
      }
      setRecorder(null);
      activeSessionId.current = null;
      setBlob(null);
      setSeconds(0);
      setRecordingState("READY");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit this recording.");
    } finally {
      setSubmitting(false);
    }
  }

  function signOut() {
    logout();
    navigate("/login");
  }

  const displayTime = new Date(seconds * 1000).toISOString().substring(11, 19);

  return (
    <main className="h-dvh overflow-hidden bg-slate-50">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-3 border-b border-line bg-white px-3 sm:h-16 sm:px-5 lg:px-8">
        <div className="flex min-w-0 items-center gap-2"><Mic className="h-5 w-5 shrink-0 text-brand" /><div className="min-w-0"><p className="truncate text-sm font-bold text-brand">Script Recorder</p><p className="hidden truncate text-xs text-muted sm:block">Trimurya Corporation Pvt. Ltd.</p></div></div>
        <div className="relative" ref={profileMenu}>
          <button className="focus-ring flex h-10 items-center gap-2 rounded-md px-1.5 hover:bg-slate-100 sm:px-2" type="button" aria-expanded={profileOpen} aria-label="Open profile menu" onClick={() => setProfileOpen((open) => !open)}>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-teal-50 text-sm font-bold text-brand">{(user?.name ?? user?.email ?? "U").charAt(0).toUpperCase()}</span>
            <span className="hidden max-w-44 text-left sm:block"><span className="block truncate text-sm font-semibold text-ink">{user?.name ?? "Recording User"}</span><span className="block truncate text-xs text-muted">{user?.email}</span></span>
            <ChevronDown className={`h-4 w-4 text-muted transition ${profileOpen ? "rotate-180" : ""}`} />
          </button>
          {profileOpen && (
            <div className="absolute right-0 top-12 z-20 w-[min(18rem,calc(100vw-1.5rem))] rounded-md border border-line bg-white p-2 shadow-lg">
              <div className="flex items-start gap-3 border-b border-line p-3">
                <UserCircle className="h-9 w-9 shrink-0 text-brand" />
                <div className="min-w-0"><p className="truncate text-sm font-semibold">{user?.name ?? "Recording User"}</p><p className="truncate text-xs text-muted">{user?.email}</p></div>
              </div>
              <div className="space-y-2 px-3 py-3 text-xs">
                <div className="flex items-center justify-between gap-3"><span className="text-muted">Platform</span><Badge tone="accent">Script Recording</Badge></div>
                <div className="flex items-center justify-between gap-3"><span className="text-muted">Mode</span><Badge tone={scripted ? "success" : "warning"}>{scripted ? "Scripted" : "Non-scripted"}</Badge></div>
                <div className="flex items-center justify-between gap-3"><span className="text-muted">Microphone</span><Badge tone={stream ? "success" : "warning"}>{stream ? "Ready" : "Checking"}</Badge></div>
              </div>
              <button className="focus-ring flex h-10 w-full items-center gap-2 rounded-md px-3 text-sm font-semibold text-danger hover:bg-red-50" type="button" onClick={signOut}><LogOut size={16} />Logout</button>
            </div>
          )}
        </div>
      </header>
      <div className="mx-auto flex h-[calc(100dvh-3.5rem)] max-w-6xl flex-col gap-3 overflow-hidden p-3 sm:h-[calc(100dvh-4rem)] sm:gap-5 sm:p-5 lg:gap-6 lg:p-8">
        <div className="hidden sm:block"><p className="text-sm font-medium text-muted">Script Recording</p><h1 className="text-2xl font-bold text-ink">Recording Workstation</h1></div>
        {(error || tasks.error) && <ErrorState message={error || tasks.error} onRetry={() => { setError(""); tasks.reload(); }} />}
        {scripted && !tasks.loading && !task ? (
          <Card title="All scripts completed"><p className="text-sm text-muted">No pending script is assigned to this account.</p></Card>
        ) : (
          <div className={scripted ? "grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-1 lg:gap-6" : "flex min-h-0 flex-1 justify-center"}>
            {scripted && <Card className="order-2 flex min-h-0 flex-col lg:order-1" title={task?.script?.title ?? "Loading script"} bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-4 sm:p-5">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase text-muted">{task?.taskCode} | {task?.project?.name}</p>
                {task?.recordingType && <Badge tone={task.recordingType === "DUAL" ? "warning" : "success"}>{task.recordingType === "DUAL" ? "Dual Recording" : "Single Recording"}</Badge>}
              </div>
              <p className="mt-3 min-h-0 flex-1 overflow-y-auto break-words pr-1 text-lg leading-8 sm:mt-5 sm:text-xl sm:leading-9">{task?.script?.currentText ?? "Loading assigned script..."}</p>
              <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-sm sm:mt-6 sm:pt-4"><span className="text-muted">Remaining scripts</span><Badge tone="accent">{availableTasks.length}</Badge></div>
            </Card>}
            <Card className={`order-1 h-fit shrink-0 lg:order-2 ${scripted ? "" : "w-full max-w-md"}`} title={scripted ? "Recording controls" : "Non-script recording"} headerClassName="px-3 py-2 sm:px-5 sm:py-4" bodyClassName="p-2.5 sm:p-5">
              <div className="text-center"><Mic className="mx-auto h-5 w-5 text-brand sm:h-8 sm:w-8" /><p className="mt-1 text-2xl font-bold tabular-nums sm:mt-3 sm:text-4xl">{countdown ?? displayTime}</p><Badge tone={recordingState === "RECORDING" ? "danger" : countdown !== null ? "warning" : "neutral"}>{recordingState}</Badge></div>
              <div className="mt-2 grid grid-cols-3 gap-1.5 sm:mt-6 sm:gap-2">
                <Button className="h-10 gap-1 px-1 text-xs sm:h-12 sm:gap-2 sm:px-2 sm:text-sm" type="button" variant={recordingActive || countdown !== null ? "danger" : "primary"} onClick={countdown !== null ? cancelCountdown : recordingActive ? stopRecording : beginCountdown} disabled={!recordingActive && countdown === null && (!stream || (scripted && !task))}>{recordingActive ? <Square size={14} /> : <Play size={14} />}{countdown !== null ? "Cancel" : recordingActive ? "Stop" : "Start"}</Button>
                <Button className="h-10 gap-1 px-1 text-xs sm:h-12 sm:gap-2 sm:px-2 sm:text-sm" type="button" variant="secondary" onClick={togglePause} disabled={countdown !== null || !recorder || recorder.state === "inactive"}><Pause size={14} />{recordingState === "PAUSED" ? "Resume" : "Pause"}</Button>
                <Button className="h-10 gap-1 px-1 text-xs sm:h-12 sm:gap-2 sm:px-2 sm:text-sm" type="button" variant="secondary" onClick={rerecord} disabled={!blob && !recordingActive && countdown === null}><RotateCcw size={14} /><span className="hidden min-[340px]:inline">Re-record</span></Button>
              </div>
              {blob && <audio className="mt-4 w-full" controls preload="metadata" src={previewUrl} />}
              <Button className="mt-2 h-10 w-full text-xs sm:mt-4 sm:h-12 sm:text-sm" type="button" onClick={submit} disabled={!blob || submitting}><Upload size={14} />{submitting ? "Submitting..." : scripted ? "Submit and next" : "Save recording"}</Button>
            </Card>
          </div>
        )}
      </div>
    </main>
  );
}
