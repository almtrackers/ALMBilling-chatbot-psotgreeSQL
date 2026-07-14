
'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/auth-context";
import { apiClient } from "@/lib/api";
import { useCommandResultStore } from "@/store/command-result-store";
import { useToast } from "@/hooks/use-toast";
import { useAppSettings } from "@/hooks/use-app-settings";

// --- Type Definitions ---

interface Device {
  id: number;
  name: string;
  uniqueId: string;
  status: string;
  lastUpdate: string;
  positionId: number;
  geofenceIds?: number[];
  attributes: { [key: string]: any };
  position?: Position;
  category?: string;
  expirationTime?: string;
}

interface Position {
  id?: number;
  deviceId: number;
  latitude: number;
  longitude: number;
  speed: number;
  course: number;
  attributes: { [key: string]: any };
  serverTime?: string;
  deviceTime?: string;
}

interface Geofence {
  id: number;
  name: string;
}

interface TraccarEvent {
  id: number;
  type: string;
  serverTime: string;
  deviceId: number;
  positionId: number;
  geofenceId: number;
  attributes: any;
  deviceName: string;
  geofenceName?: string;
}

type IgnitionState = { [deviceId: number]: boolean };

interface AppState {
  devices: { [id: number]: Device };
  positions: { [id: number]: Position };
  geofences: { [id: number]: Geofence };
  events: TraccarEvent[];
  ignition: IgnitionState;
  isLoading: boolean;
  isConnected: boolean;
}

// --- Helper Functions ---

const playNotificationSound = () => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (!audioContext) return;

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(1000, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(1200, audioContext.currentTime + 0.05);

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.3);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
};


function mapById<T extends { id: number }>(arr: T[]): { [id: number]: T } {
  if (!arr) return {};
  return arr.reduce((acc, obj) => ({ ...acc, [obj.id]: obj }), {});
}

const STATUS_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_EVENTS = 25;

function bestTimestamp(dev?: Partial<Device>, pos?: Position): string | undefined {
  return dev?.lastUpdate || pos?.serverTime || pos?.deviceTime;
}

function computeStatus(lastUpdateIso?: string, nowMs = Date.now()): string {
  if (!lastUpdateIso) return "unknown";
  const delta = nowMs - new Date(lastUpdateIso).getTime();
  return delta <= STATUS_TIMEOUT_MS ? "online" : "offline";
}

// Coerce various time shapes to ISO string
function toIsoTime(value: any): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") {
    const ms = value < 1e12 ? value * 1000 : value;
    return new Date(ms).toISOString();
  }
  if (typeof value === "string") {
    const s = value.trim();
    if (/^\d+$/.test(s)) {
      const n = Number(s);
      const ms = n < 1e12 ? n * 1000 : n;
      return new Date(ms).toISOString();
    }
    const t = Date.parse(s);
    if (!Number.isNaN(t)) return new Date(t).toISOString();
  }
  return undefined;
}

// Ensure every event has a usable serverTime; fallback to common alternates or device times
function ensureEventServerTime(ev: any, relatedDevice?: Device): string {
  const candidates = [
    ev?.serverTime,
    ev?.eventTime,
    ev?.time,
    ev?.attributes?.serverTime,
    ev?.attributes?.eventTime,
    ev?.attributes?.time,
    relatedDevice?.lastUpdate,
    relatedDevice?.position?.serverTime,
    relatedDevice?.position?.deviceTime,
  ];
  for (const c of candidates) {
    const iso = toIsoTime(c);
    if (iso) return iso;
  }
  return new Date().toISOString();
}

function enrichEvent(event: TraccarEvent, devices: { [id: number]: Device }, geofences: { [id: number]: Geofence }): TraccarEvent {
  const device = devices[event.deviceId];
  const serverTimeIso = ensureEventServerTime(event, device);
  return {
    ...event,
    serverTime: serverTimeIso,
    deviceName: device?.name || "Unknown Device",
    geofenceName: geofences[event.geofenceId]?.name || undefined,
  };
}

