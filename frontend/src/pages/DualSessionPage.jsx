import { ArrowLeft, ArrowRight, CheckCircle2, LogIn, Pause, Play, RotateCcw, Square, UserCheck, Wifi } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Badge, Button, Card, ErrorState } from "../components/ui/primitives";
import { acceptGuestInvitation, api, currentUser, logout, uploadBinary } from "../services/api";

const initialParticipants = [
  { label: "A", connection: "WAITING", micReady: false, cameraReady: false, networkOk: false, ready: false },
  { label: "B", connection: "WAITING", micReady: false, cameraReady: false, networkOk: false, ready: false }
];

function normalizedSessionState(session) {
  const value = session?.syncMetadata?.controlState ?? session?.status ?? "WAITING_FOR_PARTICIPANTS";
  if (value === "RERECORD") return "READY";
  if (["START", "RESUME"].includes(value)) return "RECORDING";
  if (value === "STOP") return "PROCESSING";
  return value;
}

function ParticipantStatus({ label, shortLabel, value, shortValue, ready }) {
  return (
    <div className="min-w-0 px-0.5 py-0.5 sm:rounded-md sm:bg-slate-50 sm:px-3 sm:py-2">
      <p className="truncate text-[8px] font-medium text-muted sm:text-xs"><span className="sm:hidden">{shortLabel}</span><span className="hidden sm:inline">{label}</span></p>
      <p className={`flex items-center gap-1 truncate text-[10px] font-semibold sm:mt-0.5 sm:gap-1.5 sm:text-xs ${ready ? "text-success" : "text-warning"}`}>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ready ? "bg-emerald-500" : "bg-amber-500"}`} />
        <span className="sm:hidden">{shortValue ?? value}</span><span className="hidden sm:inline">{value}</span>
      </p>
    </div>
  );
}

export function DualSessionPage() {
  const { taskId, token, sessionId: routeSessionId } = useParams();
  const [user, setUser] = useState(currentUser);
  const navigate = useNavigate();
  const location = useLocation();
  const initialized = useRef("");
  const [sessionId, setSessionId] = useState("");
  const [role, setRole] = useState("");
  const [task, setTask] = useState(null);
  const [participants, setParticipants] = useState(initialParticipants);
  const [state, setState] = useState("WAITING_FOR_PARTICIPANTS");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [stream, setStream] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [seconds, setSeconds] = useState(0);
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploadedParticipants, setUploadedParticipants] = useState([]);
  const recorderRef = useRef(null);
  const recordingAuthorizedRef = useRef(false);
  const timerRef = useRef(null);
  const countdownTimerRef = useRef(null);
  const secondsRef = useRef(0);
  const socket = useMemo(() => io("/", { autoConnect: false }), []);

  useEffect(() => {
    let media;
    let cancelled = false;
    navigator.mediaDevices?.getUserMedia({ audio: true }).then((next) => {
      if (cancelled) next.getTracks().forEach((track) => track?.stop());
      else { media = next; setStream(next); }
    }).catch(() => { if (!cancelled) setError("Microphone permission is required."); });
    return () => {
      cancelled = true;
      media?.getTracks()?.forEach((track) => track?.stop());
      window.clearInterval(timerRef.current);
      window.clearInterval(countdownTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (state === "RECORDING" && recordingAuthorizedRef.current && stream && !recorderRef.current) {
      const chunks = [];
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        setUploadStatus("Uploading...");
        try {
          const hash = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
          const checksum = btoa(String.fromCharCode(...new Uint8Array(hash)));
          const upload = await api("/api/uploads/initiate", { method: "POST", body: JSON.stringify({ fileName: `${sessionId}-${role}.webm`, mimeType: blob.type, size: blob.size, checksum, recordingType: "DUAL" }) });
          await uploadBinary(upload.uploadUrl, blob);
          await api(`/api/uploads/${upload.uploadId}/complete`, { method: "POST", body: JSON.stringify({ taskId: task?.id, sessionId, participantLabel: role, durationSeconds: secondsRef.current, kind: "audio", timestamps: { localStopEpochMs: Date.now() } }) });
          setUploadedParticipants((labels) => labels.includes(role) ? labels : [...labels, role]);
          socket.emit("session:upload-complete", { sessionId, participantLabel: role });
          setUploadStatus("Uploaded automatically");
        } catch (err) { setError(err.message); setUploadStatus("Upload failed"); }
        recorderRef.current = null;
      };
      recorder.start(1000);
      recorderRef.current = recorder;
      setSeconds(0);
      secondsRef.current = 0;
      timerRef.current = window.setInterval(() => setSeconds((value) => { secondsRef.current = value + 1; return value + 1; }), 1000);
    }
    if (state === "PAUSE" && recorderRef.current?.state === "recording") recorderRef.current.pause();
    if (state === "RECORDING" && recorderRef.current?.state === "paused") recorderRef.current.resume();
    if (state === "PROCESSING") {
      recordingAuthorizedRef.current = false;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      window.clearInterval(timerRef.current);
    }
  }, [role, sessionId, state, stream, task?.id]);

  useEffect(() => {
    if (!user) return;
    socket.connect();
    socket.on("session:presence", (payload) => setParticipants((list) => list.map((item) => item.label === payload.participantLabel ? { ...item, connection: payload.connection } : item)));
    socket.on("session:ready", (payload) => setParticipants((list) => list.map((item) => item.label === payload.participantLabel ? { ...item, ...payload.checks, ready: true } : item)));
    socket.on("session:countdown", ({ seconds: countdownSeconds = 5 }) => {
      window.clearInterval(countdownTimerRef.current);
      let remaining = countdownSeconds;
      setCountdown(remaining);
      countdownTimerRef.current = window.setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          window.clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
          setCountdown(null);
        } else {
          setCountdown(remaining);
        }
      }, 1000);
    });
    socket.on("session:recording-state", (payload) => {
      if (payload.state === "RECORDING") recordingAuthorizedRef.current = true;
      if (["PROCESSING", "READY"].includes(payload.state)) recordingAuthorizedRef.current = false;
      if (payload.state === "READY") {
        setUploadedParticipants([]);
        setUploadStatus("");
        setSeconds(0);
      }
      setState(payload.state);
    });
    socket.on("session:upload-complete", ({ participantLabel }) => {
      setUploadedParticipants((labels) => labels.includes(participantLabel) ? labels : [...labels, participantLabel]);
    });
    socket.on("session:next-script", ({ sessionId: nextSessionId, inviteToken }) => {
      setBusy(false);
      navigate(role === "B" && inviteToken ? `/invite/dual/${inviteToken}` : `/dual-session/${nextSessionId}`);
    });
    return () => socket.disconnect();
  }, [navigate, role, socket, user?.role]);

  useEffect(() => {
    const key = token || taskId || routeSessionId;
    if (!key || initialized.current === key) return;
    if (!user && !token) {
      navigate(`/login?returnTo=${encodeURIComponent(location.pathname)}`, { replace: true });
      return;
    }
    initialized.current = key;
    setBusy(false);
    setError("");
    setUploadStatus("");
    setUploadedParticipants([]);
    setSeconds(0);
    secondsRef.current = 0;
    setCountdown(null);
    recordingAuthorizedRef.current = false;
    const load = async () => {
      try {
        if (token) {
          const accepted = await acceptGuestInvitation(token);
          setUser(accepted.user);
          setRole("B");
          setSessionId(accepted.sessionId);
          if (accepted.taskId) {
            const result = await api(`/api/recording-sessions/task/${accepted.taskId}`);
            setTask(result.task);
            setState(normalizedSessionState(result.session));
            setParticipants(result.session?.participants?.length ? result.session.participants : initialParticipants);
          } else {
            const session = await api(`/api/recording-sessions/${accepted.sessionId}`);
            setState(normalizedSessionState(session));
            setParticipants(session.participants?.length ? session.participants : initialParticipants);
          }
          return;
        }
        if (routeSessionId) {
          const session = await api(`/api/recording-sessions/${routeSessionId}`);
          setRole(session.participantRole);
          setSessionId(session.id);
          if (session.task) {
            setTask(session.task);
          } else {
            const linkedTaskId = typeof session.taskId === "object" ? session.taskId?.id ?? session.taskId?._id : session.taskId;
            if (linkedTaskId) {
              const taskResult = await api(`/api/recording-sessions/task/${linkedTaskId}`);
              setTask(taskResult.task ?? null);
            }
          }
          setState(normalizedSessionState(session));
          setParticipants(session.participants?.length ? session.participants : initialParticipants);
          const attemptStartedAt = session.startedAt ? new Date(session.startedAt).getTime() : 0;
          setUploadedParticipants((session.tracks ?? []).filter((track) => !attemptStartedAt || new Date(track.createdAt).getTime() >= attemptStartedAt).map((track) => track.participantLabel));
          return;
        }
        const result = await api(`/api/recording-sessions/task/${taskId}`);
        setRole(result.participantRole);
        setTask(result.task);
        if (result.session) {
          setSessionId(result.session.id);
          setState(normalizedSessionState(result.session));
          setParticipants(result.session.participants?.length ? result.session.participants : initialParticipants);
        } else if (result.participantRole === "A") {
          const created = await api("/api/recording-sessions", { method: "POST", body: JSON.stringify({ taskId }) });
          setSessionId(created.id);
          setState(created.status);
          setParticipants(created.participants);
        } else {
          setError("Participant A has not created the session yet.");
        }
      } catch (err) {
        if (err?.status === 401) {
          logout();
          navigate(`/login?returnTo=${encodeURIComponent(location.pathname)}`, { replace: true });
        } else {
          setError(err instanceof Error ? err.message : "Unable to open dual session.");
        }
      }
    };
    load();
  }, [location.pathname, navigate, routeSessionId, taskId, token, user?.role]);

  useEffect(() => {
    if (!sessionId || !role) return;
    api(`/api/recording-sessions/${sessionId}/join`, { method: "POST", body: JSON.stringify({ deviceMeta: { browser: navigator.userAgent } }) })
      .then(() => {
        socket.emit("session:join", { sessionId, participantLabel: role });
        setParticipants((list) => list.map((item) => item.label === role ? { ...item, connection: "CONNECTED" } : item));
      })
      .catch((err) => setError(err.message));
  }, [role, sessionId, socket]);

  const bothReady = participants.every((participant) => participant.ready);
  const bothUploaded = ["A", "B"].every((label) => uploadedParticipants.includes(label));

  useEffect(() => {
    if (!sessionId || state !== "PROCESSING" || bothUploaded) return undefined;
    let active = true;

    const checkUploads = async () => {
      try {
        const session = await api(`/api/recording-sessions/${sessionId}`);
        if (!active) return;
        const attemptStartedAt = session.startedAt ? new Date(session.startedAt).getTime() : 0;
        const labels = [...new Set((session.tracks ?? [])
          .filter((track) => !attemptStartedAt || new Date(track.createdAt).getTime() >= attemptStartedAt)
          .map((track) => track.participantLabel))];
        setUploadedParticipants(labels);
      } catch {
        // The realtime event remains primary; polling retries transient failures.
      }
    };

    checkUploads();
    const poller = window.setInterval(checkUploads, 2000);
    return () => {
      active = false;
      window.clearInterval(poller);
    };
  }, [bothUploaded, sessionId, state]);

  const stateLabel = {
    WAITING_FOR_PARTICIPANTS: "Waiting",
    READY: "Ready",
    RECORDING: "Recording",
    PAUSE: "Paused",
    PROCESSING: "Processing"
  }[state] ?? state;

  async function markReady() {
    if (!stream) { setError("Microphone permission is required."); return; }
    setBusy(true);
    try {
      await api(`/api/recording-sessions/${sessionId}/ready`, { method: "POST", body: JSON.stringify({ cameraReady: true, deviceMeta: { browser: navigator.userAgent } }) });
      const checks = { micReady: true, cameraReady: true, networkOk: true };
      socket.emit("session:ready", { sessionId, participantLabel: role, checks });
      setParticipants((list) => list.map((item) => item.label === role ? { ...item, ...checks, ready: true } : item));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function control(action) {
    setBusy(true);
    setError("");
    try {
      if (action === "START") {
        await api(`/api/recording-sessions/${sessionId}/start`, { method: "POST", body: "{}" });
        recordingAuthorizedRef.current = true;
      }
      else if (action === "STOP") await api(`/api/recording-sessions/${sessionId}/stop`, { method: "POST", body: "{}" });
      else await api(`/api/recording-sessions/${sessionId}/control`, { method: "POST", body: JSON.stringify({ action }) });
      if (["STOP", "RERECORD"].includes(action)) recordingAuthorizedRef.current = false;
      const nextState = action === "START" || action === "RESUME" ? "RECORDING" : action === "STOP" ? "PROCESSING" : action === "RERECORD" ? "READY" : action;
      setState(nextState);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function beginCountdown() {
    if (!bothReady || busy || countdown !== null) return;
    let remaining = 5;
    socket.emit("session:countdown", { sessionId, seconds: remaining });
    setCountdown(remaining);
    countdownTimerRef.current = window.setInterval(() => {
      remaining -= 1;
      if (remaining === 0) {
        window.clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
        setCountdown(null);
        control("START");
      } else {
        setCountdown(remaining);
      }
    }, 1000);
  }

  async function recordSameScript() {
    await control("RERECORD");
    setUploadedParticipants([]);
    setUploadStatus("");
    setSeconds(0);
  }

  async function openNextScript() {
    setBusy(true);
    setError("");
    try {
      const next = await api(`/api/recording-sessions/${sessionId}/next`, { method: "POST", body: "{}" });
      setBusy(false);
      navigate(`/dual-session/${next.sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load the next script.");
      setBusy(false);
    }
  }

  if (!user) return <main className="grid min-h-dvh place-items-center bg-slate-50 p-4"><Card className="w-full max-w-sm" title="Joining dual session"><p className="text-sm text-muted">Validating invitation...</p></Card></main>;

  return (
    <div className="mx-auto max-w-6xl space-y-2 p-2 sm:space-y-5 sm:p-5 lg:p-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted sm:text-sm">Dual Recording</p>
          <h1 className="text-xl font-bold text-ink sm:text-2xl">{role === "A" ? "Host Session" : "Participant Session"}</h1>
        </div>
        <Button type="button" variant="secondary" className="h-9 shrink-0 !px-3" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> Back
        </Button>
      </div>
      {error && <ErrorState message={error} />}
      <div className="grid grid-cols-2 items-stretch gap-2 sm:gap-4">
        <Card
        className="h-full min-w-0 overflow-hidden"
        headerClassName="gap-1 px-2 py-1.5 sm:px-5 sm:py-3"
        bodyClassName="p-0"
        title="Participant A"
        action={(
          <div className="flex items-center gap-1">
            {countdown !== null && <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-50 px-1 text-[10px] font-bold text-warning sm:h-8 sm:min-w-8 sm:text-sm">{countdown}</span>}
            <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold text-accent sm:px-2 sm:text-xs">Host</span>
            {role === "A" && <Button aria-label={participants[0]?.ready ? "Participant A ready" : "Run readiness check"} title={participants[0]?.ready ? "Ready" : "Check readiness"} className="h-6 w-6 !p-0 sm:h-8 sm:w-8" onClick={markReady} disabled={participants[0]?.ready || busy}><UserCheck size={12} /></Button>}
          </div>
        )}
      >
        {participants.map((participant) => (
          <section key={participant.label} className={`p-1 sm:p-3 ${participant.label === "B" ? "border-t border-line" : ""}`}>
            {participant.label === "B" && <div className="mb-0.5 flex items-center justify-between gap-1 sm:mb-1.5"><h3 className="text-[11px] font-semibold text-ink sm:text-sm">Participant B</h3><div className="flex items-center gap-1">{countdown !== null && <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-50 px-1 text-[10px] font-bold text-warning sm:h-8 sm:min-w-8 sm:text-sm">{countdown}</span>}{role === "B" && <Button aria-label={participant.ready ? "Participant B ready" : "Run readiness check"} title={participant.ready ? "Ready" : "Check readiness"} className="h-6 w-6 !p-0 sm:h-8 sm:w-8" onClick={markReady} disabled={participant.ready || busy}><UserCheck size={12} /></Button>}</div></div>}
            <div className="grid grid-cols-4 gap-0.5 sm:gap-2">
              <ParticipantStatus label="Connection" shortLabel="Conn." value={participant.connection === "CONNECTED" ? "Connected" : "Waiting"} shortValue={participant.connection === "CONNECTED" ? "On" : "Wait"} ready={participant.connection === "CONNECTED"} />
              <ParticipantStatus label="Microphone" shortLabel="Mic" value={participant.micReady ? "Ready" : "Pending"} shortValue={participant.micReady ? "OK" : "Wait"} ready={participant.micReady} />
              <ParticipantStatus label="Camera" shortLabel="Cam" value={participant.cameraReady ? "Ready" : "Pending"} shortValue={participant.cameraReady ? "OK" : "Wait"} ready={participant.cameraReady} />
              <ParticipantStatus label="Network" shortLabel="Net" value={participant.networkOk ? "Stable" : "Check"} shortValue={participant.networkOk ? "OK" : "Check"} ready={participant.networkOk} />
            </div>
          </section>
        ))}
        </Card>

        <Card className="h-full min-w-0 overflow-hidden" title={<><span className="sm:hidden">Control</span><span className="hidden sm:inline">Session Control</span></>} headerClassName="gap-1 px-2 py-1.5 sm:px-5 sm:py-3" bodyClassName="p-1 sm:p-5" action={<span className={`rounded-full px-1.5 py-0.5 text-[8px] font-semibold sm:px-2.5 sm:py-1 sm:text-xs ${state === "RECORDING" ? "bg-red-50 text-danger" : "bg-slate-100 text-slate-700"}`}>{stateLabel}</span>}>
        <div className="mb-1 text-center sm:mb-3">
          <p className="text-lg font-bold tabular-nums sm:text-3xl">{countdown ?? new Date(seconds * 1000).toISOString().substring(11, 19)}</p>
          {countdown !== null && <p className="text-xs font-semibold text-warning">Recording starts in {countdown} seconds</p>}
          {uploadStatus && <p className="text-xs font-semibold text-brand">{uploadStatus}</p>}
        </div>
        {role === "A" ? <div className="grid grid-cols-3 gap-1 sm:gap-2">
          <Button aria-label={state === "RECORDING" ? "Stop recording" : "Start recording"} title={state === "RECORDING" ? "Stop" : "Start"} className="h-7 !px-1 text-[10px] sm:h-10 sm:!px-3 sm:text-sm" disabled={!bothReady || busy || countdown !== null || !["WAITING_FOR_PARTICIPANTS", "READY", "RECORDING"].includes(state)} variant={state === "RECORDING" ? "danger" : "primary"} onClick={() => state === "RECORDING" ? control("STOP") : beginCountdown()}>{state === "RECORDING" ? <Square size={13} /> : <Play size={13} />}<span className="hidden sm:inline">{state === "RECORDING" ? "Stop" : countdown !== null ? countdown : "Start"}</span></Button>
          <Button aria-label={state === "PAUSE" ? "Resume recording" : "Pause recording"} title={state === "PAUSE" ? "Resume" : "Pause"} className="h-7 !px-1 text-[10px] sm:h-10 sm:!px-3 sm:text-sm" variant="secondary" disabled={busy || !["RECORDING", "PAUSE"].includes(state)} onClick={() => control(state === "PAUSE" ? "RESUME" : "PAUSE")}><Pause size={13} /><span className="hidden sm:inline">{state === "PAUSE" ? "Resume" : "Pause"}</span></Button>
          <Button aria-label="Re-record" title="Re-record" className="h-7 !px-1 text-[10px] sm:h-10 sm:!px-3 sm:text-sm" variant="secondary" disabled={busy || state !== "PROCESSING"} onClick={() => control("RERECORD")}><RotateCcw size={13} /><span className="hidden sm:inline">Re-record</span></Button>
        </div> : <p className="flex items-start gap-2 text-xs leading-5 text-muted sm:text-sm"><LogIn className="mt-0.5 shrink-0" size={15} />Participant A controls this recording.</p>}
        {!bothReady && <p className="mt-2 rounded-md bg-amber-50 px-2.5 py-2 text-xs leading-5 text-warning sm:mt-3">Both participants must be ready before starting.</p>}
        {role === "A" && bothUploaded && (
          <div className="mt-1.5 border-t border-line pt-1.5 sm:mt-3 sm:pt-3">
            <p className="mb-1 flex items-center justify-center gap-1 text-[9px] font-semibold text-success sm:mb-2 sm:text-xs">
              <CheckCircle2 size={12} />
              <span className="sm:hidden">Uploaded</span>
              <span className="hidden sm:inline">Both recordings uploaded</span>
            </p>
            <div className="grid grid-cols-2 gap-1 sm:gap-2">
              <Button type="button" title="Record same script again" variant="secondary" className="h-7 !gap-1 !px-1 text-[9px] sm:h-9 sm:!px-2 sm:text-sm" disabled={busy} onClick={recordSameScript}><RotateCcw size={12} /><span className="sm:hidden">Same</span><span className="hidden sm:inline">Same Script</span></Button>
              <Button type="button" title="Load next script" className="h-7 !gap-1 !px-1 text-[9px] sm:h-9 sm:!px-2 sm:text-sm" disabled={busy} onClick={openNextScript}><span className="sm:hidden">Next</span><span className="hidden sm:inline">Next Script</span><ArrowRight size={12} /></Button>
            </div>
          </div>
        )}
        <p className="mt-2 hidden items-center gap-1.5 text-xs text-muted sm:flex sm:mt-3"><Wifi className="shrink-0" size={14} />Both tracks stay synchronized.</p>
        </Card>
      </div>
      <Card headerClassName="px-3 py-2.5 sm:px-5 sm:py-4" bodyClassName="p-0" title={task?.script?.title ?? "Recording Script"} action={<Badge tone={role === "A" ? "accent" : "neutral"}>Participant {role || "-"}</Badge>}>
        <div
          aria-label="Recording script text"
          className="h-[calc(100dvh-17rem)] min-h-60 max-h-96 overflow-y-auto overscroll-contain whitespace-pre-wrap break-words px-4 py-3 text-sm leading-6 [scrollbar-gutter:stable] sm:h-96 sm:max-h-none sm:px-5 sm:py-4 sm:text-base sm:leading-7"
          tabIndex={0}
        >
          {task?.script?.currentText ?? "Manual dual recording session"}
        </div>
      </Card>
    </div>
  );
}
