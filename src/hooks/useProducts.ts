import { useMemo, useCallback } from 'react';
import { useApp } from '../contexts/AppContext';

export function useProducts(searchQuery = '') {
  const { products, loadingProducts, error, refreshProducts } = useApp();

  const filteredProducts = useMemo(() => {
    if (!searchQuery) return products;
    const lower = searchQuery.toLowerCase();
    return products.filter(
      (p) =>
        p.sku.toLowerCase().includes(lower) ||
        p.name.toLowerCase().includes(lower) ||
        p.category.toLowerCase().includes(lower)
    );
  }, [products, searchQuery]);

  const handleRefresh = useCallback(async () => {
    return refreshProducts(true);
  }, [refreshProducts]);

  return {
    products: filteredProducts,
    allProducts: products,
    loading: loadingProducts,
    error,
    refresh: handleRefresh
  };
}
