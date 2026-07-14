
'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/contexts/auth-context';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { addLog } from '@/lib/log-service';
import { useUserPin } from '@/hooks/use-user-pin';

const formSchema = z
  .object({
    pin: z.string().length(6, 'PIN must be 6 digits.'),
    confirmPin: z.string(),
  })
  .refine((data) => data.pin === data.confirmPin, {
    message: "PINs don't match.",
    path: ['confirmPin'],
  });

export default function SecuritySettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { pinStatus, mutate: mutatePinStatus } = useUserPin(user?.traccarId);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      pin: '',
      confirmPin: '',
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!user?.email) return;

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/auth/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          traccarId: user.id,
          pin: values.pin,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = 'Failed to update PIN';
        
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        
        throw new Error(errorMessage);
      }

      await addLog('Updated security PIN', user.name, 'update');
      toast({
        title: 'PIN Updated',
        description: 'Your security PIN has been updated successfully.',
      });
      form.reset();
      mutatePinStatus();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: error.message || 'An unexpected error occurred.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Security PIN</CardTitle>
          <CardDescription>
            {pinStatus?.hasPin
              ? 'You have a PIN set. You can change it here.'
              : 'Set a 6-digit PIN to secure sensitive actions.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-w-sm">
              <FormField
                control={form.control}
                name="pin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New 6-Digit PIN</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        maxLength={6}
                        placeholder="000000"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm PIN</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        maxLength={6}
                        placeholder="000000"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  'Update PIN'
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
