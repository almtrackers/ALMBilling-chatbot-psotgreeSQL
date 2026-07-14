
'use client';

import { useState } from 'react';
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
import axios from 'axios';
import { useOffices } from '@/hooks/use-offices';

const formSchema = z.object({
  name: z.string().min(2, 'Office name must be at least 2 characters long.'),
});

type AddOfficeFormProps = {
  setDialogOpen: (open: boolean) => void;
};

export default function AddOfficeForm({ setDialogOpen }: AddOfficeFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { mutate } = useOffices();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Authentication Error',
        description: 'You must be logged in to add an office.',
      });
      return;
    }
    setIsSubmitting(true);

    try {
      const response = await axios.post('/api/offices', {
        name: values.name,
      });
      
      const newOffice = response.data;
      
      await addLog(`Added new office: "${values.name}" (ID: ${newOffice.id})`, user.name, 'create');
      toast({
          title: 'Office Added',
          description: `${values.name} has been added to your locations.`,
      });
      mutate();
      setDialogOpen(false);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err.response?.data?.message || 'Failed to add office',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Office Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Lahore Head Office" {...field} />
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
              'Save Office'
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