function mergeEvents(existing: TraccarEvent[], incoming: TraccarEvent[] | undefined, devices: { [id: number]: Device }, geofences: { [id: number]: Geofence }): TraccarEvent[] {
  if (!incoming || incoming.length === 0) return existing;
  const byId = new Map<number, TraccarEvent>();
  for (const e of existing) byId.set(e.id, e);
  for (const e of incoming) byId.set(e.id, enrichEvent(e, devices, geofences));
  return Array.from(byId.values())
    .sort((a, b) => new Date(b.serverTime).getTime() - new Date(a.serverTime).getTime())
    .slice(0, MAX_EVENTS);
}

function buildSocketUrlFromApiBase(token?: string | null) {
  const base = "wss://app.almtrace.com/api/socket";
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}


// --- Context Definition ---

const AppStateContext = createContext<AppState | undefined>(undefined);

// --- Provider Component ---

export const WebSocketProvider = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated } = useAuth();
  const { appSettings } = useAppSettings();
  const [state, setState] = useState<AppState>({
    devices: {},
    positions: {},
    geofences: {},
    events: [],
    ignition: {},
    isLoading: true,
    isConnected: false,
  });
  const socketRef = useRef<WebSocket | null>(null);
  const { toast } = useToast();
  
  const soundEvents = appSettings?.soundEvents || ['alarm'];
  const soundAlarms = appSettings?.soundAlarms || [];

  // --- Local position history (per device) persisted in localStorage ---
  function appendPositionHistory(pos: any) {
    try {
      const deviceId = pos.deviceId;
      if (!deviceId || !pos.latitude || !pos.longitude) return;
      const tsStr: string | undefined = pos.serverTime || pos.deviceTime;
      const ts = tsStr ? new Date(tsStr).getTime() : Date.now();
      const key = `deviceHistory:${deviceId}`;
      const raw = localStorage.getItem(key);
      const arr: Array<{ lat: number; lng: number; course: number; speed?: number; ts: number }>
        = raw ? JSON.parse(raw) : [];
      // Push new point
      arr.push({ lat: pos.latitude, lng: pos.longitude, course: pos.course || 0, speed: pos.speed, ts });
      // Keep only last 10 minutes or last 600 entries, whichever smaller
      const cutoff = Date.now() - 10 * 60 * 1000;
      const pruned = arr.filter(p => p.ts >= cutoff);
      const limited = pruned.length > 600 ? pruned.slice(pruned.length - 600) : pruned;
      localStorage.setItem(key, JSON.stringify(limited));
    } catch (_) {
      // ignore storage errors
    }
  }

  useEffect(() => {
    let isComponentMounted = true;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    
    // Get store actions once. They are stable.
    const addCommandResponse = useCommandResultStore.getState().addResponse;

    const connectWebSocket = async () => {
      if (socketRef.current || !isComponentMounted || !isAuthenticated) {
        return;
      }
      
      let token: string | null = null;
      try {
          console.log("Generating fresh session token for WebSocket.");
          const shortExpiration = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
          const tokenRes = await apiClient.post('/session/token', new URLSearchParams(`expiration=${shortExpiration}`));
          if (tokenRes.data) {
              const fetchedToken = typeof tokenRes.data === 'string' ? tokenRes.data : (tokenRes.data as any).token;
              if (fetchedToken) {
                  token = fetchedToken;
              }
          }
      } catch (error: any) {
          console.error("Failed to generate session token for WebSocket, aborting connection.", error);
          console.error(error.response?.data);
          if (isComponentMounted && !reconnectTimeout) {
            reconnectTimeout = setTimeout(connectWebSocket, 10000); // Retry after 10s if token generation fails
          }
          return;
      }
      
      if (!token) {
        console.error("No token available for WebSocket connection.");
        return;
      }

      const socketUrl = buildSocketUrlFromApiBase(token);
      console.log(`Attempting to connect WebSocket to ${socketUrl}`);

      socketRef.current = new WebSocket(socketUrl);

      socketRef.current.onopen = () => {
        console.log("WebSocket connected");
        if (isComponentMounted) {
          setState(prevState => ({ ...prevState, isConnected: true }));
        }
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
          reconnectTimeout = null;
        }
      };

      socketRef.current.onmessage = (event) => {
        if (!isComponentMounted) return;
        const msg = JSON.parse(event.data);
        
        let newDevicesState: { [id: number]: Device };

        setState(prev => {
          const newState: AppState = { 
            ...prev, 
            devices: { ...prev.devices }, 
            events: [...prev.events],
            ignition: { ...prev.ignition }
          };

          const handleSingleEvent = (evt: TraccarEvent) => {
            const enriched = enrichEvent(evt, newState.devices, newState.geofences);
            newState.events = mergeEvents(newState.events, [enriched], newState.devices, newState.geofences);
            const deviceToUpdate = newState.devices[enriched.deviceId];
            if (!deviceToUpdate) return;
            const updatedDevice = { ...deviceToUpdate };
            if (enriched.type === "deviceOnline") updatedDevice.status = "online";
            if (enriched.type === "deviceOffline") updatedDevice.status = "offline";
            if (enriched.type === "ignitionOn") newState.ignition[enriched.deviceId] = true;
            if (enriched.type === "ignitionOff") newState.ignition[enriched.deviceId] = false;
            
            updatedDevice.lastUpdate = enriched.serverTime || updatedDevice.lastUpdate;
            newState.devices[enriched.deviceId] = updatedDevice;

            // Trigger notification
             if (enriched.attributes.message) {
                setTimeout(() => {
                  playNotificationSound();
                  toast({
                      title: `${deviceToUpdate.name}: ${enriched.type}`,
                      description: enriched.attributes.message,
                  });
                }, 0);
            }
          };

          if (msg.devices && Array.isArray(msg.devices)) {
            msg.devices.forEach((d: Device) => {
              const existing = newState.devices[d.id] || {};
              const merged = { ...existing, ...d };
              const ts = d.lastUpdate || bestTimestamp(merged, merged.position);
              merged.lastUpdate = ts || merged.lastUpdate;
              merged.status = d.status || computeStatus(ts);
              newState.devices[d.id] = merged;
            });
          }
          
          if (msg.positions && Array.isArray(msg.positions)) {
            msg.positions.forEach((pos: Position) => {
              const prevDev = newState.devices[pos.deviceId];
              if (prevDev) {
                const ts = pos.serverTime || pos.deviceTime || prevDev.lastUpdate;
                newState.devices[pos.deviceId] = {
                  ...prevDev,
                  attributes: {
                    ...prevDev.attributes,
                    ...pos.attributes,
                  },
                  position: { ...prevDev.position, ...pos },
                  lastUpdate: ts || prevDev.lastUpdate,
                  status: computeStatus(ts || prevDev.lastUpdate),
                };
                if (pos.attributes?.ignition !== undefined) {
                    newState.ignition[pos.deviceId] = !!pos.attributes.ignition;
                }
                appendPositionHistory(pos);
              }
            });
          }

          if (msg.event) {
            handleSingleEvent(msg.event);
          } else if (msg.events && Array.isArray(msg.events)) {
              msg.events.forEach(handleSingleEvent);
          }
          
          newDevicesState = newState.devices;

          return newState;
        });

        // --- Handle command results outside of the main setState loop ---
        // Function to process a potential command result from any object
        const processResult = (sourceObj: any, deviceId: number) => {
            const resultText = sourceObj?.attributes?.result;
            if (resultText && newDevicesState) {
                const device = newDevicesState[deviceId];
                if (device) {
                    addCommandResponse({
                        deviceId,
                        deviceName: device.name,
                        result: resultText,
                    });
                }
            }
        };

        // Check for results in events
        if (msg.events && Array.isArray(msg.events)) {
            for (const evt of msg.events) {
                if (evt.type === 'commandResult') {
                    processResult(evt, evt.deviceId);
                }
            }
        }

        // Check for results in positions
        if (msg.positions && Array.isArray(msg.positions)) {
            for (const pos of msg.positions) {
                processResult(pos, pos.deviceId);
            }
        }
      };

      socketRef.current.onclose = (event) => {
        console.warn(`WebSocket disconnected. Code: ${event.code}, Reason: "${event.reason}"`);
        socketRef.current = null;
        if (isComponentMounted) {
          setState(prevState => ({ ...prevState, isConnected: false }));
          if (!reconnectTimeout) {
            reconnectTimeout = setTimeout(connectWebSocket, 5000);
          }
        }
      };

      socketRef.current.onerror = (error) => {
        console.error("WebSocket error occurred. See the 'onclose' event for details.", error);
      };
    };
    
    const disconnectWebSocket = () => {
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
        if (socketRef.current) {
            socketRef.current.onclose = null; // prevent reconnect logic from firing
            socketRef.current.close();
            socketRef.current = null;
            console.log("WebSocket disconnected by client.");
        }
    }


    const fetchInitialData = async () => {
      if (!isComponentMounted) return;
      setState(prevState => ({ ...prevState, isLoading: true }));
      try {
        const [devicesRes, positionsRes, geofencesRes] = await Promise.all([
          apiClient.get<Device[]>("/devices"),
          apiClient.get<Position[]>("/positions"),
          apiClient.get<Geofence[]>("/geofences"),
        ]);

        if (!isComponentMounted) return;

        const devicesMap = mapById(devicesRes.data || []);
        const positionsMap = mapById(positionsRes.data || []);
        const geofencesMap = mapById(geofencesRes.data || []);
        const initialIgnitionState: IgnitionState = {};

        Object.values(devicesMap).forEach(device => {
          const position = positionsMap[device.positionId];
          if (position) {
            device.position = position;
            if (position.attributes?.ignition !== undefined) {
              initialIgnitionState[device.id] = !!position.attributes.ignition;
            }
          }
          const ts = bestTimestamp(device, position);
          device.status = device.status || computeStatus(ts);
          device.lastUpdate = device.lastUpdate || ts || device.lastUpdate;
        });

        const now = new Date();
        const fromIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
        const toIso = now.toISOString();

        let initialEvents: TraccarEvent[] = [];
        try {
          const allDeviceIds = Object.keys(devicesMap);
          if (allDeviceIds.length > 0) {
            const eventsRes = await apiClient.get<TraccarEvent[]>(
              `/reports/events?from=${fromIso}&to=${toIso}&` + allDeviceIds.map(id => `deviceId=${id}`).join("&")
            );
            initialEvents = (eventsRes.data || []).map(e => enrichEvent(e, devicesMap, geofencesMap));
            
            // Set initial ignition state from recent events
            initialEvents
              .filter(e => e.type === "ignitionOn" || e.type === "ignitionOff")
              .sort((a,b) => new Date(a.serverTime).getTime() - new Date(b.serverTime).getTime())
              .forEach(e => {
                initialIgnitionState[e.deviceId] = e.type === "ignitionOn";
              });
          }
        } catch (e: any) {
          console.warn("Failed to load initial events", e);
          console.error(e.response?.data);
        }

        setState(prevState => ({
          ...prevState,
          devices: devicesMap,
          positions: positionsMap,
          geofences: geofencesMap,
          events: mergeEvents(prevState.events, initialEvents, devicesMap, geofencesMap),
          ignition: initialIgnitionState,
          isLoading: false,
        }));

        connectWebSocket();
      } catch (error: any) {
        console.error("Failed to fetch initial data from API", error);
        console.error(error.response?.data);
        if (isComponentMounted) {
          setState(prevState => ({ ...prevState, isLoading: false }));
        }
      }
    };

    if (isAuthenticated) {
      fetchInitialData();
    } else {
      disconnectWebSocket();
      setState({ devices: {}, positions: {}, geofences: {}, events: [], ignition: {}, isLoading: false, isConnected: false });
    }

    return () => {
      isComponentMounted = false;
      disconnectWebSocket();
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const intervalId: ReturnType<typeof setInterval> = setInterval(() => {
      setState(prev => {
        const now = Date.now();
        const devices = { ...prev.devices };
        let changed = false;
        Object.values(devices).forEach(d => {
          const newStatus = computeStatus(bestTimestamp(d, d.position), now);
          if (d.status !== newStatus) {
            devices[d.id] = { ...d, status: newStatus };
            changed = true;
          }
        });
        return changed ? { ...prev, devices } : prev;
      });
    }, 60000);
    return () => clearInterval(intervalId);
  }, [isAuthenticated]);

  return (
    <AppStateContext.Provider value={state}>
      {children}
    </AppStateContext.Provider>
  );
};

