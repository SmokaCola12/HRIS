'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import jsQR from 'jsqr';
import { useAuth } from '@/lib/auth/auth-context';
import { getPublicLoginUrl } from '@/lib/config/public-url';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Camera,
  Check,
  Coffee,
  Lock,
  LogIn,
  LogOut,
  QrCode,
  ScanLine,
  SwitchCamera,
  User,
  Users,
} from 'lucide-react';

type KioskAction = 'punch_in' | 'punch_out' | 'break_out' | 'break_in';
type KioskView = 'entry' | 'scan' | 'success';
type ScanPhase = 'qr' | 'photo';
type CameraFacing = 'environment' | 'user';

type KioskResult = {
  action: KioskAction;
  timestamp: string;
  warning: string | null;
  photo?: string | null;
  employee: {
    employee_id: string;
    name: string;
    department: string | null;
    position: string | null;
    employment_type: string;
    picture: string | null;
  };
};

type ScanPoint = { x: number; y: number };
type CodeLocation = {
  topLeftCorner: ScanPoint;
  topRightCorner: ScanPoint;
  bottomRightCorner: ScanPoint;
  bottomLeftCorner: ScanPoint;
};

const actions: Array<{
  value: KioskAction;
  label: string;
  description: string;
  successTitle: string;
  icon: typeof LogIn;
}> = [
  { value: 'punch_in', label: 'Punch in', description: 'Start of shift', successTitle: 'Punched in', icon: LogIn },
  { value: 'punch_out', label: 'Punch out', description: 'End of shift', successTitle: 'Punched out', icon: LogOut },
  { value: 'break_out', label: 'Break out', description: 'Starting break', successTitle: 'Break started', icon: Coffee },
  { value: 'break_in', label: 'Break in', description: 'Back from break', successTitle: 'Break ended', icon: Coffee },
];

function formatRecordedTime(timestamp: string) {
  const parsed = new Date(timestamp.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return timestamp;
  return new Intl.DateTimeFormat('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: '2-digit',
  }).format(parsed);
}

function mapVideoPointToPreview(point: ScanPoint, video: HTMLVideoElement): ScanPoint {
  const rect = video.getBoundingClientRect();
  const videoWidth = video.videoWidth || rect.width;
  const videoHeight = video.videoHeight || rect.height;
  const previewAspect = rect.width / rect.height;
  const videoAspect = videoWidth / videoHeight;
  const scale = previewAspect > videoAspect ? rect.width / videoWidth : rect.height / videoHeight;
  const renderedWidth = videoWidth * scale;
  const renderedHeight = videoHeight * scale;

  return {
    x: (rect.width - renderedWidth) / 2 + point.x * scale,
    y: (rect.height - renderedHeight) / 2 + point.y * scale,
  };
}

function mapCodeCorners(location: CodeLocation, video: HTMLVideoElement): ScanPoint[] {
  return [
    location.topLeftCorner,
    location.topRightCorner,
    location.bottomRightCorner,
    location.bottomLeftCorner,
  ].map((point) => mapVideoPointToPreview(point, video));
}

function normalizeVector(from: ScanPoint, to: ScanPoint) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: dx / length, y: dy / length };
}

function getCornerSegments(points: ScanPoint[], size = 28) {
  return points.flatMap((point, index) => {
    const previous = points[(index + points.length - 1) % points.length];
    const next = points[(index + 1) % points.length];
    const toPrevious = normalizeVector(point, previous);
    const toNext = normalizeVector(point, next);
    return [
      { x1: point.x, y1: point.y, x2: point.x + toPrevious.x * size, y2: point.y + toPrevious.y * size },
      { x1: point.x, y1: point.y, x2: point.x + toNext.x * size, y2: point.y + toNext.y * size },
    ];
  });
}

