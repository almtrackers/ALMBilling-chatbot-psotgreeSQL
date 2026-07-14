'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { MessageSquare, RefreshCw, User, Smartphone, Send, Loader2, Maximize2, Minimize2, ArrowLeft, Edit2, Check, UserPlus, Pencil, Trash2, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { cn, normalizePhoneNumber } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTraccarUsers } from '@/hooks/use-traccar-users';
import { Combobox } from '@/components/ui/combobox';

interface ChatLog {
  id: number;
  type: string;
  from: string;
  to: string | null;
  body: string;
  status: string | null;
  createdAt: string;
}

interface UserSession {
  phoneNumber: string;
  isAssigned: boolean;
  assignedTo: string | null;
  sessionStatus: string;
  lastAction?: string | null;
}

interface UserVehicle {
  id: number;
  name: string;
  uniqueId: string;
  status: string;
}

interface ChatUserProfile {
  phoneNumber: string;
  isRegistered: boolean;
  name: string | null;
  traccarId: number | null;
  registeredNumbers: string[];
  vehicles: UserVehicle[];
}

interface VehicleInvoiceSummary {
  id: string;
  amount: number;
  periodStart: string;
  periodEnd: string;
  paidAt?: string | null;
  status?: string;
  createdAt?: string;
}

interface VehicleDetailResponse {
  device: {
    id: number;
    name: string;
    uniqueId: string;
    status: string;
    installationDate: string | null;
    expiryDate: string | null;
    remainingDays: number | null;
  };
  saleInfo: {
    amountPaidAtSale: number;
    createdAt: string;
    periodStart: string;
    periodEnd: string;
  } | null;
  lastPaidInvoice: VehicleInvoiceSummary | null;
  currentInvoice: VehicleInvoiceSummary | null;
  paymentHistory: VehicleInvoiceSummary[];
}

const getCanonicalPhone = (value: string | null | undefined) => {
  if (!value) return '';
  const normalized = normalizePhoneNumber(value);
  return normalized.local || normalized.international || normalized.digits || normalized.raw;
};

