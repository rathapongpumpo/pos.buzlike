import { Coffee, Package } from "lucide-react";
export function ProductImage({
  image,
  name,
}: {
  image: string | null;
  name: string;
}) {
  if (image?.startsWith("sprite:")) {
    const i = name === "โกโก้เย็น" ? 8 : Number(image.split(":")[1]);
    return (
      <div
        role="img"
        aria-label={name}
        className="product-photo"
        style={{
          backgroundImage:
            name === "สลัดไก่"
              ? "url(/cafe-menu-sprite.png)"
              : "url(/cafe-products.png)",
          backgroundSize: "500% 200%",
          backgroundPosition: `${(i % 5) * 25}% ${Math.floor(i / 5) * 100}%`,
        }}
      />
    );
  }
  return (
    <div role="img" aria-label={name} className="product-photo empty-photo">
      <Package size={42} />
    </div>
  );
}
