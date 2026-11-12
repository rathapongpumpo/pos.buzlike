import { redirect } from "next/navigation";
export default async function Page({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  redirect(`/${(await params).storeSlug}/start`);
}
