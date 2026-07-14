
'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Loader2, X, MapPin, Package, ShoppingCart, Building } from 'lucide-react';
import QRCodeScanner from '@/components/ui/qr-code-scanner';
import { useImeiSearch } from '@/hooks/use-imei-search';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function GlobalImeiSearch() {
  const [searchTerm, setSearchTerm] = useState('');
  const { result, isLoading, searchImei } = useImeiSearch();

  const handleSearch = () => {
    if (searchTerm.trim()) {
      searchImei(searchTerm.trim());
    }
  };
  
  const handleScan = (scannedImei: string) => {
      setSearchTerm(scannedImei);
      searchImei(scannedImei);
  }

  const clearSearch = () => {
    setSearchTerm('');
    searchImei(''); // Clears the results
  };

  const getResultIcon = () => {
    if (!result) return null;
    switch (result.location) {
      case 'sold':
        return <ShoppingCart className="h-4 w-4 text-primary" />;
      case 'company_vehicle':
        return <Building className="h-4 w-4 text-blue-500" />;
      case 'in_stock':
        return <Package className="h-4 w-4 text-green-500" />;
      default:
        return <MapPin className="h-4 w-4" />;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Device & SIM Locator</CardTitle>
        <CardDescription>
          Find a device or SIM across stock, sales, and company vehicles by IMEI, IMSI, or SIM number.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex w-full items-center space-x-2">
          <div className="relative flex-grow">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Enter or scan IMEI / IMSI / SIM number..."
              className="pl-8"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <QRCodeScanner onScan={handleScan} buttonText="Scan" />
          <Button onClick={handleSearch} disabled={isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
          </Button>
          {(result || searchTerm) && (
            <Button variant="ghost" size="icon" onClick={clearSearch}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {result && (
          <div className="mt-4">
            <Alert>
              <div className="flex items-center gap-2">
                {getResultIcon()}
                <AlertTitle>{result.title}</AlertTitle>
              </div>
              <AlertDescription>{result.description}</AlertDescription>
              {result.details && result.details.length > 0 && (
                <div className="mt-4 grid grid-cols-1 gap-3 border-t pt-4 sm:grid-cols-2">
                  {result.details.map((detail) => (
                    <div key={detail.label} className="space-y-0.5 text-sm">
                      <p className="text-muted-foreground">{detail.label}</p>
                      <p className="font-medium break-words">{detail.value}</p>
                    </div>
                  ))}
                </div>
              )}
            </Alert>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
