"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  collisionPadding = 16,
  avoidCollisions = true,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        avoidCollisions={avoidCollisions}
        className={cn(
          // Glass M3 expressive + Apple: translúcido, blur, bordes sutiles, sombra suave
          // max-w evita que toque bordes en viewport angosto; collisionPadding lo despega del viewport
          "z-50 w-72 max-w-[calc(100vw-2rem)] max-w-[min(18rem,calc(100vw-2rem))] box-border rounded-2xl border border-white/20 bg-white/80 p-2 shadow-xl shadow-black/10 ring-1 ring-black/5 backdrop-blur-xl supports-[backdrop-filter]:bg-white/80 dark:border-white/10 dark:bg-zinc-900/70 dark:shadow-black/30 dark:ring-white/10",
          // Animaciones shadcn / tw-animate-css — origen según side
          "origin-(--radix-popover-content-transform-origin) duration-200 outline-none",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          "data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2",
          // Compatibilidad con data-open/data-closed (radix-ui 1.x)
          "data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95",
          "motion-reduce:animate-none",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger }
