import Link from "next/link";
import { backLinkClass } from "@/lib/cloud-admin-ui";

export function SettingsBackLink() {
  return (
    <Link href="/settings" className={backLinkClass}>
      ← Torna alle impostazioni
    </Link>
  );
}
