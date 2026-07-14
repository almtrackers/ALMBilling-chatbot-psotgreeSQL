
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
import axios from 'axios';
import { useAuth } from '@/contexts/auth-context';
import { addLog } from '@/lib/log-service';
import { useCommands } from '@/hooks/use-commands';
import { Textarea } from '@/components/ui/textarea';
import type { CustomCommand } from '@/lib/types';

const formSchema = z.object({
  name: z.string().min(2, 'Command name must be at least 2 characters.'),
  command: z.string().min(1, 'Command string is required.'),
});

type AddCommandFormProps = {
  commandToEdit?: CustomCommand;
  onFinished?: () => void;
};

export default function AddCommandForm({ commandToEdit, onFinished }: AddCommandFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { mutate } = useCommands();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditMode = !!commandToEdit;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      command: '',
    },
  });
  
  useEffect(() => {
    if (isEditMode && commandToEdit) {
      form.reset(commandToEdit);
    }
  }, [isEditMode, commandToEdit, form]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Authentication Error',
        description: 'You must be logged in to manage commands.',
      });
      return;
    }
    setIsSubmitting(true);

    try {
      if (isEditMode && commandToEdit) {
        // Update existing command
        await axios.put('/api/commands', {
          id: commandToEdit.id,
          ...values,
        });
        await addLog(`Updated custom command: "${values.name}"`, user.name, 'update');
        toast({
          title: 'Command Updated',
          description: `The command "${values.name}" has been updated.`,
        });
      } else {
        // Add new command
        await axios.post('/api/commands', values);

        await addLog(`Added new custom command: "${values.name}"`, user.name, 'create');
        toast({
          title: 'Command Added',
          description: `The command "${values.name}" has been saved.`,
        });
        form.reset();
      }
      mutate();
      if (onFinished) {
        onFinished();
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.message || 'Failed to save command',
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
              <FormLabel>Command Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Get Parameters" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
         <FormField
          control={form.control}
          name="command"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Command String</FormLabel>
              <FormControl>
                <Input placeholder="e.g., PARAM#" {...field} />
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
              isEditMode ? 'Save Changes' : 'Save Command'
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
