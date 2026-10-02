// Shelfie: count the shelf quickly, get a reorder list against target stock, and the cheapest supplier for each line.
import { useState } from "react";
import { csvObjects, num } from "./lib/csv";
import { moneyFmt } from "./lib/money";
import { waLink } from "./lib/share";
import { uid, useStored } from "./lib/store";
import { CurrencySelect, ImportBox, Section, Stat, Stats } from "./ui/kit";

const T = "shelfie";
type Product = { id: string; name: string; unit: string; par: number; count: number; prices: Record<string, number> };
type Supplier = { id: string; name: string; phone: string };
const SUPP: Supplier[] = [{ id: "s1", name: "Grossiste Ben Arous", phone: "" }, { id: "s2", name: "Metro Cash", phone: "" }, { id: "s3", name: "Dépôt Sfax", phone: "" }];
const SAMPLE: Product[] = [
  { id: "p1", name: "Mineral water 1.5L (pack of 6)", unit: "pack", par: 20, count: 6, prices: { s1: 3.9, s2: 4.2, s3: 3.75 } },
  { id: "p2", name: "Harissa 380g", unit: "tin", par: 24, count: 20, prices: { s1: 2.1, s2: 2.25 } },
  { id: "p3", name: "Couscous 1kg", unit: "bag", par: 30, count: 9, prices: { s1: 1.9, s2: 1.85, s3: 1.95 } },
  { id: "p4", name: "Olive oil 1L", unit: "bottle", par: 12, count: 2, prices: { s2: 17.5, s3: 16.9 } },
  { id: "p5", name: "Tomato paste 800g", unit: "tin", par: 18, count: 17, prices: { s1: 3.4, s3: 3.2 } },
];

