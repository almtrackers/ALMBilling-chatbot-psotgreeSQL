
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import axios from 'axios';
import { useAuth } from '@/contexts/auth-context';
import { addLog } from '@/lib/log-service';
import { usePersons } from '@/hooks/use-persons';

const formSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters long.'),
  phone: z.string().min(1, 'Phone number is required.'),
  type: z.enum(['employee', 'partner'], {
    required_error: 'You must select a type.',
  }),
});

type AddPersonFormProps = {
  setDialogOpen: (open: boolean) => void;
};

export default function AddPersonForm({ setDialogOpen }: AddPersonFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { mutate } = usePersons();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      phone: '',
      type: 'employee',
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Authentication Error',
        description: 'You must be logged in to add a person.',
      });
      return;
    }
    setIsSubmitting(true);

    try {
      await axios.post('/api/people', {
        name: values.name,
        phone: values.phone,
        type: values.type,
        status: 'active',
      });
      
      await addLog(`Added new ${values.type}: "${values.name}"`, user.name, 'create');
      toast({
          title: 'Person Added',
          description: `${values.name} has been added as a new ${values.type}.`,
      });
      mutate();
      setDialogOpen(false);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err.response?.data?.error || 'Failed to add person',
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
              <FormLabel>Full Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Ali Khan" {...field} />
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
                <Input placeholder="e.g., +923001234567" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="partner">Partner</SelectItem>
                </SelectContent>
              </Select>
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
              'Save Person'
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
