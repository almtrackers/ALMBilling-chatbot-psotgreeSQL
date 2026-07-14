import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { CommandChannel } from '@/lib/traccar-commands';

export type CommandThread = {
  id: string;
  deviceId: number;
  deviceName: string;
  /** Tracker SIM from sale record (SIM / IMSI) */
  simNumber?: string | null;
  imsi?: string | null;
  commandName: string;
  commandText: string;
  channel: CommandChannel;
  status: 'pending' | 'sent' | 'queued' | 'failed';
  detail?: string;
  sentAt: string;
  responses: Array<{ text: string; timestamp: string }>;
};

/** @deprecated Legacy shape — migrated on load */
export type CommandResult = {
  commandName: string;
  deviceName: string;
  deviceId?: number;
  result: string;
  timestamp: string;
  channel?: CommandChannel;
};

type CommandThreadState = {
  threads: CommandThread[];
  addSentCommand: (input: {
    deviceId: number;
    deviceName: string;
    commandName: string;
    commandText: string;
    channel: CommandChannel;
    status?: CommandThread['status'];
    detail?: string;
    simNumber?: string | null;
    imsi?: string | null;
  }) => string;
  addResponse: (input: {
    deviceId: number;
    deviceName: string;
    result: string;
    commandName?: string;
  }) => void;
  clearThreads: () => void;
};

const MAX_THREADS = 50;

function newThreadId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useCommandResultStore = create<CommandThreadState>()(
  persist(
    (set, get) => ({
      threads: [],
      addSentCommand: (input) => {
        const id = newThreadId();
        const thread: CommandThread = {
          id,
          deviceId: input.deviceId,
          deviceName: input.deviceName,
          simNumber: input.simNumber || null,
          imsi: input.imsi || null,
          commandName: input.commandName,
          commandText: input.commandText,
          channel: input.channel,
          status: input.status || 'sent',
          detail: input.detail,
          sentAt: new Date().toISOString(),
          responses: [],
        };
        set((state) => ({
          threads: [thread, ...state.threads].slice(0, MAX_THREADS),
        }));
        return id;
      },
      addResponse: (input) => {
        const state = get();
        const pendingIndex = state.threads.findIndex(
          (t) =>
            t.deviceId === input.deviceId &&
            t.responses.length === 0 &&
            (t.status === 'sent' || t.status === 'queued' || t.status === 'pending')
        );

        if (pendingIndex !== -1) {
          const threads = [...state.threads];
          const target = { ...threads[pendingIndex] };
          target.responses = [
            ...target.responses,
            { text: input.result, timestamp: new Date().toISOString() },
          ];
          threads[pendingIndex] = target;
          set({ threads });
          return;
        }

        const fallbackIndex = state.threads.findIndex(
          (t) => t.deviceId === input.deviceId || t.deviceName === input.deviceName
        );
        if (fallbackIndex !== -1) {
          const threads = [...state.threads];
          const target = { ...threads[fallbackIndex] };
          target.responses = [
            ...target.responses,
            { text: input.result, timestamp: new Date().toISOString() },
          ];
          threads[fallbackIndex] = target;
          set({ threads });
          return;
        }

        set((s) => ({
          threads: [
            {
              id: newThreadId(),
              deviceId: input.deviceId,
              deviceName: input.deviceName,
              commandName: input.commandName || 'Received via WebSocket',
              commandText: '',
              channel: 'network',
              status: 'sent',
              sentAt: new Date().toISOString(),
              responses: [{ text: input.result, timestamp: new Date().toISOString() }],
            },
            ...s.threads,
          ].slice(0, MAX_THREADS),
        }));
      },
      clearThreads: () => set({ threads: [] }),
    }),
    {
      name: 'command-result-storage',
      storage: createJSONStorage(() => localStorage),
      version: 2,
      migrate: (persisted: unknown) => {
        const state = persisted as { threads?: CommandThread[]; results?: CommandResult[] };
        if (state.threads?.length) return { threads: state.threads };

        const legacy = state.results || [];
        const threads: CommandThread[] = legacy.map((row) => {
          const isPlaceholder = row.result === 'Command sent, awaiting response...';
          return {
            id: newThreadId(),
            deviceId: row.deviceId || 0,
            deviceName: row.deviceName,
            commandName: row.commandName,
            commandText: row.commandName.startsWith('Direct: ')
              ? row.commandName.replace('Direct: ', '')
              : row.commandName,
            channel: row.channel || 'network',
            status: isPlaceholder ? 'pending' : 'sent',
            sentAt: row.timestamp,
            responses: isPlaceholder ? [] : [{ text: row.result, timestamp: row.timestamp }],
          };
        });
        return { threads };
      },
    }
  )
);
