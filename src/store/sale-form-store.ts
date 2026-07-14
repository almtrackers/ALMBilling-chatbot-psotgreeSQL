'use client';

import { create } from 'zustand';

type PrefillData = {
  vehicleNumber: string;
  imei: string;
  trackerId: string;
};

type SaleFormState = {
  prefillData: PrefillData | null;
  setPrefillData: (data: PrefillData | null) => void;
};

export const useSaleFormStore = create<SaleFormState>((set) => ({
  prefillData: null,
  setPrefillData: (data) => set({ prefillData: data }),
}));
