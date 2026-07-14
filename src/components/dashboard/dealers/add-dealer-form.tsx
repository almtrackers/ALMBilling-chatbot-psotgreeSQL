
'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { addLog } from '@/lib/log-service';
import { Textarea } from '@/components/ui/textarea';
import type { Dealer } from '@/lib/types';
import axios from 'axios';
import { useDealers } from '@/hooks/use-dealers';

const formSchema = z.object({
  name: z.string().min(2, 'Dealer name must be at least 2 characters long.'),
  phone: z.string().min(1, 'Phone number is required.'),
  address: z.string().min(1, 'Address is required.'),
});

type AddDealerFormProps = {
  setDialogOpen: (open: boolean) => void;
  dealerToEdit?: Dealer;
};

export default function AddDealerForm({ setDialogOpen, dealerToEdit }: AddDealerFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { mutate } = useDealers();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditMode = !!dealerToEdit;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      phone: '',
      address: '',
    },
  });
  
  useEffect(() => {
    if (isEditMode && dealerToEdit) {
      form.reset({
        name: dealerToEdit.name,
        phone: dealerToEdit.phone,
        address: dealerToEdit.address,
      });
    }
  }, [isEditMode, dealerToEdit, form]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Authentication Error',
        description: 'You must be logged in to manage dealers.',
      });
      return;
    }
    setIsSubmitting(true);

    try {
      if (isEditMode && dealerToEdit) {
        // Update existing dealer
        await axios.put('/api/dealers', {
          id: dealerToEdit.id,
          name: values.name,
          phone: values.phone,
          address: values.address,
        });
        await addLog(`Updated dealer: "${values.name}"`, user.name, 'update');
        toast({
          title: 'Dealer Updated',
          description: `${values.name}'s details have been updated.`,
        });
      } else {
        // Add new dealer
        await axios.post('/api/dealers', {
          name: values.name,
          phone: values.phone,
          address: values.address,
        });
        await addLog(`Added new dealer: "${values.name}"`, user.name, 'create');
        toast({
          title: 'Dealer Added',
          description: `${values.name} has been added to your dealers.`,
        });
      }
      mutate();
      setDialogOpen(false);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err.response?.data?.message || 'Failed to save dealer',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Dealer Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g., John Doe" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Phone Number</FormLabel>
              <FormControl>
                <Input placeholder="e.g., 03001234567" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Address</FormLabel>
              <FormControl>
                <Textarea placeholder="Enter the dealer's full address" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end pt-4">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              isEditMode ? 'Save Changes' : 'Save Dealer'
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
