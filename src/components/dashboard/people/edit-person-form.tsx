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
import type { Person } from '@/lib/types';

const formSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters long.'),
  phone: z.string().min(1, 'Phone number is required.'),
  type: z.enum(['employee', 'partner']),
  status: z.enum(['active', 'inactive']),
  cnic: z.string().optional(),
});

type EditPersonFormProps = {
  person: Person;
  setDialogOpen: (open: boolean) => void;
};

export default function EditPersonForm({ person, setDialogOpen }: EditPersonFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { mutate } = usePersons();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: person.name,
      phone: person.phone,
      type: person.type as any,
      status: person.status as any,
      cnic: person.cnic || '',
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!user) {
      toast({ variant: 'destructive', title: 'Authentication Error' });
      return;
    }
    setIsSubmitting(true);
    
    try {
      await axios.put('/api/people', {
        id: person.id,
        ...values,
      });
      
      await addLog(`Updated person details for: "${values.name}"`, user.name, 'update');
      toast({
          title: 'Person Updated',
          description: `${values.name}'s details have been saved.`,
      });
      mutate();
      setDialogOpen(false);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err.response?.data?.error || 'Failed to update person',
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
              <FormLabel>Full Name</FormLabel>
              <FormControl>
                <Input {...field} />
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
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
         <FormField
          control={form.control}
          name="cnic"
          render={({ field }) => (
            <FormItem>
              <FormLabel>CNIC (Optional)</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
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
             <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
                <FormItem>
                <FormLabel>Status</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                    <SelectTrigger>
                        <SelectValue placeholder="Select a status" />
                    </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                </Select>
                <FormMessage />
                </FormItem>
            )}
            />
        </div>
        <div className="flex justify-end pt-4">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