export default function Shelfie() {
  const [products, setProducts] = useStored<Product[]>(T, "products", SAMPLE);
  const [suppliers, setSuppliers] = useStored<Supplier[]>(T, "suppliers", SUPP);
  const [cur, setCur] = useStored(T, "cur", "TND");
  const [shop, setShop] = useStored(T, "shop", "Épicerie Ennour");
  const [mode, setMode] = useState<"count" | "order" | "setup">("count");
  const [roundTo, setRoundTo] = useStored(T, "round", 1);
  const money = moneyFmt(cur);

  const need = (p: Product) => { const n = Math.max(0, p.par - p.count); return roundTo > 1 ? Math.ceil(n / roundTo) * roundTo : n; };
  const best = (p: Product) => Object.entries(p.prices).filter(([s, v]) => v > 0 && suppliers.some(x => x.id === s)).sort((a, b) => a[1] - b[1])[0];
  const lines = products.filter(p => need(p) > 0).map(p => { const b = best(p); return { p, qty: need(p), sup: b?.[0], price: b?.[1] ?? 0 }; });
  const bySup = suppliers.map(s => ({ s, lines: lines.filter(l => l.sup === s.id) })).filter(x => x.lines.length);
  const unpriced = lines.filter(l => !l.sup);
  const total = lines.reduce((a, l) => a + l.qty * l.price, 0);
  const worst = lines.reduce((a, l) => { const prices = Object.values(l.p.prices).filter(v => v > 0); return a + (prices.length ? Math.max(...prices) : 0) * l.qty; }, 0);
  const setP = (id: string, patch: Partial<Product>) => setProducts(products.map(p => (p.id === id ? { ...p, ...patch } : p)));
  const orderText = (ls: typeof lines) => `Order from ${shop}:\n` + ls.map(l => `- ${l.qty} x ${l.p.name}`).join("\n") + `\nThank you.`;

  const importCsv = (text: string) => {
    const rows = csvObjects(text);
    const next = [...products];
    rows.forEach(r => {
      const name = r.name || r.product || r.item; if (!name) return;
      const ex = next.find(p => p.name.toLowerCase() === name.toLowerCase());
      const prices: Record<string, number> = {};
      suppliers.forEach(s => { const v = r[s.name.toLowerCase()]; if (v) prices[s.id] = num(v); });
      if (ex) Object.assign(ex, { par: r.par ? num(r.par) : ex.par, prices: { ...ex.prices, ...prices } });
      else next.push({ id: uid(), name, unit: r.unit || "unit", par: num(r.par) || 10, count: num(r.count), prices });
    });
    setProducts(next);
  };

  return (
    <div className="stack">
      <Section title={shop} aside={<div className="seg-mini"><button aria-pressed={mode === "count"} onClick={() => setMode("count")}>Count the shelf</button><button aria-pressed={mode === "order"} onClick={() => setMode("order")}>Reorder</button><button aria-pressed={mode === "setup"} onClick={() => setMode("setup")}>Products and prices</button></div>}>
        <Stats><Stat value={products.length} label="Products" /><Stat value={lines.length} label="Need restocking" tone={lines.length ? "warn" : "good"} /><Stat value={money(total)} label="Order total, best prices" /><Stat value={money(worst - total)} label="Saved vs dearest supplier" tone="good" /></Stats>
      </Section>

      {mode === "count" && (
        <Section title="Count what is on the shelf" aside={<button className="btn small" onClick={() => setProducts(products.map(p => ({ ...p, count: p.par })))}>Reset counts to full</button>}>
          <div className="sh-count">
            {products.map(p => (
              <div key={p.id} className="sh-item" style={{ borderColor: p.count < p.par * 0.3 ? "var(--bad)" : p.count < p.par ? "var(--warn)" : "var(--line)" }}>
                <div style={{ flex: 1, minWidth: 0 }}><strong>{p.name}</strong><p className="note">Target {p.par} {p.unit}s</p></div>
                <div className="sh-step">
                  <button className="btn" aria-label={`One less ${p.name}`} onClick={() => setP(p.id, { count: Math.max(0, p.count - 1) })}>−</button>
                  <input className="input num" aria-label={`Count of ${p.name}`} inputMode="numeric" value={p.count} onChange={e => setP(p.id, { count: Math.max(0, parseInt(e.target.value) || 0) })} />
                  <button className="btn" aria-label={`One more ${p.name}`} onClick={() => setP(p.id, { count: p.count + 1 })}>+</button>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {mode === "order" && (
        <>
          <div className="row" style={{ alignItems: "center" }}>
            <label className="field" style={{ flex: "0 0 200px" }}><span>Round orders up to packs of</span><input id="sh-round" type="number" min={1} className="input num" value={roundTo} onChange={e => setRoundTo(Math.max(1, +e.target.value || 1))} /></label>
          </div>
          {bySup.length === 0 && unpriced.length === 0 && <p className="empty-note">Everything is at target. Nothing to order.</p>}
          {bySup.map(({ s, lines: ls }) => (
            <Section key={s.id} title={s.name} aside={<a className="btn small primary" href={waLink(orderText(ls), s.phone)} target="_blank" rel="noreferrer">Send order on WhatsApp</a>}>
              <table className="t"><thead><tr><th>Product</th><th className="r">Qty</th><th className="r">Unit price</th><th className="r">Line</th></tr></thead>
                <tbody>{ls.map(l => <tr key={l.p.id}><td>{l.p.name}</td><td className="r">{l.qty}</td><td className="r">{money(l.price)}</td><td className="r">{money(l.qty * l.price)}</td></tr>)}
                  <tr><td colSpan={3}><strong>Total</strong></td><td className="r"><strong>{money(ls.reduce((a, l) => a + l.qty * l.price, 0))}</strong></td></tr></tbody></table>
            </Section>
          ))}
          {unpriced.length > 0 && <Section title="No price yet"><p>{unpriced.map(l => `${l.qty} x ${l.p.name}`).join(", ")}</p><p className="note">Add supplier prices under Products and prices.</p></Section>}
        </>
      )}

      {mode === "setup" && (
        <>
          <Section title="Products and supplier prices" aside={<CurrencySelect id="sh-cur" value={cur} onChange={setCur} />}>
            <div className="table-wrap"><table className="t">
              <thead><tr><th>Product</th><th>Unit</th><th className="r">Target</th>{suppliers.map(s => <th key={s.id} className="r">{s.name}</th>)}<th /></tr></thead>
              <tbody>{products.map(p => (
                <tr key={p.id}>
                  <td><input className="input" aria-label="Product" value={p.name} onChange={e => setP(p.id, { name: e.target.value })} /></td>
                  <td><input className="input" style={{ width: 80 }} aria-label="Unit" value={p.unit} onChange={e => setP(p.id, { unit: e.target.value })} /></td>
                  <td><input className="input num" style={{ width: 70 }} aria-label="Target" value={p.par} onChange={e => setP(p.id, { par: parseInt(e.target.value) || 0 })} /></td>
                  {suppliers.map(s => <td key={s.id}><input className="input num" style={{ width: 90 }} aria-label={`${s.name} price`} value={p.prices[s.id] ?? ""} placeholder="–" onChange={e => setP(p.id, { prices: { ...p.prices, [s.id]: num(e.target.value) } })} /></td>)}
                  <td><button className="btn ghost small danger" onClick={() => setProducts(products.filter(x => x.id !== p.id))}>Delete</button></td>
                </tr>
              ))}</tbody>
            </table></div>
            <button className="btn small" style={{ marginTop: 12 }} onClick={() => setProducts([...products, { id: uid(), name: "New product", unit: "unit", par: 10, count: 0, prices: {} }])}>Add a product</button>
          </Section>
          <div className="grid2">
            <Section title="Suppliers">
              <div className="stack" style={{ gap: 8 }}>
                <label className="field"><span>Shop name</span><input id="sh-shop" className="input" value={shop} onChange={e => setShop(e.target.value)} /></label>
                {suppliers.map(s => (
                  <div key={s.id} className="row">
                    <input className="input" style={{ flex: 2 }} aria-label="Supplier" value={s.name} onChange={e => setSuppliers(suppliers.map(x => x.id === s.id ? { ...x, name: e.target.value } : x))} />
                    <input className="input" style={{ flex: 1 }} aria-label="WhatsApp number" placeholder="WhatsApp, e.g. 21622123456" value={s.phone} onChange={e => setSuppliers(suppliers.map(x => x.id === s.id ? { ...x, phone: e.target.value } : x))} />
                    <button className="btn ghost small danger" onClick={() => setSuppliers(suppliers.filter(x => x.id !== s.id))}>Remove</button>
                  </div>
                ))}
                <button className="btn small" style={{ alignSelf: "flex-start" }} onClick={() => setSuppliers([...suppliers, { id: uid(), name: "New supplier", phone: "" }])}>Add a supplier</button>
              </div>
            </Section>
            <Section title="Import a price list"><ImportBox label="CSV with name, unit, par and one column per supplier name" onText={importCsv} placeholder={"name,unit,par,Metro Cash\nSugar 1kg,bag,20,1.35"} rows={4} /></Section>
          </div>
        </>
      )}
      <style>{`.sh-count{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}.sh-item{display:flex;align-items:center;gap:12px;border:2px solid;border-radius:10px;padding:10px 12px}
      .sh-step{display:flex;gap:4px;align-items:center}.sh-step .btn{width:40px;height:40px;padding:0;font-size:20px}.sh-step .input{width:60px;text-align:center;font-size:18px;font-weight:700}`}</style>
    </div>
  );
}
