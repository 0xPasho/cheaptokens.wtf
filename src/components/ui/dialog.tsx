"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { cn } from "cn"

import { Button } from "@/components/ui/button"

/** La X de cerrar: dos trazos del color del texto. El icono de bola gris se perdía en 16 px. */
function CloseGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="size-4">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  )
}

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-overlay duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  closeLabel = "Close",
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
  /** Nombre accesible de la X. Viene del diccionario de idioma. */
  closeLabel?: string
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          // Una sola superficie con un solo borde: el marco doble sumaba tres líneas paralelas en cada lado. El panel
          // es `grid-cols-1` (minmax(0, 1fr)): con columnas automáticas un texto sin cortes lo ensanchaba fuera de la pantalla.
          "fixed top-1/2 left-1/2 z-50 w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-[1.75rem] duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        <div data-slot="dialog-panel" className="relative grid grid-cols-1 gap-4 overflow-hidden rounded-[1.75rem] bg-popover p-6 text-sm text-popover-foreground ring-1 ring-foreground/10 dark:bg-card">
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close
              data-slot="dialog-close"
              render={
                // 36 px, como los controles redondos del sitio, con su fondo: a 24 px casi no se encontraba. A 14 px del
                // borde su centro (32 px) cae en el del título, que empieza a 24 px y mide 16.
                <Button
                  variant="ghost"
                  className="absolute top-3.5 right-3.5 size-9 bg-glass-control hover:bg-glass-control-hover"
                  size="icon"
                />
              }
            >
              <CloseGlyph />
              <span className="sr-only">{closeLabel}</span>
            </DialogPrimitive.Close>
          )}
        </div>
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      // Espacio a la derecha para la X: el texto largo no pasa por debajo de ella.
      className={cn("flex flex-col gap-2 pr-11", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  closeLabel = "Close",
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
  /** Texto del botón de cerrar. Viene del diccionario de idioma. */
  closeLabel?: string
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        // Sin borde arriba: el tono de la banda ya la separa del contenido.
        "-mx-6 -mb-6 flex flex-col-reverse gap-2 bg-muted/50 px-6 py-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          {closeLabel}
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
