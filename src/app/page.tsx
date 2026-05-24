"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingBag, Building2, Layers, AlertCircle } from 'lucide-react';

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

export default function Home() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [reservingKey, setReservingKey] = useState<string | null>(null); // productId_warehouseId
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchProducts = async () => {
    try {
      setLoading(true);
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

  useEffect(() => {
    fetchProducts();
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
        // Redirect directly to checkout
        router.push(`/checkout/${data.id}`);
      } else if (res.status === 409) {
        // Concurrency error
        setErrorMsg(`Allocation Conflict (409): ${data.error || 'The item was reserved by another shopper.'}`);
        await fetchProducts();
      } else {
        setErrorMsg(data.error || 'Failed to complete hold.');
      }
    } catch (err) {
      setErrorMsg('Network error. Failed to connect to server.');
    } finally {
      setReservingKey(null);
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
      <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-zinc-900 bg-zinc-950 p-6 flex flex-col gap-8 shrink-0">
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

        <nav className="flex flex-row md:flex-col gap-1 w-full text-xs">
          <a className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-zinc-900 text-white font-bold w-full transition-colors">
            <ShoppingBag className="w-4 h-4 text-violet-400" />
            <span>Products Catalog</span>
          </a>
        </nav>
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
