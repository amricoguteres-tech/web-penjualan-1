"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

export default function AddToCartButton({
  productId,
  disabled,
}: {
  productId: string;
  disabled: boolean;
}) {
  const [added, setAdded] = useState(false);
  const [error, setError] = useState("");

  function addToCart() {
    setError("");
    try {
      const current: { id: string; quantity: number }[] = JSON.parse(
        localStorage.getItem("nebula-cart") ?? "[]",
      );
      const existing = current.find((item) => item.id === productId);
      if (existing) existing.quantity = Math.min(10, existing.quantity + 1);
      else if (current.length < 20) current.push({ id: productId, quantity: 1 });
      else {
        setError("A checkout can include at most 20 different products.");
        return;
      }
      localStorage.setItem("nebula-cart", JSON.stringify(current));
      setAdded(true);
    } catch (error) {
      console.warn("Could not save product to the local cart.", error);
      setError("Your browser could not save the cart. Check storage permissions and try again.");
    }
  }

  return <div className="detail-cart-action">
    <button className="button button-primary" type="button" disabled={disabled} onClick={addToCart}>
      {disabled ? "Currently unavailable" : added ? "Added to your cart" : "Add to cart"}
      {!disabled && <Plus size={15} />}
    </button>
    {error && <span role="alert">{error}</span>}
  </div>;
}
