import CircleAlertIcon from "kubai-icons-react/icons/circle-alert";
import InfoIcon from "kubai-icons-react/icons/info";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { isLocalDevelopment } from "@/lib/auth/mode";

/** Sin MoR aprobado no se cobra nada (ADR-0019). En desarrollo avisa que los pagos son de prueba. */
export function PaymentsNotice({ available, labels }: { available: boolean; labels: { unavailable: string; dev: string } }) {
  if (available) {
    return isLocalDevelopment()
      ? <Alert><InfoIcon /><AlertDescription>{labels.dev}</AlertDescription></Alert>
      : null;
  }
  return <Alert variant="warning"><CircleAlertIcon /><AlertDescription>{labels.unavailable}</AlertDescription></Alert>;
}
