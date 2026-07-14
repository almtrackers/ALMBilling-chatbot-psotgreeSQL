
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
            size: 80mm auto;
            margin: 4mm;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            background: white !important;
          }
          .no-print,
          header,
          nav,
          footer,
          aside {
            display: none !important;
          }
          main {
            padding: 0 !important;
            margin: 0 !important;
            height: auto !important;
          }
          body * {
            visibility: hidden !important;
          }
          #single-invoice,
          #single-invoice * {
            visibility: visible !important;
          }
          #single-invoice {
            position: absolute !important;
            top: 0;
            left: 0;
            width: 100% !important;
            background: white !important;
            box-shadow: none !important;
          }
        }
      `}</style>
      <div id="single-invoice" className="receipt-print-root bg-background min-h-screen">
        {children}
      </div>
    </>
  );
}
