'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Download } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { addLog } from '@/lib/log-service';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { format } from 'date-fns';
import { localApiClient } from '@/lib/api';

const CSV_SAMPLE_DATA = 'customerName,vehicleNumber,amount,date,imei,simNumber,imsi,phoneRobocall,contactNumber,createdBy,notes\nJohn Doe,ABC-123,7500,2024-01-15 14:30:00,123456789012345,03001234567,1111,03001234567,03001234567,Admin,First installation\nJane Smith,XYZ-789,8000,2024-01-16 10:00:00,987654321098765,03017654321,2222,03017654321,03017654321,Admin,Special discount given';
const CSV_HEADERS = ['customerName', 'vehicleNumber', 'amount', 'date', 'imei', 'simNumber', 'imsi', 'phoneRobocall', 'contactNumber', 'createdBy', 'notes'];

type ImportSalesDialogProps = {
  setDialogOpen: (open: boolean) => void;
};

export default function ImportSalesDialog({
  setDialogOpen,
}: ImportSalesDialogProps) {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const { toast } = useToast();

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
    const blob = new Blob([CSV_SAMPLE_DATA], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `sales_import_sample.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const handleImport = async () => {
    if (!file || !user) {
      toast({
        variant: 'destructive',
        title: 'Prerequisites Missing',
        description: 'Please select a CSV file and ensure you are logged in.',
      });
      return;
    }

    setIsImporting(true);
    const reader = new FileReader();

    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const rows = text.split('\n').map(r => r.trim()).filter(Boolean);
      const headerLine = rows.shift();
      const header = headerLine?.replace(/^\uFEFF/, '').split(',').map(h => h.trim());

      if (!header || !CSV_HEADERS.every(h => header.includes(h))) {
        toast({
          variant: 'destructive',
          title: 'Invalid CSV Header',
          description: `File must contain the headers: ${CSV_HEADERS.join(', ')}`,
        });
        setIsImporting(false);
        return;
      }

      const indices = Object.fromEntries(CSV_HEADERS.map(h => [h, header.indexOf(h)]));

      try {
        const salesToImport = [];

        for (const row of rows) {
          const values = row.split(',');
          const dateStr = values[indices['date']]?.trim().replace(/"/g, '');
          const amountStr = values[indices['amount']]?.trim().replace(/"/g, '');

          if (!dateStr || !amountStr) continue;

          salesToImport.push({
            customerName: values[indices['customerName']]?.trim().replace(/"/g, '') || '',
            vehicleNumber: values[indices['vehicleNumber']]?.trim().replace(/"/g, '') || '',
            amount: Number(amountStr) || 0,
            date: dateStr,
            imei: values[indices['imei']]?.trim().replace(/"/g, '') || '',
            simNumber: values[indices['simNumber']]?.trim().replace(/"/g, '') || '',
            imsi: values[indices['imsi']]?.trim().replace(/"/g, '') || '',
            phoneRobocall: values[indices['phoneRobocall']]?.trim().replace(/"/g, '') || '',
            contactNumber: values[indices['contactNumber']]?.trim().replace(/"/g, '') || '',
            createdBy: values[indices['createdBy']]?.trim().replace(/"/g, '') || user.name,
            notes: values[indices['notes']]?.trim().replace(/"/g, '') || '',
          });
        }

        if (salesToImport.length > 0) {
          const response = await localApiClient.post('/sales/bulk', {
            items: salesToImport,
            userName: user.name,
          });

          if (response.data.success) {
            const count = response.data.count;
            await addLog(`Imported ${count} sales via CSV`, user.name, 'create');
            toast({
              title: 'Import Successful',
              description: `${count} sale(s) have been added.`,
            });
            setDialogOpen(false);
          } else {
            throw new Error(response.data.message || 'Import failed');
          }
        } else {
          toast({
            title: 'No New Sales Imported',
            description: 'The CSV may contain no valid data or may be empty.',
          });
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

  return (
    <div className="grid gap-6 py-4">
        <Alert>
            <AlertTitle>CSV Format for Sales Import</AlertTitle>
            <AlertDescription>
                <p className="mt-1">Each row represents a single sale record.</p>
                <p className="mt-2">
                    Required headers:{' '}
                    <code className="font-mono text-xs bg-muted p-1 rounded-sm">
                        {CSV_HEADERS.join(', ')}
                    </code>
                </p>
            </AlertDescription>
        </Alert>
        
        <Button variant="outline" size="sm" onClick={handleDownloadSample}>
            <Download className="mr-2 h-4 w-4" />
            Download Sample CSV
        </Button>

      <div className="grid w-full max-w-sm items-center gap-2">
        <Label htmlFor="sales-file">Upload CSV File</Label>
        <Input
          id="sales-file"
          type="file"
          accept=".csv"
          onChange={handleFileChange}
        />
      </div>

      <div className="flex justify-end">
        <Button onClick={handleImport} disabled={!file || isImporting}>
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
