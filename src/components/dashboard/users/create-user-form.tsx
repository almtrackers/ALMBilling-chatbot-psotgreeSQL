
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
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { addLog } from '@/lib/log-service';
import { apiClient } from '@/lib/api';
import { useTraccarUsers } from '@/hooks/use-traccar-users';
import { CnicInput } from '@/components/ui/cnic-input';
import { DocumentUploadField } from '@/components/ui/document-upload-field';
import { normalizeCnic } from '@/lib/client-documents/validate';

const phoneRegex = /^03\d{9}$/;

const formSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters long.'),
  emailOrPhone: z.string().min(1, 'Email or Phone is required.'),
  password: z.string().min(6, 'Password must be at least 6 characters long.'),
  cnic: z
    .string()
    .min(1, 'CNIC is required.')
    .refine((v) => !!normalizeCnic(v), {
      message: 'Invalid CNIC. Use 13 digits or XXXXX-XXXXXXX-X.',
    }),
});

type CreateUserFormProps = {
  setDialogOpen: (open: boolean) => void;
  onUserCreated?: () => void;
};

export default function CreateUserForm({ setDialogOpen, onUserCreated }: CreateUserFormProps) {
  const { user: adminUser } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [cnicFront, setCnicFront] = useState<File | null>(null);
  const [cnicBack, setCnicBack] = useState<File | null>(null);
  const { users: existingUsers, isLoading: isLoadingUsers } = useTraccarUsers();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      emailOrPhone: '',
      password: '',
      cnic: '',
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!adminUser) {
      toast({ variant: 'destructive', title: 'Authentication Error', description: 'You must be logged in.' });
      return;
    }

    const cnic = normalizeCnic(values.cnic);
    if (!cnic) {
      toast({ variant: 'destructive', title: 'Invalid CNIC', description: 'Enter a valid 13-digit CNIC.' });
      return;
    }
    if (!cnicFront) {
      toast({ variant: 'destructive', title: 'Missing CNIC Front', description: 'CNIC Front Image is required.' });
      return;
    }
    if (!cnicBack) {
      toast({ variant: 'destructive', title: 'Missing CNIC Back', description: 'CNIC Back Image is required.' });
      return;
    }

    setIsSubmitting(true);

    const isPhone = phoneRegex.test(values.emailOrPhone);

    if (existingUsers) {
      const nameExists = existingUsers.some(
        (user) => user.name.toLowerCase() === values.name.toLowerCase()
      );
      if (nameExists) {
        toast({
          variant: 'destructive',
          title: 'User Name Exists',
          description: 'A user with this name already exists. Please choose a different name.',
        });
        setIsSubmitting(false);
        return;
      }

      const loginIdentifierExists = existingUsers.some(
        (user) =>
          (user.email && user.email.toLowerCase() === values.emailOrPhone.toLowerCase()) ||
          (user.phone && user.phone === values.emailOrPhone)
      );

      if (loginIdentifierExists) {
        toast({
          variant: 'destructive',
          title: 'Identifier Exists',
          description: 'A user with this email or phone number already exists.',
        });
        setIsSubmitting(false);
        return;
      }
    }

    try {
      const newUserPayload: Record<string, unknown> = {
        name: values.name,
        password: values.password,
        readonly: false,
        administrator: false,
        disabled: false,
        deviceLimit: -1,
        userLimit: 0,
        deviceReadonly: true,
        limitCommands: false,
        disableReports: false,
        fixedEmail: true,
        temporary: false,
        attributes: {},
      };

      if (isPhone) {
        newUserPayload.email = values.emailOrPhone;
        newUserPayload.phone = values.emailOrPhone;
      } else {
        newUserPayload.email = values.emailOrPhone;
      }

      const response = await apiClient.post('/users', newUserPayload);

      if (response.status !== 200) {
        throw new Error(`Server responded with status ${response.status}`);
      }

      const created = response.data as { id?: number };
      const formData = new FormData();
      formData.append('name', values.name);
      formData.append('cnic', cnic.formatted);
      if (created?.id) formData.append('traccarId', String(created.id));
      if (isPhone) {
        formData.append('phone', values.emailOrPhone);
        formData.append('email', values.emailOrPhone);
      } else {
        formData.append('email', values.emailOrPhone);
      }
      formData.append('cnicFront', cnicFront);
      formData.append('cnicBack', cnicBack);

      const docsRes = await fetch('/api/clients', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      const docsJson = await docsRes.json().catch(() => ({}));
      if (!docsRes.ok) {
        throw new Error(
          docsJson.message ||
            'User was created in Traccar but saving CNIC documents failed. Update documents from the users list.'
        );
      }

      await addLog(
        `Created new standard user: ${values.name} (${values.emailOrPhone}) with CNIC ${cnic.formatted}`,
        adminUser.name,
        'create'
      );
      toast({
        title: 'User Created',
        description: `${values.name} has been successfully created.`,
      });
      if (onUserCreated) onUserCreated();
      setDialogOpen(false);
    } catch (error: unknown) {
      const err = error as { message?: string; response?: { data?: { message?: string } | string } };
      let message = err.message || 'An unexpected error occurred.';
      if (err.response?.data && typeof err.response.data === 'object' && err.response.data.message) {
        message = err.response.data.message;
      } else if (
        typeof err.response?.data === 'string' &&
        err.response.data.includes('Duplicate entry')
      ) {
        message = 'A user with this email or phone number already exists.';
      }
      toast({
        variant: 'destructive',
        title: 'Failed to Create User',
        description: message,
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
                <Input placeholder="John Doe" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="emailOrPhone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email or Phone</FormLabel>
              <FormControl>
                <Input placeholder="user@example.com or 03xxxxxxxxx" {...field} />
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
              <FormLabel>CNIC</FormLabel>
              <FormControl>
                <CnicInput value={field.value} onChange={field.onChange} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <DocumentUploadField
          label="CNIC Front Image"
          value={cnicFront}
          onChange={setCnicFront}
          required
          disabled={isSubmitting}
        />
        <DocumentUploadField
          label="CNIC Back Image"
          value={cnicBack}
          onChange={setCnicBack}
          required
          disabled={isSubmitting}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <div className="relative">
                <FormControl>
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    {...field}
                  />
                </FormControl>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute inset-y-0 right-0 h-full px-3"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  <span className="sr-only">
                    {showPassword ? 'Hide password' : 'Show password'}
                  </span>
                </Button>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end pt-4">
          <Button type="submit" disabled={isSubmitting || isLoadingUsers}>
            {isSubmitting || isLoadingUsers ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {isSubmitting ? 'Creating...' : 'Loading...'}
              </>
            ) : (
              'Create User'
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
