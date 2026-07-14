
import { Timestamp } from 'firebase/firestore';

export type AppSettings = {
  theme: 'light' | 'dark' | 'system';
  invoiceDaysMonthly: number;
  invoiceDaysYearly: number;
  simCostPerDevice: number;
  monthlyYearlyThreshold: number;
  soundEvents?: string[];
  soundAlarms?: string[];
};

export type Device = {
  id: number;
  name: string;
  uniqueId: string;
  status: 'online' | 'offline' | 'unknown';
  lastUpdate: string;
  expirationTime?: string;
  positionId?: number;
  userId?: number;
  attributes: {
    planId?: string;
    devicePassword?: string;
    ignition?: boolean;
    expiryDate?: string;
    installationDate?: string;
    [key: string]: unknown;
  };
};

export type TraccarUser = {
  id: number;
  name: string;
  email: string;
  phone?: string;
  readonly: boolean;
  administrator: boolean;
  manager: boolean;
  map?: string;
  latitude?: number;
  longitude?: number;
  zoom?: number;
  password?: string;
  twelveHourFormat?: boolean;
  coordinateFormat?: string;
  disabled: boolean;
  expirationTime?: string;
  deviceLimit: number;
  userLimit: number;
  deviceReadonly: boolean;
  limitCommands: boolean;
  poistreams?: boolean;
  attributes: {
    [key: string]: any;
  };
}

export type Invoice = {
  id: string;
  deviceIds: number[];
  customerIdentifier?: string;
  customerName?: string; // Actual customer name (separate from identifier which might be phone)
  requiresReview?: boolean; // Flag for invoices that need manual review (e.g., invalid customer name)
  totalAmount: number;
  periodStart: Timestamp;
  periodEnd: Timestamp;
  status: 'pending' | 'paid' | 'rolled-over';
  paidAt?: Timestamp | null;
  paidBy?: string;
  createdAt?: Timestamp;
  baseAmount?: number;
  simCharges?: number;
  otherCharges?: number;
  discount?: number;
  previousDues?: number;
  durationType?: 'monthly' | 'yearly';
  subscriptionType?: 'renewal' | 'firstYear'; // Added for clarity
  invoiceItems?: InvoiceItem[];
  extensionDays?: number;
  extensionGrantedAt?: Timestamp;
  // Robocall fields
  autoCallMade?: boolean; // Whether auto-call was made 1 day before expiry
  autoCallDate?: Timestamp; // When auto-call was made
  lastCallPromptId?: string; // Last robocall prompt_id for status tracking
  lastCallDate?: Timestamp; // Last call attempt date
  lastCallStatus?: 'pending' | 'completed' | 'failed' | 'unknown'; // Last call status
  comments?: string; // For agent notes on payment reminders
};

export type InvoiceItem = {
  id: string;
  invoiceId: string;
  deviceId: number;
  deviceName: string;
  deviceImei: string;
  description: string;
  baseAmount?: number;
  simCharges?: number;
  otherCharges?: number;
  discount?: number;
  totalAmount: number;
  periodStart?: Timestamp;
  periodEnd?: Timestamp;
  durationType?: 'monthly' | 'yearly';
};

export type Expense = {
  id:string;
  inventoryItemId?: string;
  title: string;
  amount: number;
  type: 'fuel' | 'staff_salary' | 'installation' | 'sim_charges' | 'rent' | 'stock_purchase' | 'people_transaction' | 'commission' | 'other';
  date: Timestamp;
  status: 'pending' | 'approved';
  monthId?: string; // e.g., '2024-07'
  notes?: string;
  createdBy: string;
  createdAt?: Timestamp;
  approvedBy?: string;
  approvedAt?: Timestamp | null;
  isRecurring?: boolean;
  recurringFrequency?: 'monthly' | 'yearly';
  // Fields for people/dealer transactions
  personId?: string;
  dealerId?: string;
  transactionType?: 'incoming' | 'outgoing';
};

export type Sale = {
  id: string;
  customerName: string;
  amount: number;
  date: Timestamp;
  vehicleNumber: string;
  monthId?: string;
  notes?: string;
  relatedInvoiceId?: string;
  createdBy: string; // Admin's name
  createdAt?: Timestamp;
  dealerId?: string;
  commission?: number;
  trackerId: string;
  imei: string;
  harnessId: string;
  relayId?: string;
  micId?: string;
  sosButtonId?: string;
  simId: string;
  simNumber: string;
  imsi: string;
  phoneRobocall?: string;
  contactNumber?: string;
  notificationIds?: number[];
  status: 'active' | 'unsubscribed';
  unsubscribedAt?: Timestamp;
  unsubscribeReason?: string;
  // Invoice related fields
  renewalFee?: number;
  simCharges?: number;
  discount?: number;
  vehicleCardPath?: string | null;
};

export type CompanyVehicle = {
  id: string;
  customerName: string;
  date: Timestamp;
  vehicleNumber: string;
  monthId?: string;
  notes?: string;
  createdBy: string; // Admin's name
  createdAt?: Timestamp;
  dealerId?: string;
  trackerId?: string;
  imei?: string;
  harnessId?: string;
  relayId?: string;
  micId?: string;
  sosButtonId?: string;
  simId?: string;
  simNumber?: string;
  imsi?: string;
  phoneRobocall?: string;
  contactNumber?: string;
  notificationIds?: number[];
  vehicleCardPath?: string | null;
}

