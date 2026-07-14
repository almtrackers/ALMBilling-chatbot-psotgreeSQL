import { cn } from '@/lib/utils';

type PageHeaderProps = {
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
};

export default function PageHeader({
  title,
  description,
  children,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn('flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between', className)}
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-muted-foreground">{description}</p>
        )}
      </div>
      {children && <div className="flex shrink-0 flex-col sm:flex-row gap-2">{children}</div>}
    </div>
  );
}
