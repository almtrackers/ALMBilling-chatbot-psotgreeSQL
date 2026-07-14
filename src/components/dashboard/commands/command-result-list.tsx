
'use client';

import { useCommandResultStore } from '@/store/command-result-store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format, formatDistanceToNow } from 'date-fns';
import { Trash2, Inbox, Car, MessageSquare, Radio, Smartphone } from 'lucide-react';

function channelLabel(channel: 'network' | 'sms') {
  return channel === 'sms' ? 'SMS' : 'Network';
}

function channelIcon(channel: 'network' | 'sms') {
  return channel === 'sms' ? Smartphone : Radio;
}

export default function CommandResultList() {
  const { threads, clearThreads } = useCommandResultStore();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Command Activity</CardTitle>
          <CardDescription>
            Sent commands and device responses. Offline vehicles use SMS when gateway is configured.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={clearThreads} disabled={threads.length === 0}>
          <Trash2 className="mr-2 h-4 w-4" />
          Clear History
        </Button>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[28rem]">
          {threads.length > 0 ? (
            <div className="flex flex-col gap-6 pr-4 max-w-4xl mx-auto">
              {threads.map((thread) => {
                const ChannelIcon = channelIcon(thread.channel);
                const commandBody = thread.commandText || thread.commandName;

                return (
                  <div key={thread.id} className="flex flex-col gap-2">
                    {/* Outgoing — sent command */}
                    <div className="flex flex-col items-end">
                      <div className="max-w-[90%] sm:max-w-[75%] rounded-lg rounded-tr-none bg-[#dcf8c6] px-3 py-2 text-sm shadow-sm text-slate-800">
                        <div className="flex flex-col gap-0.5 text-xs font-medium text-slate-600 mb-1">
                          <div className="flex items-center gap-1.5">
                            <Car className="h-3.5 w-3.5 shrink-0" />
                            <span>Vehicle (No.): {thread.deviceName}</span>
                          </div>
                          {thread.simNumber && (
                            <div className="flex items-center gap-1.5 pl-5">
                              <span>
                                SIM: {thread.simNumber}
                                {thread.imsi ? ` / ${thread.imsi}` : ''}
                              </span>
                            </div>
                          )}
                        </div>
                        <p className="font-mono whitespace-pre-wrap break-all">{commandBody}</p>
                        {thread.commandText && thread.commandName !== thread.commandText && (
                          <p className="text-xs text-muted-foreground mt-1">{thread.commandName}</p>
                        )}
                        <div className="flex flex-wrap items-center justify-end gap-2 mt-2">
                          <Badge variant="secondary" className="text-[10px] h-5 gap-1 font-normal">
                            <ChannelIcon className="h-3 w-3" />
                            {channelLabel(thread.channel)}
                          </Badge>
                          {thread.status === 'queued' && (
                            <Badge variant="outline" className="text-[10px] h-5 font-normal">
                              Queued
                            </Badge>
                          )}
                          {thread.status === 'pending' && (
                            <Badge variant="outline" className="text-[10px] h-5 font-normal">
                              Awaiting response
                            </Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground/70">
                            {format(new Date(thread.sentAt), 'HH:mm')} ·{' '}
                            {formatDistanceToNow(new Date(thread.sentAt), { addSuffix: true })}
                          </span>
                        </div>
                        {thread.detail && (
                          <p className="text-[10px] text-muted-foreground mt-1 text-right">{thread.detail}</p>
                        )}
                      </div>
                    </div>

                    {/* Incoming — device response(s) under sent command */}
                    {thread.responses.length > 0 ? (
                      thread.responses.map((response, idx) => (
                        <div key={`${thread.id}-resp-${idx}`} className="flex flex-col items-start pl-2 sm:pl-6">
                          <div className="max-w-[90%] sm:max-w-[75%] rounded-lg rounded-tl-none bg-white px-3 py-2 text-sm shadow-sm text-slate-800 border">
                            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-1">
                              <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                              <span>
                                Response from {thread.deviceName}
                                {thread.simNumber ? ` · SIM ${thread.simNumber}` : ''}
                              </span>
                            </div>
                            <p className="font-mono whitespace-pre-wrap break-all text-xs sm:text-sm">
                              {response.text}
                            </p>
                            <div className="flex justify-end mt-1">
                              <span className="text-[10px] text-muted-foreground/70">
                                {format(new Date(response.timestamp), 'HH:mm')}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : thread.status !== 'failed' ? (
                      <div className="flex flex-col items-start pl-2 sm:pl-6">
                        <div className="text-xs text-muted-foreground italic px-1">
                          Waiting for device response...
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex h-full min-h-[200px] items-center justify-center">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Inbox className="h-10 w-10" />
                <h3 className="text-lg font-semibold">No commands yet</h3>
                <p className="text-sm text-center max-w-sm">
                  Send a command above. Responses appear underneath each sent command with the vehicle number.
                </p>
              </div>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
