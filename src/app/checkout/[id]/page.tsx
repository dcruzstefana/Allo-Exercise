"use client";

import { useState, useEffect, use } from 'react';
import Link from 'next/link';

interface Reservation {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  status: 'PENDING' | 'CONFIRMED' | 'RELEASED';
  expiresAt: string;
  product: {
    id: string;
    name: string;
    sku: string;
    description: string;
  };
  warehouse: {
    id: string;
    name: string;
    location: string;
  };
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function CheckoutPage({ params }: PageProps) {
  const { id } = use(params);

  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Timer & state
  const [timeLeft, setTimeLeft] = useState<number>(600);
  const [statusState, setStatusState] = useState<'PENDING' | 'CONFIRMED' | 'RELEASED' | 'EXPIRED'>('PENDING');

  const fetchReservation = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await fetch(`/api/reservations/${id}`);
      
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Reservation not found.');
        }
        throw new Error('Could not fetch reservation details.');
      }
      
      const data: Reservation = await res.json();
      setReservation(data);
      setStatusState(data.status);

      if (data.status === 'PENDING') {
        const diff = typeof (data as any).timeLeft === 'number'
          ? (data as any).timeLeft
          : Math.max(0, Math.floor((new Date(data.expiresAt).getTime() - Date.now()) / 1000));
        
        if (diff <= 0) {
          setStatusState('EXPIRED');
        } else {
          setTimeLeft(diff);
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReservation();
  }, [id]);

  // Expiration countdown ticker
  useEffect(() => {
    if (statusState !== 'PENDING' || loading || !reservation) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setStatusState('EXPIRED');
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [statusState, loading, reservation]);

  // Confirm Purchase
  const handleConfirm = async () => {
    if (statusState !== 'PENDING') return;
    setErrorMsg(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/reservations/${id}/confirm`, {
        method: 'POST',
      });

      const data = await res.json();

      if (res.status === 200) {
        setStatusState('CONFIRMED');
      } else if (res.status === 410) {
        setStatusState('EXPIRED');
        setErrorMsg('Reservation Expired (410): The hold window has closed and the units have been released.');
      } else {
        setErrorMsg(data.error || 'Failed to confirm purchase.');
      }
    } catch (err: any) {
      console.error("Confirm purchase failed:", err);
      setErrorMsg(`Network error: ${err.message || 'Failed to confirm purchase.'}`);
    } finally {
      setLoading(false);
    }
  };

  // Cancel/Release Reservation
  const handleCancel = async () => {
    if (statusState !== 'PENDING') return;
    setErrorMsg(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/reservations/${id}/release`, {
        method: 'POST',
      });

      const data = await res.json();

      if (res.status === 200) {
        setStatusState('RELEASED');
      } else {
        setErrorMsg(data.error || 'Failed to cancel reservation.');
      }
    } catch (err: any) {
      console.error("Cancel reservation failed:", err);
      setErrorMsg(`Network error: ${err.message || 'Failed to cancel reservation.'}`);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !reservation) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-violet-500"></div>
      </div>
    );
  }

  if (errorMsg && !reservation) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col items-center justify-center p-6 text-center space-y-6">
        <div className="p-4 rounded-xl bg-red-950/30 border border-red-900/50 text-red-400 text-sm max-w-md">
          {errorMsg}
        </div>
        <Link href="/" className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs font-bold transition-all">
          Return to Storefront
        </Link>
      </div>
    );
  }

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 font-sans p-6 md:p-12 flex items-center justify-center">
      <div className="max-w-md w-full bg-zinc-900/40 border border-zinc-900 rounded-3xl p-8 space-y-6 backdrop-blur-sm shadow-xl">
        
        {/* Header */}
        <header className="text-center space-y-1">
          <h1 className="text-2xl font-black tracking-tight text-white">Checkout</h1>
          <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
            Reservation ID: {id.substring(0, 8)}...
          </p>
        </header>

        {/* Dynamic Errors display (like 410) */}
        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-red-950/20 border border-red-900/30 text-red-400 text-xs font-semibold leading-relaxed">
            {errorMsg}
          </div>
        )}

        {/* State 1: PENDING (Active Countdown & Receipt) */}
        {statusState === 'PENDING' && reservation && (
          <div className="space-y-6">
            
            {/* Live Expiry Timer Box */}
            <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-900 text-center space-y-1">
              <span className="text-[10px] font-mono font-bold tracking-widest text-zinc-500 uppercase">
                Time Remaining to complete purchase
              </span>
              <div className="text-3xl font-mono font-black text-violet-400 tracking-tight">
                {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
              </div>
            </div>

            {/* Receipt details */}
            <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-900 space-y-4">
              <h3 className="text-xs font-mono font-bold tracking-widest text-zinc-500 uppercase pb-2.5 border-b border-zinc-900">
                Reservation Details
              </h3>
              
              <div className="space-y-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Product:</span>
                  <span className="text-zinc-200 font-bold">{reservation.product.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Warehouse:</span>
                  <span className="text-zinc-200 font-bold truncate max-w-[200px]" title={reservation.warehouse.name}>
                    {reservation.warehouse.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Quantity Held:</span>
                  <span className="text-zinc-200 font-bold">{reservation.quantity} Unit(s)</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3 pt-3 border-t border-zinc-900">
              <button
                onClick={handleConfirm}
                className="w-full bg-violet-600 hover:bg-violet-500 text-white font-extrabold py-3.5 px-4 rounded-xl text-xs transition-all active:scale-98"
              >
                Confirm Purchase
              </button>

              <button
                onClick={handleCancel}
                className="w-full bg-zinc-950 hover:bg-zinc-900 border border-zinc-900 text-zinc-400 hover:text-red-400 py-3 rounded-xl text-xs font-bold transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* State 2: CONFIRMED (Reflect state change without reload) */}
        {statusState === 'CONFIRMED' && (
          <div className="text-center space-y-6 py-6">
            <div className="w-16 h-16 bg-emerald-950/40 border border-emerald-900/30 rounded-full flex items-center justify-center mx-auto text-emerald-400">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            
            <div className="space-y-2">
              <h2 className="text-xl font-extrabold text-emerald-400">Purchase Confirmed!</h2>
              <p className="text-xs text-zinc-400 max-w-xs mx-auto leading-relaxed">
                Thank you for your order! The units have been permanently decremented from warehouse inventory.
              </p>
            </div>

            <div className="border-t border-zinc-900 pt-5">
              <Link
                href="/"
                className="block w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-100 py-3 rounded-xl text-xs font-bold text-center transition-colors"
              >
                Return to Storefront
              </Link>
            </div>
          </div>
        )}

        {/* State 3: RELEASED (Reflect cancel without reload) */}
        {statusState === 'RELEASED' && (
          <div className="text-center space-y-6 py-6">
            <div className="w-16 h-16 bg-zinc-950 border border-zinc-900 rounded-full flex items-center justify-center mx-auto text-zinc-500">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-zinc-300">Reservation Cancelled</h2>
              <p className="text-xs text-zinc-400 max-w-xs mx-auto leading-relaxed">
                This secure reservation has been successfully cancelled and the held units have been returned to available stock.
              </p>
            </div>

            <div className="border-t border-zinc-900 pt-5">
              <Link
                href="/"
                className="block w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-100 py-3 rounded-xl text-xs font-bold text-center transition-colors"
              >
                Return to Storefront
              </Link>
            </div>
          </div>
        )}

        {/* State 4: EXPIRED (Show expired error 410 or local timeout) */}
        {statusState === 'EXPIRED' && (
          <div className="text-center space-y-6 py-6">
            <div className="w-16 h-16 bg-red-950/20 border border-red-900/30 rounded-full flex items-center justify-center mx-auto text-red-500 animate-pulse">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            
            <div className="space-y-2">
              <h2 className="text-xl font-extrabold text-red-500">Hold Expired (410)</h2>
              <p className="text-xs text-zinc-400 max-w-xs mx-auto leading-relaxed">
                The secure holding window for these units has elapsed. In accordance with system specifications, the held stock has been automatically returned to the available inventory pool.
              </p>
            </div>

            <div className="border-t border-zinc-900 pt-5">
              <Link
                href="/"
                className="block w-full bg-violet-600 hover:bg-violet-500 text-white py-3 rounded-xl text-xs font-bold text-center transition-colors"
              >
                Return to Storefront
              </Link>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
