"use client";
import { useState } from "react";
import type { ProductView, CartLine } from "@/lib/view-types";
import { money } from "@/lib/money";
import { Modal } from "../ui/modal";
import { Button } from "../ui/button";
export function ModifierPicker({
  product,
  onClose,
  onAdd,
}: {
  product: ProductView | null;
  onClose: () => void;
  onAdd: (line: CartLine) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]),
    [note, setNote] = useState("");
  if (!product) return null;
  const choices = product.modifierGroups
    .flatMap((g) => g.modifierGroup.options)
    .filter((o) => selected.includes(o.id));
  const total =
    Number(product.price) +
    choices.reduce((s, o) => s + Number(o.priceDelta), 0);
  const valid = product.modifierGroups.every(({ modifierGroup: g }) => {
    const count = g.options.filter((o) => selected.includes(o.id)).length;
    return (
      count >= g.minSelect &&
      count <= g.maxSelect &&
      (!g.isRequired || count > 0)
    );
  });
  return (
    <Modal title={product.name} open onClose={onClose}>
      <div className="stack">
        {product.modifierGroups.map(({ modifierGroup: g }) => (
          <div key={g.id}>
            <strong>
              {g.name} {g.isRequired && <small>· ต้องเลือก</small>}
            </strong>
            <div className="option-row">
              {g.options.map((o) => (
                <label key={o.id}>
                  <input
                    type={g.maxSelect === 1 ? "radio" : "checkbox"}
                    name={g.id}
                    checked={selected.includes(o.id)}
                    onChange={(e) =>
                      setSelected((s) =>
                        g.maxSelect === 1
                          ? [
                              ...s.filter(
                                (id) => !g.options.some((x) => x.id === id),
                              ),
                              o.id,
                            ]
                          : e.target.checked
                            ? [...s, o.id]
                            : s.filter((id) => id !== o.id),
                      )
                    }
                  />
                  {o.name}
                  {Number(o.priceDelta) > 0 &&
                    ` +฿${money(o.priceDelta).replace(".00", "")}`}
                </label>
              ))}
            </div>
          </div>
        ))}
        <label className="field">
          หมายเหตุ
          <textarea
            maxLength={300}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="เช่น แยกน้ำแข็ง"
          />
        </label>
        <Button
          disabled={!valid}
          onClick={() => {
            onAdd({
              key: `${product.id}:${[...selected].sort().join(",")}:${note}`,
              productId: product.id,
              name: product.name,
              price: total,
              quantity: 1,
              optionIds: selected,
              optionNames: choices.map((o) => o.name),
              note,
              imageUrl: product.imageUrl,
            });
            onClose();
          }}
        >
          เพิ่มลงตะกร้า · ฿{money(total)}
        </Button>
      </div>
    </Modal>
  );
}
