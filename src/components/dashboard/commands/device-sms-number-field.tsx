
'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { toSmsE164 } from '@/lib/utils';
import { Combobox } from '@/components/ui/combobox';

type SimSearchResult = {
  id: string;
  simNumber: string;
  imsi: string | null;
  vehicleNumber: string | null;
  source: 'installed' | 'company' | 'inventory';
  status: string | null;
};

type DeviceSmsNumberFieldProps = {
  deviceId: string | null;
  enabled: boolean;
  value: string;
  onChange: (value: string) => void;
  imsi?: string | null;
  onImsiLoaded?: (imsi: string | null) => void;
};

export default function DeviceSmsNumberField({
  deviceId,
  enabled,
  value,
  onChange,
  imsi,
  onImsiLoaded,
}: DeviceSmsNumberFieldProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [source, setSource] = useState<'sale' | 'device' | null>(null);
  const [simOptions, setSimOptions] = useState<SimSearchResult[]>([]);

  useEffect(() => {
    if (!enabled || !deviceId) {
      onChange('');
      onImsiLoaded?.(null);
      setSource(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    fetch(`/api/commands/device-sim?deviceId=${deviceId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.success) {
          onChange(data.simNumber || data.smsTo || '');
          onImsiLoaded?.(data.imsi || null);
          setSource(data.source || null);
        } else {
          onChange('');
          onImsiLoaded?.(null);
          setSource(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          onChange('');
          onImsiLoaded?.(null);
          setSource(null);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only refetch when device changes
  }, [deviceId, enabled]);

  useEffect(() => {
    if (!enabled) {
      setSimOptions([]);
      return;
    }

    let cancelled = false;
    fetch('/api/commands/sim-search')
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled && data.success && Array.isArray(data.results)) {
          setSimOptions(data.results);
        }
      })
      .catch(() => {
        if (!cancelled) setSimOptions([]);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (!enabled) return null;

  const e164Preview = value.trim() ? toSmsE164(value.trim()) : null;
  const options = simOptions.map((sim) => ({
    value: sim.simNumber,
    label: [
      sim.simNumber,
      sim.imsi ? `IMSI ${sim.imsi}` : '',
      sim.vehicleNumber ? `Vehicle ${sim.vehicleNumber}` : '',
      sim.source === 'inventory' ? `Inventory · ${sim.status || 'available'}` : 'Installed',
    ]
      .filter(Boolean)
      .join(' · '),
  }));

  return (
    <div className="space-y-1.5 w-full">
      <Label htmlFor="sms-number" className="text-sm">
        SIM Number
        {isLoading && <Loader2 className="inline ml-2 h-3 w-3 animate-spin" />}
      </Label>
      <Combobox
        options={options}
        value={value}
        onChange={onChange}
        placeholder="Search or type SIM number..."
        searchPlaceholder="Search vehicle, IMSI, or mobile number..."
        noResultsMessage="No matching SIM. Type a number manually."
        disabled={isLoading}
        allowCustomValue
      />
      <Input
        id="sms-number"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Or type manually: 03001234567"
        disabled={isLoading}
        className="font-mono"
      />
      {source === 'sale' && value && (
        <p className="text-xs text-muted-foreground">Loaded from sale record — edit if needed.</p>
      )}
      {source === 'device' && value && (
        <p className="text-xs text-muted-foreground">Loaded from device — edit if needed.</p>
      )}
      {!value && !isLoading && (
        <p className="text-xs text-muted-foreground">
          Search installed or inventory SIMs by vehicle, IMSI, or mobile number, or enter manually.
        </p>
      )}
      {e164Preview && (
        <p className="text-xs text-muted-foreground">Will send as {e164Preview}</p>
      )}
      {imsi && (
        <p className="text-xs text-muted-foreground font-mono">IMSI: {imsi}</p>
      )}
    </div>
  );
}
