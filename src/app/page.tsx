"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ShoppingBag, Building2, Layers, AlertCircle, Clock } from 'lucide-react';

interface Warehouse {
  id: string;
  name: string;
  location: string;
}

interface Stock {
  id: string;
  productId: string;
  warehouseId: string;
  totalUnits: number;
  reservedUnits: number;
  warehouse: Warehouse;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  description: string;
  stockLevels: Stock[];
}

interface ActiveHold {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  status: 'PENDING' | 'CONFIRMED' | 'RELEASED';
  expiresAt: string;
  product: {
    name: string;
    sku: string;
  };
  warehouse: {
    name: string;
  };
  timeLeft?: number; // seconds
}

export default function Home() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [reservingKey, setReservingKey] = useState<string | null>(null); // productId_warehouseId
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeHolds, setActiveHolds] = useState<ActiveHold[]>([]);

  const fetchProducts = async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      const res = await fetch('/api/products');
      if (!res.ok) throw new Error('Failed to load products');
      const data = await res.json();
      setProducts(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred while loading products');
    } finally {
      setLoading(false);
    }
  };

  // Sync local holds from localStorage safely
  const syncHolds = async () => {
    const storedIdsRaw = localStorage.getItem('allo_reservations');
    if (!storedIdsRaw) return;

    try {
      const ids: string[] = JSON.parse(storedIdsRaw);
      const holdsDetails: ActiveHold[] = [];
      const validIds: string[] = [];

      await Promise.all(
        ids.map(async (id) => {
          try {
            const res = await fetch(`/api/reservations/${id}`);
            if (res.status === 200) {
              const hold: ActiveHold = await res.json();
              if (hold.status === 'PENDING') {
                const diff = typeof hold.timeLeft === 'number'
                  ? hold.timeLeft
                  : Math.max(0, Math.floor((new Date(hold.expiresAt).getTime() - Date.now()) / 1000));
                
                if (diff > 0) {
                  hold.timeLeft = diff;
                  holdsDetails.push(hold);
                  validIds.push(id);
                }
              }
            } else {
              // Keep the reservation in localStorage unless it's explicitly deleted (404) or gone (410)
              if (res.status !== 404 && res.status !== 410) {
                validIds.push(id);
              }
            }
          } catch (e) {
            console.error(`Error syncing hold ${id}:`, e);
            // On fetch exception (network drop/server restart), retain the ID
            validIds.push(id);
          }
        })
      );

      setActiveHolds(holdsDetails);
      localStorage.setItem('allo_reservations', JSON.stringify(validIds));
    } catch (e) {
      console.error('Failed to parse active holds:', e);
    }
  };

  const loadData = async () => {
    await fetchProducts();
    await syncHolds();
  };

  useEffect(() => {
    loadData();
    // Poll to keep counts accurate
    const interval = setInterval(() => {
      fetchProducts(true);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Expiration countdown ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveHolds((prevHolds) => {
        const updated = prevHolds
          .map((h) => {
            if (h.timeLeft && h.timeLeft > 0) {
              return { ...h, timeLeft: h.timeLeft - 1 };
            }
            return h;
          })
          .filter((h) => h.timeLeft && h.timeLeft > 0);

        const activeIds = updated.map((u) => u.id);
        localStorage.setItem('allo_reservations', JSON.stringify(activeIds));
        return updated;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleReserve = async (productId: string, warehouseId: string) => {
    const key = `${productId}_${warehouseId}`;
    setReservingKey(key);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, warehouseId, quantity: 1 }),
      });

      const data = await res.json();

      if (res.status === 201) {
        // Add to local holds tracking
        const storedIdsRaw = localStorage.getItem('allo_reservations');
        const ids: string[] = storedIdsRaw ? JSON.parse(storedIdsRaw) : [];
        ids.push(data.id);
        localStorage.setItem('allo_reservations', JSON.stringify(ids));

        // Redirect directly to checkout
        router.push(`/checkout/${data.id}`);
      } else if (res.status === 409) {
        // Concurrency error
        setErrorMsg(`Allocation Conflict (409): ${data.error || 'The item was reserved by another shopper.'}`);
        await fetchProducts(true);
      } else {
        setErrorMsg(data.error || 'Failed to complete hold.');
      }
    } catch (err) {
      setErrorMsg('Network error. Failed to connect to server.');
    } finally {
      setReservingKey(null);
    }
  };

  // Release/Cancel hold early from sidebar
  const handleRelease = async (id: string) => {
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/reservations/${id}/release`, {
        method: 'POST',
      });

      if (res.ok) {
        // Remove from list and localStorage
        setActiveHolds((prev) => prev.filter((h) => h.id !== id));
        const storedIdsRaw = localStorage.getItem('allo_reservations');
        if (storedIdsRaw) {
          const ids: string[] = JSON.parse(storedIdsRaw);
          localStorage.setItem('allo_reservations', JSON.stringify(ids.filter((x) => x !== id)));
        }
        await fetchProducts(true);
      } else {
        const data = await res.json();
        setErrorMsg(data.error || 'Could not cancel reservation.');
      }
    } catch (err) {
      setErrorMsg('Failed to connect to server.');
    }
  };

  // Resolve matching product image
  const getProductImage = (sku: string) => {
    if (sku.includes('HOODIE')) return '/hoodie.png';
    if (sku.includes('BOTTLE')) return '/bottle.png';
    if (sku.includes('KEYBOARD')) return '/keyboard.png';
    if (sku.includes('POUCH')) return '/pouch.png';
    if (sku.includes('DESKMAT')) return '/deskmat.png';
    return '/mug.png';
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 font-sans flex flex-col md:flex-row">
      
      {/* 1. Left Sidebar Shell */}
      <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-zinc-900 bg-zinc-950 p-6 flex flex-col gap-8 shrink-0 justify-between">
        <div className="space-y-8">
          <div className="flex items-center gap-3">
            <div className="bg-violet-600 p-2 rounded-xl text-white">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-extrabold text-sm tracking-wider uppercase text-white">
                Allo Platform
              </h1>
              <p className="text-[9px] text-zinc-500 font-mono tracking-wider">
                Inventory Manager
              </p>
            </div>
          </div>

          <nav className="flex flex-col gap-1 w-full text-xs">
            <a className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-zinc-900 text-white font-bold w-full transition-colors">
              <ShoppingBag className="w-4 h-4 text-violet-400" />
              <span>Products Catalog</span>
            </a>
          </nav>

          {/* Active Holds list directly in sidebar for cancellation */}
          <div className="border-t border-zinc-900 pt-6 space-y-4">
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-zinc-500" />
              <h3 className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase font-bold">
                Active Holds
              </h3>
            </div>
            
            {activeHolds.length === 0 ? (
              <p className="text-[10px] text-zinc-600 font-medium leading-relaxed">
                No active reservations. Items reserved will appear here.
              </p>
            ) : (
              <div className="space-y-3">
                {activeHolds.map((hold) => {
                  const min = Math.floor((hold.timeLeft || 0) / 60);
                  const sec = (hold.timeLeft || 0) % 60;
                  
                  return (
                    <div 
                      key={hold.id} 
                      className="p-3 bg-zinc-900/30 border border-zinc-900 rounded-2xl flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-zinc-200 truncate leading-tight">
                          {hold.product.name}
                        </p>
                        <p className="text-[9px] text-zinc-500 truncate mt-0.5">
                          {hold.warehouse.name}
                        </p>
                        <div className="flex items-center gap-1 mt-1 font-mono text-[9px] text-violet-400 font-bold">
                          <Clock className="w-2.5 h-2.5" />
                          <span>
                            {String(min).padStart(2, '0')}:{String(sec).padStart(2, '0')}
                          </span>
                        </div>
                      </div>

                      {/* Clickable Action Icons */}
                      <div className="flex gap-1.5 shrink-0">
                        <Link 
                          href={`/checkout/${hold.id}`} 
                          className="p-1.5 bg-emerald-950/40 border border-emerald-900/30 hover:bg-emerald-900/30 text-emerald-400 rounded-lg transition-colors"
                          title="Checkout"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                        </Link>
                        
                        <button 
                          onClick={() => handleRelease(hold.id)} 
                          className="p-1.5 bg-red-950/40 border border-red-900/30 hover:bg-red-900/30 text-red-400 rounded-lg transition-colors"
                          title="Cancel Hold"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* 2. Main Content Frame */}
      <main className="flex-1 p-6 md:p-12 max-w-5xl mx-auto w-full space-y-8">
        
        {/* Simple Page Header */}
        <header className="border-b border-zinc-900 pb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-white">Storefront</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Secure real-time product reservations across multiple warehouses.
            </p>
          </div>
        </header>

        {/* Visibility of 409 / Conflict Errors */}
        {errorMsg && (
          <div className="p-4 rounded-xl bg-red-950/20 border border-red-900/40 text-red-400 text-xs font-semibold flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="leading-relaxed">{errorMsg}</p>
          </div>
        )}

        {/* Catalog list */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-violet-500"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {products.map((product) => (
              <div 
                key={product.id} 
                className="bg-zinc-900/30 border border-zinc-900 rounded-3xl overflow-hidden flex flex-col justify-between"
              >
                {/* Product Picture */}
                <div className="h-48 relative bg-zinc-950 border-b border-zinc-900 flex items-center justify-center overflow-hidden p-4">
                  <img 
                    src={getProductImage(product.sku)} 
                    alt={product.name} 
                    className="max-h-full max-w-full object-contain hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/5 font-mono text-[9px] text-zinc-400">
                    {product.sku}
                  </div>
                </div>

                {/* Product Detail */}
                <div className="p-6 space-y-6 flex-1 flex flex-col justify-between">
                  <div className="space-y-2">
                    <h3 className="text-lg font-bold text-zinc-100">{product.name}</h3>
                    <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2">{product.description}</p>
                  </div>

                  {/* Warehouses lists */}
                  <div className="space-y-3 pt-4 border-t border-zinc-900">
                    <h4 className="text-[9px] font-mono tracking-widest text-zinc-500 uppercase font-bold">
                      Warehouse Stock Levels
                    </h4>
                    
                    <div className="space-y-2.5">
                      {product.stockLevels.map((stock) => {
                        const available = stock.totalUnits - stock.reservedUnits;
                        const isOutOfStock = available <= 0;
                        const key = `${product.id}_${stock.warehouseId}`;
                        const isReserving = reservingKey === key;

                        return (
                          <div 
                            key={stock.id} 
                            className="flex items-center justify-between p-3 bg-zinc-950/60 rounded-2xl border border-zinc-900/60 text-xs"
                          >
                            <div>
                              <p className="font-bold text-zinc-300 flex items-center gap-1.5">
                                <Building2 className="w-3.5 h-3.5 text-zinc-500" />
                                {stock.warehouse.name}
                              </p>
                              <p className="text-[9px] text-zinc-500 pl-5">{stock.warehouse.location}</p>
                            </div>

                            <div className="flex items-center gap-3">
                              <span className={`font-mono font-bold ${isOutOfStock ? 'text-red-500' : 'text-emerald-400'}`}>
                                {isOutOfStock ? '0 available' : `${available} left`}
                              </span>

                              <button
                                onClick={() => handleReserve(product.id, stock.warehouseId)}
                                disabled={isOutOfStock || reservingKey !== null}
                                className="px-3.5 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-900 disabled:text-zinc-650 text-white rounded-xl text-xs font-bold transition-all active:scale-98"
                              >
                                {isReserving ? 'Holding...' : 'Reserve'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>
              </div>
            ))}
          </div>
        )}

      </main>
    </div>
  );
}