function getCameraFailure(error: unknown) {
  const name = error instanceof DOMException || error instanceof Error ? error.name : '';
  const loginUrl = getPublicLoginUrl();

  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return {
      title: 'Camera blocked by browser security',
      help: `Open the kiosk with HTTPS: ${loginUrl.replace(/^http:/, 'https:')}. iPhone and Android browsers block camera access on ordinary http network pages.`,
    };
  }

  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return {
      title: 'Camera permission is blocked',
      help: 'Allow camera access for this site in the browser permission prompt or site settings, then press Rescan.',
    };
  }

  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return {
      title: 'No usable camera found',
      help: 'Use a tablet/laptop with a working camera, or check that the rear/front camera is enabled in the operating system.',
    };
  }

  if (name === 'NotReadableError' || name === 'AbortError') {
    return {
      title: 'Camera is busy',
      help: 'Close other apps or browser tabs using the camera, then press Rescan.',
    };
  }

  return {
    title: 'Camera unavailable in this browser',
    help: `The Codex in-app browser may not expose your physical camera. Open ${loginUrl} in Chrome or Edge on the kiosk device and allow camera access.`,
  };
}

async function requestCameraStream(facingMode: CameraFacing) {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facingMode } },
      audio: false,
    });
  } catch (error) {
    const name = error instanceof DOMException || error instanceof Error ? error.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') throw error;

    return navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });
  }
}

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading: authLoading } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedAction, setSelectedAction] = useState<KioskAction | null>(null);
  const [kioskView, setKioskView] = useState<KioskView>('entry');
  const [scanPhase, setScanPhase] = useState<ScanPhase>('qr');
  const [cameraFacing, setCameraFacing] = useState<CameraFacing>('environment');
  const [scanAttempt, setScanAttempt] = useState(0);
  const [scannedPayload, setScannedPayload] = useState('');
  const [scanCorners, setScanCorners] = useState<ScanPoint[] | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [scanStatus, setScanStatus] = useState('Camera ready');
  const [cameraHelp, setCameraHelp] = useState<string | null>(null);
  const [kioskResult, setKioskResult] = useState<KioskResult | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanFrameRef = useRef<number | null>(null);
  const isRecordingRef = useRef(false);
  const scannedPayloadRef = useRef('');
  const qrLockStartedAtRef = useRef<number | null>(null);
  const lastCameraTapRef = useRef(0);

  const selectedMeta = useMemo(
    () => actions.find((action) => action.value === selectedAction) || null,
    [selectedAction],
  );

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  const stopCamera = () => {
    if (scanFrameRef.current) cancelAnimationFrame(scanFrameRef.current);
    scanFrameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const result = await login(username, password);

    if (result.success) {
      toast.success('Login successful');
      router.push('/dashboard');
    } else {
      toast.error(result.error || 'Login failed');
      setIsLoading(false);
    }
  };

  const beginScan = () => {
    if (!selectedAction) {
      toast.error('Select an attendance action');
      return;
    }

    scannedPayloadRef.current = '';
    setScannedPayload('');
    setCapturedPhoto(null);
    setCountdown(null);
    setScanCorners(null);
    setCameraHelp(null);
    qrLockStartedAtRef.current = null;
    setCameraFacing('environment');
    setScanPhase('qr');
    setScanAttempt((attempt) => attempt + 1);
    setScanStatus('Scanning QR code');
    setKioskView('scan');
  };

  const switchCamera = () => {
    setCameraHelp(null);
    qrLockStartedAtRef.current = null;
    setScanCorners(null);
    setScanStatus('Switching camera');
    setCameraFacing((current) => current === 'environment' ? 'user' : 'environment');
    setScanAttempt((attempt) => attempt + 1);
  };

  const handleCameraTouchEnd = () => {
    const now = Date.now();
    if (now - lastCameraTapRef.current < 350) {
      switchCamera();
      lastCameraTapRef.current = 0;
      return;
    }
    lastCameraTapRef.current = now;
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      throw new Error('Camera is not ready for photo capture');
    }

    const maxWidth = 720;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to capture verification photo');

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  };

  const recordAttendance = async (payload: string, photo: string) => {
    if (!selectedAction) {
      toast.error('Select an attendance action');
      return;
    }
    if (!payload.trim()) {
      toast.error('Scan a QR code first');
      return;
    }
    if (!photo.trim()) {
      toast.error('Verification photo is required');
      return;
    }

    setIsRecording(true);
    try {
      const response = await fetch('/api/attendance/kiosk-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: selectedAction,
          qrPayload: payload.trim(),
          photo,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to record attendance');

      stopCamera();
      setKioskResult(data);
      setKioskView('success');
      toast.success(`${data.employee.name} - ${selectedMeta?.label || 'Attendance'} recorded`);
      if (data.warning) toast.warning(data.warning);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to record attendance');
      setScanStatus(error instanceof Error ? error.message : 'Failed to record attendance');
    } finally {
      setIsRecording(false);
    }
  };

  useEffect(() => {
    if (kioskView !== 'scan') {
      stopCamera();
      return;
    }

    let cancelled = false;
    let countdownTimer: ReturnType<typeof setInterval> | null = null;

    const startCamera = async () => {
      try {
        setCameraHelp(null);
        if (!navigator.mediaDevices?.getUserMedia) {
          const failure = getCameraFailure(new Error('MediaDevicesUnavailable'));
          setScanStatus(failure.title);
          setCameraHelp(failure.help);
          return;
        }

        const stream = await requestCameraStream(cameraFacing);
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        if (scanPhase === 'photo') {
          let nextCount = 3;
          setCountdown(nextCount);
          setScanStatus('Hold still for photo');
          countdownTimer = setInterval(async () => {
            nextCount -= 1;
            if (nextCount > 0) {
              setCountdown(nextCount);
              return;
            }

            if (countdownTimer) clearInterval(countdownTimer);
            setCountdown(0);
            try {
              const photo = capturePhoto();
              setCapturedPhoto(photo);
              await recordAttendance(scannedPayloadRef.current, photo);
            } catch (error) {
              toast.error(error instanceof Error ? error.message : 'Photo capture failed');
              setScanStatus('Photo capture failed');
              setScanPhase('qr');
            }
          }, 800);
          return;
        }

        setScanStatus('Scanning QR code');
        const scan = () => {
          if (!videoRef.current || !canvasRef.current || cancelled || isRecordingRef.current) return;

          try {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            if (video.videoWidth && video.videoHeight) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              const context = canvas.getContext('2d', { willReadFrequently: true });
              if (!context) throw new Error('Scanner unavailable');

              context.drawImage(video, 0, 0, canvas.width, canvas.height);
              const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
              const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: 'dontInvert',
              });

              if (code?.data) {
                const now = Date.now();
                if (scannedPayloadRef.current !== code.data || !qrLockStartedAtRef.current) {
                  qrLockStartedAtRef.current = now;
                  scannedPayloadRef.current = code.data;
                  setScannedPayload(code.data);
                }
                setScanCorners(mapCodeCorners(code.location as CodeLocation, video));
                setScanStatus('QR locked');
                if (qrLockStartedAtRef.current && now - qrLockStartedAtRef.current >= 400) {
                  if (!cancelled) {
                    setCameraFacing('user');
                    setScanPhase('photo');
                    setScanStatus('Preparing camera');
                  }
                  return;
                }
              } else {
                qrLockStartedAtRef.current = null;
                scannedPayloadRef.current = '';
                setScannedPayload('');
                setScanCorners(null);
              }
            }
          } catch {
            if (!cancelled) setScanStatus('Scanning paused');
          } finally {
            if (!cancelled) scanFrameRef.current = requestAnimationFrame(scan);
          }
        };

        scanFrameRef.current = requestAnimationFrame(scan);
      } catch (error) {
        const failure = getCameraFailure(error);
        setScanStatus(failure.title);
        setCameraHelp(failure.help);
      }
    };

    startCamera();
    return () => {
      cancelled = true;
      if (countdownTimer) clearInterval(countdownTimer);
      stopCamera();
    };
  }, [kioskView, scanPhase, cameraFacing, scanAttempt]);

  useEffect(() => {
    if (kioskView !== 'success') return;
    const timer = setTimeout(() => {
      setKioskView('entry');
      setScannedPayload('');
      scannedPayloadRef.current = '';
      setKioskResult(null);
      setCapturedPhoto(null);
      setScanCorners(null);
      setCameraHelp(null);
      setCountdown(null);
    }, 3200);
    return () => clearTimeout(timer);
  }, [kioskView]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md rounded-none">
        {kioskView === 'entry' && (
          <>
            <CardHeader className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="p-3 border border-border">
                  <Users className="h-8 w-8 text-foreground" />
                </div>
              </div>
              <div>
                <CardTitle className="text-2xl font-bold tracking-tight">HRIS Portal</CardTitle>
                <CardDescription className="mt-2">
                  Human Resource Information System
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="login" className="gap-4">
                <TabsList className="grid h-10 w-full grid-cols-2 rounded-none">
                  <TabsTrigger value="login" className="rounded-none">
                    <User className="h-4 w-4" />
                    Sign in
                  </TabsTrigger>
                  <TabsTrigger value="attendance" className="rounded-none">
                    <QrCode className="h-4 w-4" />
                    Attendance
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="login">
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="username">Username</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="username"
                          type="text"
                          placeholder="Enter your username"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          className="pl-10"
                          required
                          disabled={isLoading || authLoading}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="password"
                          type="password"
                          placeholder="Enter your password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="pl-10"
                          required
                          disabled={isLoading || authLoading}
                        />
                      </div>
                    </div>
                    <Button type="submit" className="w-full" disabled={isLoading || authLoading}>
                      {isLoading ? 'Signing in...' : 'Sign In'}
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="attendance" className="space-y-4">
                  <div className="grid gap-2">
                    {actions.map((action) => {
                      const Icon = action.icon;
                      const selected = selectedAction === action.value;
                      return (
                        <button
                          key={action.value}
                          type="button"
                          onClick={() => setSelectedAction(action.value)}
                          className={`flex min-h-14 items-center gap-3 border px-3 text-left transition-colors ${
                            selected ? 'border-foreground bg-muted' : 'border-border hover:bg-muted/70'
                          }`}
                        >
                          <span className={`flex h-8 w-8 items-center justify-center border ${selected ? 'bg-foreground text-background' : ''}`}>
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">{action.label}</span>
                            <span className="block text-xs text-muted-foreground">{action.description}</span>
                          </span>
                          {selected && <Check className="h-4 w-4" />}
                        </button>
                      );
                    })}
                  </div>

                  <Button
                    type="button"
                    className="w-full"
                    variant={selectedAction ? 'default' : 'secondary'}
                    onClick={beginScan}
                    disabled={!selectedAction || isRecording}
                  >
                    <ScanLine className="h-4 w-4" />
                    {selectedMeta ? `Scan to ${selectedMeta.label.toLowerCase()}` : 'Select action first'}
                  </Button>
                </TabsContent>
              </Tabs>
            </CardContent>
          </>
        )}

        {kioskView === 'scan' && (
          <>
            <div className="flex items-center justify-between border-b p-3">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setKioskView('entry')}
                aria-label="Back"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Badge variant="outline" className="rounded-none">
                {selectedMeta?.label || 'Attendance'}
              </Badge>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={switchCamera}
                disabled={isRecording}
                aria-label="Switch camera"
                title="Switch camera"
              >
                <SwitchCamera className="h-4 w-4" />
              </Button>
            </div>
            <CardContent className="space-y-4 p-4">
              <div
                className="relative flex aspect-square items-center justify-center overflow-hidden bg-black"
                onDoubleClick={switchCamera}
                onTouchEnd={handleCameraTouchEnd}
              >
                <video
                  ref={videoRef}
                  className={`h-full w-full object-cover ${scanPhase === 'photo' ? '-scale-x-100' : ''}`}
                  muted
                  playsInline
                  autoPlay
                />
                <canvas ref={canvasRef} className="hidden" />
                {scanPhase === 'qr' ? (
                  <>
                    {!scanCorners && (
                      <div className="pointer-events-none absolute inset-[18%]">
                        <span className="absolute left-0 top-0 h-12 w-12 border-l-4 border-t-4 border-background" />
                        <span className="absolute right-0 top-0 h-12 w-12 border-r-4 border-t-4 border-background" />
                        <span className="absolute bottom-0 right-0 h-12 w-12 border-b-4 border-r-4 border-background" />
                        <span className="absolute bottom-0 left-0 h-12 w-12 border-b-4 border-l-4 border-background" />
                      </div>
                    )}
                    {scanCorners && (
                      <svg className="pointer-events-none absolute inset-0 h-full w-full">
                        {getCornerSegments(scanCorners).map((segment, index) => (
                          <line
                            key={index}
                            x1={segment.x1}
                            y1={segment.y1}
                            x2={segment.x2}
                            y2={segment.y2}
                            stroke="white"
                            strokeWidth="4"
                            strokeLinecap="square"
                          />
                        ))}
                      </svg>
                    )}
                  </>
                ) : (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10">
                    <div className="flex h-40 w-40 items-center justify-center rounded-full border-2 border-background/90">
                      {countdown !== null && countdown > 0 ? (
                        <span className="text-5xl font-bold text-background">{countdown}</span>
                      ) : (
                        <Camera className="h-10 w-10 text-background" />
                      )}
                    </div>
                  </div>
                )}
              </div>
              <Alert className="rounded-none">
                {scanPhase === 'qr' ? <QrCode className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
                <AlertDescription>
                  <span className="block">
                    {isRecording ? 'Recording attendance' : scanStatus}
                    {scannedPayload && scanPhase === 'photo' ? ' with verified QR' : ''}
                  </span>
                  {cameraHelp && (
                    <span className="mt-1 block text-xs text-muted-foreground">{cameraHelp}</span>
                  )}
                </AlertDescription>
              </Alert>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setCameraHelp(null);
                  setScanStatus('Scanning QR code');
                  setScanPhase('qr');
                  setScanAttempt((attempt) => attempt + 1);
                }}
                disabled={isRecording}
              >
                <ScanLine className="h-4 w-4" />
                Rescan
              </Button>
            </CardContent>
          </>
        )}

        {kioskView === 'success' && kioskResult && (
          <CardContent className="space-y-5 p-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center border bg-foreground text-background">
              <Check className="h-7 w-7" />
            </div>
            <div>
              <CardTitle className="text-xl">{selectedMeta?.successTitle || 'Attendance recorded'}</CardTitle>
              <CardDescription className="mt-2">
                {formatRecordedTime(kioskResult.timestamp)}
              </CardDescription>
            </div>
            <div className="flex items-center gap-3 border p-3 text-left">
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden border bg-muted">
                {capturedPhoto || kioskResult.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={capturedPhoto || kioskResult.photo || ''} alt="" className="h-full w-full object-cover" />
                ) : kioskResult.employee.picture ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={kioskResult.employee.picture} alt="" className="h-full w-full object-cover" />
                ) : (
                  <User className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{kioskResult.employee.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {kioskResult.employee.employee_id} - {kioskResult.employee.department || kioskResult.employee.employment_type}
                </p>
              </div>
            </div>
            {kioskResult.warning && (
              <Alert className="rounded-none text-left">
                <AlertDescription>{kioskResult.warning}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
