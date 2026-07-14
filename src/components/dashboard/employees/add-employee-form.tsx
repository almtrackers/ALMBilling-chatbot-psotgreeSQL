
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
import { useEmployees } from '@/hooks/use-employees';

const formSchema = z.object({
  name: z.string().min(2, 'Employee name must be at least 2 characters long.'),
  phone: z.string().min(1, 'Phone number is required.'),
});

type AddEmployeeFormProps = {
  setDialogOpen: (open: boolean) => void;
};

export default function AddEmployeeForm({ setDialogOpen }: AddEmployeeFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { mutate } = useEmployees();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      phone: '',
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Authentication Error',
        description: 'You must be logged in to add an employee.',
      });
      return;
    }
    setIsSubmitting(true);
    
    try {
      const response = await axios.post('/api/employees', {
        name: values.name,
        phone: values.phone,
      });
      
      const newEmployee = response.data;

      await addLog(`Added new employee: "${values.name}" (ID: ${newEmployee.id})`, user.name, 'create');
      toast({
          title: 'Employee Added',
          description: `${values.name} has been added.`,
      });
      mutate();
      setDialogOpen(false);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err.response?.data?.message || 'Failed to add employee',
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
              <FormLabel>Employee Name</FormLabel>
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
        <div className="flex justify-end pt-4">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Employee'
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
