
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Search } from 'lucide-react';
import QRCodeScanner from './ui/qr-code-scanner';

export default function VerifyPaymentDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [receiptId, setReceiptId] = useState('');
  const router = useRouter();

  const handleVerify = () => {
    if (receiptId.trim()) {
      router.push(`/verify?id=${receiptId.trim()}`);
      setIsOpen(false);
    }
  };

  const handleScan = (scannedId: string) => {
    // If the scanned data is a URL, extract the ID parameter
    try {
      const url = new URL(scannedId);
      const id = url.searchParams.get('id');
      if (id) {
        router.push(`/verify?id=${id}`);
        setIsOpen(false);
        return;
      }
    } catch (e) {
      // Not a URL, treat as a direct ID
    }
    router.push(`/verify?id=${scannedId}`);
    setIsOpen(false);
  };


  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="link">Verify Payment Receipt</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Verify Receipt</DialogTitle>
          <DialogDescription>
            Scan a QR code or enter the Sale/Invoice ID from your receipt to
            verify its status.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-center py-4">
            <QRCodeScanner 
                onScan={handleScan}
                buttonText="Scan QR Code"
            />
        </div>
        <div className="relative flex items-center justify-center">
            <div className="absolute left-0 top-0 bottom-0 w-full border-b" />
            <span className="relative bg-background px-2 text-sm text-muted-foreground">OR</span>
        </div>
        <div className="space-y-2 py-4">
          <Label htmlFor="receipt-id">Enter Receipt ID</Label>
          <Input
            id="receipt-id"
            placeholder="e.g., 1001 or SALE-XYZ"
            value={receiptId}
            onChange={(e) => setReceiptId(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button onClick={handleVerify} disabled={!receiptId.trim()}>
            <Search className="mr-2 h-4 w-4" />
            Verify
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