export default function ChatLogsPage() {
  const [logs, setLogs] = useState<ChatLog[]>([]);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [userProfiles, setUserProfiles] = useState<Record<string, ChatUserProfile>>({});
  const [loading, setLoading] = useState(true);
  const initialLoadDone = useRef(false);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showFullScreenSidebar, setShowFullScreenSidebar] = useState(true);
  const [agentName, setAgentName] = useState('Agent');
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempAgentName, setTempAgentName] = useState('');
  const [isUserDetailsOpen, setIsUserDetailsOpen] = useState(false);
  const [isAddRegOpen, setIsAddRegOpen] = useState(false);
  const [isManageRegOpen, setIsManageRegOpen] = useState(false);
  const [isAddingRegNumber, setIsAddingRegNumber] = useState(false);
  const [newRegNumber, setNewRegNumber] = useState('');
  const [targetUserId, setTargetUserId] = useState('');
  const [manageUserId, setManageUserId] = useState('');
  const [managedNumbers, setManagedNumbers] = useState<Array<{ number: string; editValue: string; busy: boolean }>>([]);
  const [isLoadingNumbers, setIsLoadingNumbers] = useState(false);
  const [isSyncingRegNumbers, setIsSyncingRegNumbers] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [vehicleDetails, setVehicleDetails] = useState<VehicleDetailResponse | null>(null);
  const [loadingVehicleDetails, setLoadingVehicleDetails] = useState(false);
  const [sendingResetCommand, setSendingResetCommand] = useState(false);
  const { users: traccarUsers } = useTraccarUsers();
  const { toast } = useToast();

  // Load agent name from localStorage
  useEffect(() => {
    const savedName = localStorage.getItem('chat_agent_name');
    if (savedName) {
      setAgentName(savedName);
    }
  }, []);

  const saveAgentName = () => {
    if (tempAgentName.trim()) {
      setAgentName(tempAgentName.trim());
      localStorage.setItem('chat_agent_name', tempAgentName.trim());
      setIsEditingName(false);
      toast({
        title: "Name Saved",
        description: `Your agent name is now set to "${tempAgentName.trim()}"`,
      });
    }
  };

  const fetchLogs = useCallback(async (options?: { showSpinner?: boolean }) => {
    const showSpinner = options?.showSpinner ?? !initialLoadDone.current;
    if (showSpinner) setLoading(true);
    try {
      const res = await fetch('/api/chatbot/logs', { cache: 'no-store' });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to load chat logs');
      }

      if (data && typeof data === 'object' && Array.isArray(data.logs)) {
        setLogs(data.logs);
        setSessions(data.sessions || []);
        setUserProfiles(data.userProfiles || {});
      } else if (Array.isArray(data)) {
        setLogs(data);
        setSessions([]);
        setUserProfiles({});
      } else {
        console.error('API Error or unexpected format:', data);
        setLogs([]);
        setSessions([]);
        setUserProfiles({});
      }
    } catch (error) {
      console.error('Failed to fetch chat logs:', error);
      if (!initialLoadDone.current) {
        toast({
          title: 'Failed to load chat',
          description: error instanceof Error ? error.message : 'Could not load live chat data.',
          variant: 'destructive',
        });
      }
      setLogs([]);
      setSessions([]);
      setUserProfiles({});
    } finally {
      initialLoadDone.current = true;
      setLoading(false);
    }
  }, [toast]);

  const handleSessionAction = async (action: 'assign' | 'close') => {
    if (!selectedUser) return;

    try {
      const res = await fetch('/api/chatbot/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: selectedUser,
          action,
          agentName: agentName,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast({
          title: action === 'assign' ? "Chat Assigned" : "Chat Closed",
          description: action === 'assign'
            ? "You are now handling this conversation."
            : "Session closed. User will be handled by bot again.",
        });
        fetchLogs();
      } else {
        throw new Error(data.error || 'Action failed');
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleClearChat = async () => {
    if (!selectedUser) return;
    const shouldClear = confirm(`Clear full chat history for ${selectedUser}?`);
    if (!shouldClear) return;

    try {
      const response = await fetch('/api/chatbot/logs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: selectedUser }),
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to clear chat');
      }

      toast({
        title: "Chat Cleared",
        description: "Conversation history has been cleared.",
      });
      setSelectedUser(null);
      await fetchLogs();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedUser || !messageText.trim() || sending) return;

    setSending(true);
    try {
      const res = await fetch('/api/chatbot/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: selectedUser,
          message: messageText.trim(),
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setMessageText('');
        toast({
          title: "Message Sent",
          description: "Your message has been queued for delivery.",
        });
        // Immediately fetch logs to show the sent message
        fetchLogs();
      } else {
        throw new Error(data.error || 'Failed to send message');
      }
    } catch (error: any) {
      console.error('Failed to send message:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to send message. Please check your WhatsApp configuration.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const fetchVehicleDetails = async (vehicleId: number) => {
    if (!selectedUser) return;
    setSelectedVehicleId(vehicleId);
    setLoadingVehicleDetails(true);
    try {
      const response = await fetch(`/api/chatbot/vehicle-details?phoneNumber=${encodeURIComponent(selectedUser)}&deviceId=${vehicleId}`, {
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load vehicle details');
      }
      setVehicleDetails(data);
    } catch (error: any) {
      setVehicleDetails(null);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoadingVehicleDetails(false);
    }
  };

  const handleResetDevice = async () => {
    if (!selectedUser || !selectedVehicleId || sendingResetCommand) return;
    setSendingResetCommand(true);
    try {
      const response = await fetch('/api/chatbot/vehicle-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: selectedUser,
          deviceId: selectedVehicleId,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send reset command');
      }
      toast({
        title: "Success",
        description: data.message || 'RESET# command sent successfully.',
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSendingResetCommand(false);
    }
  };

  const handleAddRegNumber = async () => {
    if (!newRegNumber || !targetUserId) return;
    setIsAddingRegNumber(true);
    try {
      const normalized = normalizePhoneNumber(newRegNumber).local;
      const selectedUser = (traccarUsers || []).find((user) => String(user.id) === targetUserId);
      const response = await fetch('/api/traccar/users/reg-numbers', {
        method: 'POST',
        body: JSON.stringify({
          userId: parseInt(targetUserId, 10),
          number: normalized,
          name: selectedUser?.name,
          phone: selectedUser?.phone,
          email: selectedUser?.email,
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to add number');
      }
      toast({ title: 'Success', description: `Added ${data.normalizedNumber || normalized} to user ID ${targetUserId}.` });
      setNewRegNumber('');
      setTargetUserId('');
      setIsAddRegOpen(false);
      fetchLogs();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsAddingRegNumber(false);
    }
  };

  const loadManagedNumbers = async (userId: string) => {
    if (!userId) {
      setManagedNumbers([]);
      return;
    }
    setIsLoadingNumbers(true);
    try {
      const response = await fetch(`/api/traccar/users/reg-numbers?userId=${encodeURIComponent(userId)}`);
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to load registration numbers');
      }
      const numbers = Array.isArray(data.numbers) ? data.numbers : [];
      setManagedNumbers(numbers.map((item: { number: string }) => ({
        number: item.number,
        editValue: item.number,
        busy: false,
      })));
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setManagedNumbers([]);
    } finally {
      setIsLoadingNumbers(false);
    }
  };

  const handleUpdateManagedNumber = async (currentNumber: string, newValue: string) => {
    if (!manageUserId || !newValue.trim()) return;
    setManagedNumbers((prev) => prev.map((item) => item.number === currentNumber ? { ...item, busy: true } : item));
    try {
      const normalizedNew = normalizePhoneNumber(newValue).local;
      const response = await fetch('/api/traccar/users/reg-numbers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: parseInt(manageUserId),
          oldNumber: currentNumber,
          newNumber: normalizedNew,
        }),
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to update number');
      }
      toast({ title: 'Updated', description: `Updated number to ${data.normalizedNumber || normalizedNew}.` });
      await loadManagedNumbers(manageUserId);
      fetchLogs();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setManagedNumbers((prev) => prev.map((item) => item.number === currentNumber ? { ...item, busy: false } : item));
    }
  };

  const handleRemoveManagedNumber = async (numberToRemove: string) => {
    if (!manageUserId) return;
    setManagedNumbers((prev) => prev.map((item) => item.number === numberToRemove ? { ...item, busy: true } : item));
    try {
      const response = await fetch('/api/traccar/users/reg-numbers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: parseInt(manageUserId),
          number: numberToRemove,
        }),
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to remove number');
      }
      toast({ title: 'Removed', description: `Removed number ${numberToRemove}.` });
      await loadManagedNumbers(manageUserId);
      fetchLogs();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setManagedNumbers((prev) => prev.map((item) => item.number === numberToRemove ? { ...item, busy: false } : item));
    }
  };

  useEffect(() => {
    setIsFullScreen(false);
    fetchLogs({ showSpinner: true });
    const interval = setInterval(() => fetchLogs({ showSpinner: false }), 5000);
    return () => {
      clearInterval(interval);
      setIsFullScreen(false);
    };
  }, [fetchLogs]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFullScreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Group logs by user
  const userGroups = useMemo(() => {
    const groups = logs.reduce((acc: Record<string, ChatLog[]>, log) => {
      const rawUserId = log.type === 'incoming' ? log.from : (log.to || '');
      if (log.type === 'incoming' && rawUserId === 'Webhook') return acc;
      if (log.type === 'outgoing' && rawUserId === 'Agent' && !log.to) return acc;

      const userId = getCanonicalPhone(rawUserId);
      if (!userId) return acc;

      if (!acc[userId]) {
        acc[userId] = [];
      }
      acc[userId].push(log);
      return acc;
    }, {});

    sessions.forEach((session) => {
      const key = getCanonicalPhone(session.phoneNumber);
      if (!key) return;
      if (!groups[key]) {
        groups[key] = [];
      }
    });

    return groups;
  }, [logs, sessions]);

  const sessionsByUser = useMemo(() => sessions.reduce((acc: Record<string, UserSession>, session) => {
    const key = getCanonicalPhone(session.phoneNumber);
    if (!key) return acc;
    const existing = acc[key];
    if (!existing) {
      acc[key] = { ...session, phoneNumber: key };
      return acc;
    }
    const isAssigned = existing.isAssigned || session.isAssigned || existing.sessionStatus === 'agent' || session.sessionStatus === 'agent';
    acc[key] = {
      ...existing,
      phoneNumber: key,
      isAssigned,
      assignedTo: existing.assignedTo || session.assignedTo,
      sessionStatus: isAssigned ? 'agent' : (existing.sessionStatus || session.sessionStatus),
      lastAction: existing.lastAction === 'REQUEST_LIVE_AGENT' || session.lastAction === 'REQUEST_LIVE_AGENT'
        ? 'REQUEST_LIVE_AGENT'
        : (existing.lastAction || session.lastAction || null),
    };
    return acc;
  }, {}), [sessions]);

  const traccarUserOptions = (traccarUsers || [])
    .filter((user) => !user.administrator && !user.manager)
    .map((user) => ({
      value: String(user.id),
      label: `${user.id} - ${user.name}`,
    }));

  const userProfilesByUser = useMemo(() => Object.values(userProfiles).reduce((acc: Record<string, ChatUserProfile>, profile) => {
    const key = getCanonicalPhone(profile.phoneNumber);
    if (!key) return acc;
    const existing = acc[key];
    if (!existing) {
      acc[key] = { ...profile, phoneNumber: key };
      return acc;
    }
    acc[key] = {
      ...existing,
      isRegistered: existing.isRegistered || profile.isRegistered,
      name: existing.name || profile.name,
      traccarId: existing.traccarId || profile.traccarId,
      registeredNumbers: Array.from(new Set([...(existing.registeredNumbers || []), ...(profile.registeredNumbers || [])])),
      vehicles: Array.from(
        new Map([...(existing.vehicles || []), ...(profile.vehicles || [])].map((vehicle) => [vehicle.id, vehicle])).values()
      ),
    };
    return acc;
  }, {}), [userProfiles]);

  const users = useMemo(() => Object.keys(userGroups).sort((a, b) => {
    const sessionA = sessionsByUser[a];
    const sessionB = sessionsByUser[b];
    const isUnattendedA = sessionA?.lastAction === 'REQUEST_LIVE_AGENT' && !(sessionA?.isAssigned || sessionA?.sessionStatus === 'agent');
    const isUnattendedB = sessionB?.lastAction === 'REQUEST_LIVE_AGENT' && !(sessionB?.isAssigned || sessionB?.sessionStatus === 'agent');

    if (isUnattendedA && !isUnattendedB) return -1;
    if (!isUnattendedA && isUnattendedB) return 1;

    const latestA = userGroups[a][0] ? new Date(userGroups[a][0].createdAt).getTime() : 0;
    const latestB = userGroups[b][0] ? new Date(userGroups[b][0].createdAt).getTime() : 0;
    return latestB - latestA;
  }), [userGroups, sessionsByUser]);

  // Automatically select the first user if none selected
  useEffect(() => {
    if (users.length === 0) {
      if (selectedUser) setSelectedUser(null);
      return;
    }
    if (!selectedUser || !userGroups[selectedUser]) {
      setSelectedUser(users[0]);
    }
  }, [users, selectedUser, userGroups]);

  const currentChat = selectedUser ? userGroups[selectedUser] : [];
  const selectedUserProfile = selectedUser ? userProfilesByUser[selectedUser] : null;
  const selectedUserSession = selectedUser ? sessionsByUser[selectedUser] : null;

  const handleSyncRegNumbers = async () => {
    setIsSyncingRegNumbers(true);
    try {
      const response = await fetch('/api/traccar/sync/reg-numbers', { method: 'POST' });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to sync registration numbers');
      }
      const stats = data.stats || {};
      toast({
        title: 'Registration Numbers Synced',
        description:
          data.message ||
          `Saved ${stats.registrationNumbersSaved || 0} number(s) from username and robocall sources.`,
      });
      fetchLogs({ showSpinner: true });
    } catch (error: any) {
      toast({
        title: 'Sync Failed',
        description: error.message || 'Could not sync registration numbers.',
        variant: 'destructive',
      });
    } finally {
      setIsSyncingRegNumbers(false);
    }
  };

  const openAddRegDialog = () => {
    if (selectedUser) {
      setNewRegNumber(selectedUser);
      if (selectedUserProfile?.traccarId) {
        setTargetUserId(String(selectedUserProfile.traccarId));
      } else {
        setTargetUserId('');
      }
    } else {
      setNewRegNumber('');
      setTargetUserId('');
    }
    setIsAddRegOpen(true);
  };

  const openManageRegDialog = () => {
    if (selectedUserProfile?.traccarId) {
      const traccarId = String(selectedUserProfile.traccarId);
      setManageUserId(traccarId);
      loadManagedNumbers(traccarId);
    } else {
      setManageUserId('');
      setManagedNumbers([]);
    }
    setIsManageRegOpen(true);
  };

  return (
    <div className={cn(
      "flex flex-col",
      isFullScreen
        ? "fixed inset-0 z-50 bg-white h-screen"
        : "h-[calc(100vh-4rem)] lg:h-[calc(100vh-5rem)]"
    )}>
      <div className={cn("flex-none p-2 border-b bg-white", isFullScreen ? "shadow-sm" : "")}>
          <div className="flex items-center justify-between max-w-full">
            <div>
              <h1 className="text-lg font-bold flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                Live Chat
              </h1>
              <p className="text-xs text-muted-foreground hidden sm:block">
                Real-time user interactions
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isEditingName ? (
                <div className="flex items-center gap-1 animate-in slide-in-from-right-2 duration-200">
                  <Input
                    value={tempAgentName}
                    onChange={(e) => setTempAgentName(e.target.value)}
                    placeholder="Enter your name"
                    className="h-8 w-32 sm:w-48 text-xs"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveAgentName();
                      if (e.key === 'Escape') setIsEditingName(false);
                    }}
                  />
                  <Button onClick={saveAgentName} size="icon" variant="ghost" className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50">
                    <Check className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={() => {
                    setTempAgentName(agentName);
                    setIsEditingName(true);
                  }}
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                >
                  <User className="h-3 w-3" />
                  <span className="hidden sm:inline">Agent:</span>
                  <span className="font-semibold text-foreground">{agentName}</span>
                  <Edit2 className="h-3 w-3 ml-0.5" />
                </Button>
              )}
              <Button onClick={() => fetchLogs({ showSpinner: true })} disabled={loading} variant="outline" size="sm" className="h-8">
                <RefreshCw className={`mr-1 h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              {isFullScreen && (
                <Button
                  onClick={() => setShowFullScreenSidebar((prev) => !prev)}
                  variant="outline"
                  size="sm"
                  className="h-8"
                >
                  {showFullScreenSidebar ? 'Hide Conversations' : 'Show Conversations'}
                </Button>
              )}
              <Button onClick={handleSyncRegNumbers} disabled={isSyncingRegNumbers} variant="outline" size="sm" className="h-8">
                {isSyncingRegNumbers ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Database className="mr-1 h-3 w-3" />
                )}
                Sync Register Numbers
              </Button>
              <Button onClick={openAddRegDialog} variant="outline" size="sm" className="h-8">
                <UserPlus className="mr-1 h-3 w-3" />
                Add Register Number
              </Button>
              <Button onClick={openManageRegDialog} variant="outline" size="sm" className="h-8">
                <Pencil className="mr-1 h-3 w-3" />
                Manage Register Numbers
              </Button>
            </div>
          </div>
          <Dialog open={isAddRegOpen} onOpenChange={setIsAddRegOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Registration Number</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <label htmlFor="chat-userId" className="text-right">User</label>
                  <div className="col-span-3">
                    <Combobox
                      options={traccarUserOptions}
                      value={targetUserId}
                      onChange={(value) => setTargetUserId(value)}
                      placeholder="Select user by ID or name"
                      searchPlaceholder="Search user by ID or name..."
                      noResultsMessage="No users found."
                    />
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <label htmlFor="chat-regNum" className="text-right">Number</label>
                  <Input id="chat-regNum" value={newRegNumber} onChange={(e) => setNewRegNumber(e.target.value)} placeholder="+92300..." className="col-span-3" />
                </div>
                <Button onClick={handleAddRegNumber} disabled={isAddingRegNumber} className="ml-auto">
                  {isAddingRegNumber ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                  Save Number
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={isManageRegOpen} onOpenChange={setIsManageRegOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Update or Remove Registration Numbers</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid grid-cols-4 items-center gap-4">
                  <label htmlFor="chat-manageUserId" className="text-right">User</label>
                  <div className="col-span-3">
                    <Combobox
                      options={traccarUserOptions}
                      value={manageUserId}
                      onChange={(value) => {
                        setManageUserId(value);
                        loadManagedNumbers(value);
                      }}
                      placeholder="Select user by ID or name"
                      searchPlaceholder="Search user by ID or name..."
                      noResultsMessage="No users found."
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  {isLoadingNumbers ? (
                    <div className="text-sm text-muted-foreground">Loading numbers...</div>
                  ) : managedNumbers.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No registration numbers found for selected user.</div>
                  ) : (
                    managedNumbers.map((item) => (
                      <div key={item.number} className="flex items-center gap-2">
                        <Input
                          value={item.editValue}
                          onChange={(e) => {
                            const value = e.target.value;
                            setManagedNumbers((prev) =>
                              prev.map((row) => row.number === item.number ? { ...row, editValue: value } : row)
                            );
                          }}
                          disabled={item.busy}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={item.busy || !item.editValue.trim() || item.editValue === item.number}
                          onClick={() => handleUpdateManagedNumber(item.number, item.editValue)}
                        >
                          {item.busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Update'}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={item.busy}
                          onClick={() => handleRemoveManagedNumber(item.number)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* User List Sidebar */}
        <Card className={cn(
          "flex flex-col shrink-0 overflow-hidden rounded-none border-y-0 border-l-0 shadow-none",
          isFullScreen
            ? (showFullScreenSidebar ? "w-[22rem] border-r" : "hidden")
            : "w-full sm:w-64 md:w-80",
          !isFullScreen && (selectedUser ? 'hidden sm:flex' : 'flex')
        )}>
          <CardHeader className="py-2 px-4 border-b bg-muted/30 shrink-0">
            <CardTitle className="text-xs font-semibold flex items-center gap-2">
              <User className="h-3 w-3 text-muted-foreground" />
              Conversations
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="flex flex-col divide-y divide-border/50">
                {Object.keys(userGroups).length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <p className="text-sm">No conversations yet</p>
                  </div>
                ) : (
                  users.map((userId) => {
                    const userLogs = userGroups[userId];
                    const lastLog = userLogs[0];
                    const isSelected = selectedUser === userId;
                    const session = sessionsByUser[userId];
                    const isAssigned = session?.isAssigned || session?.sessionStatus === 'agent';
                    const isLiveAgentRequest = session?.lastAction === 'REQUEST_LIVE_AGENT' && !isAssigned;
                    const profile = userProfilesByUser[userId];
                    const displayName = profile?.name || userId;

                    return (
                      <button
                        key={userId}
                        onClick={() => setSelectedUser(userId)}
                        className={`flex flex-col items-start gap-1 p-3 text-left transition-colors hover:bg-muted/50 ${isSelected ? 'bg-primary/5 border-r-2 border-primary' : ''} ${isAssigned ? 'bg-red-50/50' : ''} ${isLiveAgentRequest ? 'bg-yellow-50/80' : ''}`}
                      >
                          <div className="flex items-center justify-between w-full">
                            <span className={`font-medium text-sm flex items-center gap-1 ${isAssigned ? 'text-red-600' : ''} ${isLiveAgentRequest ? 'text-yellow-700' : ''}`}>
                              <Smartphone className={`h-3 w-3 ${isAssigned ? 'text-red-500' : isLiveAgentRequest ? 'text-yellow-600' : 'text-muted-foreground'}`} />
                              {displayName}
                              {isAssigned && (
                                <Badge variant="outline" className="ml-1 px-1 py-0 h-3.5 text-[8px] bg-red-100 text-red-700 border-red-200">
                                  ACTIVE
                                </Badge>
                              )}
                              {isLiveAgentRequest && (
                                <Badge variant="outline" className="ml-1 px-1 py-0 h-3.5 text-[8px] bg-yellow-100 text-yellow-800 border-yellow-300">
                                  LIVE AGENT REQUEST
                                </Badge>
                              )}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {lastLog ? format(new Date(lastLog.createdAt), 'HH:mm') : '--:--'}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-1 w-full">
                            {lastLog
                              ? (profile?.name ? `${userId} • ${lastLog.body}` : lastLog.body)
                              : 'No messages yet'}
                          </p>
                        </button>
                      );
                    })
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Chat Window */}
        <Card className={cn(
          "flex-1 overflow-hidden flex flex-col rounded-none border-none shadow-none",
          !selectedUser && !isFullScreen ? 'hidden sm:flex' : 'flex'
        )}>
          {selectedUser ? (
            <>
              <CardHeader className="py-2 px-4 border-b bg-white shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isFullScreen ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowFullScreenSidebar((prev) => !prev)}
                      >
                        <ArrowLeft className="h-4 w-4" />
                        <span className="text-xs font-medium">{showFullScreenSidebar ? 'Hide List' : 'Show List'}</span>
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="sm:hidden h-8 w-8 text-muted-foreground"
                        onClick={() => setSelectedUser(null)}
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                    )}
                    <div>
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        {selectedUserProfile?.name || selectedUser}
                        {selectedUserSession?.isAssigned && (
                          <Badge variant="outline" className="text-[10px] py-0 h-5 bg-red-100 text-red-700 border-red-200">
                            Assigned to {selectedUserSession?.assignedTo || 'Agent'}
                          </Badge>
                        )}
                        {selectedUserSession?.lastAction === 'REQUEST_LIVE_AGENT' && !selectedUserSession?.isAssigned && (
                          <Badge variant="outline" className="text-[10px] py-0 h-5 bg-yellow-100 text-yellow-800 border-yellow-300">
                            Asking for Live Agent
                          </Badge>
                        )}
                      </CardTitle>
                      <div className="flex items-center gap-1 mt-0.5">
                        <div className={`h-1.5 w-1.5 rounded-full ${
                          selectedUserSession?.isAssigned
                            ? 'bg-red-500'
                            : selectedUserSession?.lastAction === 'REQUEST_LIVE_AGENT'
                            ? 'bg-yellow-500'
                            : 'bg-green-500'
                        }`} />
                        <span className="text-[10px] text-muted-foreground">
                          {selectedUserSession?.isAssigned
                            ? 'Agent Chat'
                            : selectedUserSession?.lastAction === 'REQUEST_LIVE_AGENT'
                            ? 'Awaiting Live Agent'
                            : 'Active Bot Session'}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {selectedUser}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedUserSession?.isAssigned ? (
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-8 text-xs font-semibold"
                        onClick={() => handleSessionAction('close')}
                      >
                        Close Chat
                      </Button>
                    ) : (
                      <Button
                        variant="default"
                        size="sm"
                        className="h-8 text-xs font-semibold bg-blue-600 hover:bg-blue-700"
                        onClick={() => handleSessionAction('assign')}
                      >
                        Assign to Me
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs font-semibold"
                      onClick={() => {
                        setIsUserDetailsOpen(true);
                        setSelectedVehicleId(null);
                        setVehicleDetails(null);
                      }}
                    >
                      User Details
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs font-semibold border-red-200 text-red-700 hover:bg-red-50"
                      onClick={handleClearChat}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Clear Chat
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground"
                      onClick={() => setIsFullScreen(!isFullScreen)}
                      title={isFullScreen ? "Exit Full Screen" : "Full Screen"}
                    >
                      {isFullScreen ? (
                        <Minimize2 className="h-4 w-4" />
                      ) : (
                        <Maximize2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0 flex-1 overflow-hidden bg-[#f0f2f5] relative flex flex-col">
                <ScrollArea className="flex-1 p-4">
                  <div className="flex flex-col gap-3 max-w-4xl mx-auto">
                    {[...(userGroups[selectedUser] || [])].reverse().map((log) => (
                      <div
                        key={log.id}
                        className={`flex flex-col ${log.type === 'incoming' ? 'items-start' : 'items-end'}`}
                      >
                        <div
                          className={`max-w-[85%] sm:max-w-[75%] rounded-lg px-3 py-2 text-sm shadow-sm ${
                            log.type === 'incoming'
                              ? 'bg-white text-slate-800 rounded-tl-none'
                              : 'bg-[#dcf8c6] text-slate-800 rounded-tr-none'
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">{log.body}</p>
                          <div className="flex items-center justify-end gap-1 mt-1">
                            <span className="text-[10px] text-muted-foreground/70">
                              {format(new Date(log.createdAt), 'HH:mm')}
                            </span>
                            {log.type === 'outgoing' && (
                              <span className="text-[10px] font-medium text-blue-500 uppercase tracking-tighter">
                                {log.status || 'sent'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                {/* Message Input */}
                <div className="p-3 bg-white border-t shrink-0">
                  <form
                    onSubmit={handleSendMessage}
                    className="flex items-center gap-2 max-w-4xl mx-auto"
                  >
                    <Input
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      placeholder="Type a message..."
                      className="flex-1 h-9 text-sm"
                      disabled={sending}
                    />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={!messageText.trim() || sending}
                      className="shrink-0 h-9 px-3"
                    >
                      {sending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-1.5" />
                          <span className="hidden xs:inline">Send</span>
                        </>
                      )}
                    </Button>
                  </form>
                </div>
              </CardContent>
              <Dialog open={isUserDetailsOpen} onOpenChange={setIsUserDetailsOpen}>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>User Details</DialogTitle>
                    <DialogDescription>
                      {selectedUserProfile?.isRegistered ? 'Registered user profile and linked vehicles.' : 'No registered profile is linked yet.'}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2 text-sm">
                    <div><span className="font-semibold">Display Name:</span> {selectedUserProfile?.name || selectedUser}</div>
                    <div><span className="font-semibold">Chat Number:</span> {selectedUser}</div>
                    <div><span className="font-semibold">Traccar User ID:</span> {selectedUserProfile?.traccarId ?? 'N/A'}</div>
                    <div><span className="font-semibold">Registered Numbers:</span> {selectedUserProfile?.registeredNumbers?.length ? selectedUserProfile.registeredNumbers.join(', ') : 'N/A'}</div>
                    <div>
                      <span className="font-semibold">Vehicles:</span>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedUserProfile?.vehicles?.length ? selectedUserProfile.vehicles.map((vehicle) => (
                          <Button
                            key={vehicle.id}
                            type="button"
                            variant={selectedVehicleId === vehicle.id ? "default" : "outline"}
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => fetchVehicleDetails(vehicle.id)}
                          >
                            {vehicle.name} ({vehicle.uniqueId})
                          </Button>
                        )) : (
                          <span className="text-muted-foreground">No vehicles found</span>
                        )}
                      </div>
                    </div>
                    {loadingVehicleDetails && (
                      <div className="text-xs text-muted-foreground">Loading vehicle details...</div>
                    )}
                    {!loadingVehicleDetails && vehicleDetails && (
                      <div className="mt-3 space-y-2 rounded-md border p-3">
                        <div><span className="font-semibold">Device Status:</span> {vehicleDetails.device.status}</div>
                        <div><span className="font-semibold">Installation Date:</span> {vehicleDetails.device.installationDate ? format(new Date(vehicleDetails.device.installationDate), 'dd MMM yyyy') : 'N/A'}</div>
                        <div><span className="font-semibold">Amount Paid At Sale:</span> {vehicleDetails.saleInfo ? vehicleDetails.saleInfo.amountPaidAtSale.toLocaleString() : 'N/A'}</div>
                        <div><span className="font-semibold">Last Paid Invoice:</span> {vehicleDetails.lastPaidInvoice ? `${vehicleDetails.lastPaidInvoice.amount.toLocaleString()} | ${format(new Date(vehicleDetails.lastPaidInvoice.periodStart), 'dd MMM yyyy')} - ${format(new Date(vehicleDetails.lastPaidInvoice.periodEnd), 'dd MMM yyyy')} | ${vehicleDetails.lastPaidInvoice.paidAt ? format(new Date(vehicleDetails.lastPaidInvoice.paidAt), 'dd MMM yyyy') : 'N/A'}` : 'N/A'}</div>
                        <div><span className="font-semibold">Current Invoice:</span> {vehicleDetails.currentInvoice ? `${vehicleDetails.currentInvoice.amount.toLocaleString()} | ${String(vehicleDetails.currentInvoice.status || '').toUpperCase()}` : 'N/A'}</div>
                        <div><span className="font-semibold">Expiry Date:</span> {vehicleDetails.device.expiryDate ? format(new Date(vehicleDetails.device.expiryDate), 'dd MMM yyyy') : 'N/A'}</div>
                        <div><span className="font-semibold">Remaining Validity Days:</span> {vehicleDetails.device.remainingDays ?? 'N/A'}</div>
                        <div>
                          <span className="font-semibold">Paid Invoice History:</span>{' '}
                          {vehicleDetails.paymentHistory.length > 0
                            ? vehicleDetails.paymentHistory.map((invoice) => {
                                const paidOn = invoice.paidAt ? format(new Date(invoice.paidAt), 'dd MMM yyyy') : 'N/A';
                                return `${invoice.amount.toLocaleString()} (${format(new Date(invoice.periodStart), 'dd MMM yyyy')} - ${format(new Date(invoice.periodEnd), 'dd MMM yyyy')}, paid: ${paidOn})`;
                              }).join(' | ')
                            : 'No paid invoices'}
                        </div>
                        <div className="pt-1">
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="h-8"
                            onClick={handleResetDevice}
                            disabled={sendingResetCommand}
                          >
                            {sendingResetCommand ? 'Sending RESET#...' : 'Reboot Device (RESET#)'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end">
                    <Button variant="outline" onClick={() => setIsUserDetailsOpen(false)}>
                      Close
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 text-muted-foreground p-8 relative">
              {isFullScreen && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-2 left-2 h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
                  onClick={() => setIsFullScreen(false)}
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span className="text-xs font-medium">Back</span>
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 h-8 w-8 text-muted-foreground"
                onClick={() => setIsFullScreen(!isFullScreen)}
                title={isFullScreen ? "Exit Full Screen" : "Full Screen"}
              >
                {isFullScreen ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </Button>
              <div className="bg-white p-6 rounded-full shadow-sm mb-4">
                <MessageSquare className="h-12 w-12 text-slate-200" />
              </div>
              <h3 className="text-lg font-medium text-slate-900 mb-1">Select a conversation</h3>
              <p className="text-sm text-center max-w-xs">
                Choose a user from the list on the left to start chatting in real-time.
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
