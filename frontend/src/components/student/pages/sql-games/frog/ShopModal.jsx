// The cosmetic shop — spend coins earned from levels to recolor the frog
// (a "skin", applied as a CSS filter since there's no colored-frog emoji)
// or give it an accessory. Buying an item also grants a small XP bonus on
// top of its coin cost (see backend SqlFrogPurchaseCosmeticView) — a
// purchase is never *pure* spending, it's still forward progress.
import { useEffect, useState } from "react";
import { X, Coins, Loader2, Check, ShoppingBag } from "lucide-react";
import { buildJsonPostOptions, extractApiError } from "../../../../../lib/appUtils";
import { playSound, FrogMascot } from "./shared";

function ItemCard({ item, equippedInSlot, busy, onPurchase, onEquip }) {
  const isEquipped = equippedInSlot === item.id;
  const previewEquipped = item.slot === "skin" ? { skin: item.id } : { accessory: item.id };

  return (
    <div className="sqlg-card-in" style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
      padding: "16px 12px", borderRadius: 16, minWidth: 110,
      border: isEquipped ? "2px solid var(--sqlg-lily)" : "1px solid var(--border-soft)",
      background: isEquipped ? "#f0fdf4" : "white",
    }}>
      <div style={{ height: 44, display: "flex", alignItems: "center" }}>
        <FrogMascot size={36} equipped={previewEquipped} />
      </div>
      <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "var(--olive-900)", textAlign: "center" }}>{item.name}</div>

      {item.owned ? (
        isEquipped ? (
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.72rem", fontWeight: 800, color: "#16a34a" }}>
            <Check size={13} /> Equipped
          </div>
        ) : (
          <button
            onClick={() => onEquip(item)}
            disabled={busy}
            style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid var(--border-soft)", background: "white", fontSize: "0.72rem", fontWeight: 700, cursor: busy ? "not-allowed" : "pointer" }}
          >
            {busy ? <Loader2 size={12} className="spin" /> : "Equip"}
          </button>
        )
      ) : (
        <button
          onClick={() => onPurchase(item)}
          disabled={busy}
          className="primary-button"
          style={{ padding: "5px 12px", borderRadius: 8, fontSize: "0.72rem", fontWeight: 800, display: "flex", alignItems: "center", gap: 4, cursor: busy ? "not-allowed" : "pointer" }}
        >
          {busy ? <Loader2 size={12} className="spin" /> : <><Coins size={12} /> {item.cost}</>}
        </button>
      )}
    </div>
  );
}

export default function ShopModal({ soundEnabled, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState(null); // { text, tone: 'good'|'bad' }

  const load = () => fetch("/api/sql-frog/shop/", { credentials: "include" })
    .then(async (res) => {
      const body = await res.json();
      if (!res.ok) throw new Error(extractApiError(body, "Could not load the shop."));
      return body;
    })
    .then(setData)
    .catch((err) => setLoadError(err.message));

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  const purchase = async (item) => {
    setBusyId(item.id);
    setMessage(null);
    try {
      const res = await fetch("/api/sql-frog/shop/purchase/", buildJsonPostOptions({ item_id: item.id }));
      const body = await res.json();
      if (!res.ok) {
        setMessage({ text: body.error || "Could not purchase this item.", tone: "bad" });
        return;
      }
      setData(body);
      playSound(soundEnabled, "coin");
      setMessage({ text: `Bought ${item.name}! +${body.xp_awarded} XP`, tone: "good" });
      onChanged?.();
    } finally {
      setBusyId(null);
    }
  };

  const equip = async (item) => {
    setBusyId(item.id);
    setMessage(null);
    try {
      const res = await fetch("/api/sql-frog/shop/equip/", buildJsonPostOptions({ item_id: item.id }));
      const body = await res.json();
      if (!res.ok) {
        setMessage({ text: body.error || "Could not equip this item.", tone: "bad" });
        return;
      }
      setData(body);
      playSound(soundEnabled, "click");
      onChanged?.();
    } finally {
      setBusyId(null);
    }
  };

  const skins = data?.items.filter((i) => i.slot === "skin") || [];
  const accessories = data?.items.filter((i) => i.slot === "accessory") || [];

  return (
    <div className="sqlg-modal-backdrop sqlg-backdrop-in" onClick={onClose}>
      <div
        className="sqlg-modal-in"
        onClick={(e) => e.stopPropagation()}
        style={{ background: "white", borderRadius: 24, padding: 28, maxWidth: 560, width: "100%", maxHeight: "85vh", overflowY: "auto" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <ShoppingBag size={20} style={{ color: "var(--sqlg-gold)" }} />
          <h2 style={{ margin: 0, fontSize: "1.2rem" }}>Frog Customization Shop</h2>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-soft)", display: "flex" }}>
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-soft)" }}><Loader2 size={20} className="spin" /></div>
        ) : loadError ? (
          <div style={{ padding: "20px 0", textAlign: "center", color: "#dc2626" }}>{loadError}</div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16, fontWeight: 800, color: "var(--sqlg-gold)" }}>
              <Coins size={16} /> {data.coins} coins available
            </div>

            {message && (
              <div className="sqlg-toast-in" style={{
                padding: "8px 14px", borderRadius: 10, marginBottom: 16, fontSize: "0.82rem", fontWeight: 700,
                background: message.tone === "good" ? "#f0fdf4" : "#fef2f2",
                color: message.tone === "good" ? "#166534" : "#991b1b",
              }}>
                {message.text}
              </div>
            )}

            <div style={{ fontSize: "0.75rem", fontWeight: 800, color: "var(--text-soft)", textTransform: "uppercase", marginBottom: 10 }}>Skins</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
              {skins.map((item) => (
                <ItemCard
                  key={item.id} item={item} equippedInSlot={data.equipped.skin || "skin_default"}
                  busy={busyId === item.id} onPurchase={purchase} onEquip={equip}
                />
              ))}
            </div>

            <div style={{ fontSize: "0.75rem", fontWeight: 800, color: "var(--text-soft)", textTransform: "uppercase", marginBottom: 10 }}>Accessories</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {accessories.map((item) => (
                <ItemCard
                  key={item.id} item={item} equippedInSlot={data.equipped.accessory || "acc_none"}
                  busy={busyId === item.id} onPurchase={purchase} onEquip={equip}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
