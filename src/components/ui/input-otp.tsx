"use client"

import * as React from "react"
import { cn } from "cn"
import { OTPInput, OTPInputContext } from "input-otp"

/**
 * Código de un solo uso: un `<input>` real encima de casillas dibujadas, así se puede pegar,
 * autocompletar desde el SMS o el correo y leer con un lector de pantalla como un solo campo.
 * Las casillas son decoración: van dentro de un contenedor `aria-hidden`.
 */
function InputOTP({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<typeof OTPInput> & {
  containerClassName?: string
}) {
  return (
    <OTPInput
      data-slot="input-otp"
      containerClassName={cn(
        "cn-input-otp group/input-otp flex items-center gap-2 has-disabled:opacity-50",
        containerClassName
      )}
      spellCheck={false}
      className={cn("disabled:cursor-not-allowed", className)}
      {...props}
    />
  )
}

function InputOTPGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-otp-group"
      className={cn("flex items-center gap-2", className)}
      {...props}
    />
  )
}

function InputOTPSlot({
  index,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  index: number
}) {
  const inputOTPContext = React.useContext(OTPInputContext)
  const { char, hasFakeCaret, isActive } = inputOTPContext?.slots[index] ?? {}

  return (
    <div
      data-slot="input-otp-slot"
      data-active={isActive}
      className={cn(
        // El error se lee del `aria-invalid` del input real: las casillas no llevan ARIA.
        "relative flex size-10 items-center justify-center rounded-xl border border-input glass-control font-mono text-base tabular-nums transition-[border-color,box-shadow,opacity] duration-150 ease-out group-has-aria-invalid/input-otp:border-destructive data-[active=true]:border-ring data-[active=true]:ring-3 data-[active=true]:ring-ring/50 group-has-aria-invalid/input-otp:data-[active=true]:border-destructive group-has-aria-invalid/input-otp:data-[active=true]:ring-destructive/20 dark:group-has-aria-invalid/input-otp:data-[active=true]:ring-destructive/40",
        className
      )}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            data-slot="input-otp-caret"
            className="h-4 w-px animate-caret-blink bg-foreground duration-1000"
          />
        </div>
      )}
    </div>
  )
}

/** El guion entre grupos de casillas. Una barra, no un icono: es puntuación. */
function InputOTPSeparator({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-otp-separator"
      className={cn("flex items-center justify-center", className)}
      {...props}
    >
      <span className="h-0.5 w-2.5 rounded-full bg-muted-foreground opacity-60" />
    </div>
  )
}

export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator }
