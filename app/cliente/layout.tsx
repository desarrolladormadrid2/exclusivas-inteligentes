import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Exclusivas Inteligentes · Área de cliente",
  description: "Pedidos, entregas, facturas y seguimiento para clientes de Exclusivas Inteligentes.",
  manifest: "/cliente/manifest.webmanifest",
  themeColor: "#b91c1c",
};

export default function ClienteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
