
'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { QrCode, VideoOff, Zap, ZapOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import jsQR from 'jsqr';
import { Alert, AlertTitle, AlertDescription } from './alert';

type QRCodeScannerProps = {
  onScan: (result: string) => void;
  buttonText: string;
  className?: string;
  keepOpenOnScan?: boolean;
};

// Function to play a success beep sound
const playBeep = () => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (!audioContext) return;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // A6 note
    gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.5);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.2);
};

// Function to play an error beep sound
const playErrorBeep = () => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (!audioContext) return;
    const oscillator = audio-context.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(220, audioContext.currentTime); // A3 note
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.3);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.2);
};


export default function QRCodeScanner({ onScan, buttonText, className, keepOpenOnScan = false }: QRCodeScannerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState(true);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [hasFlash, setHasFlash] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const animationFrameId = useRef<number>();
  const lastScanTime = useRef<number>(0);
  const scanCooldown = 1500; // 1.5 seconds
  const sessionScannedCodes = useRef<Set<string>>(new Set());

  const { toast } = useToast();

  useEffect(() => {
    if (!isOpen) {
      sessionScannedCodes.current.clear(); // Clear session memory when dialog closes
      // Ensure flash is off when dialog closes
      if (trackRef.current && hasFlash) {
        trackRef.current.applyConstraints({ advanced: [{ torch: false }] });
        setIsFlashOn(false);
      }
      return;
    }

    const videoElement = videoRef.current;
    let stream: MediaStream | null = null;

    const getCameraPermission = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        setHasCameraPermission(true);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        
        const videoTrack = stream.getVideoTracks()[0];
        trackRef.current = videoTrack;
        const capabilities = videoTrack.getCapabilities();
        if (capabilities.torch) {
            setHasFlash(true);
        }

      } catch (error) {
        console.error('Error accessing camera:', error);
        setHasCameraPermission(false);
      }
    };

    getCameraPermission();

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (videoElement) {
        videoElement.srcObject = null;
      }
      trackRef.current = null;
    };
  }, [isOpen]);

  const tick = () => {
    if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      canvas.height = video.videoHeight;
      canvas.width = video.videoWidth;

      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });
        
        const now = Date.now();
        if (code && now - lastScanTime.current > scanCooldown) {
          lastScanTime.current = now;
          if (sessionScannedCodes.current.has(code.data)) {
            // Already scanned in this session
             playErrorBeep();
             toast({
              variant: "destructive",
              title: 'Duplicate Scan',
              description: `Already scanned: ${code.data}`,
            });
          } else {
            // New scan for this session
            sessionScannedCodes.current.add(code.data);
            playBeep();
            onScan(code.data);
            toast({
              title: 'QR Code Scanned',
              description: `Value: ${code.data}`,
            });

            if (!keepOpenOnScan) {
              setIsOpen(false);
            }
          }
        }
      }
    }
    animationFrameId.current = requestAnimationFrame(tick);
  };
  
  const handleCanPlay = () => {
     if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
     }
     animationFrameId.current = requestAnimationFrame(tick);
  };
  
  const toggleFlash = async () => {
    if (trackRef.current && hasFlash) {
      try {
        await trackRef.current.applyConstraints({
          advanced: [{ torch: !isFlashOn }],
        });
        setIsFlashOn(!isFlashOn);
      } catch (error) {
        console.error('Error toggling flash:', error);
        toast({
          variant: 'destructive',
          title: 'Flash Error',
          description: 'Could not toggle the flashlight.',
        });
      }
    }
  };


  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setIsOpen(true)}
        className={className}
      >
        <QrCode className="mr-2 h-4 w-4" />
        {buttonText}
      </Button>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Scan QR Code</DialogTitle>
            <DialogDescription>
              Point your camera at the QR code to scan it.
            </DialogDescription>
          </DialogHeader>

          <div className="relative w-full aspect-square overflow-hidden rounded-lg bg-black">
             <video 
                ref={videoRef} 
                className="w-full h-full" 
                autoPlay 
                playsInline 
                muted
                onCanPlay={handleCanPlay}
             />
             <canvas ref={canvasRef} style={{ display: 'none' }} />

             {hasFlash && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute bottom-4 right-4 text-white bg-black/50 hover:bg-black/75 hover:text-white"
                  onClick={toggleFlash}
                >
                  {isFlashOn ? <ZapOff /> : <Zap />}
                  <span className="sr-only">Toggle Flash</span>
                </Button>
            )}
          </div>

          {!hasCameraPermission && (
            <Alert variant="destructive">
              <VideoOff className="h-4 w-4" />
              <AlertTitle>Camera Access Required</AlertTitle>
              <AlertDescription>
                Please allow camera access in your browser settings to use this feature.
              </AlertDescription>
            </Alert>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
