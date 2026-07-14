
'use client';

import { useMemo } from 'react';
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
  TableFooter,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import type { Transaction } from '@/hooks/use-transactions';

type InvestmentDetailsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  investments: Transaction[];
};

export default function InvestmentDetailsDialog({
  open,
  onOpenChange,
  investments,
}: InvestmentDetailsDialogProps) {
    
  const investmentSummary = useMemo(() => {
    if (!investments || investments.length === 0) {
      return { byPerson: [], total: 0 };
    }

    const summaryMap = new Map<string, number>();
    investments.forEach(inv => {
        // Description is expected to be "Investment from [Person Name]"
        const personName = inv.description.replace('Investment from ', '');
        summaryMap.set(personName, (summaryMap.get(personName) || 0) + inv.amount);
    });

    const byPerson = Array.from(summaryMap.entries()).map(([name, amount]) => ({ name, amount }));
    const total = investments.reduce((acc, inv) => acc + inv.amount, 0);

    return { byPerson, total };
  }, [investments]);


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Investment Breakdown</DialogTitle>
          <DialogDescription>
            A summary of all capital investment from partners and employees.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Investor</TableHead>
                <TableHead className="text-right">Total Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {investmentSummary.byPerson.length > 0 ? (
                investmentSummary.byPerson.map((item) => (
                  <TableRow key={item.name}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-right">PKR {item.amount.toLocaleString()}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={2} className="h-24 text-center">
                    No investments found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
             <TableFooter>
                <TableRow>
                    <TableCell className="font-bold">Total Investment</TableCell>
                    <TableCell className="text-right font-bold">PKR {investmentSummary.total.toLocaleString()}</TableCell>
                </TableRow>
            </TableFooter>
          </Table>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
