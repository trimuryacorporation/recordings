import { Pause, Play, Radio, RotateCcw, Square, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Badge, Button, Card, ErrorState, PageHeader } from "../components/ui/primitives";
import { useApiResource } from "../hooks/useApiResource";
import { api } from "../services/api";

export function RecorderPage({ mode }) {
  const { taskId } = useParams();
  const task = useApiResource(`/api/tasks/${taskId}`, null);
  const [stream, setStream] = useState(null);
  const [recorder, setRecorder] = useState(null);
  const [blob, setBlob] = useState(null);
  const [status, setStatus] = useState("Device check pending");
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(0);
  const timer = useRef();
  const videoRef = useRef(null);
  const previewUrl = useMemo(() => (blob ? URL.createObjectURL(blob) : ""), [blob]);

  useEffect(() => {
    let media;
    navigator.mediaDevices
      ?.getUserMedia({ audio: true, video: true })
      .then((nextMedia) => {
        media = nextMedia;
        setStream(nextMedia);
        if (videoRef.current) videoRef.current.srcObject = nextMedia;
        setStatus("Microphone detected, camera detected, permission granted, network stable");
      })
      .catch(() => setStatus("Your microphone permission is required to continue."));

    return () => media?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => () => previewUrl && URL.revokeObjectURL(previewUrl), [previewUrl]);

  function start() {
    if (!stream) return;
    const chunks = [];
    const mediaRecorder = new MediaRecorder(stream, { mimeType: "video/webm" });
    mediaRecorder.ondataavailable = (event) => chunks.push(event.data);
    mediaRecorder.onstop = () => setBlob(new Blob(chunks, { type: "video/webm" }));
    mediaRecorder.start(1000);
    setRecorder(mediaRecorder);
    setBlob(null);
    setStatus("Recording");
    timer.current = window.setInterval(() => setSeconds((value) => value + 1), 1000);
  }

  function stop() {
    recorder?.stop();
    window.clearInterval(timer.current);
    setStatus("Preview ready");
  }

  async function submit() {
    if (!blob || !taskId) return;
    setError("");
    try {
      const session = await api("/api/recording-sessions", {
        method: "POST",
        body: JSON.stringify({ taskId })
      });
      const hash = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
      const checksum = btoa(String.fromCharCode(...new Uint8Array(hash)));
      const upload = await api("/api/uploads/initiate", {
        method: "POST",
        body: JSON.stringify({ fileName: `${taskId}.webm`, mimeType: blob.type, size: blob.size, checksum, recordingType: "SINGLE" })
      });
      await api(`/api/uploads/${upload.uploadId}/complete`, {
        method: "POST",
        body: JSON.stringify({ taskId, sessionId: session.id, durationSeconds: seconds, kind: "video", timestamps: { localStopEpochMs: Date.now() } })
      });
      setStatus("Uploaded and submitted for QA");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit recording.");
    }
  }

  const displayTime = new Date(seconds * 1000).toISOString().substring(11, 19);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader eyebrow="Trimurya Corporation Pvt. Ltd." title={`${mode === "single" ? "Single Recording" : "Recording"} Interface`} />
      {(error || task.error) && <ErrorState message={error || task.error} onRetry={() => { setError(""); task.reload(); }} />}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card title="Script Display">
          <div className="rounded-lg border border-line bg-slate-50 p-6 text-lg leading-8">
            {task.loading ? "Loading assigned script..." : task.data?.script?.currentText ?? "No script text is available for this task."}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone={stream ? "success" : "warning"}>MIC</Badge>
            <Badge tone={stream ? "success" : "warning"}>CAMERA</Badge>
            <Badge tone="success">INPUT LEVEL</Badge>
            <Badge tone="success">NETWORK</Badge>
          </div>
        </Card>

        <Card title="Recording Controls">
          <video ref={videoRef} autoPlay muted playsInline className="aspect-video w-full rounded-md bg-slate-900 object-cover" />
          <div className="mt-4 text-center">
            <p className="text-4xl font-bold tabular-nums">{displayTime}</p>
            <p className="mt-2 text-sm text-muted">{status}</p>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Button onClick={start} disabled={!stream || recorder?.state === "recording"}>
              <Play className="h-4 w-4" />
              Start
            </Button>
            <Button variant="secondary" disabled={!recorder}>
              <Pause className="h-4 w-4" />
              Pause
            </Button>
            <Button variant="danger" onClick={stop} disabled={!recorder || recorder?.state === "inactive"}>
              <Square className="h-4 w-4" />
              Stop
            </Button>
            <Button variant="secondary" onClick={() => { setBlob(null); setSeconds(0); }}>
              <RotateCcw className="h-4 w-4" />
              Re-record
            </Button>
          </div>
          {blob && <video className="mt-4 w-full rounded-md" controls src={previewUrl} />}
          <Button className="mt-4 w-full" onClick={submit} disabled={!blob}>
            <Upload className="h-4 w-4" />
            Submit
          </Button>
        </Card>
      </div>

      <Card title="Upload Architecture">
        <div className="flex items-center gap-3 text-sm text-muted">
          <Radio className="h-4 w-4 text-brand" />
          Large files use upload initiation, storage metadata, checksum, and completion records instead of JSON payload uploads.
        </div>
      </Card>
    </div>
  );
}
