"use client";

import * as React from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// ─── Re-exports primitivos ───────────────────────────────────────────────
export { Popover as GlassPopover };
export { PopoverTrigger as GlassPopoverTrigger };
export { PopoverAnchor } from "@/components/ui/popover";

// ─── GlassPopoverContent ─────────────────────────────────────────────────
/**
 * Contenedor glass reutilizable. Defaults pensados para móviles:
 * - side="top" + align="end" evita que un trigger en el borde derecho
 *   desborde; collisionPadding + max-w evita que toque el viewport.
 * - bg-white/80 + backdrop-blur-xl mantiene el efecto glass.
 * - p-3 + rounded-[20px] match BottomNav anterior.
 *
 * Props genéricas: align, side, sideOffset, collisionPadding, avoidCollisions,
 * className, children — passthrough a PopoverContent (Radix).
 * @example
 * <GlassPopover>
 *   <GlassPopoverTrigger asChild><Button>...</Button></GlassPopoverTrigger>
 *   <GlassPopoverContent align="end" sideOffset={12}>
 *     <GlassPopoverList>
 *       <GlassPopoverItem icon={Search} label="Explorar" to="/explorar" />
 *     </GlassPopoverList>
 *   </GlassPopoverContent>
 * </GlassPopover>
 */
export function GlassPopoverContent({
  align = "end",
  side = "top",
  sideOffset = 12,
  collisionPadding = 16,
  avoidCollisions = true,
  className,
  children,
  ...props
}: React.ComponentProps<typeof PopoverContent>) {
  return (
    <PopoverContent
      align={align}
      side={side}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      avoidCollisions={avoidCollisions}
      // w-72 + max-w calc + rounded 20 glass — override p-2 base con p-3
      // max-w-[calc(100vw-32px)] evita desborde en 375px: w-72=288 < 343 (375-32)
      className={cn(
        "w-72 max-w-[calc(100vw-2rem)] max-w-[min(18rem,calc(100vw-2rem))] box-border rounded-[20px] border border-white/20 bg-white/80 p-3 shadow-xl shadow-black/10 ring-1 ring-black/[0.04] backdrop-blur-xl supports-[backdrop-filter]:bg-white/80 dark:border-white/10 dark:bg-zinc-900/70 dark:ring-white/10",
        className,
      )}
      {...props}
    >
      {children}
    </PopoverContent>
  );
}

// ─── GlassPopoverList ────────────────────────────────────────────────────
export function GlassPopoverList({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1", className)} {...props} />;
}

// ─── GlassPopoverItem ────────────────────────────────────────────────────
export type GlassPopoverItemProps = {
  icon?: React.ElementType<{ className?: string }>;
  label: string;
  active?: boolean;
  to?: string;
  href?: string;
  onClick?: () => void;
  className?: string;
  iconClassName?: string;
} & Omit<React.ComponentPropsWithoutRef<"button">, "children">;

export function GlassPopoverItem({
  icon: Icon,
  label,
  active = false,
  to,
  href,
  onClick,
  className,
  iconClassName,
  ...rest
}: GlassPopoverItemProps) {
  const baseClass = cn(
    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium leading-none transition-colors",
    active
      ? "bg-primary/10 text-primary"
      : "text-foreground/80 hover:bg-muted/60 hover:text-foreground",
    className,
  );

  const content = (
    <>
      {Icon ? (
        <Icon
          aria-hidden
          className={cn(
            "h-5 w-5 shrink-0",
            active ? "text-primary" : "text-muted-foreground",
            iconClassName,
          )}
        />
      ) : null}
      <span className="flex-1 leading-none">{label}</span>
    </>
  );

  if (to) {
    return (
      <Link
        to={to}
        aria-current={active ? "page" : undefined}
        onClick={onClick}
        className={baseClass}
      >
        {content}
      </Link>
    );
  }

  if (href) {
    return (
      <a
        href={href}
        aria-current={active ? "page" : undefined}
        onClick={onClick}
        className={baseClass}
        {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={baseClass}
      {...rest}
    >
      {content}
    </button>
  );
}

// ─── GlassPopover (conveniencia con items) ───────────────────────────────
export type GlassPopoverMenuItem = {
  label: string;
  icon?: React.ElementType<{ className?: string }>;
  to?: string;
  href?: string;
  active?: boolean;
  onClick?: () => void;
};

export type GlassPopoverMenuProps = {
  items: GlassPopoverMenuItem[];
  onItemClick?: () => void;
  className?: string;
};

/**
 * Lista vertical lista para usar cuando solo necesitas renderizar items.
 * Mantiene icons sueltos sin pill.
 */
export function GlassPopoverMenu({
  items,
  onItemClick,
  className,
}: GlassPopoverMenuProps) {
  return (
    <GlassPopoverList className={className}>
      {items.map((item) => (
        <GlassPopoverItem
          key={item.to ?? item.href ?? item.label}
          icon={item.icon}
          label={item.label}
          to={item.to}
          href={item.href}
          active={item.active}
          onClick={() => {
            item.onClick?.();
            onItemClick?.();
          }}
        />
      ))}
    </GlassPopoverList>
  );
}