// --- Custom Hooks ---

export const useWebSocket = (): AppState => {
  const context = useContext(AppStateContext);
  if (context === undefined) {
    throw new Error("useWebSocket must be used within a WebSocketProvider");
  }
  return context;
};

export const useIgnitionStatus = (deviceId: number): boolean => {
    const context = useContext(AppStateContext);
    if (context === undefined) {
        throw new Error("useIgnitionStatus must be used within a WebSocketProvider");
    }
    return context.ignition[deviceId] ?? false;
}

// --- Engine Status Logic ---
type EngineState = "locked" | "unlocked" | "unknown";

function normalizeBool(v: any): boolean | undefined {
  if (v === true || v === false) return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "on", "yes", "1", "y"].includes(s)) return true;
    if (["false", "off", "no", "0", "n"].includes(s)) return false;
  }
  return undefined;
}

export function likelyEngineRunning(device: any): boolean {
  if (!device) return false;
  const da = device?.attributes ?? {};
  const pa = device?.position?.attributes ?? {};

  const ignition = normalizeBool(
    da.ignition ?? pa.ignition ?? da.engine ?? pa.engine ?? da.acc ?? pa.acc
  );
  if (ignition === true) return true;

  const rpm = Number(pa.rpm ?? da.rpm);
  if (!Number.isNaN(rpm) && rpm > 0) return true;

  const volts = [
    pa.externalVoltage, da.externalVoltage,
    pa.power, da.power,
    pa.batteryVoltage, da.batteryVoltage
  ].map(v => (v == null ? NaN : Number(v)))
   .find(v => !Number.isNaN(v));

  if (typeof volts === "number" && volts > 13.0) return true;

  return false;
}

export function useEngineAndTow(deviceId: number) {
  const { devices } = useWebSocket();
  const device = devices[deviceId];
  if (!device) return { engineState: "unknown" as EngineState, isTowed: false };

  const da = device.attributes ?? {};
  const pa = device.position?.attributes ?? {};
  const speed = device.position?.speed ?? 0;

  let engine: EngineState = "unknown";

  const blocked = normalizeBool(
    da.blocked ?? pa.blocked ??
    da.engineBlocked ?? pa.engineBlocked ??
    da.immobilizer ?? pa.immobilizer ??
    da.relay ?? pa.relay ??
    da.output1 ?? pa.output1 ??
    da.engineCut ?? pa.engineCut
  );

  if (blocked !== undefined) engine = blocked ? "locked" : "unlocked";
  
  const isIgnitionOn = useIgnitionStatus(deviceId);
  if (engine === "unknown" && isIgnitionOn) engine = "unlocked";

  const moving = speed > 0.5 || normalizeBool(pa.motion) === true;
  const isTowed = moving && !isIgnitionOn;

  return { engineState: engine, isTowed };
}