export type SimCard = {
  simNumber: string;
  imsi: string;
};

export type InventoryItem = {
  id: string;
  name: string;
  type:
    | 'tracker'
    | 'relay'
    | 'sim'
    | 'wire_plug_harness'
    | 'mic'
    | 'sos_button'
    | 'other';
  quantity: number;
  cost?: number;
  supplier?: string;
  lastUpdated: Timestamp;
  imeis?: string[];
  sims?: SimCard[];
};

export type LogType = 'create' | 'update' | 'delete' | 'info' | 'automation';

export type Log = {
  id: string;
  action: string;
  adminName: string;
  type: LogType;
  createdAt: Timestamp;
};

export type Dealer = {
  id: string;
  name: string;
  phone: string;
  address: string;
  createdAt: Timestamp;
};

export type StockAllocation = {
  id: string;
  inventoryItemId: string;
  dealerId: string;
  quantity: number; // This is now always the count of items allocated in this specific transaction
  allocatedImeis?: string[];
  allocatedSims?: SimCard[];
  allocatedAt: Timestamp;
  allocatedBy: string;
};

export type Event = {
  id: number;
  type: string;
  serverTime: string;
  deviceId: number;
  positionId: number;
  geofenceId: number;
  maintenanceId: number;
  attributes: {
    [key:string]: any;
  };
};

export type ApprovalRequest = {
    id: string;
    actionType: 'approve_expense' | 'mark_invoice_unpaid' | 'clear_logs';
    targetId: string;
    payload: any;
    status: 'pending' | 'approved' | 'rejected';
    requestedBy: { uid: string; name: string };
    approvals: { uid: string; name: string }[];
    rejections?: { uid: string; name: string; reason?: string }[];
    requiredApprovals: number;
    createdAt: Timestamp;
    resolvedAt?: Timestamp;
    resolvedBy?: string;
};

export type CustomCommand = {
  id: string;
  name: string;
  command: string;
  createdAt: Timestamp;
};

export type Notification = {
  id: number;
  type: string;
  attributes: {
      alarms?: string; // Comma-separated list of alarm types
      [key: string]: any;
  };
  always: boolean;
  notificators: string;
  calendarId: number;
};

export type Notificator = {
  type: string;
};

export type Person = {
  id: string;
  name: string;
  phone: string;
  type: 'employee' | 'partner';
  cnic?: string;
  status: 'active' | 'inactive';
  createdAt: Timestamp;
  updatedAt: Timestamp;
  totalIncoming: number;
  totalOutgoing: number;
  balance: number;
}

export type LedgerEntry = {
    id: string;
    date: Timestamp;
    type: 'incoming' | 'outgoing';
    description: string;
    paymentMethod: 'cash' | 'bank' | 'wallet';
    amount: number;
    addedBy: string; // User ID
    attachmentUrl?: string;
}

export type Employee = {
  id: string;
  name: string;
  phone: string;
  createdAt: Date;
};

export type Office = {
  id: string;
  name: string;
  createdAt: Date;
};

export type ReportTransaction = {
  id: string;
  date: Timestamp;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  source: 'invoice' | 'sale' | 'expense' | 'commission' | 'stock_purchase' | 'investment';
};

export type RobocallLog = {
  deviceId: number;
  userId?: number;
  eventId?: number;
  rcId?: string;
  callTo: string;
  voiceId?: string;
  vehicleNumber?: string;
  callStatus: string;
  dtmf?: string;
  dtmfProcessed?: boolean;
  errorMessage?: string;
  retryCount?: number;
  duration?: number;
  createdAt: string;
  updatedAt?: string;
  nextRetryAt?: string;
};

export type DeviceRemark = {
  id: string;
  deviceId: number;
  deviceName: string;
  customerName: string;
  phoneRobocall?: string;
  moderatorName: string;
  remarks: string;
  lastCallDate?: Timestamp;
  maintenanceRequired: boolean;
  scheduledDate?: Timestamp;
  scheduledTime?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type WalletDevice = {
  id: number;
  userId: number;
  traccarDeviceId: number;
  name: string;
  planType: 'monthly' | 'yearly';
  planPrice: number;
  dailyCost: number;
  billingStartDate: string | Date;
  lastChargedAt?: string | Date | null;
  status: 'active' | 'paused' | 'blocked';
  createdAt: string | Date;
  updatedAt: string | Date;
};

export type WalletUser = {
  id: number;
  traccarId?: number | null;
  name: string;
  phone?: string | null;
  email?: string | null;
  balance: number;
  status: 'active' | 'suspended';
  devices?: WalletDevice[];
  transactions?: WalletTransaction[];
  createdAt: string | Date;
  updatedAt: string | Date;
};

export type WalletTransaction = {
  id: number;
  userId: number;
  deviceId?: number | null;
  type: 'credit' | 'debit';
  amount: number;
  balanceAfter: number;
  description: string;
  createdAt: string | Date;
};
