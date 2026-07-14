
'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import axios from 'axios';
import { Loader2, Download } from 'lucide-react';
import type { InventoryItem, SimCard } from '@/lib/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/contexts/auth-context';
import { addLog } from '@/lib/log-service';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useInventory } from '@/hooks/use-inventory';


type ItemType = InventoryItem['type'];

const CSV_CONFIG: Record<
  ItemType,
  { headers: string[]; sampleData: string; description: string }
> = {
  tracker: {
    headers: ['name', 'cost', 'supplier', 'imei'],
    sampleData: 'name,cost,supplier,imei\nGT-06 Tracker,3500,China Vendor,123456789012345\nGT-06 Tracker,3500,China Vendor,987654321098765',
    description: 'Each row represents a single tracker. The `quantity` is determined by the number of unique IMEIs provided.',
  },
  sim: {
    headers: ['name', 'cost', 'supplier', 'simNumber', 'imsi'],
    sampleData: 'name,cost,supplier,simNumber,imsi\nJazz SIM,150,Jazz,03001234567,1111\nJazz SIM,150,Jazz,03007654321,2222',
    description: 'Each row represents a single SIM card. Ensure `simNumber` and 4-digit `imsi` are provided for each.',
  },
  relay: {
    headers: ['name', 'quantity', 'cost', 'supplier'],
    sampleData: 'name,quantity,cost,supplier\nStandard Relay,50,200,Local Shop',
    description: '`quantity` column is required for bulk items.',
  },
  wire_plug_harness: {
    headers: ['name', 'quantity', 'cost', 'supplier'],
    sampleData: 'name,quantity,cost,supplier\nGT-06 Harness,50,150,Local Shop',
     description: '`quantity` column is required for bulk items.',
  },
  mic: {
    headers: ['name', 'quantity', 'cost', 'supplier'],
    sampleData: 'name,quantity,cost,supplier\nStandard Mic,20,100,Local Shop',
    description: '`quantity` column is required for bulk items.',
  },
  sos_button: {
    headers: ['name', 'quantity', 'cost', 'supplier'],
    sampleData: 'name,quantity,cost,supplier\nSOS Button,20,120,Local Shop',
    description: '`quantity` column is required for bulk items.',
  },
  other: {
    headers: ['name', 'quantity', 'cost', 'supplier'],
    sampleData: 'name,quantity,cost,supplier\nPackaging Box,100,50,Local Market',
    description: '`quantity` column is required for bulk items.',
  },
};

type ImportInventoryDialogProps = {
  setDialogOpen: (open: boolean) => void;
};

