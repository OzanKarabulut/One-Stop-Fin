"use client";

interface IndexItem {
  symbol: string;
  price: number;
  change: number;
}

export function IndexStrip({ items }: { items: IndexItem[] }) {
  return (
    <div className="flex gap-4 overflow-x-auto py-2 px-1 mb-4">
      {items.map((item) => (
        <div key={item.symbol} className="flex items-center gap-2 text-xs whitespace-nowrap">
          <span className="font-medium text-text-primary">{item.symbol}</span>
          <span className="text-text-muted">{item.price.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          <span className={item.change >= 0 ? "text-up" : "text-down"}>
            {item.change >= 0 ? "+" : ""}{item.change.toFixed(2)}%
          </span>
        </div>
      ))}
    </div>
  );
}
