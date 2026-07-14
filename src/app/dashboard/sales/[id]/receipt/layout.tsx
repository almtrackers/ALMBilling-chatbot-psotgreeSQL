
'use client';

export default function PrintLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <style jsx global>{`
        @media print {
          @page {
            size: 80mm auto; /* Set page size for POS printer */
            margin: 4mm;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .no-print {
            display: none !important;
          }
          main {
            padding: 0 !important;
            margin: 0 !important;
          }
        }
      `}</style>
      <div className="bg-background min-h-screen">{children}</div>
    </>
  );
}
