'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { format } from 'date-fns';
import type { BillingHistoryRow } from '@/hooks/use-billing-health';
import { Badge } from '@/components/ui/badge';

type BillingBreakdownDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: BillingHistoryRow | null;
};

export default function BillingBreakdownDialog({
  open,
  onOpenChange,
  row,
}: BillingBreakdownDialogProps) {
  if (!row) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Billing Breakdown: {row.deviceName}</DialogTitle>
          <DialogDescription>
            Detailed calculation of expected amounts since installation for {row.customerName}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <p className="text-muted-foreground">Installation Date</p>
              <p className="font-medium">
                {row.installationDate ? format(row.installationDate, 'PPP') : 'N/A'}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground">Renewal Fee</p>
              <p className="font-medium">
                PKR {row.renewalFee.toLocaleString()} ({row.periodType})
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Calculation Steps</h3>
            <p className="text-xs text-muted-foreground">
              Note: The first period immediately after installation is exempt from billing.
            </p>
            
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Period Range</TableHead>
                  <TableHead>Breakdown</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Show exempt period */}
                <TableRow className="bg-muted/30 italic">
                  <TableCell>0</TableCell>
                  <TableCell>
                    {row.installationDate ? (
                      <>
                        {format(row.installationDate, 'MMM d, yyyy')} —{' '}
                        {format(row.periods.length > 0 ? row.periods[0].start : new Date(), 'MMM d, yyyy')}
                      </>
                    ) : 'N/A'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">Exempt (1st Period)</Badge>
                  </TableCell>
                  <TableCell className="text-right">PKR 0.00</TableCell>
                </TableRow>

                {/* Show billed periods */}
                {row.periods.map((period) => (
                  <TableRow key={period.index}>
                    <TableCell>{period.index}</TableCell>
                    <TableCell>
                      {format(period.start, 'MMM d, yyyy')} —{' '}
                      {format(period.end, 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      <div className="text-[10px] space-y-0.5">
                        <div>Base: {period.breakdown.renewalFee.toLocaleString()}</div>
                        {period.breakdown.simCharges > 0 && <div>SIM: +{period.breakdown.simCharges.toLocaleString()}</div>}
                        {period.breakdown.otherCharges > 0 && <div>Other: +{period.breakdown.otherCharges.toLocaleString()}</div>}
                        {period.breakdown.discount > 0 && <div className="text-green-600">Disc: -{period.breakdown.discount.toLocaleString()}</div>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      PKR {period.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="border-t pt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Expected Amount:</span>
              <span className="font-semibold">PKR {row.expectedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Paid Amount:</span>
              <span className="font-semibold text-green-600">PKR {row.paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-base border-t pt-2">
              <span className="font-bold">Remaining Balance:</span>
              <span className={`font-bold ${row.remainingAmount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                PKR {row.remainingAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
