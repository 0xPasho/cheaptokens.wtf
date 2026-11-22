import { avatarBackground } from "@/lib/account-avatar";
import { cn } from "@/lib/utils";

const SIZES = { sm: "size-6", default: "size-8", lg: "size-10", xl: "size-14" } as const;

/**
 * La imagen de la cuenta: el degradado que sale de su id de Clerk (el de Deska). Aún no se puede subir foto,
 * así que no hay otra. Es decorativa: el nombre o el correo siempre van como texto al lado o en sr-only.
 */
export function AccountAvatar({ seed, size = "default", className }: {
  seed: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      data-slot="account-avatar"
      className={cn("block shrink-0 rounded-full outline outline-1 -outline-offset-1 outline-border", SIZES[size], className)}
      style={{ background: avatarBackground(seed) }}
    />
  );
}
