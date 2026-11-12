import { MobileMenu } from "@/components/mobile-menu";
export default async function Page({
  params,
}: {
  params: Promise<{ tableToken: string }>;
}) {
  return <MobileMenu token={(await params).tableToken} />;
}
