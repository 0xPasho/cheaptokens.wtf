import CircleAlertIcon from "kubai-icons-react/icons/circle-alert";
import InfoIcon from "kubai-icons-react/icons/info";

import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Sin redes configuradas no se puede depositar (ADR-0058). En desarrollo local avisa que las direcciones son
 * de ejemplo y que el depósito se simula.
 */
export function PaymentsNotice({ available, simulate, labels }: {
  available: boolean;
  simulate: boolean;
  labels: { unavailable: string; dev: string };
}) {
  if (simulate) return <Alert><InfoIcon /><AlertDescription>{labels.dev}</AlertDescription></Alert>;
  if (available) return null;
  return <Alert variant="warning"><CircleAlertIcon /><AlertDescription>{labels.unavailable}</AlertDescription></Alert>;
}