export default function ImportInventoryDialog({
  setDialogOpen,
}: ImportInventoryDialogProps) {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const { toast } = useToast();
  const [itemType, setItemType] = useState<ItemType | null>(null);

  const { inventoryItems, isLoading: isLoadingInventory, mutate } = useInventory();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const selectedFile = event.target.files[0];
      if (selectedFile.type !== 'text/csv') {
        toast({
          variant: 'destructive',
          title: 'Invalid File Type',
          description: 'Please upload a valid CSV file.',
        });
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleDownloadSample = () => {
    if (!itemType) return;
    const config = CSV_CONFIG[itemType];
    const blob = new Blob([config.sampleData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${itemType}_sample.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const handleImport = async () => {
    if (!file || !itemType || !user || !inventoryItems) {
      toast({
        variant: 'destructive',
        title: 'Prerequisites Missing',
        description: 'Please select an item type, a CSV file, and ensure you are logged in.',
      });
      return;
    }

    setIsImporting(true);
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const rows = text.split('\n').map(r => r.trim()).filter(Boolean);
        const headerLine = rows.shift();
        const header = headerLine?.replace(/^\uFEFF/, '').split(',').map(h => h.trim());
        
        const requiredConfig = CSV_CONFIG[itemType];

        if (!header || !requiredConfig.headers.every(h => header.includes(h))) {
          toast({
            variant: 'destructive',
            title: 'Invalid CSV Header',
            description: `File must contain the headers: ${requiredConfig.headers.join(', ')}`,
          });
          setIsImporting(false);
          return;
        }

        const indices = Object.fromEntries(requiredConfig.headers.map(h => [h, header.indexOf(h)]));
        
        // Group rows by name, cost, and supplier
        const groupedItems = new Map<string, any[]>();
        for (const row of rows) {
          const values = row.split(',');
          const name = values[indices['name']]?.trim().replace(/"/g, '');
          const cost = values[indices['cost']]?.trim().replace(/"/g, '');
          const supplier = values[indices['supplier']]?.trim().replace(/"/g, '');
          if (!name) continue;

          const groupKey = `${name}|${cost || 0}|${supplier || ''}`;
          if (!groupedItems.has(groupKey)) {
            groupedItems.set(groupKey, []);
          }
          groupedItems.get(groupKey)?.push(values);
        }

        const itemsToSubmit = [];
        for (const [groupKey, groupRows] of groupedItems.entries()) {
          const [name, cost, supplier] = groupKey.split('|');
          const item: any = {
            name,
            cost: Number(cost) || 0,
            supplier: supplier || '',
          };

          if (itemType === 'tracker') {
            item.imeis = groupRows.map(row => row[indices['imei']]?.trim()).filter(Boolean);
            item.quantity = item.imeis.length;
          } else if (itemType === 'sim') {
            item.sims = groupRows.map(row => ({
              simNumber: row[indices['simNumber']]?.trim(),
              imsi: row[indices['imsi']]?.trim(),
            })).filter(sim => sim.simNumber && sim.imsi);
            item.quantity = item.sims.length;
          } else {
            item.quantity = groupRows.reduce((sum, row) => sum + (Number(row[indices['quantity']]) || 0), 0);
          }
          itemsToSubmit.push(item);
        }

        const response = await axios.post('/api/inventory/bulk', {
          items: itemsToSubmit,
          itemType: itemType,
        });

        if (response.data.success) {
          const { itemsAddedCount, logDetails } = response.data;
          if (itemsAddedCount > 0) {
            const logSummary = Object.entries(logDetails).map(([name, qty]) => `${qty} x ${name}`).join(', ');
            await addLog(`Imported inventory via CSV: ${logSummary}`, user.name, 'create');
            toast({
              title: 'Import Successful',
              description: `${itemsAddedCount} item(s)/records have been added or updated.`,
            });
            mutate();
            setDialogOpen(false);
          } else {
            toast({
              title: 'No New Items Imported',
              description: 'The items in the CSV may already exist in your inventory or contain no new data.',
            });
          }
        } else {
          throw new Error(response.data.message || 'Failed to import inventory');
        }
      } catch (error: any) {
        toast({
          variant: 'destructive',
          title: 'Import Failed',
          description: error.message || 'An unexpected error occurred.',
        });
      } finally {
        setIsImporting(false);
      }
    };

    reader.readAsText(file);
  };
  
  const currentConfig = itemType ? CSV_CONFIG[itemType] : null;

  return (
    <div className="grid gap-6 py-4">
        <div className="grid w-full items-center gap-2">
            <Label htmlFor="item-type-select">1. Select Item Type to Import</Label>
             <Select onValueChange={(value: ItemType) => setItemType(value)}>
                <SelectTrigger id="item-type-select">
                    <SelectValue placeholder="Choose an item type..." />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="tracker">Tracker</SelectItem>
                    <SelectItem value="sim">SIM Card</SelectItem>
                    <SelectItem value="relay">Relay</SelectItem>
                    <SelectItem value="wire_plug_harness">Wire/Plug Harness</SelectItem>
                    <SelectItem value="mic">Microphone</SelectItem>
                    <SelectItem value="sos_button">SOS Button</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                </SelectContent>
            </Select>
        </div>

      {itemType && currentConfig && (
        <div className="space-y-4">
             <Alert>
                <AlertTitle>CSV Format for "{itemType}"</AlertTitle>
                <AlertDescription>
                <p className="mt-1">{currentConfig.description}</p>
                <p className="mt-2">
                    Your CSV must have the headers:{' '}
                    <code className="font-mono text-xs bg-muted p-1 rounded-sm">
                    {currentConfig.headers.join(', ')}
                    </code>
                </p>
                </AlertDescription>
            </Alert>
            <Button variant="outline" size="sm" onClick={handleDownloadSample}>
                <Download className="mr-2 h-4 w-4" />
                Download Sample CSV
            </Button>
        </div>
      )}

      <div className="grid w-full max-w-sm items-center gap-2">
        <Label htmlFor="inventory-file">2. Upload CSV File</Label>
        <Input
          id="inventory-file"
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          disabled={!itemType}
        />
      </div>

      <div className="flex justify-end">
        <Button onClick={handleImport} disabled={!file || !itemType || isImporting || isLoadingInventory}>
          {isImporting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Importing...
            </>
          ) : (
            'Start Import'
          )}
        </Button>
      </div>
    </div>
  );
}
